import UsersAuth from "../../models/usersAuth.model.js";
import Vendors from "../../models/vendors.model.js";
import Customers from "../../models/customers.model.js";
import Admin from "../../models/admins.models.js";
import Logs from "../../models/adminLogs.model.js";

// ── UsersAuth ─────────────────────────────────────────────────────────────────

export const findPendingVendorAuthIds = () =>
    UsersAuth.distinct("_id", { role: "vendor", accountStatus: "pending" });

export const findAuthById = (id) =>
    UsersAuth.findById(id);

export const updateAuthStatus = (id, status) =>
    UsersAuth.findByIdAndUpdate(
        id,
        { accountStatus: status },
        { returnDocument: "after", runValidators: true }
    );

// ── Admin ─────────────────────────────────────────────────────────────────────

export const findAdminByAuthId = (authId) =>
    Admin.findOne({ authId });

export const findAdminById = (id) =>
    Admin.findById(id);

// ── Vendors ───────────────────────────────────────────────────────────────────

export const findVendorsByAuthIds = (authIds) =>
    Vendors.find({ authId: { $in: authIds } }).lean();

export const findVendorById = (id) =>
    Vendors.findById(id);

// ── Customers ─────────────────────────────────────────────────────────────────

export const findCustomerById = (id) =>
    Customers.findById(id);

// ── Logs ──────────────────────────────────────────────────────────────────────

export const createLog = (data) =>
    Logs.create(data);

export const countAllLogs = () =>
    Logs.countDocuments();

export const findAllLogs = (skip, limit) =>
    Logs.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean();

export const countLogsByAdmin = (adminId) =>
    Logs.countDocuments({ adminId });

export const findLogsByAdmin = (adminId, skip, limit) =>
    Logs.find({ adminId }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean();