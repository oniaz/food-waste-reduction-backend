import { waitUntil } from "@vercel/functions";
import AppError from "../../utils/AppError.js";
import * as adminRepo from "./admin.repository.js";
import { sendAccountStatusEmail } from "../../utils/mailer.js";

// ── Pending Vendors ───────────────────────────────────────────────────────────

/**
 * Returns a paginated list of vendor profiles whose accountStatus is 'pending'.
 */
export async function getPendingVendorsList(page, limit) {
    const skip = (page - 1) * limit;

    const allPendingVendorIds = await adminRepo.findPendingVendorAuthIds();
    const totalVendors = allPendingVendorIds.length;

    //Slice the IDs array for pagination OR let the second query handle skip/limit
    const paginatedIds = allPendingVendorIds.slice(skip, skip + limit);

    const pendingVendors = await adminRepo.findVendorsByAuthIds(paginatedIds); // .lean() makes this dashboard query much faster

    return { pendingVendors, totalVendors };
}

// ── Vendor Status ─────────────────────────────────────────────────────────────

/**
 * Updates a vendor's accountStatus and writes an audit log.
 * Throws AppError on any business-rule violation.
 */
export async function updateVendorStatus(authId, vendorId, newStatus) {
    const validStatuses = ["pending", "incompleteData", "active", "suspended"];

    if (!newStatus || !validStatuses.includes(newStatus)) {
        throw new AppError("Invalid or missing status value", 400);
    }

    const adminProfile = await adminRepo.findAdminByAuthId(authId);
    if (!adminProfile) throw new AppError("Admin profile record not found", 404);

    const vendorProfile = await adminRepo.findVendorById(vendorId);
    if (!vendorProfile) throw new AppError("Vendor profile not found", 404);

    // get current account status before overwrite
    const currentAuth = await adminRepo.findAuthById(vendorProfile.authId);
    if (!currentAuth) throw new AppError("Associated authentication account not found", 404);

    const previousStatus = currentAuth.accountStatus;

    if (previousStatus === newStatus) {
        throw new AppError(`Vendor account is already ${newStatus}`, 400);
    }

    //Maping the action string to match your exact schema enum values
    let logAction;
    if (newStatus === "incompleteData") {
        logAction = "approve_vendor";
    } else if (newStatus === "active") {
        if (previousStatus === "suspended") {
            logAction = "reactivate_user";
        } else {
            throw new AppError(
                "Bad Request: Accounts can only be manually set to active from a suspended state.",
                400
            );
        }
    } else if (newStatus === "suspended") {
        if (previousStatus === "pending") {
            logAction = "reject_vendor";
        } else if (previousStatus === "active" || previousStatus === "incompleteData") {
            logAction = "suspend_user";
        }
    } else if (newStatus === "pending") {
        logAction = "suspend_user";
    }

    const updatedAuth = await adminRepo.updateAuthStatus(vendorProfile.authId, newStatus);

    // Create the system log (fire-and-forget — non-blocking audit write)
    adminRepo.createLog({
        adminId: adminProfile._id, // Now referencing the real '_id' from the Admin collection
        userId: vendorProfile.authId, // Targets 'UsersAuth' of the vendor being updated
        action: logAction,
        description: `Changed vendor of shop ${vendorProfile.shopName}  with username: ${currentAuth.username} status from '${previousStatus}' to '${newStatus}'.`,
    });

    // Send status change notification email
    waitUntil(
        sendAccountStatusEmail(currentAuth.email, currentAuth.username, newStatus, "vendor")
            .then((emailResult) => {
                if (emailResult && !emailResult.success) {
                    console.warn(
                        `[Warning] Status notification email failed to send to vendor ${currentAuth.username} (${currentAuth.email})`
                    );
                }
            })
            .catch((err) => {
                console.error("[Email Error]", err);
            })
    );

    return {
        vendorId: vendorProfile._id,
        authId: updatedAuth._id,
        newStatus: updatedAuth.accountStatus,
    };
}

// ── Customer Status ───────────────────────────────────────────────────────────

