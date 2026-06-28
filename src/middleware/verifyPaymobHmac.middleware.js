import crypto from "crypto";

/**
 * Verifies that an incoming Paymob webhook is genuine by validating
 * its HMAC-SHA512 signature against our PAYMOB_HMAC_SECRET.
 *
 * Paymob appends ?hmac=<signature> to the webhook URL and signs
 * the transaction fields in this exact order:
 * amount_cents, created_at, currency, error_occured, has_parent_transaction,
 * id, integration_id, is_3d_secure, is_auth, is_capture, is_refunded,
 * is_standalone_payment, is_voided, order.id, owner, pending,
 * source_data.pan, source_data.sub_type, source_data.type, success
 */
const verifyPaymobHmac = (req, res, next) => {
    const hmacSecret = process.env.PAYMOB_HMAC_SECRET;

    // Paymob sends the HMAC in the query string as ?hmac=...
    const receivedHmac = req.query.hmac;

    if (!receivedHmac) {
        return res.status(400).json({ message: "Missing HMAC in query string" });
    }

    const obj = req.body.obj; // transaction object

    if (!obj) {
        return res.status(400).json({ message: "Missing transaction object in webhook body" });
    }

    // Concatenate fields in the exact order Paymob specifies
    const concatenated = [
        obj.amount_cents,
        obj.created_at,
        obj.currency,
        obj.error_occured,
        obj.has_parent_transaction,
        obj.id,
        obj.integration_id,
        obj.is_3d_secure,
        obj.is_auth,
        obj.is_capture,
        obj.is_refunded,
        obj.is_standalone_payment,
        obj.is_voided,
        obj.order?.id,
        obj.owner,
        obj.pending,
        obj.source_data?.pan,
        obj.source_data?.sub_type,
        obj.source_data?.type,
        obj.success,
    ]
        .map((v) => String(v ?? ""))
        .join("");

    const expectedHmac = crypto
        .createHmac("sha512", hmacSecret)
        .update(concatenated)
        .digest("hex");

    if (expectedHmac !== receivedHmac) {
        console.error("❌ HMAC verification failed — possible spoofed webhook");
        return res.status(401).json({ message: "Invalid HMAC signature" });
    }

    next();
};

export default verifyPaymobHmac;
