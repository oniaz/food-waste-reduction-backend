import nodemailer from 'nodemailer';


import mongoose from "mongoose";
import UsersAuth from "../../models/usersAuth.model.js";
import Vendors from "../../models/vendors.model.js";
import Customers from "../../models/customers.model.js";

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
      <div style="font-family: Arial, sans-serif; line-height: 1.6; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; padding: 32px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border-top: 4px solid #0f8a5f;">
          
          <h2 style="color: #1e293b; margin-top: 0; margin-bottom: 20px; font-size: 24px;">Password Reset Request</h2>

          <p style="margin-bottom: 16px;">We received a request to reset the password for this account:</p>

          <p style="margin-bottom: 24px; background-color: #f8fafc; padding: 12px; border-radius: 6px; border-left: 3px solid #14a56f;">
            <b style="color: #1e293b;">Username:</b> ${name}
          </p>

          <p style="margin-bottom: 24px;">Click the button below to reset your password:</p>

          <div style="text-align: center; margin-bottom: 24px;">
            <a href="${resetLink}"
               style="display: inline-block; padding: 12px 24px; background-color: #0f8a5f; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: bold;">
               Reset Password
            </a>
          </div>

          <p style="color: #ef4444; font-size: 14px; margin-bottom: 24px; font-weight: 500;">
            ⚠️ This link will expire in <b>15 minutes</b>.
          </p>

          <hr style="border: 0; border-top: 1px solid #f8fafc; margin-bottom: 16px;" />

          <p style="font-size: 12px; color: #1e293b; opacity: 0.7; margin: 0;">
            If you did not request this, you can safely ignore this email.
          </p>
          
        </div>
      </div>
    `,
    });
};
