import mongoose from "mongoose";
import { categoriesEnum, daysToSubtractBeforeExpiry } from "../data/productCategories.js";

const COMMISSION_FACTOR = 0.1;

const productSchema = new mongoose.Schema(
  {
    category: {
      type: String,
      required: true,
      enum: categoriesEnum,
    },
    productName: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 50,
    },
    price: {
      type: Number,
      required: true,
      min: 0,
    },

    commission: {
      type: Number,
      min: 0,
    },
    discount: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
      max:100 //modified since discount is saved and calculated as percentage
    },
    expiryDate: {
      type: Date,
      required: true,
    },
    validDate: {
      type: Date,
      default: Date.now,
    },
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendors",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    isDeliverable: {
      type: Boolean,
      required: true,
    },
    imgUrl: {
      type: String,
      required: true,
    },
    publicImgId: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 200,
    },
    tags: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true },
);

productSchema.pre("save", async function () {
  // Recalculate if either field is modified, or if validDate doesn't exist yet
  this.commission = this.price * COMMISSION_FACTOR;
  const isCategoryChanged = this.isModified("category");
  const isExpiryChanged = this.isModified("expiryDate");
  const isValidDateMissing = !this.validDate;

  if (!isCategoryChanged && !isExpiryChanged && !isValidDateMissing) {
    return; // Safe to skip only if nothing relevant changed and validDate already exists
  }

  if (!this.expiryDate) return;

  const bufferDays = daysToSubtractBeforeExpiry[this.category] || 0;

  const calculatedDate = new Date(this.expiryDate);

  calculatedDate.setDate(calculatedDate.getDate() - bufferDays); // Subtract the buffer days from the expiry date

  this.validDate = calculatedDate; // Update the field natively
});

const Products = mongoose.model("Products", productSchema);
export default Products;
