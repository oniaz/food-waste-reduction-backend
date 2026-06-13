import Order from "../../models/orders.model.js";
import Product from "../../models/products.model.js";
import Customer from "../../models/customers.model.js";
import Vendor from "../../models/vendors.model.js";
import express from "express";
import mongoose from "mongoose";
import UsersAuth from "../../models/usersAuth.model.js";
import bcrypt from 'bcrypt';
import { validateName, validateShopName, validatePhoneNumber, validateAddress } from "../../utils/userDataValidators.js";

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
 * @returns {Promise<void>} Sends a JSON response with status 200 containing either 'sellerData' or 'customerData'.
 * @throws {401} If the user payload session data cannot be parsed or verified by authentication guards.
 * @throws {403} If the parsed user role does not have authorization clearance to hit the endpoint.
 * @throws {404} If the underlying model document corresponding to the user ID is missing from the database.
 */
export const getCurrentUser = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'vendor' && currentUserRole !== 'customer') {
            return res.status(403).json({ message: "Forbidden: Only authorized vendors and customers can access this endpoint" });
        }

        // Handle Vendor Fetching
        if (currentUserRole === "vendor") {
            
            const sellerData = await Vendor.findById(userId).lean(); // .lean() allows us to freely modify and spread the object safely
            
            if (!sellerData) {
                return res.status(404).json({ message: "Vendor profile not found" });
            }

            // Calculate rating, protecting against division by zero (0 total ratings)
            const totalRatings = sellerData.rating?.totalRatingsNumber || 0;
            const score = sellerData.rating?.score || 0;
            const vendorRating = totalRatings > 0 ? (score / totalRatings) : 0;

            return res.status(200).json({
                success: true,
                sellerData: {
                    ...sellerData,
                    vendorRating 
                }
            });
        }

        // Handle Customer 
        if (currentUserRole === "customer") {
            const customerData = await Customer.findById(userId).lean(); // Added .lean() here too for consistency

            if (!customerData) {
                return res.status(404).json({ message: "Customer profile not found" });
            }
            return res.status(200).json({
                success: true,
                customerData
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
 * This endpoint implements strict structural security validation patterns:
 * 1. Isolates payload parsing by role: Vendors may only modify 'shopName', 'address', and 'phoneNumber'. Customers may only modify 'name', 'address', and 'phoneNumber'.
 * 2. Automatically strips out 'undefined' properties from the tracking payload map.
 * 3. Demands that at least one valid key remains post-filtering to avoid wasting database writes.
 * 4. Natively applies Mongoose schema validators on the dynamic fields before modifying the records.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.body - The request body payload containing optional fields to modify.
 * @param {string} [req.body.name] - The new name configuration (Customer only).
 * @param {string} [req.body.shopName] - The new marketplace business name (Vendor only).
 * @param {string} [req.body.address] - The updated default residential or business location string.
 * @param {string} [req.body.phoneNumber] - The updated mobile communication line digits.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the target profile owner.
 * @param {string} req.user.role - The internal authentication role level tier ('customer' or 'vendor').
 * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * @returns {Promise<void>} Sends a JSON response with status 200 along with the cleanly parsed updated data profile snapshot.
 * @throws {400} If no valid, role-approved parameters are present post-filtering, or if inputs fail base type schema constraints.
 * @throws {401} If the core identity payload values are missing from the request middleware context.
 * @throws {403} If the matching authenticated system role is barred from mutating basic resource models.
 * @throws {404} If the underlying model document corresponding to the parameter index does not exist within the collection.
 */
export const updateUserInfo = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'vendor' && currentUserRole !== 'customer') {
            return res.status(403).json({ message: "Forbidden: Only authorized vendors and customers can access this endpoint" });
        }

        let allowedUpdates = {};
        if (currentUserRole === 'vendor') {
            const { shopName, address, phoneNumber } = req.body;
            allowedUpdates = { shopName, address, phoneNumber };
        } 
        
        if (currentUserRole === 'customer') {
            const { name, address, phoneNumber } = req.body;
            allowedUpdates = { name, address, phoneNumber };
        }

        
        Object.keys(allowedUpdates).forEach(
            key => allowedUpdates[key] === undefined && delete allowedUpdates[key] // No update for undefined edits
        );

        
        if (Object.keys(allowedUpdates).length === 0) { // Check if there's actually anything to update
            return res.status(400).json({ message: "Bad Request: No valid fields provided for update" });
        }

        let validationError = null;
        if (allowedUpdates.shopName) validationError = validateShopName(allowedUpdates.shopName, true);
        if (validationError) return res.status(400).json({ message: validationError });

        if (allowedUpdates.name) validationError = validateName(allowedUpdates.name, true);
        if (validationError) return res.status(400).json({ message: validationError });

        if (allowedUpdates.phoneNumber) validationError = validatePhoneNumber(allowedUpdates.phoneNumber, true);
        if (validationError) return res.status(400).json({ message: validationError });

        if (allowedUpdates.address) validationError = validateAddress(allowedUpdates.address, true);
        if (validationError) return res.status(400).json({ message: validationError });

        let updatedUser;
        const updateOptions = { 
            new: true,          // Returns the document after update is applied
            runValidators: true // Ensures the new data adheres to your Mongoose Schema rules
        };

        if (currentUserRole === "vendor") {
            updatedUser = await Vendor.findByIdAndUpdate(userId, allowedUpdates, updateOptions).lean();
            
            if (!updatedUser) return res.status(404).json({ message: "Vendor profile not found" });

            return res.status(200).json({
                success: true,
                message: "Vendor profile updated successfully",
                sellerData: updatedUser
            });
        }

        if (currentUserRole === "customer") {
            updatedUser = await Customer.findByIdAndUpdate(userId, allowedUpdates, updateOptions).lean();
            
            if (!updatedUser) return res.status(404).json({ message: "Customer profile not found" });

            return res.status(200).json({
                success: true,
                message: "Customer profile updated successfully",
                customerData: updatedUser
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
 * @throws {400} If required string inputs are missing, formatted improperly, or if the current password verification fails bcrypt cross-referencing.
 * @throws {401} If the request context is missing active user authentication metadata.
 * @throws {403} If the underlying security role level does not possess clearance to execute credential changes.
 * @throws {404} If either the secondary profile record or primary matching auth collection entity cannot be found.
 */
export const changePassword = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const userId = req.user?.id;
        const { oldPassword, newPassword } = req.body;
        

        
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'vendor' && currentUserRole !== 'customer') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: "Bad Request: Missing required parameters" });
        }
        if (typeof oldPassword !== 'string' || typeof newPassword !== 'string') {
            return res.status(400).json({ 
                message: "Bad Request: Password fields must be valid text strings." 
            });
        }

        
        let profile;
        if (currentUserRole === "vendor") {
            profile = await Vendor.findById(userId).select("authId");
        } else if (currentUserRole === "customer") {
            profile = await Customer.findById(userId).select("authId");
        }

        if (!profile || !profile.authId) {
            return res.status(404).json({ message: "authentication record not found" });
        }

        
        const userAuth = await UsersAuth.findById(profile.authId);
        if (!userAuth) {
            return res.status(404).json({ message: "Authentication record not found" });
        }

        
        const isMatch = await bcrypt.compare(oldPassword, userAuth.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Can not change password" });
        }
        userAuth.password = newPassword;
        await userAuth.save();

        return res.status(200).json({
            success: true,
            message: "Password changed successfully"
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
 * 1. Enforces absolute authorization lockouts restricting execution exclusively to administrative tokens.
 * 2. Parses string-based query parameters securely into dynamic numerical pagination keys ('page', 'limit').
 * 3. Implements non-blocking skips and scale restrictions to minimize bandwidth allocation.
 * 4. Sorts output lists in descending order based on total 'moneyOwed' ledger status parameters.
 * 5. Returns a rich, descriptive meta-pagination wrapper alongside the list array payload.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.query - URL query configuration strings.
 * @param {number} [req.query.page=1] - The sequential chunk section page index to retrieve.
 * @param {number} [req.query.limit=10] - The maximum sizing ceiling of structural records per array chunk.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.authId - The primary unique matching global credential record link identifier.
 * @param {string} req.user.role - The authorization system role string of the active entity ('admin').
 * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * @returns {Promise<void>} Sends a JSON response with status 200 detailing the total database record inventory count alongside the paginated vendor block.
 * @throws {401} If session credential links are missing or corrupted post-middleware evaluation.
 * @throws {403} If the underlying request payload claims an access tier other than 'admin'.
 */
export const getAllVendors = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const authId = req.user?.authId
        
        if (!authId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }

        
        const page = parseInt(req.query.page, 10) || 1;   // Default to page 1
        const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 records per page
        
        
        const skip = (page - 1) * limit;

        const vendors = await Vendor.find({})
            .sort({ moneyOwed: -1 }) 
            .skip(skip)   // Skips the previous pages' items
            .limit(limit) // Grabs only the current page's size
            .lean();

        const totalVendors = await Vendor.countDocuments({});

        return res.status(200).json({ 
            success: true, 
            pagination: {
                totalVendors,
                currentPage: page,
                totalPages: Math.ceil(totalVendors / limit),
                limit
            },
            count: vendors.length, 
            vendors 
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
 * 1. Restricts caller context explicitly to admin roles, rejecting unauthorized entry.
 * 2. Parses string-based query parameters safely into base-10 numerical indices ('page', 'limit').
 * 3. Utilizes lean database scans alongside skip and allocation ceilings to guarantee minimal memory overhead.
 * 4. Sorts output lists chronologically in descending order to surface the most recent signups first.
 * 5. Returns a rich, descriptive meta-pagination wrapper alongside the customers list array block.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.query - URL query parameter keys.
 * @param {number} [req.query.page=1] - The current target slice chunk page index to retrieve.
 * @param {number} [req.query.limit=10] - The maximum capacity ceiling of customer entries per page window.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.authId - The primary unique matching global credential record link identifier.
 * @param {string} req.user.role - The authorization system role string of the active entity ('admin').
 * @param {import('express').Response} res - Express response object used to transmit JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * @returns {Promise<void>} Sends a JSON response with status 200 detailing structural meta-pagination indices and the customer document list.
 * @throws {401} If session credential links are missing or corrupted post-middleware validation.
 * @throws {403} If the incoming actor's permission profile role is anything other than 'admin'.
 */
export const getAllCustomers = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const authId = req.user?.authId
        
        if (!authId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }

        
        const page = parseInt(req.query.page, 10) || 1;   // Default to page 1
        const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 customers per page
        const skip = (page - 1) * limit;

        
        const customers = await Customer.find({})
            .sort({ createdAt: -1 }) // Shows newest registered customers first
            .skip(skip)
            .limit(limit)
            .lean(); // Faster lookup performance

        
        const totalCustomers = await Customer.countDocuments({});

        return res.status(200).json({ 
            success: true, 
            pagination: {
                totalCustomers,
                currentPage: page,
                totalPages: Math.ceil(totalCustomers / limit),
                limit
            },
            count: customers.length, 
            customers 
        });
        
    } catch (error) {
        next(error);
    }
};
// GET /users/seller-dashboard | Auth required (seller) | get seller analytics summary
/**
 * @api {get} /api/users/seller-dashboard Get Seller Analytics Summary
 * @apiName GetSellerAnalytics
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
 * @param {string} req.user.role - The authorized system permission tier role of the user ('vendor').
 * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * @returns {Promise<void>} Sends a JSON response with status 200 containing an 'analytics' data map showing net profit, rolling product inventory stats, and customer counts.
 * @throws {401} If identity profile context links are absent from the session middleware payload.
 * @throws {403} If the incoming actor's permission profile role is anything other than 'vendor'.
 */
export const getSellerAnalytics = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const userId = req.user?.id; 
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'vendor') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }

        const vendorOrders = await Order.find({
            "products.vendorId": userId 
        });

        if (vendorOrders.length === 0) {
           return res.status(200).json({ 
               success: true, 
               message: "Vendor has no orders yet",
               analytics: { profit: 0, productsInCurrentOrders: 0, productsInCompletedOrders: 0, numberOfCustomers: 0 }
           }); 
        }
        
        let profit = 0;
        let currentOrderItems = 0;
        let completedOrderItems = 0;
        const customerSet = new Set(); 

        vendorOrders.forEach(order => {
            let orderHasVendorProduct = false;

            order.products.forEach(item => {
                
                if (item.vendorId?.toString() === userId) {
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

        return res.status(200).json({
            success: true,
            analytics: {
                profit: Math.round(profit * 100) / 100, 
                productsInCurrentOrders: currentOrderItems,
                productsInCompletedOrders: completedOrderItems,
                numberOfCustomers: customerSet.size 
            }
        });

    } catch (error) {
        console.error("Error fetching vendor analytics:", error);
        next(error);
    }
};