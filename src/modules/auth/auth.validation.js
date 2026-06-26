import {
    validateUsername,
    validateEmail,
    validatePassword,
    validateRole,
    validatePhoneNumber,
    validateAddress,
    validateShopName,
    validateTaxNumber,
    validateName,
} from "../../utils/userDataValidators.js";

// Validates shape and format only.
// Duplicate username + duplicate tax number checks are business rules
// that live in auth.service.js → registerUser().
export const validateRegister = (req, res, next) => {
    let { username, password, role, email, ...profileData } = req.body;

    if (!username || !password || !role || !email) {
        return res.status(400).json({
            message: "All fields are required: username, email, password, role.",
        });
    }

    // Normalize before validating so the service receives clean values
    username = username.trim();
    email = email.trim().toLowerCase();
    role = role?.trim().toLowerCase();

    req.body.username = username;
    req.body.email = email;
    req.body.role = role;

    const validationError =
        validateRole(role) ||
        validateUsername(username) ||
        validateEmail(email) ||
        validatePassword(password);

    if (validationError) return res.status(400).json({ message: validationError });

    if (role === "vendor") {
        const { shopName, phoneNumber, taxNumber, address } = profileData;
        const err =
            validateShopName(shopName) ||
            validatePhoneNumber(phoneNumber) ||
            validateTaxNumber(taxNumber) ||
            validateAddress(address);
        if (err) return res.status(400).json({ message: err });
    }

    if (role === "customer") {
        const { name, phoneNumber, address } = profileData;
        const err =
            validateName(name) ||
            validatePhoneNumber(phoneNumber) ||
            validateAddress(address);
        if (err) return res.status(400).json({ message: err });
    }

    next();
};

export const validateLogin = (req, res, next) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ message: "Username and password are required." });
    }

    next();
};

export const validateForgotPassword = (req, res, next) => {
    const { username } = req.body;

    if (!username) {
        return res.status(400).json({ message: "Username is required" });
    }

    next();
};

export const validateResetPassword = (req, res, next) => {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    next();
};
