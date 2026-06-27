import bcrypt from "bcrypt";
import AppError from "../../utils/AppError.js";
import * as usersRepo from "./users.repository.js";

// ── Profile Fetching ──────────────────────────────────────────────────────────

/**
 * Returns the auth record without sensitive fields.
 */
export async function getAuthRecord(authId) {
    const userAuth = await usersRepo.findAuthById(authId);
    if (!userAuth) throw new AppError("Account authentication credentials not found", 404);
    return userAuth;
}

/**
 * Returns the vendor profile with a computed average rating appended.
 */
export async function getVendorProfile(vendorId) {
    const vendorData = await usersRepo.findVendorById(vendorId);
    if (!vendorData) throw new AppError("Vendor profile not found", 404);

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
    const customerData = await usersRepo.findCustomerById(customerId);
    if (!customerData) throw new AppError("Customer profile not found", 404);
    return customerData;
}

/**
 * Returns the admin profile document.
 */
export async function getAdminProfile(authId) {
    const adminData = await usersRepo.findAdminByAuthId(authId);
    if (!adminData) throw new AppError("Admin profile not found", 404);
    return adminData;
}

// ── Profile Updates ───────────────────────────────────────────────────────────

/**
 * Applies allowed field updates to a vendor's profile.
 * Auto-promotes accountStatus from 'incompleteData' to 'active' once both
 * address.map and pickupTime are present on the updated document.
 */
export async function updateVendorProfile(vendorId, updates) {
    const updateOptions = {
        returnDocument: "after", // Replaces new: true to fix the deprecation warning
        runValidators: true, // Ensures the new data adheres to your Mongoose Schema rules
    };

    const updatedUser = await usersRepo.updateVendorById(vendorId, updates, updateOptions);
    if (!updatedUser) throw new AppError("Vendor profile not found", 404);

    if (updatedUser.address?.map && updatedUser.pickupTime) {
        await usersRepo.activateIfIncomplete(updatedUser.authId);
    }

    return updatedUser;
}

/**
 * Applies allowed field updates to a customer's profile.
 */
export async function updateCustomerProfile(customerId, updates) {
    const updateOptions = {
        returnDocument: "after",
        runValidators: true,
    };

    const updatedUser = await usersRepo.updateCustomerById(customerId, updates, updateOptions);
    if (!updatedUser) throw new AppError("Customer profile not found", 404);
    return updatedUser;
}

// ── Password Change ───────────────────────────────────────────────────────────

/**
 * Verifies the old password and saves the new one.
 * Hashing is handled by the UsersAuth pre-save hook.
 */
export async function changeUserPassword(userId, role, oldPassword, newPassword) {
    let profile;
    if (role === "vendor") {
        profile = await usersRepo.findVendorByIdWithAuthId(userId);
    } else if (role === "customer") {
        profile = await usersRepo.findCustomerByIdWithAuthId(userId);
    }

    if (!profile || !profile.authId) {
        throw new AppError("Authentication record not found", 404);
    }

    const userAuth = await usersRepo.findAuthByIdWithPassword(profile.authId);
    if (!userAuth) throw new AppError("Authentication record not found", 404);

    const isMatch = await bcrypt.compare(oldPassword, userAuth.password);
    if (!isMatch) throw new AppError("Current password is incorrect", 400);
    userAuth.password = newPassword;
    await userAuth.save();
}

// ── Vendor Analytics ──────────────────────────────────────────────────────────

/**
 * Computes KPI analytics for a vendor from their order history.
 * Returns null if the vendor has no orders yet.
 */
export async function computeVendorAnalytics(vendorId) {
    const vendorOrders = await usersRepo.findOrdersByVendorId(vendorId);

    if (vendorOrders.length === 0) {
        return null; // Caller handles the empty-state response
    }

    let profit = 0;
    let currentOrderItems = 0;
    let completedOrderItems = 0;
    const customerSet = new Set();

    vendorOrders.forEach((order) => {
        let orderHasVendorProduct = false;

        order.products.forEach((item) => {

            if (item.vendorId?.toString() === vendorId) {
                orderHasVendorProduct = true;

                if (order.status === "completed") {
                    profit += item.priceAtPurchase * item.quantity * 0.9;
                    completedOrderItems += item.quantity;
                } else if (["pending", "ready"].includes(order.status)) {
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
        numberOfCustomers: customerSet.size,
    };
}

// ── Admin List Queries ────────────────────────────────────────────────────────

/**
 * Returns a paginated list of all vendors, sorted by moneyOwed descending.
 */
export async function getPaginatedVendors(page, limit) {
    const skip = (page - 1) * limit;
    const vendors = await usersRepo.findAllVendors(skip, limit);
    const totalVendors = await usersRepo.countVendors();
    return { vendors, totalVendors };
}

/**
 * Returns a paginated list of all customers, sorted by createdAt descending.
 */
export async function getPaginatedCustomers(page, limit) {
    const skip = (page - 1) * limit;
    const customers = await usersRepo.findAllCustomers(skip, limit);
    const totalCustomers = await usersRepo.countCustomers();
    return { customers, totalCustomers };
}