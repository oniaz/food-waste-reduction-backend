export function validateUsername(username) {
    if (username.length < 5 || username.length > 30) {
        return "Username must be between 5 and 30 characters.";
    }
    if (/\s/.test(username)) {
        return "Username cannot contain spaces.";
    }
    return null;
}

export function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return "Invalid email format.";
    }
    return null;
}

export function validatePassword(password) {
    if (password.length < 6) {
        return "Password must be at least 6 characters.";
    }

    if (/\s/.test(password)) {
        return "Password cannot contain spaces.";
    }
    return null;
}

export function validateRole(role) {
    const allowedRoles = ["customer", "vendor", "admin"];

    if (!allowedRoles.includes(role)) {
        return "Invalid role.";
    }

    return null;
}
