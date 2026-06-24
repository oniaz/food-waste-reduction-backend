import express from "express";
import {getCurrentUser , updateUserInfo, changePassword,getAllVendors,getAllCustomers, getVendorAnalytics} from "./users.controller.js";
import authenticate from "../../middleware/authentication.middleware.js" 
import authorizeRole from "../../middleware/authorization.middleware.js"
import authorizeStatus from "../../middleware/status.middleware.js";

const router = express.Router();

// GET /users/me | Auth required (all roles) | get current user profile with role data
// PATCH /users/me | Auth required (all roles) | update own profile information
// PATCH /users/change-password | Auth required (all roles) | change password with old password verification
// GET /users/vendor-dashboard | Auth required (vendor) | get vendor analytics summary
// GET /users | Auth required (admin) | get all users list =====>>> replaced with get-customers and get-vendors for better data management

router.get("/me", authenticate, getCurrentUser);

router.patch("/me", authenticate, authorizeStatus("active", "incompleteData"), updateUserInfo);

router.patch("/change-password",authenticate,changePassword)

router.get("/vendor-dashboard", authenticate, authorizeRole("vendor"), authorizeStatus("active", "suspended"), getVendorAnalytics)
router.get("/get-vendors", authenticate,authorizeRole("admin") , getAllVendors);
router.get("/get-customers", authenticate,authorizeRole("admin"), getAllCustomers);

export default router;