/**
 * Updates a customer's accountStatus and writes an audit log.
 * Throws AppError on any business-rule violation.
 */
export async function updateCustomerStatus(authId, customerId, newStatus) {
    const validStatuses = ["pending", "active", "suspended"];

    if (!newStatus || !validStatuses.includes(newStatus)) {
        throw new AppError("Invalid or missing status value", 400);
    }

    const adminProfile = await adminRepo.findAdminByAuthId(authId);
    if (!adminProfile) throw new AppError("Admin profile record not found", 404);

    const customerProfile = await adminRepo.findCustomerById(customerId);
    if (!customerProfile) throw new AppError("Customer profile not found", 404);

    const currentAuth = await adminRepo.findAuthById(customerProfile.authId);
    if (!currentAuth) throw new AppError("Associated authentication account not found", 404);

    const previousStatus = currentAuth.accountStatus;

    if (previousStatus === newStatus) {
        throw new AppError(`Customer account is already ${newStatus}`, 400);
    }

    let logAction;
    if (newStatus === "active") {
        if (previousStatus === "suspended") {
            logAction = "reactivate_user";
        } else if (previousStatus === "pending") {
            logAction = "reactivate_user"; // Custom action tag for clean audit sorting
        } else {
            throw new AppError(
                "Bad Request: Customer accounts can only be set to active from a pending or suspended state.",
                400
            );
        }
    } else if (newStatus === "suspended") {
        logAction = "suspend_user";
    } else if (newStatus === "pending") {
        logAction = "suspend_user";
    }

    // Perform the write update operation
    const updatedAuth = await adminRepo.updateAuthStatus(customerProfile.authId, newStatus);

    // Create the system log
    await adminRepo.createLog({
        adminId: adminProfile._id,
        userId: customerProfile.authId, // Targets 'UsersAuth' of the customer being updated
        action: logAction,
        description: `Changed customer ${customerProfile.name.firstName} ${customerProfile.name.lastName} with username: ${currentAuth.username} status from '${previousStatus}' to '${newStatus}'.`,
    });

    // Send status change notification email
    waitUntil(
        sendAccountStatusEmail(
            currentAuth.email,
            currentAuth.username,
            newStatus,
            "customer"
        )
            .then((emailResult) => {
                if (emailResult && !emailResult.success) {
                    console.warn(
                        `[Warning] Status notification email failed to send to customer ${currentAuth.username} (${currentAuth.email})`
                    );
                }
            })
            .catch((err) => {
                console.error("[Email Error]", err);
            })
    );

    return {
        customerId: customerProfile._id,
        authId: updatedAuth._id,
        newStatus: updatedAuth.accountStatus,
    };
}

// ── Audit Logs ────────────────────────────────────────────────────────────────

/**
 * Returns a paginated list of all AdminLogs, sorted newest first.
 */
export async function getAllAdminLogs(page, limit) {
    const skip = (page - 1) * limit;
    const totalLogs = await adminRepo.countAllLogs();
    const logs = await adminRepo.findAllLogs(skip, limit); // Converts Mongoose docs to lightweight JSON objects
    return { logs, totalLogs };
}

/**
 * Returns a paginated list of logs scoped to a single admin.
 * Throws AppError if the admin is not found.
 */
export async function getLogsByAdmin(adminId, page, limit) {
    const adminProfile = await adminRepo.findAdminById(adminId); //check admin exists
    if (!adminProfile) throw new AppError("Admin profile not found", 404);

    const skip = (page - 1) * limit;
    const totalLogs = await adminRepo.countLogsByAdmin(adminProfile._id);
    const logs = await adminRepo.findLogsByAdmin(adminProfile._id, skip, limit);

    return { logs, totalLogs };
}

//Admin Dashboard
export async function getDashBoard() {
    const totalVendors = await adminRepo.countVendors();
    console.log("1");
    const totalCustomers = await adminRepo.countCustomers();
    const totalOrders = await adminRepo.countOrders();
    const totalProducts= await adminRepo.countProducts();
    return { totalVendors, totalCustomers, totalOrders , totalProducts };
}