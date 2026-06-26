import nodemailer from "nodemailer";

// ── Email Transport ───────────────────────────────────────────────────────────

const transporter = nodemailer.createTransport({
    service: process.env.NODEMAILER_EMAIL_SERVICE,
    auth: {
        user: process.env.NODEMAILER_USERNAME,
        pass: process.env.NODEMAILER_PASS,
    },
});

export const getEmailLayout = (title, bodyContent) => {
    return `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; background-color: #f8fafc; padding: 40px 20px; color: #1e293b;">
        <div style="max-width: 500px; margin: 0 auto; background-color: #ffffff; padding: 32px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); border-top: 4px solid #0f8a5f;">
          ${title ? `<h2 style="color: #1e293b; margin-top: 0; margin-bottom: 20px; font-size: 24px;">${title}</h2>` : ""}
          ${bodyContent}
        </div>
      </div>
    `;
};

export const sendEmail = async ({ to, subject, html, title, raw = false }) => {
    try {
        const finalHtml = raw ? html : getEmailLayout(title || subject, html);
        const info = await transporter.sendMail({
            from: process.env.NODEMAILER_USERNAME,
            to,
            subject,
            html: finalHtml,
        });

        if (info.rejected && info.rejected.length > 0) {
            console.warn(`[Nodemailer] Email rejected for: ${info.rejected.join(", ")}`);
        }

        return { success: true, info };
    } catch (error) {
        console.error("[Nodemailer Error] Failed to send email:", error.message);
        return { success: false, error: error.message };
    }
};

export const sendPasswordResetEmail = async (email, name, resetLink) => {
    const bodyContent = `
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
    `;

    return sendEmail({
        to: email,
        subject: "Password Reset Request",
        html: bodyContent,
    });
};

export const sendAccountStatusEmail = async (email, username, newStatus) => {
    let statusText = newStatus;
    let description = "";

    if (newStatus === "active") {
        statusText = "Active / Reactivated";
        description = "Your account is active. You can now log in and access all features.";
    } else if (newStatus === "suspended") {
        statusText = "Suspended";
        description = "Your account has been suspended. Please contact support if you believe this is an error.";
    } else if (newStatus === "incompleteData") {
        statusText = "Approved (Incomplete Profile)";
        description = "Your account has been approved! Please complete your profile data to be able to start listing products.";
    } else if (newStatus === "pending") {
        statusText = "Awaiting Admin Approval";
        description = "Thank you for registering! Your vendor application is currently under review by our admin team. We will notify you via email as soon as your account is approved.";
    }

    const bodyContent = `
          <p style="margin-bottom: 16px;">Hello <b>${username}</b>,</p>
          <p style="margin-bottom: 24px;">This is to inform you that your account status has been updated by an administrator.</p>

          <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; border-left: 4px solid #0f8a5f; margin-bottom: 24px;">
              <p style="margin: 0 0 8px 0;"><span style="color: #64748b; font-weight: bold; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">New Status</span></p>
              <h3 style="margin: 0; color: #0f8a5f; font-size: 20px;">${statusText}</h3>
              <p style="margin: 8px 0 0 0; font-size: 14px; color: #475569;">${description}</p>
          </div>

          <hr style="border: 0; border-top: 1px solid #f8fafc; margin-bottom: 16px;" />
          <p style="font-size: 12px; color: #1e293b; opacity: 0.7; margin: 0;">
              If you have any questions, please contact our support team.
          </p>
    `;

    return sendEmail({
        to: email,
        subject: "Account Status Updated",
        html: bodyContent,
    });
};
