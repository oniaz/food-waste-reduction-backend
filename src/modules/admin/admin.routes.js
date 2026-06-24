import express from "express";
import {getPendingSellers , changeSellerStatus , getAllLogs,getAdminLogs,changeCustomerStatus} from "./admin.controller.js"
import authenticate from "../../middleware/authentication.middleware.js" 
import authorizeRole from "../../middleware/authorization.middleware.js"
const router = express.Router();

// GET /admin/pending-sellers | Auth required (admin) | list sellers awaiting approval
// PATCH /admin/sellers/:sellerId/status | Auth required (admin) | approve or reject seller account
// GET /admin/logs | Auth required (admin) | get all system admin logs
// GET /admin/:id/logs | Auth required (admin) | get logs for specific admin user 

router.get("/pending-sellers", authenticate,authorizeRole("admin"),getPendingSellers)
router.patch("/sellers/:sellerId/status", authenticate,authorizeRole("admin"),changeSellerStatus)
router.patch("/customers/:customerId/status", authenticate,authorizeRole("admin"),changeCustomerStatus)
router.get("/logs", authenticate,authorizeRole("admin"),getAllLogs)
router.get("/:id/logs",authenticate,authorizeRole("admin"),getAdminLogs)

export default router;