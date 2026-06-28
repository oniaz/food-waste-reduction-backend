import {
    initiateVendorPayment,
    processPaymentWebhook,
    getVendorPaymentHistory,
    getAllPaymentLogs,
} from "./payment.service.js";

/**
 * POST /api/payment/initiate
 * Vendor calls this to get a Paymob hosted checkout URL for their current moneyOwed balance.
 *
 * Amount and currency are always read server-side — never from the request body.
 *
 * The three billing fields (vendorFullName, vendorEmail, vendorPhone) are what Paymob
 * displays on the payment page and receipt. They are NOT pulled from the DB because
 * payment receipts should reflect what the payer consciously provides.
 *
 * @route POST /api/payment/initiate
 * @access vendor / active or suspended
 */
export const initiatePayment = async (req, res, next) => {
    try {
        const vendorId = req.user.id;
        const { vendorFullName, vendorEmail, vendorPhone } = req.body;

        // Build Paymob's required billing_data block.
        // Paymob needs first_name and last_name separately — split on the first space.
        const nameParts = vendorFullName.trim().split(" ");
        const billingData = {
            first_name: nameParts[0],
            last_name: nameParts.slice(1).join(" ") || nameParts[0], // fallback if single name
            email: vendorEmail,
            phone_number: vendorPhone,
            // The fields below are required by Paymob's schema but not relevant
            // for a vendor-to-platform payment — filled with NA placeholders.
            apartment: "NA",
            floor: "NA",
            street: "NA",
            building: "NA",
            shipping_method: "NA",
            postal_code: "NA",
            city: "NA",
            country: "EGY",
            state: "NA",
        };

        const result = await initiateVendorPayment(vendorId, billingData);

        return res.status(200).json({
            success: true,
            ...result,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/payment/webhook
 * Paymob posts here after every transaction attempt.
 * HMAC verification is handled by verifyPaymobHmac middleware before this runs.
 * This is the only place where moneyOwed is zeroed and the payment log is written.
 *
 * Always responds 200 — Paymob retries indefinitely on anything else.
 *
 * @route POST /api/payment/webhook
 * @access public (Paymob server) — protected by HMAC, not by JWT
 */
export const handleWebhook = async (req, res, next) => {
    try {
        const transaction = req.body.obj;

        const result = await processPaymentWebhook(transaction);

        // Always respond 200 immediately — Paymob retries on anything else
        return res.status(200).json({ received: true, ...result });
    } catch (error) {
        console.error("Webhook processing error:", error.message);
        // Still respond 200 to stop Paymob retrying — error is logged for investigation
        return res.status(200).json({ received: true, error: error.message });
    }
};

/**
 * GET /api/payment/callback
 * Paymob redirects the vendor's browser here after the payment flow completes.
 * Display-only — do NOT use this for fulfillment. Use the webhook instead.
 *
 * @route GET /api/payment/callback
 * @access public (browser redirect from Paymob)
 */
export const paymentCallback = (req, res) => {
    const { success, id: transactionId } = req.query;

    return res.status(200).json({
        message: success === "true"
            ? "Payment successful! Your balance has been cleared. 🎉"
            : "Payment was not completed. Please try again.",
        transactionId,
        note: "Balance update is handled via webhook — this page is for display only.",
    });
};

/**
 * GET /api/payment/my-history
 * Returns the authenticated vendor's own payment history (paginated, newest first).
 *
 * @route GET /api/payment/my-history
 * @access vendor / active or suspended
 */
export const getMyPaymentHistory = async (req, res, next) => {
    try {
        const vendorId = req.user.id;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;

        const { logs, total } = await getVendorPaymentHistory(vendorId, page, limit);

        return res.status(200).json({
            success: true,
            pagination: {
                total,
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                limit,
            },
            count: logs.length,
            logs,
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/payment/logs
 * Admin-only view of all vendor payment logs across the platform.
 *
 * Supports:
 *   ?shopName=<string>   — case-insensitive partial match on vendor shopName
 *   ?username=<string>   — exact match on vendor's UsersAuth username
 *   ?sortDate=asc|desc   — sort by payment date (default: desc / newest first)
 *   ?page=<n>&limit=<n>  — pagination
 *
 * @route GET /api/payment/logs
 * @access admin
 */
export const getPaymentLogs = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        const { shopName, username, sortDate } = req.query;

        const { logs, total } = await getAllPaymentLogs({
            shopName,
            username,
            sortDate,
            page,
            limit,
        });

        return res.status(200).json({
            success: true,
            pagination: {
                total,
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                limit,
            },
            count: logs.length,
            logs,
        });
    } catch (error) {
        next(error);
    }
};