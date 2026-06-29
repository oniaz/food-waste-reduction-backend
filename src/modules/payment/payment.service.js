import AppError from "../../utils/AppError.js";
import * as paymentRepo from "./payment.repository.js";

const PAYMOB_BASE_URL = "https://accept.paymobsolutions.com";

// EGP is the only currency used on this platform.
// Hardcoded here so it never leaks into the request body or controller layer.
const CURRENCY = "EGP";

// ── Paymob API ────────────────────────────────────────────────────────────────

/**
 * Creates a Paymob payment intention for the exact amount the vendor owes.
 * Amount and currency are always server-side — never from the client.
 */
async function createPaymobIntention(amountCents, billingData, vendorId) {
    const response = await fetch(`${PAYMOB_BASE_URL}/v1/intention/`, {
        method: "POST",
        headers: {
            Authorization: `Token ${process.env.PAYMOB_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            amount: amountCents,
            currency: CURRENCY,
            payment_methods: [parseInt(process.env.PAYMOB_INTEGRATION_ID)],
            items: [],
            billing_data: billingData,
            
            // ⬇️ THIS TELLS PAYMOB WHERE TO SEND THE BROWSER ONCE COMPLETED ⬇️
            redirection_url: `${process.env.BACKEND_URL}/api/payment/callback`,

            // Embed vendorId in the reference so the webhook can identify who paid
            special_reference: `vendor-${vendorId}-${Date.now()}`,
            extras: { vendorId: vendorId.toString() },
        }),
    });

    // fetch does not throw on non-2xx — check manually and surface Paymob's error body
    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new AppError(
            `Paymob API error (${response.status}): ${errorBody?.detail || response.statusText}`,
            502
        );
    }

    return response.json();
}

// ── Initiate Payment ──────────────────────────────────────────────────────────

/**
 * Reads the vendor's current moneyOwed from the DB, creates a Paymob intention
 * for that exact amount, and returns the hosted checkout URL.
 *
 * @param {string} vendorId - The vendor's profile _id from req.user.id
 * @param {Object} billingData - Paymob billing_data block built by the controller from vendorFullName/Email/Phone
 */
export async function initiateVendorPayment(vendorId, billingData) {
    const vendor = await paymentRepo.findVendorById(vendorId);
    if (!vendor) throw new AppError("Vendor not found", 404);

    if (!vendor.moneyOwed || vendor.moneyOwed <= 0) {
        throw new AppError("No outstanding balance to pay", 400);
    }

    // Convert EGP to cents — Paymob always works in the smallest currency unit
    const amountCents = Math.round(vendor.moneyOwed * 100);

    const intention = await createPaymobIntention(amountCents, billingData, vendorId);

    const paymentUrl = `https://accept.paymobsolutions.com/unifiedcheckout/?publicKey=${process.env.PAYMOB_PUBLIC_KEY}&clientSecret=${intention.client_secret}`;

    return {
        paymentUrl,
        intentionId: intention.id,
        amountEGP: vendor.moneyOwed,
        amountCents,
        currency: CURRENCY,
    };
}

// ── Webhook Handler ───────────────────────────────────────────────────────────

/**
 * Processes a verified Paymob webhook transaction object.
 * On success:
 *   1. Guards against duplicate webhook delivery using the transaction ID.
 *   2. Extracts the vendorId from extras.vendorId (embedded at intention creation).
 *   3. Reads the vendor's current balance as previousBalance snapshot.
 *   4. Zeros out vendor.moneyOwed.
 *   5. Writes an immutable VendorPaymentLog entry.
 */
export async function processPaymentWebhook(transaction) {
    console.log("=== VERCEL WEBHOOK START ===");
    console.log("Transaction Payload keys:", Object.keys(transaction || {}));

    const {
        id: paymobTransactionId,
        success,
        amount_cents,
        currency,
        intention_order_data,
        extra,
    } = transaction;

    console.log(`Processing Transaction ID: ${paymobTransactionId}, Success Status: ${success}`);

    // Only process successful transactions
    if (success !== true) {
        console.log(`⚠️  Webhook received for failed transaction ${paymobTransactionId} — skipping`);
        return { processed: false, reason: "transaction_not_successful" };
    }

    // Guard against duplicate webhook delivery (Paymob retries on non-200)
    const existing = await paymentRepo.findPaymentLogByTransactionId(
        String(paymobTransactionId)
    );
    if (existing) {
        console.log(`⚠️  Duplicate webhook for transaction ${paymobTransactionId} — ignoring`);
        return { processed: false, reason: "duplicate" };
    }

    // Extract vendorId embedded in intention extras at checkout creation time
    console.log("Nesting Debug - intention_order_data.extras:", JSON.stringify(intention_order_data?.extras));
    console.log("Nesting Debug - extra field:", JSON.stringify(extra));

    const vendorId = intention_order_data?.extras?.vendorId || extra?.vendorId;
    console.log(`Extracted Vendor ID resolving to: ${vendorId}`);

    if (!vendorId) {
        throw new AppError("Webhook missing vendorId in extras", 400);
    }

    const vendor = await paymentRepo.findVendorById(vendorId);
    if (!vendor) throw new AppError(`Vendor ${vendorId} not found during webhook processing`, 404);

    const previousBalance = vendor.moneyOwed;
    console.log(`Found Vendor: ${vendor.shopName}, Current Owed Balance: ${previousBalance}`);

    // Zero out the balance atomically
    await paymentRepo.clearVendorMoneyOwed(vendorId);
    console.log(`Atomically cleared moneyOwed field for vendor ${vendorId}`);

    // Write the immutable payment audit log
    await paymentRepo.createPaymentLog({
        vendorId,
        amountPaidCents: amount_cents,
        paymobTransactionId: String(paymobTransactionId),
        paymobIntentionId: String(intention_order_data?.id || ""),
        currency: currency || CURRENCY,
        previousBalance,
    });
    console.log("Immutable VendorPaymentLog created successfully.");

    console.log(`✅ Payment processed — Vendor: ${vendor.shopName} | Amount: ${amount_cents / 100} ${currency} | Prev balance: ${previousBalance} EGP`);

    return { processed: true, vendorId, amountPaidEGP: amount_cents / 100, previousBalance };
}

// ── Payment Log Queries ───────────────────────────────────────────────────────

/**
 * Returns a vendor's own payment history (paginated).
 */
export async function getVendorPaymentHistory(vendorId, page, limit) {
    const skip = (page - 1) * limit;
    const logs = await paymentRepo.findPaymentLogsByVendor(vendorId, skip, limit);
    const total = await paymentRepo.countPaymentLogsByVendor(vendorId);
    return { logs, total };
}

/**
 * Returns all vendor payment logs for admin oversight.
 * Supports filtering by vendorShopName or vendorUsername, and sort by date direction.
 *
 * @param {Object} filters
 * @param {string} [filters.shopName]  - Case-insensitive partial match on vendor shopName
 * @param {string} [filters.username]  - Exact match on the vendor's UsersAuth username
 * @param {string} [filters.sortDate]  - "asc" | "desc" (default "desc")
 * @param {number} filters.page
 * @param {number} filters.limit
 */
export async function getAllPaymentLogs(filters) {
    const { shopName, username, sortDate, page, limit } = filters;
    const skip = (page - 1) * limit;
    const sortDirection = sortDate === "asc" ? 1 : -1; // default descending

    const logs = await paymentRepo.findAllPaymentLogsFiltered({
        shopName,
        username,
        sortDirection,
        skip,
        limit,
    });

    const total = await paymentRepo.countAllPaymentLogsFiltered({ shopName, username });

    return { logs, total };
}