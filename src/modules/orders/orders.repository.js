import Order from "../../models/orders.model.js";
import Product from "../../models/products.model.js";
import Customer from "../../models/customers.model.js";
import Vendor from "../../models/vendors.model.js";

// ── Orders ────────────────────────────────────────────────────────────────────

export const createOrder = (data) =>
    Order.create(data);

export const findOrderById = (id) =>
    Order.findById(id);

export const findOrderByIdPopulatedForDetail = (id) =>
    Order.findById(id)
        .populate({
            path: "customerId",
            select: "name phoneNumber address",
        })
        ;

export const findOrderByIdPopulatedForRating = (id) =>
    Order.findById(id);

export const findAndUpdateOrderStatus = (id, status) =>
    Order.findByIdAndUpdate(
        id,
        { $set: { status } },
        { new: true, runValidators: true }
    );

export const markOrderRated = (id) =>
    Order.findByIdAndUpdate(
        id,
        { $set: { isRated: true } },
        { new: true, strict: false } // strict: false lets us save fields not pre-defined in orderSchema
    );

export const countOrdersByFilter = (filter) =>
    Order.countDocuments(filter);

export const findOrdersByFilter = (filter, skip, limit) =>
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit);

export const findOrdersByFilterWithCustomerPopulate = (filter, skip, limit) =>
    Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: "customerId", select: "name phoneNumber address" });

export const findOrdersByFilterWithProductPopulate = (filter, skip, limit) =>
    Order.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({ path: "products.vendorId", select: "shopName address pickupTime" }); // Targets vendorId inside the products array

// ── Products ──────────────────────────────────────────────────────────────────

export const findProductByIdWithVendorAuth = (id) =>
    Product.findById(id).populate({
        path: "vendorId",
        populate: { path: "authId" },
    });

export const findProductsByIds = (ids) =>
    Product.find({ _id: { $in: ids } }).select("productName price discount commission vendorId");

export const getDistinctProductIdsByVendor = (vendorId) =>
    Product.distinct("_id", { vendorId });

export const decrementProductStock = (productId, quantity) =>
    Product.findByIdAndUpdate(productId, {
        $inc: { quantity: -quantity }, // Decrements stock count natively in MongoDB
    });

export const bulkRestockProducts = (products) => {
    const ops = products.map((item) => ({
        updateOne: {
            filter: { _id: item.productId },
            update: { $inc: { quantity: item.quantity } },
        },
    }));
    return Product.bulkWrite(ops);
};

// ── Customers ─────────────────────────────────────────────────────────────────

export const findCustomerById = (id) =>
    Customer.findById(id);

export const incrementCustomerLoyaltyPoints = (customerId, points) =>
    Customer.findByIdAndUpdate(customerId, {
        $inc: { loyaltyPoints: points },
    });

// ── Vendors ───────────────────────────────────────────────────────────────────

export const bulkIncrementVendorMoneyOwed = (vendorSalesMap) => {
    // VENDOR COMMISSION (BULK WRITE)
    const ops = Object.keys(vendorSalesMap).map((vId) => {
        const grossSales = vendorSalesMap[vId];
        const platformDebt = parseFloat((grossSales * 0.1).toFixed(2));

        return {
            updateOne: {
                filter: { _id: vId },
                update: { $inc: { moneyOwed: platformDebt } },
            },
        };
    });

    return Vendor.bulkWrite(ops);
};

export const bulkIncrementVendorRatings = (vendorIds, rating) => {
    //Generate and execute bulk operations for unique vendors
    const ops = vendorIds.map((vendorId) => ({
        updateOne: {
            filter: { _id: vendorId },
            update: {
                $inc: {
                    "rating.score": rating,        // Increment cumulative score by the stars given
                    "rating.totalRatingsNumber": 1, // Increment total count of ratings by 1
                },
            },
        },
    }));

    return Vendor.bulkWrite(ops);
};