import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
    service: process.env.NODEMAILER_EMAIL_SERVICE,
    auth: {
        user: process.env.NODEMAILER_USERNAME,
        pass: process.env.NODEMAILER_PASS,
    },
});

export const sendEmail = async ({ to, subject, html }) => {
    await transporter.sendMail({
        from: process.env.NODEMAILER_USERNAME,
        to,
        subject,
        html,
    });
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
