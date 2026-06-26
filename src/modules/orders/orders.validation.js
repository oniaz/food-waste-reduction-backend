import mongoose from "mongoose";

export const validateCreateOrder = (req, res, next) => {
    const { products } = req.body;

    if (!products || !Array.isArray(products) || products.length === 0) {
        return res.status(400).json({ message: "Missing required fields" });
    }

    next();
};

export const validateOrderIdParam = (req, res, next) => {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid order ID" });
    }

    next();
};

export const validateUpdateOrderStatus = (req, res, next) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid order ID" });
    }

    // Only checks presence and type — which statuses are *valid in context*
    // (e.g. blocking 'cancelled', terminal-state lock) is a business rule in the service.
    if (!status || typeof status !== "string" || status.trim() === "") {
        return res.status(400).json({ message: "Invalid or missing status value" });
    }

    next();
};

export const validateRateOrder = (req, res, next) => {
    const { id } = req.params;
    const { rating } = req.body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid order ID" });
    }

    //Check rating range — this is pure input shape validation (1–5 integer)
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be an integer between 1 and 5" });
    }

    next();
};