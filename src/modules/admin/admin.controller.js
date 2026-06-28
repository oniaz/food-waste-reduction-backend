import {
    getPendingVendorsList,
    updateVendorStatus,
    updateCustomerStatus,
    getAllAdminLogs,
    getLogsByAdmin,
    getDashBoard
} from "./admin.service.js";

// GET /admin/pending-vendors | Auth required (admin) | list vendors awaiting approval
/**
 * @api {get} /admin/pending-vendors List vendors awaiting approval
 * @apiName GetPendingVendors
 * @apiGroup Admin
 * @apiPermission admin
 * @description Fetches a paginated list of vendor profiles whose accounts are currently in a 'pending' status.
 * @param {Object} req.query.page - The page number to fetch.
 * @param {Object} req.query.limit - Number of vendor records per page.
 * @returns {Object} 200 - Paginated pending vendor profiles with metadata.
 */
export const getPendingVendors = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;

        const { pendingVendors, totalVendors } = await getPendingVendorsList(page, limit);

        return res.status(200).json({
            success: true,
            pagination: {
                totalVendors,
                currentPage: page,
                totalPages: Math.ceil(totalVendors / limit),
                limit,
            },
            count: pendingVendors.length, // Shows how many are on THIS page
            pendingVendors,
        });
    } catch (error) {
        next(error);
    }
};

// PATCH /admin/vendors/:vendorId/status | Auth required (admin) | approve or reject vendor account
/**
 * @api {patch} /admin/vendors/:vendorId/status Approve, reject, or suspend a vendor account
 * @apiName ChangeVendorStatus
 * @apiGroup Admin
 * @apiPermission admin
 * @description Updates a vendor's accountStatus and writes an immutable audit log.
 * Input validation is handled by validateVendorStatusUpdate middleware.
 * Business rules (valid transitions, duplicate status) are enforced by the service.
 * @param {string} req.params.vendorId - Target Vendor document _id.
 * @param {string} req.body.status - Target status string.
 * @returns {Object} 200 - Updated status data.
 */
export const changeVendorStatus = async (req, res, next) => {
    try {
        const { vendorId } = req.params;
        const { status } = req.body;
        const authId = req.user.authId; // UsersAuth ID of the acting admin

        const data = await updateVendorStatus(authId, vendorId, status);

        return res.status(200).json({
            success: true,
            message: `Vendor account status successfully updated to ${status}`,
            data,
        });
    } catch (error) {
        next(error);
    }
};

// GET /admin/logs | Auth required (admin) | get all system admin logs
/**
 * @api {get} /admin/logs Get all system admin logs
 * @apiName GetAllLogs
 * @apiGroup Admin
 * @apiPermission admin
 * @description Retrieves a globally paginated chronological stream of all system administration actions.
 * @param {number} req.query.page - Page number.
 * @param {number} req.query.limit - Records per page.
 * @returns {Object} 200 - Paginated log entries with metadata.
 */
export const getAllLogs = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;

        const { logs, totalLogs } = await getAllAdminLogs(page, limit);

        return res.status(200).json({
            success: true,
            pagination: {
                totalLogs,
                currentPage: page,
                totalPages: Math.ceil(totalLogs / limit),
                limit,
            },
            count: logs.length,
            logs,
        });
    } catch (error) {
        next(error);
    }
};

// GET /admin/:id/logs | Auth required (admin) | get logs for specific admin user
/**
 * @api {get} /admin/:id/logs Get logs for a specific admin user
 * @apiName GetAdminLogs
 * @apiGroup Admin
 * @apiPermission admin
 * @description Fetches paginated audit log entries for a single admin.
 * ID format validation is handled by validateAdminIdParam middleware.
 * @param {string} req.params.id - Target Admin document _id.
 * @returns {Object} 200 - Paginated log entries with metadata.
 */
export const getAdminLogs = async (req, res, next) => {
    try {
        const targetAdminId = req.params.id; //admin Id from admin table
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;

        const { logs, totalLogs } = await getLogsByAdmin(targetAdminId, page, limit);

        return res.status(200).json({
            success: true,
            pagination: {
                totalLogs,
                currentPage: page,
                totalPages: Math.ceil(totalLogs / limit),
                limit,
            },
            count: logs.length,
            logs,
        });
    } catch (error) {
        next(error);
    }
};

// PATCH /admin/customers/:customerId/status | Auth required (admin) | suspend or activate user
/**
 * @api {patch} /api/admin/customer/:customerId/status Update Customer Account Status
 * @apiName ChangeCustomerStatus
 * @apiGroup Admin
 * @apiPermission admin
 * @description Modifies the accountStatus of a customer profile.
 * Input validation is handled by validateCustomerStatusUpdate middleware.
 * Business rules are enforced by the service.
 * @param {string} req.params.customerId - Target Customer document _id.
 * @param {string} req.body.status - Target status string.
 * @returns {Object} 200 - Updated status data.
 */
export const changeCustomerStatus = async (req, res, next) => {
    try {
        const { customerId } = req.params;
        const { status } = req.body;
        const authId = req.user.authId; // UsersAuth ID of the acting admin

        const data = await updateCustomerStatus(authId, customerId, status);

        return res.status(200).json({
            success: true,
            message: `Customer account status successfully updated to ${status}`,
            data,
        });
    } catch (error) {
        next(error);
    }
};

// Get /admin/dashboard
export const getAdminDashboard =async(req,res,next)=>{
    try {
    const data = await getDashBoard();
    return res.status(200).json({
            success: true,
            message: `Retrived Dashboard info Successfully`,
            data,
    });
        
    } catch (error) {
        console.log(error);
         next(error);
    }
}