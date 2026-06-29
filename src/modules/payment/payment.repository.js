import mongoose from "mongoose";
import Vendors from "../../models/vendors.model.js";
import UsersAuth from "../../models/usersAuth.model.js";
import VendorPaymentLog from "../../models/vendorPaymentLog.model.js";

// ── Vendors ───────────────────────────────────────────────────────────────────

export const findVendorById = (id) =>
    Vendors.findById(id);

// Atomically zero-out moneyOwed after a successful payment
export const clearVendorMoneyOwed = (vendorId) =>
    Vendors.findByIdAndUpdate(
        vendorId,
        { $set: { moneyOwed: 0 } },
        { returnDocument: "after", runValidators: true } // Cleaned up the deprecated warning
    );

// ── Payment Logs ──────────────────────────────────────────────────────────────

export const createPaymentLog = (data) =>
    VendorPaymentLog.create(data);

export const findPaymentLogByTransactionId = (transactionId) =>
    VendorPaymentLog.findOne({ paymobTransactionId: transactionId });

export const findPaymentLogsByVendor = (vendorId, skip, limit) =>
    VendorPaymentLog.find({ vendorId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

export const countPaymentLogsByVendor = (vendorId) =>
    VendorPaymentLog.countDocuments({ vendorId });

// ── Admin Filtered Log Queries ────────────────────────────────────────────────

/**
 * Builds vendor ID filter sets when shopName or username filters are provided.
 * Returns null if no filter is active (meaning: include all vendors).
 *
 * Strategy:
 * - shopName  → query Vendors collection directly (case-insensitive regex)
 * - username  → query UsersAuth, then cross-reference Vendors via authId
 * Both filters narrow the set of vendorIds to match against VendorPaymentLog.
 */
async function resolveVendorIdFilter({ shopName, username }) {
    const hasFilter = shopName || username;
    if (!hasFilter) return null; // No filter — match all logs

    let vendorIds = null;

    if (shopName) {
        const matchedVendors = await Vendors.find({
            shopName: { $regex: shopName, $options: "i" }, // case-insensitive partial match
        }).select("_id").lean();

        vendorIds = matchedVendors.map((v) => v._id);
    }

    if (username) {
        // username lives in UsersAuth — look up the authId, then find the Vendor by authId
        const authRecord = await UsersAuth.findOne({ username }).select("_id").lean();

        if (!authRecord) {
            // Username doesn't exist — return an empty set so the query returns nothing
            return [];
        }

        const vendorByAuth = await Vendors.findOne({ authId: authRecord._id }).select("_id").lean();

        if (!vendorByAuth) {
            return []; // Auth exists but no vendor profile — return empty
        }

        const usernameVendorId = vendorByAuth._id;

        // If shopName filter is also active, intersect the two sets
        if (vendorIds !== null) {
            vendorIds = vendorIds.filter(
                (id) => id.toString() === usernameVendorId.toString()
            );
        } else {
            vendorIds = [usernameVendorId];
        }
    }

    return vendorIds; // May be an empty array if filters match nothing
}

/**
 * Fetches all payment logs with optional vendor filter and date sort direction.
 * Populates vendorId with shopName, taxNumber, and authId (for username lookup).
 * Post-population, attaches vendorUsername from the populated authId.
 */
export async function findAllPaymentLogsFiltered({ shopName, username, sortDirection, skip, limit }) {
    const vendorIds = await resolveVendorIdFilter({ shopName, username });

    // Build the base match — only restrict vendorId if a filter resolved a set
    const match = {};
    if (vendorIds !== null) {
        match.vendorId = { $in: vendorIds.map((id) => new mongoose.Types.ObjectId(id.toString())) };
    }

    const rawLogs = await VendorPaymentLog.find(match)
        .sort({ createdAt: sortDirection })
        .skip(skip)
        .limit(limit)
        .populate({
            path: "vendorId",
            select: "shopName taxNumber authId", // authId needed to look up username
            populate: {
                path: "authId",
                model: "UsersAuth",
                select: "username", // Only pull the username field
            },
        })
        .lean();

    // Flatten vendorUsername onto the top level for clean response shape
    return rawLogs.map((log) => ({
        ...log,
        vendorId: {
            _id: log.vendorId?._id,
            shopName: log.vendorId?.shopName,
            taxNumber: log.vendorId?.taxNumber,
            username: log.vendorId?.authId?.username || null,
        },
    }));
}

export async function countAllPaymentLogsFiltered({ shopName, username }) {
    const vendorIds = await resolveVendorIdFilter({ shopName, username });

    const match = {};
    if (vendorIds !== null) {
        match.vendorId = { $in: vendorIds.map((id) => new mongoose.Types.ObjectId(id.toString())) };
    }

    return VendorPaymentLog.countDocuments(match);
}