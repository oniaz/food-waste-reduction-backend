import express from "express";
import {getPendingSellers , changeSellerStatus , getAllLogs} from "./admin.controller.js"
import authenticate from "../../middleware/authentication.middleware.js" 
import authorizeRole from "../../middleware/authorization.middleware.js"
const router = express.Router();

// GET /admin/pending-sellers | Auth required (admin) | list sellers awaiting approval
// PATCH /admin/sellers/:sellerId/status | Auth required (admin) | approve or reject seller account
// GET /admin/logs | Auth required (admin) | get all system admin logs
// GET /admin/:id/logs | Auth required (admin) | get logs for specific admin user 

router.get("/pending-sellers", authenticate,authorizeRole("admin"),getPendingSellers)
router.patch("/sellers/:sellerId/status", authenticate,authorizeRole("admin"),changeSellerStatus)

router.get("/logs", authenticate,authorizeRole("admin"),getAllLogs)
router.get("/:id/logs", (req, res) => {
    res.json({message: "Get specific admin logs endpoint"});
});

export default router;