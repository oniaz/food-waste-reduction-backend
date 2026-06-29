import { waitUntil } from "@vercel/functions";
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

        const result = await initiateVendorPayment(vendorId);

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

        waitUntil(
            processPaymentWebhook(transaction).catch((error) => {
                console.error("Background webhook processing error:", error.message);
            })
        );

        // Always respond 200 immediately — Paymob retries on anything else
        return res.status(200).json({ received: true });
    } catch (error) {
        console.error("Webhook processing error:", error.message);
        // Still respond 200 to stop Paymob retrying — error is logged for investigation
        return res.status(200).json({ received: true, error: error.message });
    }
};

/**
 * GET /api/payment/callback
 * Paymob redirects the vendor's browser here after the payment flow completes.
 * Secure Fallback: Settles balance and sends the user back to the React frontend.
 *
 * @route GET /api/payment/callback
 * @access public (browser redirect from Paymob)
 */
export const paymentCallback = async (req, res, next) => {
    // Define your Frontend App URL (Use an environment variable for deployment!)
    const FRONTEND_URL = process.env.FRONTEND_APP_URL || "http://localhost:5173"; 

    try {
        console.log("=== PAYMOB REDIRECT CALLBACK ACCESSED ===");
        
        // Extract parameters appended by Paymob's redirect
        const { 
            success, 
            id: transactionId, 
            amount_cents, 
            currency,
            extra_fields,
            intention_order_id,
            merchant_order_id 
        } = req.query;

        console.log(`Callback query parameters received - Tx ID: ${transactionId}, Success: ${success}`);

        // If the checkout explicitly states it was a success, run the verification fallback
        if (success === "true") {
            
            // Try extracting from query params variations first
            let vendorId = 
                req.query.vendorId || 
                req.query['extra_fields.vendorId'] || 
                req.query['intention_order_data.extras.vendorId'] ||
                req.query['extra.vendorId'];

            // Fallback parsing if Paymob stringified it into extra_fields
            if (!vendorId && extra_fields) {
                try {
                    const parsedExtras = typeof extra_fields === 'string' ? JSON.parse(extra_fields) : extra_fields;
                    vendorId = parsedExtras.vendorId;
                } catch (e) {
                    console.log("Could not parse stringified extra_fields attributes.");
                }
            }

            // 🌟 GOLDEN FALLBACK: Parse from merchant_order_id ("vendor-ID-timestamp")
            if (!vendorId && merchant_order_id && merchant_order_id.startsWith("vendor-")) {
                const parts = merchant_order_id.split("-");
                if (parts[1]) {
                    vendorId = parts[1];
                    console.log(`Successfully parsed Vendor ID from merchant_order_id: ${vendorId}`);
                }
            }

            console.log(`Extracted Vendor ID for callback verification: ${vendorId}`);

            // Reconstruct the transaction payload object exactly like processPaymentWebhook expects it
            const fallbackTransactionPayload = {
                id: Number(transactionId),
                success: true,
                amount_cents: Number(amount_cents),
                currency: currency || "EGP",
                intention_order_data: {
                    id: intention_order_id || "fallback_flow",
                    extras: {
                        vendorId: vendorId ? vendorId.toString() : undefined
                    }
                }
            };

            console.log("Triggering processPaymentWebhook from redirect fallback pipeline...");
            
            // Run your service worker process right here synchronously to clear the balance safely
            await processPaymentWebhook(fallbackTransactionPayload);
            
            console.log("✅ Fallback settlement complete. Redirecting client to frontend success page...");

            //  REDIRECT TO FRONTEND SUCCESS PAGE
            return res.redirect(`${FRONTEND_URL}/payment-success?status=success&tx=${transactionId}`);
        }

        //  REDIRECT TO FRONTEND FAILURE/CANCEL PAGE
        return res.redirect(`${FRONTEND_URL}/payment-failed?status=failed&tx=${transactionId}`);

    } catch (error) {
        console.error("Error handling payment callback execution:", error.message);
        // If an error happens, still send them back to frontend with the error info
        return res.redirect(`${FRONTEND_URL}/payment-failed?status=error&message=${encodeURIComponent(error.message)}`);
    }
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