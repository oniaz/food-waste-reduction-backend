import express from "express";
import {
    initiatePayment,
    handleWebhook,
    paymentCallback,
    getMyPaymentHistory,
    getPaymentLogs,
} from "./payment.controller.js";
import { validateInitiatePayment } from "./payment.validation.js";
import authenticate from "../../middleware/authentication.middleware.js";
import authorizeRole from "../../middleware/authorization.middleware.js";
import authorizeStatus from "../../middleware/status.middleware.js";
import verifyPaymobHmac from "../../middleware/verifyPaymobHmac.middleware.js";

const router = express.Router();

// POST /payment/initiate | Auth required (vendor / active) | create Paymob checkout URL for moneyOwed balance
router.post(
    "/initiate",
    authenticate,
    authorizeRole("vendor"),
    authorizeStatus("active", "suspended"), // suspended vendors can still pay what they owe
    validateInitiatePayment,
    initiatePayment
);

// POST /payment/webhook | Public (Paymob server) | HMAC-verified transaction callback
// This is the only endpoint that zeros moneyOwed and writes the payment log
router.post("/webhook", verifyPaymobHmac, handleWebhook);

// GET /payment/callback | Public (browser redirect from Paymob) | display-only success/failure page
router.get("/callback", paymentCallback);

// GET /payment/my-history | Auth required (vendor) | vendor's own payment history
router.get(
    "/my-history",
    authenticate,
    authorizeRole("vendor"),
    authorizeStatus("active", "suspended"),
    getMyPaymentHistory
);

// GET /payment/logs | Auth required (admin) | all vendor payment logs across the platform
router.get(
    "/logs",
    authenticate,
    authorizeRole("admin"),
    getPaymentLogs
);

export default router;
