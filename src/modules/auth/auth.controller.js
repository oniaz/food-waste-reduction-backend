import UsersAuth from "../../models/usersAuth.model.js";
import { validateUsername, validateEmail, validatePassword, validateRole } from "../../utils/authValidators.js";
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