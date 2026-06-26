import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";

import AppError from "../../utils/AppError.js";
import { JWT_CONFIG, RESET_TOKEN_CONFIG } from "../../config/auth.js";
import * as authRepo from "./auth.repository.js";
import { sendPasswordResetEmail, sendAccountStatusEmail } from "../../utils/mailer.js";

// ── Registration ──────────────────────────────────────────────────────────────

export async function registerUser({ username, password, role, email, profileData }) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        if (role === "customer") {
            const existingCustomer = await authRepo.findAuthByEmail(email, "customer", session);
            if (existingCustomer) {
                throw new AppError(
                    "Customer account already exists with this email. Only one customer account per email is allowed.",
                    400
                );
            }
        }

        // Duplicate username check — business rule that lives in the service
        const existingUsername = await authRepo.findUsernameExists(username);
        if (existingUsername) {
            throw new AppError("Username already exists.", 400);
        }

        // Duplicate tax number check for vendors — business rule that lives in the service
        if (role === "vendor") {
            const { taxNumber } = profileData;
            const taxExists = await authRepo.findVendorByTaxNumber(taxNumber);
            if (taxExists) throw new AppError("Tax number already in use.", 400);
        }

        const accountStatus = role === "vendor" ? "pending" : "active";
        const [newAuth] = await authRepo.createAuth(
            { username, password, role, email, accountStatus },
            session
        );

        if (role === "vendor") {
            await authRepo.createVendor({ ...profileData, authId: newAuth._id }, session);
        } else if (role === "customer") {
            await authRepo.createCustomer({ ...profileData, authId: newAuth._id }, session);
        }

        await session.commitTransaction();

        // ── Send Registration Emails ──────────────────────────────────────────
        if (role === "vendor") {
            // Vendors get the pending email
            const emailResult = await sendAccountStatusEmail(newAuth.email, newAuth.username, "pending", "vendor");
            if (emailResult && !emailResult.success) {
                console.warn(`[Warning] Application email failed to send to registered vendor ${newAuth.username}`);
            }
        } else if (role === "customer") {
            // Customers get an immediate registration confirmation email
            const emailResult = await sendAccountStatusEmail(newAuth.email, newAuth.username, "active", "customer");
            if (emailResult && !emailResult.success) {
                console.warn(`[Warning] Welcome email failed to send to registered customer ${newAuth.username}`);
            }
        }

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
    const user = await authRepo.findAuthByUsername(username.trim());

    if (!user) throw new AppError("Invalid username or password.", 400);

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) throw new AppError("Invalid username or password.", 400);

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
 * Returns silently when the user is not found — caller always sends the same generic 200.
 */
export async function initiatePasswordReset(username, frontendUrl) {
    // findAuthByUsername returns a full document — safe to mutate and .save()
    const user = await authRepo.findAuthByUsername(username);
    if (!user) return; // Intentional no-op — prevents account enumeration

    const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET,
        RESET_TOKEN_CONFIG
    );

    user.resetToken = token;
    await authRepo.saveAuth(user);

    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    const emailResult = await sendPasswordResetEmail(user.email, user.username, resetLink);

    if (emailResult && !emailResult.success) {
        console.error(`[Warning] Reset email failed to send to ${user.username} (${user.email})`);
    }
}

/**
 * Validates a reset token, applies the new password, and clears the token.
 * Uses findAuthByIdAsDocument to ensure .save() is available on the returned object.
 */
export async function completePasswordReset(token, newPassword) {
    let decoded;
    try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        throw new AppError("Link is invalid or has expired", 400);
    }

    // findAuthByIdAsDocument returns a full Mongoose document so we can call .save()
    const user = await authRepo.findAuthByIdAsDocument(decoded.userId);
    if (!user) throw new AppError("User not found", 404);

    if (user.resetToken !== token) {
        throw new AppError("Link is invalid or has expired", 400);
    }

    user.password = newPassword;
    user.resetToken = null;
    await authRepo.saveAuth(user);
}