import {
    getAuthRecord,
    getVendorProfile,
    getCustomerProfile,
    getAdminProfile,
    updateVendorProfile,
    updateCustomerProfile,
    changeUserPassword,
    computeVendorAnalytics,
    getPaginatedVendors,
    getPaginatedCustomers,
} from "./users.service.js";

// GET /users/me | Auth required (all roles) | get current user profile with role data
/**
 * @api {get} /api/users/me Get Current User Profile
 * @apiName GetCurrentUser
 * @apiGroup Users
 * @apiPermission customer | vendor
 * @description Retrieves the active user's profile details based on their authenticated token context.
 * It dynamically forks execution path behavior based on user roles:
 * 1. For Vendors: Fetches raw data using optimized lean queries and injects a dynamically computed rating score average.
 * 2. For Customers: Fetches core user details natively via clean document separation.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the requesting actor.
 * @param {string} req.user.role - The system access tier role of the user ('customer' or 'vendor').
 * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * @returns {Promise<void>} Sends a JSON response with status 200 containing either 'vendorData' or 'customerData'.
 * @throws {404} If the underlying model document corresponding to the user ID is missing from the database.
 */
export const getCurrentUser = async (req, res, next) => {
    try {
        const { role: currentUserRole, id: userId, authId } = req.user;

        const userAuth = await getAuthRecord(authId);

        // Handle Vendor Fetching
        if (currentUserRole === "vendor") {
            const vendorData = await getVendorProfile(userId);

            return res.status(200).json({
                success: true,
                vendorData: {
                    ...vendorData,
                    username: userAuth.username,
                    email: userAuth.email,
                    role: userAuth.role,
                    accountStatus: userAuth.accountStatus,
                },
            });
        }

        // Handle Customer Fetching
        if (currentUserRole === "customer") {
            const customerData = await getCustomerProfile(userId);

            return res.status(200).json({
                success: true,
                customerData: {
                    ...customerData,
                    username: userAuth.username,
                    email: userAuth.email,
                    role: userAuth.role,
                    accountStatus: userAuth.accountStatus,
                },
            });
        }

        // Handle Admin Fetching
        if (currentUserRole === "admin") {
            const adminData = await getAdminProfile(authId);

            return res.status(200).json({
                success: true,
                adminData: {
                    ...adminData,
                    username: userAuth.username,
                    email: userAuth.email,
                    role: userAuth.role,
                    accountStatus: userAuth.accountStatus,
                },
            });
        }

    } catch (error) {
        next(error);
    }
};

// PATCH /users/me | Auth required (all roles) | update own profile information
/**
 * @api {patch} /api/users/me Update Current User Profile
 * @apiName UpdateUserInfo
 * @apiGroup Users
 * @apiPermission customer | vendor
 * @description Modifies specific personal profile details for the authenticated user session.
 * Validation of field shapes is handled upstream by validateUpdateProfile middleware.
 * This controller builds the role-specific allowed update map and delegates to the service.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.body - The request body payload containing optional fields to modify.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the target profile owner.
 * @param {string} req.user.role - The internal authentication role level tier ('customer' or 'vendor').
 * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * @returns {Promise<void>} Sends a JSON response with status 200 along with the updated profile snapshot.
 * @throws {404} If the underlying model document does not exist within the collection.
 */
export const updateUserInfo = async (req, res, next) => {
    try {
        const { role: currentUserRole, id: userId } = req.user;

        // Role-based field filtering lives here in the controller — not in the validator.
        // The validator (validateUpdateProfile) only checked shapes; we now decide
        // which of those validated fields are actually allowed for this role.
        let allowedUpdates = {};

        if (currentUserRole === "vendor") {
            const { shopName, address, phoneNumber, pickupTime, map } = req.body;
            allowedUpdates = { shopName, address, phoneNumber, pickupTime };
            if (map !== undefined) {
                allowedUpdates["address.map"] = map;
            }
        }

        if (currentUserRole === "customer") {
            const { name, address, phoneNumber } = req.body;
            allowedUpdates = { name, address, phoneNumber };
        }

        // Strip undefined values — only send fields the caller actually provided
        Object.keys(allowedUpdates).forEach(
            (key) => allowedUpdates[key] === undefined && delete allowedUpdates[key]
        );

        if (Object.keys(allowedUpdates).length === 0) {
            return res.status(400).json({ message: "Bad Request: No valid fields provided for update" });
        }

        if (currentUserRole === "vendor") {
            const updatedUser = await updateVendorProfile(userId, allowedUpdates);

            return res.status(200).json({
                success: true,
                message: "Vendor profile updated successfully",
                vendorData: updatedUser,
            });
        }

        if (currentUserRole === "customer") {
            const updatedUser = await updateCustomerProfile(userId, allowedUpdates);

            return res.status(200).json({
                success: true,
                message: "Customer profile updated successfully",
                customerData: updatedUser,
            });
        }

    } catch (error) {
        next(error);
    }
};

// PATCH /users/change-password | Auth required (all roles) | change password with old password verification
/**
 * @api {patch} /api/users/change-password Change Password
 * @apiName ChangePassword
 * @apiGroup Users
 * @apiPermission customer | vendor
 * @description Securely updates an authenticated user's account password.
 * This endpoint enforces multi-layered credential validation sequences:
 * 1. Checks route safety parameters ensuring both old and new plain text strings exist.
 * 2. Fetches the calling identity snapshot from specific role tables ('Vendor' or 'Customer') targeting only the required 'authId' relational link.
 * 3. References the centralized 'UsersAuth' collection to retrieve current encrypted credential hashes.
 * 4. Executes an asynchronous, non-blocking cryptographic match verify using bcrypt.
 * 5. Re-assigns and saves the new credential, natively triggering any upstream hashing 'pre-save' middleware configurations.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.body - The request body payload.
 * @param {string} req.body.oldPassword - The active plain text password currently securing the profile.
 * @param {string} req.body.newPassword - The target plain text replacement password.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the requesting role profile document.
 * @param {string} req.user.role - The authorized system permission tier of the user ('customer' or 'vendor').
 * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * @returns {Promise<void>} Sends a JSON response with status 200 confirming successful credential mutation.
 * @throws {400} If the current password verification fails bcrypt cross-referencing.
 * @throws {404} If either the secondary profile record or primary matching auth collection entity cannot be found.
 */
export const changePassword = async (req, res, next) => {
    try {
        const { role: currentUserRole, id: userId } = req.user;
        const { oldPassword, newPassword } = req.body;

        await changeUserPassword(userId, currentUserRole, oldPassword, newPassword);

        return res.status(200).json({
            success: true,
            message: "Password changed successfully",
        });
    } catch (error) {
        next(error);
    }
};

// GET /get-vendors | Auth required (admin) | get all vendors list
/**
 * @api {get} /api/users/get-vendors Get All Vendors
 * @apiName GetAllVendors
 * @apiGroup Users
 * @apiPermission admin
 * @description Retrieves a paginated matrix of all registered marketplace vendor records.
 * This dashboard endpoint applies administrative workflow and performance layout logic:
 * 1. Parses string-based query parameters securely into dynamic numerical pagination keys ('page', 'limit').
 * 2. Implements non-blocking skips and scale restrictions to minimize bandwidth allocation.
 * 3. Sorts output lists in descending order based on total 'moneyOwed' ledger status parameters.
 * 4. Returns a rich, descriptive meta-pagination wrapper alongside the list array payload.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.query - URL query configuration strings.
 * @param {number} [req.query.page=1] - The sequential chunk section page index to retrieve.
 * @param {number} [req.query.limit=10] - The maximum sizing ceiling of structural records per array chunk.
 * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * @returns {Promise<void>} Sends a JSON response with status 200 detailing the total database record inventory count alongside the paginated vendor block.
 */
export const getAllVendors = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;   // Default to page 1
        const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 records per page

        const { vendors, totalVendors } = await getPaginatedVendors(page, limit);

        return res.status(200).json({
            success: true,
            pagination: {
                totalVendors,
                currentPage: page,
                totalPages: Math.ceil(totalVendors / limit),
                limit,
            },
            count: vendors.length,
            vendors,
        });
    } catch (error) {
        next(error);
    }
};

// GET /users/customers | Auth required (admin) | get all customers list with pagination
/**
 * @api {get} /api/users/customers Get All Customers
 * @apiName GetAllCustomers
 * @apiGroup Users
 * @apiPermission admin
 * @description Retrieves a paginated list matrix of all registered marketplace customer records.
 * This endpoint provides administrative overview tracking through specialized data behaviors:
 * 1. Parses string-based query parameters safely into base-10 numerical indices ('page', 'limit').
 * 2. Utilizes lean database scans alongside skip and allocation ceilings to guarantee minimal memory overhead.
 * 3. Sorts output lists chronologically in descending order to surface the most recent signups first.
 * 4. Returns a rich, descriptive meta-pagination wrapper alongside the customers list array block.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.query - URL query parameter keys.
 * @param {number} [req.query.page=1] - The current target slice chunk page index to retrieve.
 * @param {number} [req.query.limit=10] - The maximum capacity ceiling of customer entries per page window.
 * @param {import('express').Response} res - Express response object used to transmit JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * @returns {Promise<void>} Sends a JSON response with status 200 detailing structural meta-pagination indices and the customer document list.
 */
export const getAllCustomers = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;   // Default to page 1
        const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 customers per page

        const { customers, totalCustomers } = await getPaginatedCustomers(page, limit);

        return res.status(200).json({
            success: true,
            pagination: {
                totalCustomers,
                currentPage: page,
                totalPages: Math.ceil(totalCustomers / limit),
                limit,
            },
            count: customers.length,
            customers,
        });
    } catch (error) {
        next(error);
    }
};

// GET /users/vendor-dashboard | Auth required (vendor) | get vendor analytics summary
/**
 * @api {get} /api/users/vendor-dashboard Get Vendor Analytics Summary
 * @apiName GetVendorAnalytics
 * @apiGroup Users
 * @apiPermission vendor
 * @description Compiles an analytical performance dashboard metric snapshot for the authenticated vendor.
 * This endpoint processes embedded document loops to extract key-performance indicators (KPIs):
 * 1. Queries the collections to find any multi-item order referencing the active vendor's product ID criteria.
 * 2. Parses the transactional items block to separate active processing quantities ('pending', 'ready') from archived history ('completed').
 * 3. Deducts the platform's 10% commission fee to dynamically aggregate net financial payout metrics (90% revenue retained).
 * 4. Utilizes a unique hash Set collection to accurately deduce the total number of distinct customers served.
 * 5. Applies an arithmetic precision rounding scale to protect return floating-point totals.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the vendor requesting analytics.
 * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * @returns {Promise<void>} Sends a JSON response with status 200 containing an 'analytics' data map showing net profit, rolling product inventory stats, and customer counts.
 */
export const getVendorAnalytics = async (req, res, next) => {
    try {
        const { id: userId } = req.user;

        const analytics = await computeVendorAnalytics(userId);

        if (!analytics) {
            return res.status(200).json({
                success: true,
                message: "Vendor has no orders yet",
                analytics: {
                    profit: 0,
                    productsInCurrentOrders: 0,
                    productsInCompletedOrders: 0,
                    numberOfCustomers: 0,
                },
            });
        }

        return res.status(200).json({ success: true, analytics });
    } catch (error) {
        console.error("Error fetching vendor analytics:", error);
        next(error);
    }
};