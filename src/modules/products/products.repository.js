import mongoose from "mongoose";
import Products from "../../models/products.model.js";
import UsersAuth from "../../models/usersAuth.model.js";

// ── Aggregation Pipelines ─────────────────────────────────────────────────────

/**
 * Runs the full filtered/sorted/paginated product listing pipeline.
 * Only products from active vendors are returned.
 */
export const aggregateProducts = (matchStage, postMatchStage, sortStage, skip, limit) => {
    const pipeline = [
        { $match: matchStage },

        {
            $lookup: {
                from: "vendors",
                localField: "vendorId",
                foreignField: "_id",
                as: "vendor",
            },
        },

        { $unwind: "$vendor" },

        {
            $lookup: {
                from: UsersAuth.collection.name,
                localField: "vendor.authId",
                foreignField: "_id",
                as: "vendorAuth",
            },
        },

        { $unwind: "$vendorAuth" },

        // Only surface products whose vendor is currently active
        { $match: { "vendorAuth.accountStatus": "active" } },

        // FINAL PRICE AFTER DISCOUNT
        {
            $addFields: {
                finalPrice: {
                    $subtract: [
                        { $add: ["$price", { $ifNull: ["$commission", 0] }] },
                        { $multiply: ["$price", { $divide: ["$discount", 100] }] },
                    ],
                },
            },
        },

        // Post-lookup filters (finalPrice, vendor location) — only injected when needed
        ...(Object.keys(postMatchStage).length ? [{ $match: postMatchStage }] : []),

        // PROJECT RESPONSE (expose vendor address/shopName)
        {
            $project: {
                productName: 1,
                price: 1,
                discount: 1,
                finalPrice: 1,
                expiryDate: 1,
                validDate: 1,
                quantity: 1,
                isDeliverable: 1,
                imgUrl: 1,
                description: 1,
                tags: 1,
                category: 1,
                vendorId: 1,
                commission: 1,
                "vendor.address.city": 1,
                "vendor.address.governorate": 1,
                "vendor.address.neighborhood": 1,
                "vendor.address.detailedAddress": 1,
                shopName: "$vendor.shopName",
            },
        },

        { $sort: sortStage },

        {
            $facet: {
                metadata: [{ $count: "total" }],
                data: [{ $skip: skip }, { $limit: limit }],
            },
        },
    ];

    return Products.aggregate(pipeline);
};

/**
 * Runs the search pipeline matching productName, shopName, or tags.
 */
export const aggregateSearch = (searchKey, skip, limit) => {
    const pipeline = [
        {
            $match: {
                validDate: { $gte: new Date() },
                expiryDate: { $gt: new Date() },
                quantity: { $gt: 0 },
            },
        },

        {
            $lookup: {
                from: "vendors",
                localField: "vendorId",
                foreignField: "_id",
                as: "vendor",
            },
        },

        { $unwind: "$vendor" },

        {
            $match: {
                $or: [
                    { productName: { $regex: searchKey, $options: "i" } },
                    { "vendor.shopName": { $regex: searchKey, $options: "i" } },
                    { tags: { $elemMatch: { $regex: searchKey, $options: "i" } } },
                ],
            },
        },

        { $sort: { expiryDate: 1 } },

        {
            $facet: {
                metadata: [{ $count: "total" }],
                data: [{ $skip: skip }, { $limit: limit }],
            },
        },
    ];

    return Products.aggregate(pipeline);
};

/**
 * Fetches a single product by ID with vendor and vendorAuth joined.
 */
export const aggregateProductById = (id) => {
    return Products.aggregate([
        { $match: { _id: new mongoose.Types.ObjectId(id) } },

        // lookup vendor
        {
            $lookup: {
                from: "vendors",
                localField: "vendorId",
                foreignField: "_id",
                as: "vendor",
            },
        },

        { $unwind: { path: "$vendor", preserveNullAndEmptyArrays: true } },

        // lookup vendor auth status
        {
            $lookup: {
                from: "usersauths",
                localField: "vendor.authId",
                foreignField: "_id",
                as: "vendorAuth",
            },
        },

        { $unwind: { path: "$vendorAuth", preserveNullAndEmptyArrays: true } },

        // Final price calculation after discount
        {
            $addFields: {
                finalPrice: {
                    $subtract: [
                        { $add: ["$price", { $ifNull: ["$commission", 0] }] },
                        { $multiply: ["$price", { $divide: ["$discount", 100] }] },
                    ],
                },
            },
        },

        {
            $project: {
                _id: 1,
                productName: 1,
                category: 1,
                price: 1,
                discount: 1,
                finalPrice: 1,
                expiryDate: 1,
                validDate: 1,
                quantity: 1,
                isDeliverable: 1,
                imgUrl: 1,
                description: 1,
                tags: 1,
                vendorId: 1,
                createdAt: 1,
                updatedAt: 1,
                commission: 1,
                "vendor.address.governorate": 1,
                "vendor.address.city": 1,
                "vendor.address.neighborhood": 1,
                "vendor.address.detailedAddress": 1,
                "vendor.address.map": 1,
                "vendor.pickupTime": 1,
                shopName: "$vendor.shopName",
                vendorStatus: { $ifNull: ["$vendorAuth.accountStatus", "suspended"] },
            },
        },
    ]);
};

// ── CRUD ──────────────────────────────────────────────────────────────────────

export const findProductById = (id) =>
    Products.findById(id);

export const createProduct = (data) =>
    Products.create(data);

export const saveProduct = (product) =>
    product.save();

export const deleteProductById = (id) =>
    Products.findByIdAndDelete(id);