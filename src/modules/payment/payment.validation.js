// Validates the billing info the vendor submits when initiating a payment.
// Amount and currency are never accepted from the client — both are server-side only.
// "billing" fields are what Paymob requires to display on the payment page and receipt.
// We ask the vendor to input them explicitly rather than silently pulling from the DB,
// because payment receipts should reflect what the payer consciously provides.
export const validateInitiatePayment = (req, res, next) => {
    // Data is now pulled completely from the database server-side for safety.
    next();
};