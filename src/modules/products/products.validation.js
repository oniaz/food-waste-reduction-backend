// src/modules/products/products.validation.js
// Path goes up two levels (out of products, out of modules) then into data
import { categoriesEnum, daysToSubtractBeforeExpiry } from "../../data/productCategories.js";

export const validateCreateProduct = (req, res, next) => {
    req.body ??= {};

    // --- TYPE CONVERSION FOR MULTIPART FORM-DATA ---
    // Convert incoming text strings to their appropriate types before running checks
    if (req.body.price !== undefined) req.body.price = Number(req.body.price);
    if (req.body.quantity !== undefined) req.body.quantity = Number(req.body.quantity);
    if (req.body.discount !== undefined) req.body.discount = Number(req.body.discount);
    if (req.body.isDeliverable === "true") req.body.isDeliverable = true;
    if (req.body.isDeliverable === "false") req.body.isDeliverable = false;

    const { productName, price, expiryDate, quantity, category, discount, isDeliverable } =
        req.body;

    // 1. Required fields (imgUrl arrives as req.file, not body)
    const requiredFields = [
        "productName",
        "price",
        "expiryDate",
        "quantity",
        "category",
        "isDeliverable",
    ];

    for (const field of requiredFields) {
        if (req.body[field] === undefined || req.body[field] === null) {
            return res.status(400).json({ success: false, message: `${field} is required` });
        }
    }

    // File requirement check specifically for creating
    if (!req.file) {
        return res.status(400).json({
            success: false,
            message: "Product image file is required",
        });
    }

    // 2. productName validation
    if (typeof productName !== "string") {
        return res.status(400).json({ success: false, message: "Product name must be a string" });
    }

    const trimmedName = productName.trim();

    if (trimmedName.length < 3 || trimmedName.length > 50) {
        return res.status(400).json({
            success: false,
            message: "Product name must be between 3 and 50 characters",
        });
    }

    if (/^\d+$/.test(trimmedName)) {
        return res.status(400).json({
            success: false,
            message: "Product name cannot contain only numbers",
        });
    }

    // 3. Validates category against the array imported from data/
    if (typeof category !== "string" || !categoriesEnum.includes(category)) {
        return res.status(400).json({
            success: false,
            message: `Category must be one of: ${categoriesEnum.join(", ")}`,
        });
    }

    // 4. BUSINESS RULE — category buffer window check
    // This check lives here rather than in the service because it depends purely
    // on the incoming request values (expiryDate + category) and requires no DB access.
    const today = new Date();
    const expiry = new Date(expiryDate);

    const minAllowedDate = new Date(expiry);
    minAllowedDate.setDate(
        minAllowedDate.getDate() - daysToSubtractBeforeExpiry[category]
    );

    if (minAllowedDate < today) {
        return res.status(400).json({
            success: false,
            message: `This ${category} product is too close to expiry to be accepted`,
        });
    }

    // 5. expiryDate validation
    if (isNaN(expiry.getTime()) || expiry <= new Date()) {
        return res.status(400).json({
            success: false,
            message: "Expiry date must be a valid future date",
        });
    }

    // 6. price validation
    if (typeof price !== "number" || isNaN(price) || price <= 0) {
        return res.status(400).json({ success: false, message: "Price must be a positive number" });
    }

    // 7. quantity validation
    if (!Number.isInteger(quantity) || quantity <= 0) {
        return res.status(400).json({
            success: false,
            message: "Quantity must be a positive integer",
        });
    }

    // 8. discount validation
    if (discount !== undefined && !isNaN(discount)) {
        if (typeof discount !== "number" || discount < 0 ) {
            return res.status(400).json({
                success: false,
                message: "Discount must be between 0 and the product price",
            });
        }
    }

    // 9. isDeliverable validation
    if (typeof isDeliverable !== "boolean") {
        return res.status(400).json({
            success: false,
            message: "isDeliverable must be true or false",
        });
    }

    // 10. Inject vendorId from auth so the controller never reads it from the body
    req.body.vendorId = req.user.id;

    next();
};

export const validateRecommendCartItems = (req, res, next) => {
    req.body ??= {};

    const { cartItems } = req.body;

    if (!Array.isArray(cartItems)) {
        return res.status(400).json({ success: false, message: "cartItems must be an array" });
    }

    if (cartItems.length === 0) {
        return res.status(400).json({ success: false, message: "cartItems cannot be empty" });
    }

    for (const [index, id] of cartItems.entries()) {
        if (typeof id !== "string" || !/^[a-fA-F0-9]{24}$/.test(id)) {
            return res.status(400).json({
                success: false,
                message: `cartItems[${index}] must be a valid 24-character hex product ID`,
            });
        }
    }

    next();
};

export const validateProductIdParam = (req, res, next) => {
    const { id } = req.params;

    // Only validates ObjectId format — existence check is the service's job
    if (!id || !/^[a-fA-F0-9]{24}$/.test(id)) {
        return res.status(400).json({ success: false, message: "Invalid product ID" });
    }

    next();
};