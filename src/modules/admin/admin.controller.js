import {
    getPendingVendorsList,
    updateVendorStatus,
    updateCustomerStatus,
    getAllAdminLogs,
    getLogsByAdmin,
} from "./admin.service.js";

// GET /admin/pending-vendors | Auth required (admin) | list vendors awaiting approval
/**
 * @api {get} /admin/pending-vendors List vendors awaiting approval
 * @apiName GetPendingVendors
 * @apiGroup Admin
 * @apiPermission admin
 * * @description Fetches a paginated list of vendor profiles whose accounts are currently in a 'pending' status.
 * Requires an authenticated user session with the 'admin' role.
 * * @param {Object} req - Express request object.
 * @param {Object} req.user - Authenticated user details attached by auth middleware.
 * @param {string} req.user.authId - The authenticated account ID of the current user.
 * @param {string} req.user.role - The role of the current user (must be 'admin').
 * @param {Object} req.query - Query parameters for pagination.
 * @param {number} [req.query.page=1] - The page number to fetch.
 * @param {number} [req.query.limit=10] - Number of vendor records per page.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function for error handling.
 * * @returns {Object} 200 - An object containing a success flag, paginated vendor profiles, and metadata.
 * @returns {boolean} response.success - Indicates if the operation was successful.
 * @returns {Object} response.pagination - Pagination metadata.
 * @returns {number} response.pagination.totalVendors - Total number of matching pending vendors across all pages.
 * @returns {number} response.pagination.currentPage - The current page number being viewed.
 * @returns {number} response.pagination.totalPages - Total calculated pages available.
 * @returns {number} response.pagination.limit - Number of records fetched per page.
 * @returns {number} response.count - The number of vendor records returned on the current page.
 * @returns {Array<Object>} response.pendingVendors - Array of lightweight, lean vendor document profiles.
 * * @throws {Object} 401 - Unauthorized: If the `authId` is missing from the session context.
 * @throws {Object} 403 - Forbidden: If the user making the request does not have an 'admin' role.
 * @throws {Error} Passes any database or internal execution failures to the global error handler via `next(error)`.
 */
export const getPendingVendors = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const authId = req.user?.authId;
        
        if (!authId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }

        const page = parseInt(req.query.page, 10) || 1;   
        const limit = parseInt(req.query.limit, 10) || 10; 

        const { pendingVendors, totalVendors } = await getPendingVendorsList(page, limit);

        return res.status(200).json({ 
            success: true, 
            pagination: {
                totalVendors,
                currentPage: page,
                totalPages: Math.ceil(totalVendors / limit),
                limit
            },
            count: pendingVendors.length, // Shows how many are on THIS page
            pendingVendors 
        });
        
    } catch (error) {
        console.log(error);
        next(error);
    }
};

// PATCH /admin/vendors/:vendorId/status | Auth required (admin) | approve or reject vendor account
/**
 * @api {patch} /admin/vendors/:vendorId/status Approve, reject, or suspend a vendor account
 * @apiName ChangeVendorStatus
 * @apiGroup Admin
 * @apiPermission admin
 * * @description Updates a vendor's authentication account status (`pending`, `incompleteData`, `active`, or `suspended`) 
 * and asynchronously creates an immutable system audit log tracking the state transition action.
 * * @param {Object} req - Express request object.
 * @param {Object} req.user - Authenticated session details attached by security middleware.
 * @param {string} req.user.authId - The `UsersAuth` ID of the issuing admin.
 * @param {string} req.user.role - The security role of the current user (must be 'admin').
 * @param {Object} req.params - URL route parameters.
 * @param {string} req.params.vendorId - The 24-character hexadecimal Mongoose ObjectId of the target Vendor profile.
 * @param {Object} req.body - JSON payload data.
 * @param {"pending"|"incompleteData"|"active"|"suspended"} req.body.status - The target status to transition the vendor account into.
 * @param {Object} res - Express response object.
 * @param {Function} next - Express next middleware function for error handling pipelines.
 * * @returns {Object} 200 - Success response containing updated account visibility parameters.
 * @returns {boolean} response.success - Always true upon successful execution.
 * @returns {string} response.message - Clarifying verification message stating the new status string.
 * @returns {Object} response.data - Synchronized ID payloads reflecting database states.
 * @returns {string} response.data.vendorId - Core structural MongoDB profile document identity match.
 * @returns {string} response.data.authId - Corresponding network security credential wrapper document mapping.
 * @returns {string} response.data.newStatus - The definitive live state value matching the update.
 * * @throws {Object} 401 - Unauthorized: If the active middleware state cannot verify a valid `authId`.
 * @throws {Object} 403 - Forbidden: Passed if user credentials possess standard consumer or base vendor access layers.
 * @throws {Object} 400 - Bad Request: Emitted for malformed `vendorId` fields, illegal state request formats, or identity logic redundancy (e.g. state updating to itself) or unauthorized state paths (e.g. going straight to active from pending).
 * @throws {Object} 404 - Not Found: Triggered if matching database profiles for the targeted Vendor profile, Admin profile context, or Core Authentication mapping values cannot be fetched.
 */
export const changeVendorStatus = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const authId = req.user?.authId; // This is the UsersAuth ID
        const { vendorId } = req.params; 
        const { status } = req.body;

        if (!authId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }

        const result = await updateVendorStatus(authId, vendorId, status);

        if (result.error) {
            return res.status(result.status).json({ message: result.error });
        }

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.data
        });
        
    } catch (error) {
        console.log(error);
        next(error);
    }
};

// GET /admin/logs | Auth required (admin) | get all system admin logs
/**
 * @api {get} /admin/logs Get all system admin logs
 * @apiName GetAllLogs
 * @apiGroup Admin
 * @apiPermission admin
 * * @description Retrieves a globally paginated chronological stream of all system administration actions,
 * automatically sorted to deliver the most recent actions first (`descending`). 
 * Guarded against non-administrative account visibility scopes.
 * * @param {Object} req - Express request object.
 * @param {Object} req.user - Security session wrapper injected by prior authorization validation middlewares.
 * @param {string} req.user.authId - System validation identity key corresponding to the admin making the request.
 * @param {string} req.user.role - Functional credential level verification marker (must exactly evaluate to 'admin').
 * @param {Object} req.query - Incoming query parameters parsing filters.
 * @param {number} [req.query.page=1] - Sequential ledger view page index mapping target context blocks.
 * @param {number} [req.query.limit=10] - Window block sizing controlling records fetched dynamically per cycle.
 * @param {Object} res - Express server-to-client processing channel stream object.
 * @param {Function} next - Intercept pipe mechanism routing runtime execution faults directly into global capture hooks.
 * * @returns {Object} 200 - Seamless data transmission object summarizing operational system trails.
 * @returns {boolean} response.success - Boolean indicator demonstrating explicit routine validation completion.
 * @returns {Object} response.pagination - Structured overview parameters indicating system storage allocation metrics.
 * @returns {number} response.pagination.totalLogs - Complete absolute document count presently indexing data structures.
 * @returns {number} response.pagination.currentPage - Validated location slice value processing client views.
 * @returns {number} response.pagination.totalPages - Math aggregate ceiling dividing absolute capacity indices by request windows.
 * @returns {number} response.pagination.limit - Normalized paging threshold used during pipeline array splits.
 * @returns {number} response.count - Quantitative assessment denoting current payload size strings.
 * @returns {Array<Object>} response.logs - Array consisting of uninstantiated, read-only POJO execution records matching schema designs.
 * * @throws {Object} 401 - Unauthorized: Fails verification if active access credentials evaluate to falsy structures.
 * @throws {Object} 403 - Forbidden: Enforced immediately if user access layer claims present mismatched validation properties.
 * @throws {Error} Relays application exceptions natively to peripheral intercept handlers via execution callbacks.
 */
