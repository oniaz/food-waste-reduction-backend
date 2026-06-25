import mongoose from "mongoose";
import UsersAuth from "../../models/usersAuth.model.js";
import Vendor from "../../models/vendors.model.js";
import Customer from "../../models/customers.model.js";
import Logs from "../../models/adminLogs.model.js";
import Admin from "../../models/admins.models.js";

// ── Pending Vendors ───────────────────────────────────────────────────────────

/**
 * Returns a paginated list of vendor profiles whose accountStatus is 'pending'.
 */
export async function getPendingVendorsList(page, limit) {
    const skip = (page - 1) * limit;

    const allPendingVendorIds = await UsersAuth.distinct(
        "_id", 
        { role: "vendor", accountStatus: "pending" }
    );

    const totalVendors = allPendingVendorIds.length;

    //Slice the IDs array for pagination OR let the second query handle skip/limit
    const paginatedIds = allPendingVendorIds.slice(skip, skip + limit);

    const pendingVendors = await Vendor.find({ 
        authId: { $in: paginatedIds } 
    }).lean(); // .lean() makes this dashboard query much faster

    return { pendingVendors, totalVendors };
}

// ── Vendor Status ─────────────────────────────────────────────────────────────

/**
 * Updates a vendor's accountStatus and writes an audit log.
 * Returns { data, message } on success or { error, status } on a business-rule violation.
 */
export async function updateVendorStatus(authId, vendorId, newStatus) {
    const validStatuses = ['pending', 'incompleteData', 'active', 'suspended'];

    if (!mongoose.Types.ObjectId.isValid(vendorId)) {
        return { error: "Invalid vendor ID format", status: 400 };
    }
    if (!newStatus || !validStatuses.includes(newStatus)) {
        return { error: "Invalid or missing status value", status: 400 };
    }

    const adminProfile = await Admin.findOne({ authId });
    if (!adminProfile) {
        return { error: "Admin profile record not found", status: 404 };
    }

    const vendorProfile = await Vendor.findById(vendorId);
    if (!vendorProfile) {
        return { error: "Vendor profile not found", status: 404 };
    }

    // get current account status before overwrite 
    const currentAuth = await UsersAuth.findById(vendorProfile.authId);
    if (!currentAuth) {
        return { error: "Associated authentication account not found", status: 404 };
    }
    const previousStatus = currentAuth.accountStatus;

    if (previousStatus === newStatus) {
        return { error: `Vendor account is already ${newStatus}`, status: 400 };
    }

    //Maping the action string to match your exact schema enum values
    let logAction;
    if (newStatus === 'incompleteData') {
        logAction = 'approve_vendor';
    } else if (newStatus === 'active') {
        if (previousStatus === 'suspended') {
            logAction = 'reactivate_user';
        } else {
            return { error: "Bad Request: Accounts can only be manually set to active from a suspended state.", status: 400 };
        }
    } else if (newStatus === 'suspended') {
        if (previousStatus === 'pending') {
            logAction = 'reject_vendor';
        } else if (previousStatus === 'active' || previousStatus === 'incompleteData') {
            logAction = 'suspend_user'; 
        }
    } else if (newStatus === 'pending') {
        logAction = 'suspend_user'; 
    }

    const updatedAuth = await UsersAuth.findByIdAndUpdate(
        vendorProfile.authId,
        { accountStatus: newStatus },
        { returnDocument: 'after', runValidators: true }
    );

    // Create the system log 
    Logs.create({
        adminId: adminProfile._id, // Now referencing the real '_id' from the Admin collection
        userId: vendorProfile.authId, // Targets 'UsersAuth' of the vendor being updated
        action: logAction,
        description: `Changed vendor with Id ${vendorId} status from '${previousStatus}' to '${newStatus}'.`
    })

    return {
        data: {
            vendorId: vendorProfile._id,
            authId: updatedAuth._id,
            newStatus: updatedAuth.accountStatus
        },
        message: `Vendor account status successfully updated to ${newStatus}`
    };
}

