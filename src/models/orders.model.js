import mongoose from "mongoose";

const orderSchema = new mongoose.Schema({
    customerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Customers', // Targets your exported Customers model name
        required: true
    },
    products: [{
        productId: {
            type: mongoose.Schema.Types.ObjectId, 
            ref: 'Products', // Targets your exported Products model name
            required: true
        },
        quantity: {
            type: Number,
            required: true
        },
        priceAtPurchase: {
            type: Number,
            required: true
        },
        isCommissioned: {
            type: Boolean,
            required: true
        }
    }],
    status: {
        type: String,
        enum: ['ready', 'completed', 'cancelled'],
        default: 'pending'
    },
    shippingAddress: {
        type: String,
        required: true
    },
    paymentMethod: {
        type: String,
        enum: ['credit_card', 'paypal', 'cash_on_delivery'],
        required: true
    }}, { timestamps: true }); // Automatically adds createdAt and updatedAt fields

const Order = mongoose.model('Order', orderSchema);
export default Order;