import mongoose from "mongoose";

/**
 * Logs every successful Paymob payment made by a vendor to settle their moneyOwed balance.
 * Each document is immutable — created once on payment success, never updated.
 */
const vendorPaymentLogSchema = new mongoose.Schema(
    {
        vendorId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Vendors",
            required: true,
        },
        // Snapshot of how much was owed before this payment
        amountPaidCents: {
            type: Number,
            required: true,
            min: 1,
        },
        // Paymob transaction ID for reconciliation
        paymobTransactionId: {
            type: String,
            required: true,
            unique: true,
        },
        // Paymob intention ID created at checkout
        paymobIntentionId: {
            type: String,
            required: true,
        },
        currency: {
            type: String,
            default: "EGP",
        },
        // moneyOwed value on the vendor doc BEFORE this payment cleared it
        previousBalance: {
            type: Number,
            required: true,
            min: 0,
        },
    },
    { timestamps: true } // createdAt = "when did this payment happen"
);

const VendorPaymentLog = mongoose.model("VendorPaymentLog", vendorPaymentLogSchema);
export default VendorPaymentLog;
