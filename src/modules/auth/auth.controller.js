import UsersAuth from "../../models/usersAuth.model.js";
import { validateUsername, validateEmail, validatePassword, validateRole } from "../../utils/authValidators.js";
import jwt from "jsonwebtoken";
import bcrypt from 'bcrypt';

// req: {
//     username: string,
//     email: string,
//     password: string,
//     role: "customer" | "vendor" | "admin"
// }
// username cannot contain spaces, must be between 5 and 30 characters
// email must be valid format
// password must be at least 6 characters
// role must be one of "customer", "vendor", "admin"
// if role is vendor, accountStatus is pending (must be approved later by admin), otherwise active
// only one customer user can exist with the same email, but multiple vendor users can have the same email
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