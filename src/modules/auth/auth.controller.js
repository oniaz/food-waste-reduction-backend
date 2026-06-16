import UsersAuth from "../../models/usersAuth.model.js";
import {
    validateUsername, validateEmail, validatePassword, validateRole,
    validatePhoneNumber, validateAddress, validateShopName, validateTaxNumber, validateName

} from "../../utils/userDataValidators.js";
import { sendPasswordResetEmail } from "../auth/auth.services.js";
import { registerUser } from "./auth.services.js";
import Vendors from "../../models/vendors.model.js";
import jwt from "jsonwebtoken";
import bcrypt from 'bcrypt';

/**
 * Register a new user (customer, vendor, or admin).
 *
 * @route POST /auth/register
 *
 * @body {Object} req.body
 * @property {string} username - 5–30 chars, no spaces
 * @property {string} email - valid email format (normalized to lowercase)
 * @property {string} password - minimum 6 characters, no spaces
 * @property {"customer"|"vendor"|"admin"} role - user role
 * @property {Object} [profileData] - Additional profile fields depending on `role`
 *
 * Role-specific `profileData`:
 * - Vendor: `{ shopName, phoneNumber, taxNumber, address }` where `address` is `{ governorate, city, neighborhood, detailedAddress }`.
 * - Customer: `{ name, phoneNumber, address }` where `address` matches the vendor address shape.
 *
 * Notes:
 * - The endpoint performs server-side validation for all fields and returns a 400 on validation errors.
 * - Vendor creation is run inside a MongoDB transaction that creates both the auth record and vendor profile atomically.
 * - `taxNumber` is enforced unique at the DB level; duplicate tax numbers will cause a 400 response if detected pre-insert, or a 500-level error if raised by the DB.
 *
 * @returns {Object} 201 - User registered successfully
 * @returns {Object} 400 - Validation error (missing/invalid fields or duplicate constraints)
 * @returns {Object} 500 - Server error
 */
export const register = async (req, res, next) => {
    try {
        let { username, password, role, email, ...profileData } = req.body;

        if (!username || !password || !role || !email) {
            return res.status(400).json({
                message: "All fields are required: username, email, password, role."
            });
        }

        username = username.trim();
        email = email.trim().toLowerCase();
        role = role?.trim().toLowerCase();

        const roleError = validateRole(role);
        const usernameError = validateUsername(username);
        const emailError = validateEmail(email);
        const passwordError = validatePassword(password);

        const validationError = roleError || usernameError || emailError || passwordError;
        if (validationError) return res.status(400).json({ message: validationError });


        const existingUser = await UsersAuth.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ message: "Username already exists." });
        }

        if (role === "vendor") {
            const { shopName, phoneNumber, taxNumber, address } = profileData;
            const err =
                validateShopName(shopName) ||
                validatePhoneNumber(phoneNumber) ||
                validateTaxNumber(taxNumber) ||
                validateAddress(address);
            if (err) return res.status(400).json({ message: err });
            if (await Vendors.findOne({ taxNumber: taxNumber.trim() }))
                return res.status(400).json({ message: "Tax number already in use." });
        }

        if (role === "customer") {
            const { name, phoneNumber, address } = profileData;
            const err =
                validateName(name) ||
                validatePhoneNumber(phoneNumber) ||
                validateAddress(address);
            if (err) return res.status(400).json({ message: err });
        }

        await registerUser({ username, password, role, email, profileData });

        return res.status(201).json({ message: "User registered successfully." });

    } catch (error) {
        next(error);
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
export const login = async (req, res, next) => {
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
        next(error);
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
export const logout = async (req, res, next) => {
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
        next(error);
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
export const forgotPassword = async (req, res, next) => {
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
        next(error);
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
export const resetPassword = async (req, res, next) => {
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
        next(error);
    }
};