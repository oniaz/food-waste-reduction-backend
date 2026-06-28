// Validates the billing info the vendor submits when initiating a payment.
// Amount and currency are never accepted from the client — both are server-side only.
// "billing" fields are what Paymob requires to display on the payment page and receipt.
// We ask the vendor to input them explicitly rather than silently pulling from the DB,
// because payment receipts should reflect what the payer consciously provides.
export const validateInitiatePayment = (req, res, next) => {
    const { vendorFullName, vendorEmail, vendorPhone } = req.body;

    if (!vendorFullName || typeof vendorFullName !== "string" || vendorFullName.trim() === "") {
        return res.status(400).json({ message: "vendorFullName is required" });
    }
    if (!vendorEmail || typeof vendorEmail !== "string" || vendorEmail.trim() === "") {
        return res.status(400).json({ message: "vendorEmail is required" });
    }
    if (!vendorPhone || typeof vendorPhone !== "string" || vendorPhone.trim() === "") {
        return res.status(400).json({ message: "vendorPhone is required" });
    }

    next();
};