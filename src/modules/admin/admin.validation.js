import mongoose from "mongoose";

export const validateVendorStatusUpdate = (req, res, next) => {
    const { vendorId } = req.params;
    const { status } = req.body;
    const validStatuses = ["pending", "incompleteData", "active", "suspended"];

    if (!vendorId || !mongoose.Types.ObjectId.isValid(vendorId)) {
        return res.status(400).json({ message: "Invalid vendor ID format" });
    }
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid or missing status value" });
    }

    next();
};

export const validateCustomerStatusUpdate = (req, res, next) => {
    const { customerId } = req.params;
    const { status } = req.body;
    const validStatuses = ["pending", "active", "suspended"];

    if (!customerId || !mongoose.Types.ObjectId.isValid(customerId)) {
        return res.status(400).json({ message: "Invalid customer ID format" });
    }
    if (!status || !validStatuses.includes(status)) {
        return res.status(400).json({ message: "Invalid or missing status value" });
    }

    next();
};

export const validateAdminIdParam = (req, res, next) => {
    const { id } = req.params;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid Admin ID format" });
    }

    next();
};