// ── Customer Status ───────────────────────────────────────────────────────────

/**
 * Updates a customer's accountStatus and writes an audit log.
 * Returns { data, message } on success or { error, status } on a business-rule violation.
 */
export async function updateCustomerStatus(authId, customerId, newStatus) {
    const validStatuses = ['pending', 'active', 'suspended'];

    if (!mongoose.Types.ObjectId.isValid(customerId)) {
        return { error: "Invalid customer ID format", status: 400 };
    }
    if (!newStatus || !validStatuses.includes(newStatus)) {
        return { error: "Invalid or missing status value", status: 400 };
    }

    const adminProfile = await Admin.findOne({ authId });
    if (!adminProfile) {
        return { error: "Admin profile record not found", status: 404 };
    }

    const customerProfile = await Customer.findById(customerId);
    if (!customerProfile) {
        return { error: "Customer profile not found", status: 404 };
    }

    const currentAuth = await UsersAuth.findById(customerProfile.authId);
    if (!currentAuth) {
        return { error: "Associated authentication account not found", status: 404 };
    }
    const previousStatus = currentAuth.accountStatus;

    if (previousStatus === newStatus) {
        return { error: `Customer account is already ${newStatus}`, status: 400 };
    }

    let logAction;
    if (newStatus === 'active') {
        if (previousStatus === 'suspended') {
            logAction = 'reactivate_user';
        } else if (previousStatus === 'pending') {
            logAction = 'reactivate_user'; // Custom action tag for clean audit sorting
        } else {
            return { error: "Bad Request: Customer accounts can only be set to active from a pending or suspended state.", status: 400 };
        }
    } else if (newStatus === 'suspended') {
        logAction = 'suspend_user'; 
    } else if (newStatus === 'pending') {
        logAction = 'suspend_user'; 
    }

    // Perform the write update operation
    const updatedAuth = await UsersAuth.findByIdAndUpdate(
        customerProfile.authId,
        { accountStatus: newStatus },
        { returnDocument: 'after', runValidators: true }
    );

    // Create the system log 
    await Logs.create({
        adminId: adminProfile._id, 
        userId: customerProfile.authId, // Targets 'UsersAuth' of the customer being updated
        action: logAction,
        description: `Changed customer with Id ${customerId} status from '${previousStatus}' to '${newStatus}'.`
    });

    return {
        data: {
            customerId: customerProfile._id,
            authId: updatedAuth._id,
            newStatus: updatedAuth.accountStatus
        },
        message: `Customer account status successfully updated to ${newStatus}`
    };
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

/**
 * Returns a paginated list of all AdminLogs, sorted newest first.
 */
export async function getAllAdminLogs(page, limit) {
    const skip = (page - 1) * limit;

    const totalLogs = await Logs.countDocuments(); 

    const logs = await Logs.find()
        .sort({ createdAt: -1 }) // -1 sorts descending (newest first)
        .skip(skip)
        .limit(limit)
        .lean(); // Converts Mongoose docs to lightweight JSON objects

    return { logs, totalLogs };
}

/**
 * Returns a paginated list of logs scoped to a single admin.
 * Returns { error, status } if the admin is not found.
 */
export async function getLogsByAdmin(adminId, page, limit) {
    if (!mongoose.Types.ObjectId.isValid(adminId)) {
        return { error: "Invalid Admin ID format", status: 400 };
    }

    const adminProfile = await Admin.findById(adminId); //check admin exists
    if (!adminProfile) {
        return { error: "Admin profile not found", status: 404 };
    }

    const skip = (page - 1) * limit;
    const logQuery = { adminId: adminProfile._id };
    const totalLogs = await Logs.countDocuments(logQuery); 

    const logs = await Logs.find(logQuery)
        .sort({ createdAt: -1 }) 
        .skip(skip)
        .limit(limit)
        .lean(); 

    return { logs, totalLogs };
}