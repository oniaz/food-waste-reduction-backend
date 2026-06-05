import UsersAuth from "../../models/usersAuth.model.js";
import { validateUsername, validateEmail, validatePassword, validateRole } from "../../utils/authValidators.js";
import { sendPasswordResetEmail } from "../auth/auth.services.js";
import jwt from "jsonwebtoken";
import bcrypt from 'bcrypt';

/**
 * Register a new user.
 *
 * @route POST /auth/register
 *
 * @body {Object} req.body
 * @property {string} username - 5–30 chars, no spaces
 * @property {string} email - valid email format
 * @property {string} password - minimum 6 characters, no spaces
 * @property {"customer"|"vendor"|"admin"} role - user role
 *
 * Rules:
 * - Username must be unique and contain no whitespace; length 5–30 characters
 * - Email is normalized to lowercase
 * - Customers: only one account per email allowed
 * - Vendors: multiple accounts allowed per email (each represents a branch/store)
 * - Vendor accounts start with accountStatus = "pending" and require admin approval
 * - Other roles default to accountStatus = "active"
 *
 * @returns {Object} 201 - Success message
 * @returns {Object} 400 - Validation error
 * @returns {Object} 500 - Server error
 */
export const register = async (req, res) => {
    try {
        let { username, password, role, email } = req.body;

        if (!username || !password || !role || !email) {
            return res.status(400).json({
                message: "All fields are required: username, email, password, role."
            });
        }

        username = username.trim();
        email = email.trim().toLowerCase();
        role = role?.trim().toLowerCase();

        const roleError = validateRole(role);
        if (roleError) return res.status(400).json({ message: roleError });

        const usernameError = validateUsername(username);
        if (usernameError) return res.status(400).json({ message: usernameError });

        const emailError = validateEmail(email);
        if (emailError) return res.status(400).json({ message: emailError });

        const passwordError = validatePassword(password);
        if (passwordError) return res.status(400).json({ message: passwordError });

        const existingUser = await UsersAuth.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "Username already exists." });
        }

        if (role === "customer") {
            const existingCustomer = await UsersAuth.findOne({
                email,
                role: "customer"
            });

            if (existingCustomer) {
                return res.status(400).json({
                    message: "Customer already exists with this email."
                });
            }
        }

        // commented out until admin approval flow is implemented
        // const accountStatus = role === "vendor" ? "pending" : "active";

        const newUser = new UsersAuth({
            username,
            password,
            role,
            email,
            // accountStatus
        });

        await newUser.save();

        return res.status(201).json({
            message: "User registered successfully."
        });

    } catch (error) {
        // replace later with error middleware
        return res.status(500).json({ message: error.message });
    }
};

/**
 * Authenticate a user and set a JWT cookie on success.
 *
 * @route POST /auth/login
 *
 * @body {Object} req.body
 * @property {string} username - Registered username (trimmed, case-sensitive)
 * @property {string} password - User password
 *
 * Rules:
 * - Username is trimmed before lookup
 * - Password is compared using bcrypt (hashed in DB)
 * - Same error message is returned for invalid credentials (security)
 *
 * Auth Flow:
 * - Find user by username
 * - Validate password using bcrypt
 * - Generate JWT token (sub, role, accountStatus)
 * - Store token in httpOnly cookie
 *
 * Cookie:
 * - httpOnly: true (prevents JS access)
 * - secure: true in production only
 * - sameSite: none (required for cross-origin frontend)
 * - maxAge: 7 days
 *
 * @returns {Object} 200 - Login successful
 * @returns {Object} 400 - Invalid credentials or missing fields
 * @returns {Object} 500 - Server error
 */
export const login = async (req, res) => {
    try {
        let { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({
                message: "Username and password are required."
            });
        }

        username = username.trim();

        const user = await UsersAuth.findOne({ username });

        if (!user) {
            return res.status(400).json({ message: "Invalid username or password." });
        }

        const isMatch = await bcrypt.compare(password, user.password);

        if (!isMatch) {
            return res.status(400).json({ message: "Invalid username or password." });
        }

        const jwtToken = jwt.sign(
            { sub: user._id, role: user.role, accountStatus: user.accountStatus },
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.cookie("token", jwtToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "none",
            maxAge: 7 * 24 * 60 * 60 * 1000
        });
        return res.status(200).json({
            message: "Login successful."
        })
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};

/**
 * Logout user by clearing authentication cookie.
 *
 * @route POST /auth/logout
 *
 * Auth Flow:
 * - Clears JWT cookie from client browser
 * - Invalidates session on frontend (stateless backend)
 *
 * Cookie:
 * - httpOnly: true (secure cookie removal)
 * - secure: true in production only
 * - sameSite: none (matches login configuration)
 *
 * @returns {Object} 200 - Logout successful
 * @returns {Object} 500 - Server error
 */
export const logout = async (req, res) => {
    try {
        res.clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "none"
        });

        return res.status(200).json({
            message: "Logged out successfully."
        });
    } catch (error) {
        return res.status(500).json({ message: error.message });
    }
};


/**
 * Initiate password reset for a user.
 *
 * @route POST /auth/forgot-password
 *
 * @body {Object} req.body
 * @property {string} username - The username to send a reset link for
 *
 * Rules:
 * - Always respond with a generic success message to avoid leaking account existence
 * - If the account exists a short-lived JWT reset token is generated and emailed
 *
 * @returns {Object} 200 - Generic success message (email sent if account exists)
 * @returns {Object} 400 - Missing required fields
 * @returns {Object} 500 - Server error
 */
export const forgotPassword = async (req, res) => {
    try {
        const { username } = req.body;
        if (!username) {
            return res.status(400).json({ message: "Username is required" });
        }

        const user = await UsersAuth.findOne({ username });

        if (!user) {
            return res.status(200).json({
                message: "If the account exists, a reset link has been sent to the associated email."
            });
        }

        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: "15m" }
        );

        const resetLink = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

        await sendPasswordResetEmail(
            user.email,
            user.username,
            resetLink
        );

        return res.status(200).json({
            message: "If the account exists, a reset link has been sent to the associated email."
        });

    } catch (error) {
        return res.status(500).json({
            message: "An internal server error occurred"
        });
    }
};

/**
 * Complete a password reset using a previously issued token.
 *
 * @route POST /auth/reset-password
 *
 * @body {Object} req.body
 * @property {string} token - Short-lived JWT token issued by forgot-password flow
 * @property {string} newPassword - New password to set for the account
 *
 * Rules:
 * - Token is verified with the server JWT secret
 * - If token is valid, the password is updated and saved
 *
 * @returns {Object} 200 - Password reset successfully
 * @returns {Object} 400 - Missing fields or invalid/expired token
 * @returns {Object} 404 - User not found
 * @returns {Object} 500 - Server error
 */
export const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;

        if (!token || !newPassword) {
            return res.status(400).json({
                message: "Missing required fields"
            });
        }

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
        } catch (error) {
            return res.status(400).json({
                message: "Link is invalid or has expired"
            });
        }

        const user = await UsersAuth.findById(decoded.userId);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        user.password = newPassword;
        await user.save();

        return res.status(200).json({
            message: "Password reset successfully!"
        });

    } catch (error) {
        return res.status(500).json({
            message: "An internal server error occurred"
        });
    }
};