import express from "express";
import {getPendingVendors , changeVendorStatus , getAllLogs,getAdminLogs,changeCustomerStatus} from "./admin.controller.js"
import authenticate from "../../middleware/authentication.middleware.js" 
import authorizeRole from "../../middleware/authorization.middleware.js"
const router = express.Router();

// GET /admin/pending-vendors | Auth required (admin) | list vendors awaiting approval
// PATCH /admin/vendors/:vendorId/status | Auth required (admin) | approve or reject vendor account
// GET /admin/logs | Auth required (admin) | get all system admin logs
// GET /admin/:id/logs | Auth required (admin) | get logs for specific admin user 

router.get("/pending-vendors", authenticate,authorizeRole("admin"),getPendingVendors)
router.patch("/vendors/:vendorId/status", authenticate,authorizeRole("admin"),changeVendorStatus)
router.patch("/customers/:customerId/status", authenticate,authorizeRole("admin"),changeCustomerStatus)
router.get("/logs", authenticate,authorizeRole("admin"),getAllLogs)
router.get("/:id/logs",authenticate,authorizeRole("admin"),getAdminLogs)

export default router;