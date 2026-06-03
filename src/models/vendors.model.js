import mongoose from "mongoose";
const vendorsSchema = new mongoose.Schema({
   email: {
      type: String,
      required: true,
        unique: true, //on the level of vendors, email should be unique
   },
    shopName: {
       type: String,
       required: true,
    },
    address: {
        governorate: {
            type: String,
            required: true,
        },
        city: {
            type: String,
            required: true,
        },
        neighborhood: {
            type: String,
            required: true,
        },
        detailedAddress: {
            type: String,
            required: true,
        }
    },
    phoneNumber: {
        type: String,
        required: true,
    },
    taxNumber: {
        type: String,
        required: true,
    },
    moneyOwed: {
        type: Number,
        default: 0,
    },
    rating: {
        score: {
            type: Number,
            default: 0},
        totalRatingsNumber: { //to calculate the average rating
            type: Number,
            default: 0
        }
    },
    authId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "UsersAuth",
        required: true
    }
}   , { timestamps: true });
const Vendors = mongoose.model("Vendors", vendorsSchema);
export default Vendors;