import mongoose from "mongoose";

const customersSchema = new mongoose.Schema({
    name: {
        firstName: {
            type: String,
            required: true,
            trim: true,
            minlength: 3,
            maxlength: 50
        },
        lastName: {
            type: String,
            required: true,
            trim: true,
            minlength: 3,   
            maxlength: 50
        }
    },
    address: {
        governorate: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        city: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        neighborhood: {
            type: String,
            required: true,
            trim: true,
            lowercase: true
        },
        detailedAddress: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200
        }
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true
    },
    loyaltyPoints: {
        type: Number,
        default: 0,
        min: 0 // Loyalty points should never be negative
    },
    authId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "UsersAuth",
        required: true
    }
}, { timestamps: true });

const Customers = mongoose.model("Customers", customersSchema);
export default Customers;