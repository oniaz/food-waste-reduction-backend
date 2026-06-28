import express from "express";
import {
    getPendingVendors,
    changeVendorStatus,
    getAllLogs,
    getAdminLogs,
    changeCustomerStatus,
    getAdminDashboard
} from "./admin.controller.js";
import {
    validateVendorStatusUpdate,
    validateCustomerStatusUpdate,
    validateAdminIdParam,
} from "./admin.validation.js";
import authenticate from "../../middleware/authentication.middleware.js";
import authorizeRole from "../../middleware/authorization.middleware.js";

const router = express.Router();
router.use((req, res, next) => {
    console.log("Admin router hit:", req.method, req.path);
    next();
});

// GET /admin/pending-vendors | Auth required (admin) | list vendors awaiting approval
// PATCH /admin/vendors/:vendorId/status | Auth required (admin) | approve or reject vendor account
// GET /admin/logs | Auth required (admin) | get all system admin logs
// GET /admin/:id/logs | Auth required (admin) | get logs for specific admin user

router.get("/pending-vendors", authenticate, authorizeRole("admin"), getPendingVendors);
router.get("/dashboard", authenticate, authorizeRole("admin"), getAdminDashboard);

router.get("/logs", authenticate, authorizeRole("admin"), getAllLogs);

router.patch(
    "/vendors/:vendorId/status",
    authenticate,
    authorizeRole("admin"),
    validateVendorStatusUpdate,
    changeVendorStatus
);

router.patch(
    "/customers/:customerId/status",
    authenticate,
    authorizeRole("admin"),
    validateCustomerStatusUpdate,
    changeCustomerStatus
);

router.get("/:id/logs", authenticate, authorizeRole("admin"), validateAdminIdParam, getAdminLogs);


export default router;
