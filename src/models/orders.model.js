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
            required: true,
            min: 1
        },
        priceAtPurchase: {
            type: Number,
            required: true,
            min: 0
        },
        isCommissioned: {
            type: Boolean,
            default: false
        }
    }],
    status: {
        type: String,
        enum: ['ready', 'completed', 'cancelled', 'pending'],
        default: 'pending'
    },
    shippingAddress: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    paymentMethod: {
        type: String,
        enum: ['credit_card', 'paypal', 'cash_on_delivery'],
        required: true
    }}, { timestamps: true }); // Automatically adds createdAt and updatedAt fields

const Order = mongoose.model('Order', orderSchema);
export default Order;