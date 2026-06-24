import mongoose from "mongoose";

const vendorsSchema = new mongoose.Schema({
    shopName: {
        type: String,
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 50
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
        },
        map: {
            type: [Number], // [longitude, latitude]
            default: null
        }
    },
    phoneNumber: {
        type: String,
        required: true,
        trim: true // Cleans up accidental leading/trailing spaces from user input
    },
    taxNumber: {
        type: String,
        required: true,
        unique: true,
        trim: true // Cleans up pasted registration spacing
    },
    pickupTime: {
        type: [
            {
                days: { type: [String], required: true },
                from: { type: String, required: true },
                to: { type: String, required: true }
            }
        ],
        default: null
    },
    moneyOwed: {
        type: Number,
        default: 0,
        min: 0 // Protects ledger from negative balances
    },
    rating: {
        score: {
            type: Number,
            default: 0,
            min: 0
        },
        totalRatingsNumber: { 
            type: Number,
            default: 0,
            min: 0
        }
    },
    authId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "UsersAuth",
        required: true
    }
}, { timestamps: true });

const Vendors = mongoose.model("Vendors", vendorsSchema);
export default Vendors;