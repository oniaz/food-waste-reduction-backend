import UsersAuth from "../../models/usersAuth.model.js";
import Vendors from "../../models/vendors.model.js";
import Customers from "../../models/customers.model.js";
import Order from "../../models/orders.model.js";
import Admin from "../../models/admins.models.js";

// ── Auth ──────────────────────────────────────────────────────────────────────

export const findAuthById = (id) =>
    UsersAuth.findById(id).select("-password -resetToken").lean();

export const findAuthByIdWithPassword = (id) =>
    UsersAuth.findById(id);

export const findAdminByAuthId = (authId) =>
    Admin.findOne({ authId }).lean();

export const activateIfIncomplete = (authId) =>
    UsersAuth.updateOne(
        { _id: authId, accountStatus: "incompleteData" },
        { accountStatus: "active" }
    );

// ── Vendors ───────────────────────────────────────────────────────────────────

export const findVendorById = (id) =>
    Vendors.findById(id).lean();

export const findVendorByIdWithAuthId = (id) =>
    Vendors.findById(id).select("authId");

export const updateVendorById = (id, updates, options) =>
    Vendors.findByIdAndUpdate(id, updates, options).lean();

export const findAllVendors = (skip, limit) =>
    Vendors.find({})
        .sort({ moneyOwed: -1 })
        .skip(skip)
        .limit(limit)
        .populate("authId", "accountStatus")
        .lean();
export const countVendors = () =>
    Vendors.countDocuments({});

// ── Customers ─────────────────────────────────────────────────────────────────

export const findCustomerById = (id) =>
    Customers.findById(id).lean();

export const findCustomerByIdWithAuthId = (id) =>
    Customers.findById(id).select("authId");

export const updateCustomerById = (id, updates, options) =>
    Customers.findByIdAndUpdate(id, updates, options).lean();

export const findAllCustomers = (skip, limit) =>
    Customers.find({})
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("authId", "accountStatus")

export const countCustomers = () =>
    Customers.countDocuments({});

// ── Orders (for analytics) ────────────────────────────────────────────────────

export const findOrdersByVendorId = (vendorId) =>
    Order.find({ "products.vendorId": vendorId });