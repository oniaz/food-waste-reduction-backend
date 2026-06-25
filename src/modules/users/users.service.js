import bcrypt from 'bcrypt';
import Order from "../../models/orders.model.js";
import Customer from "../../models/customers.model.js";
import Vendor from "../../models/vendors.model.js";
import UsersAuth from "../../models/usersAuth.model.js";

// ── Profile Fetching ──────────────────────────────────────────────────────────

/**
 * Returns the auth record without sensitive fields.
 */
export async function getAuthRecord(authId) {
    return UsersAuth.findById(authId).select("-password -resetToken").lean();
}

/**
 * Returns the vendor profile with a computed average rating.
 */
export async function getVendorProfile(vendorId) {
    const vendorData = await Vendor.findById(vendorId).lean();
    if (!vendorData) return null;

    // Calculate rating, protecting against division by zero (0 total ratings)
    const totalRatings = vendorData.rating?.totalRatingsNumber || 0;
    const score = vendorData.rating?.score || 0;
    const vendorRating = totalRatings > 0 ? (score / totalRatings) : 0;

    return { ...vendorData, vendorRating };
}

/**
 * Returns the customer profile document.
 */
export async function getCustomerProfile(customerId) {
    return Customer.findById(customerId).lean();
}

// ── Profile Updates ───────────────────────────────────────────────────────────

/**
 * Applies allowed field updates to a vendor's profile.
 * Auto-promotes accountStatus from 'incompleteData' to 'active' once both
 * address.map and pickupTime are present on the updated document.
 */
export async function updateVendorProfile(vendorId, updates) {
    const updateOptions = { 
        returnDocument: 'after', // Replaces new: true to fix the deprecation warning
        runValidators: true // Ensures the new data adheres to your Mongoose Schema rules
    };

    const updatedUser = await Vendor.findByIdAndUpdate(vendorId, updates, updateOptions).lean();
    if (!updatedUser) return null;

    if (updatedUser.address?.map && updatedUser.pickupTime) {
        await UsersAuth.updateOne(
            { _id: updatedUser.authId, accountStatus: "incompleteData" },
            { accountStatus: "active" }
        );
    }

    return updatedUser;
}

/**
 * Applies allowed field updates to a customer's profile.
 */
export async function updateCustomerProfile(customerId, updates) {
    const updateOptions = { 
        returnDocument: 'after', 
        runValidators: true
    };
    return Customer.findByIdAndUpdate(customerId, updates, updateOptions).lean();
}

// ── Password Change ───────────────────────────────────────────────────────────

/**
 * Verifies the old password and saves the new one.
 * Hashing is handled by the UsersAuth pre-save hook.
 * Returns { success: true } or { error: string }.
 */
export async function changeUserPassword(userId, role, oldPassword, newPassword) {
    let profile;
    if (role === "vendor") {
        profile = await Vendor.findById(userId).select("authId");
    } else if (role === "customer") {
        profile = await Customer.findById(userId).select("authId");
    }

    if (!profile || !profile.authId) {
        return { error: "authentication record not found" };
    }

    const userAuth = await UsersAuth.findById(profile.authId);
    if (!userAuth) {
        return { error: "Authentication record not found" };
    }

    const isMatch = await bcrypt.compare(oldPassword, userAuth.password);
    if (!isMatch) {
        return { error: "Can not change password" };
    }

    userAuth.password = newPassword;
    await userAuth.save();

    return { success: true };
}

// ── Vendor Analytics ──────────────────────────────────────────────────────────

/**
 * Computes KPI analytics for a vendor from their order history.
 */
export async function computeVendorAnalytics(vendorId) {
    const vendorOrders = await Order.find({
        "products.vendorId": vendorId 
    });

    if (vendorOrders.length === 0) {
        return null; // Caller handles the empty-state response
    }
    
    let profit = 0;
    let currentOrderItems = 0;
    let completedOrderItems = 0;
    const customerSet = new Set(); 

    vendorOrders.forEach(order => {
        let orderHasVendorProduct = false;

        order.products.forEach(item => {
            
            if (item.vendorId?.toString() === vendorId) {
                orderHasVendorProduct = true;

                if (order.status === 'completed') {
                    profit += item.priceAtPurchase * item.quantity * 0.9; 
                    completedOrderItems += item.quantity;
                } else if (['pending', 'ready'].includes(order.status)) {
                    currentOrderItems += item.quantity;
                }
            }
        });

        if (orderHasVendorProduct && order.customerId) {
            customerSet.add(order.customerId.toString());
        }
    });

    return {
        profit: Math.round(profit * 100) / 100, 
        productsInCurrentOrders: currentOrderItems,
        productsInCompletedOrders: completedOrderItems,
        numberOfCustomers: customerSet.size 
    };
}

// ── Admin List Queries ────────────────────────────────────────────────────────

/**
 * Returns a paginated list of all vendors, sorted by moneyOwed descending.
 */
export async function getPaginatedVendors(page, limit) {
    const skip = (page - 1) * limit;

    const vendors = await Vendor.find({})
        .sort({ moneyOwed: -1 }) 
        .skip(skip)   // Skips the previous pages' items
        .limit(limit) // Grabs only the current page's size
        .lean();

    const totalVendors = await Vendor.countDocuments({});

    return { vendors, totalVendors };
}

/**
 * Returns a paginated list of all customers, sorted by createdAt descending.
 */
export async function getPaginatedCustomers(page, limit) {
    const skip = (page - 1) * limit;

    const customers = await Customer.find({})
        .sort({ createdAt: -1 }) // Shows newest registered customers first
        .skip(skip)
        .limit(limit)
        .lean(); // Faster lookup performance

    const totalCustomers = await Customer.countDocuments({});

    return { customers, totalCustomers };
}