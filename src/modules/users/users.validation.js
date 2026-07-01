import {
    validateName,
    validateShopName,
    validatePhoneNumber,
    validateAddress,
    validatePickupTime,
    validateMapCoordinates,
} from "../../utils/validators.js";

// Validates shape and format of profile update fields only.
// Does NOT read req.user.role — role-based field filtering is the controller's job.
// Validates every field that could be present for either role; unknown fields are just ignored.
export const validateUpdateProfile = (req, res, next) => {
    const { shopName, name, address, phoneNumber, pickupTime, map } = req.body;

    // If nothing at all was sent, reject early
    const hasAtLeastOne = [shopName, name, address, phoneNumber, pickupTime, map]
        .some((v) => v !== undefined);

    if (!hasAtLeastOne) {
        return res.status(400).json({ message: "Bad Request: No valid fields provided for update" });
    }

    let validationError = null;

    if (shopName !== undefined) {
        validationError = validateShopName(shopName, true);
        if (validationError) return res.status(400).json({ message: validationError });
    }

    if (name !== undefined) {
        validationError = validateName(name, true);
        if (validationError) return res.status(400).json({ message: validationError });
    }

    if (phoneNumber !== undefined) {
        validationError = validatePhoneNumber(phoneNumber, true);
        if (validationError) return res.status(400).json({ message: validationError });
    }

    if (address !== undefined) {
        validationError = validateAddress(address, true);
        if (validationError) return res.status(400).json({ message: validationError });
    }

    if (pickupTime !== undefined) {
        validationError = validatePickupTime(pickupTime, true);
        if (validationError) return res.status(400).json({ message: validationError });
    }

    if (map !== undefined) {
        validationError = validateMapCoordinates(map, true);
        if (validationError) return res.status(400).json({ message: validationError });
    }

    next();
};

export const validateChangePassword = (req, res, next) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        return res.status(400).json({ message: "Bad Request: Missing required parameters" });
    }
    if (typeof oldPassword !== "string" || typeof newPassword !== "string") {
        return res.status(400).json({
            message: "Bad Request: Password fields must be valid text strings.",
        });
    }

    next();
};