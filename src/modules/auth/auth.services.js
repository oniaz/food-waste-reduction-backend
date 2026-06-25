import nodemailer from 'nodemailer';
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

import UsersAuth from "../../models/usersAuth.model.js";
import Vendors from "../../models/vendors.model.js";
import Customers from "../../models/customers.model.js";
import { JWT_CONFIG, RESET_TOKEN_CONFIG } from "../../config/auth.js";

// ── Registration ──────────────────────────────────────────────────────────────

export async function registerUser({ username, password, role, email, profileData }) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        if (role === "customer") {
            const existingCustomer = await UsersAuth.findOne({ email, role: "customer" }).session(session);
            if (existingCustomer) throw { status: 400, message: "Customer account already exists with this email. Only one customer account per email is allowed." };
        }

        const accountStatus = role === "vendor" ? "pending" : "active";
        const [newAuth] = await UsersAuth.create(
            [{
                username, password, role, email, accountStatus
            }],
            { session }
        );

        if (role === "vendor") {
            await Vendors.create([{ ...profileData, authId: newAuth._id }], { session });
        } else if (role === "customer") {
            await Customers.create([{ ...profileData, authId: newAuth._id }], { session });
        }
        await session.commitTransaction();
        return newAuth;

    } catch (err) {
        await session.abortTransaction();
        throw err;
    } finally {
        session.endSession();
    }
}

// ── Login ─────────────────────────────────────────────────────────────────────

/**
 * Verifies credentials and returns a signed JWT string.
 * Cookie setting is handled by the controller — services stay transport-agnostic.
 */
export async function loginUser(username, password) {
    const user = await UsersAuth.findOne({ username: username.trim() });
    if (!user) return null;

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return null;

    const token = jwt.sign(
        { sub: user._id, role: user.role },
        process.env.JWT_SECRET,
        JWT_CONFIG
    );

    return token;
}

// ── Password Reset ────────────────────────────────────────────────────────────

/**
 * Generates a short-lived reset token, persists it to the user record, and sends the email.
 * Returns the user document if found, or null if not found.
 */
export async function initiatePasswordReset(username, frontendUrl) {
    const user = await UsersAuth.findOne({ username });
    if (!user) return null; // Caller always returns the same generic 200 — no leak

    const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        RESET_TOKEN_CONFIG
    );

    user.resetToken = token;
    await user.save();

    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    const emailResult = await sendPasswordResetEmail(
        user.email,
        user.username,
        resetLink
    );

    if (emailResult && !emailResult.success) {
        console.error(`[Warning] Reset email failed to send to ${user.username} (${user.email})`);
    }

    return user;
}

/**
 * Validates a reset token, applies the new password, and clears the token.
 */
export async function completePasswordReset(token, newPassword) {
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return { error: "Link is invalid or has expired" };
    }

    const user = await UsersAuth.findById(decoded.userId);
    if (!user) return { error: "not_found" };

    if (user.resetToken !== token) {
        return { error: "Link is invalid or has expired" };
    }

    user.password = newPassword;
    user.resetToken = null;
    await user.save();

    return { success: true };
}

// ── Email Transport ───────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
    service: process.env.NODEMAILER_EMAIL_SERVICE,
    auth: {
        user: process.env.NODEMAILER_USERNAME,
        pass: process.env.NODEMAILER_PASS,
    },
});

export const sendEmail = async ({ to, subject, html }) => {
    try {
        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_USERNAME,
            to,
            subject,
            html,
        });

        if (info.rejected && info.rejected.length > 0) {
            console.warn(`[Nodemailer] Email rejected for: ${info.rejected.join(', ')}`);
        }

        return { success: true, info };
    } catch (error) {
        console.error("[Nodemailer Error] Failed to send email:", error.message);
        return { success: false, error: error.message };
    }
};

export const sendPasswordResetEmail = async (email, name, resetLink) => {

    return sendEmail({
        to: email,
        subject: "Password Reset Request",
        html: `
      <div style="font-family: Arial, sans-serif; line-height: 1.5; color: #222;">
        <h2>Password Reset Request</h2>

        <p>We received a request to reset the password for this account:</p>

        <p><b>Username:</b> ${name}</p>

        <p>Click the button below to reset your password:</p>

        <a href="${resetLink}"
           style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px;">
           Reset Password
        </a>

        <p>This link will expire in <b>15 minutes</b>.</p>

        <p style="font-size:12px;color:#666;">
          If you did not request this, you can ignore this email.
        </p>
      </div>
    `,
    });
};