export const getAllLogs = async (req, res, next) => { 
    try {
        const currentUserRole = req.user?.role;
        const authId = req.user?.authId;
        
        if (!authId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }

        const page = parseInt(req.query.page, 10) || 1;   
        const limit = parseInt(req.query.limit, 10) || 10; 

        const { logs, totalLogs } = await getAllAdminLogs(page, limit);

        return res.status(200).json({
            success: true,
            pagination: {
                totalLogs,
                currentPage: page,
                totalPages: Math.ceil(totalLogs / limit),
                limit
            },
            count: logs.length,
            logs
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
 * * @description Fetches a paginated, chronologically descending stream of audit trail entries generated 
 * by a specifically targeted administrative account. Resolves the incoming URL parameters against 
 * native Admin storage structures to isolate precise tracking query bounds.
 * * @param {Object} req - Express request object.
 * @param {Object} req.user - Active passport/session validation context injected by authentication middleware layers.
 * @param {string} req.user.authId - The credentials identification key belonging to the user issuing the query request.
 * @param {string} req.user.role - The authorized group designation of the caller (must strictly match 'admin').
 * @param {Object} req.params - Collected URL path attributes.
 * @param {string} req.params.id - The 24-character hexadecimal Mongoose ObjectId matching the targeted Admin document registry.
 * @param {Object} req.query - Extracted URL trailing query params string block.
 * @param {number} [req.query.page=1] - Page number offset used to slice localized ledger view increments.
 * @param {number} [req.query.limit=10] - Absolute scale block boundary determining items fetched per single page request.
 * @param {Object} res - Express HTTP server response routing stream interface.
 * @param {Function} next - Application middleware routing handler capturing runtime operational exceptions.
 * * @returns {Object} 200 - Successful collection retrieval array structure populated with requested data fields.
 * @returns {boolean} response.success - Boolean confirmation status detailing smooth operational endpoint exit.
 * @returns {Object} response.pagination - Structured collection metric breakdown providing real-time storage indexes.
 * @returns {number} response.pagination.totalLogs - Aggregated absolute sum count of matched event logs resting in database memory.
 * @returns {number} response.pagination.currentPage - Current active list viewport page offset context.
 * @returns {number} response.pagination.totalPages - Scaled quotient representing final calculated logical indexing layout boundaries.
 * @returns {number} response.pagination.limit - Configured tracking record layout size restrictions per call loop.
 * @returns {number} response.count - Explicit current payload array size context evaluation metric.
 * @returns {Array<Object>} response.logs - Array of raw, decoupled log items conforming strictly to system schema definitions.
 * * @throws {Object} 401 - Unauthorized: Fails verification checks if authentication reference contexts resolve as falsy structures.
 * @throws {Object} 403 - Forbidden: Thrown immediately if client identity context maps outside designated global admin permissions.
 * @throws {Object} 400 - Bad Request: Emitted if incoming target ID parameters fail base Mongoose hexadecimal pattern validity tests.
 * @throws {Object} 404 - Not Found: Delivered when target parameter lookups fail to isolate a corresponding active Admin profile.
 */
export const getAdminLogs = async (req, res, next) => { 
    try {
        const currentUserRole = req.user?.role;
        const currentAuthId = req.user?.authId;
        const targetAdminAuthId = req.params.id;  //admin Id from admin table
        
        // Authorization Guards
        if (!currentAuthId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }

        const page = parseInt(req.query.page, 10) || 1;   
        const limit = parseInt(req.query.limit, 10) || 10; 

        const result = await getLogsByAdmin(targetAdminAuthId, page, limit);

        if (result.error) {
            return res.status(result.status).json({ message: result.error });
        }

        const { logs, totalLogs } = result;

        return res.status(200).json({
            success: true,
            pagination: {
                totalLogs,
                currentPage: page,
                totalPages: Math.ceil(totalLogs / limit),
                limit
            },
            count: logs.length,
            logs
        });

    } catch (error) {
        console.log(error);
        next(error); 
    }
};


// PATCH /admin/customers/:customerId/status | Auth required (admin) | suspend or activate user
/**
 * @api {patch} /api/admin/customer/:customerId/status Update Customer Account Status
 * @apiName ChangeCustomerStatus
 * @apiGroup Admin
 * @apiPermission admin
 * @description Modifies the authentication lifecycle state (`accountStatus`) of a customer profile. 
 * Enforces administrative system guardrails:
 * 1. Restricts request access strictly to accounts with the 'admin' authorization role.
 * 2. Blocks updates if the new status matches the target account's current status.
 * 3. Restricts manual activations to records currently sitting in a 'pending' or 'suspended' state.
 * 4. Automatically writes an immutable audit record to the system logs repository upon successful updates.
 *
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.params - URL route parameter maps.
 * @param {string} req.params.customerId - The unique MongoDB ObjectId of the target Customer document.
 * @param {Object} req.body - HTTP request body payload wrapper.
 * @param {string} req.body.status - Target account status to enforce ('pending', 'active', 'suspended').
 * @param {Object} req.user - Identity payload decoded and attached by authentication middlewares.
 * @param {string} req.user.authId - The unique MongoDB ObjectId of the administrative manager executing the write.
 * @param {string} req.user.role - System access authority verification tag (must evaluate to 'admin').
 * @param {import('express').Response} res - Express response object used to transmit HTTP network responses.
 * @param {import('express').NextFunction} next - Express callback handler routed to centralized error handling components.
 * @returns {Promise<void>} Resolves with a status 200 payload displaying updating model keys, or forwards caught exceptions.
 * @throws {400} Sent if route params fail ObjectId compliance, statuses are invalid, or lifecycle transition bounds are violated.
 * @throws {401} Sent if the request header context is missing valid authentication markers.
 * @throws {403} Sent if the account role evaluates to a configuration other than 'admin'.
 * @throws {404} Sent if referenced Admin, Customer, or UsersAuth base profiles cannot be found in database documents.
 */
export const changeCustomerStatus = async (req, res, next) => { //suspend and activate customer account
    try {
        const currentUserRole = req.user?.role;
        const authId = req.user?.authId; // This is the UsersAuth ID
        const { customerId } = req.params; 
        const { status } = req.body;

        if (!authId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }

        const result = await updateCustomerStatus(authId, customerId, status);

        if (result.error) {
            return res.status(result.status).json({ message: result.error });
        }

        return res.status(200).json({
            success: true,
            message: result.message,
            data: result.data
        });
        
    } catch (error) {
        console.log(error);
        next(error);
    }
};