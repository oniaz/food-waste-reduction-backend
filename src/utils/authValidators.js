export function validateUsername(username) {
    if (username.length < 5 || username.length > 30) {
        return "Username must be between 5 and 30 characters.";
    }
    if (/\s/.test(username)) {
        return "username cannot contain spaces.";
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
        return "password cannot contain spaces.";
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

export function validatePhoneNumber(phoneNumber) {
    if (!phoneNumber || phoneNumber.trim() === "") return "phoneNumber is required.";
    if (!/^\+?[0-9]{7,15}$/.test(phoneNumber.trim())) return "Invalid phoneNumber format.";
    return null;
}

export function validateAddress(address) {
    if (!address) return "address is required.";
    const { governorate, city, neighborhood, detailedAddress } = address;
    if (!governorate?.trim()) return "address: governorate is required.";
    if (!city?.trim()) return "address: city is required.";
    if (!neighborhood?.trim()) return "address: neighborhood is required.";
    if (!detailedAddress?.trim()) return "address: detailedAddress is required.";
    if (detailedAddress.trim().length > 200) return "address: detailedAddress max 200 characters.";
    return null;
}

export function validateShopName(shopName) {
    if (!shopName?.trim()) return "Shop name is required.";
    if (shopName.trim().length < 3 || shopName.trim().length > 50)
        return "Shop name must be between 3 and 50 characters.";
    return null;
}

export function validateTaxNumber(taxNumber) {
    if (!taxNumber?.trim()) return "taxNumber is required.";
    return null;
}

export function validateName(name) {
    if (!name) return "name is required.";
    const { firstName, lastName } = name;

    const NAME_REGEX = /^[\p{L}][\p{L}\p{M}'-]*([\s][\p{L}\p{M}'-]+)*$/u;

    if (!firstName?.trim()) return "name: firstName is required.";
    if (firstName.trim().length < 3 || firstName.trim().length > 50)
        return "name: firstName must be between 3 and 50 characters.";
    if (!NAME_REGEX.test(firstName.trim()))
        return "name: firstName contains invalid characters.";

    if (!lastName?.trim()) return "name: lastName is required.";
    if (lastName.trim().length < 3 || lastName.trim().length > 50)
        return "name: lastName must be between 3 and 50 characters.";
    if (!NAME_REGEX.test(lastName.trim()))
        return "name: lastName contains invalid characters.";
    return null;
}