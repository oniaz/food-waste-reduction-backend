import mongoose from 'mongoose';

const categoriesEnum = ["bakery", "dairy", "snacks"]; 

const productSchema = new mongoose.Schema({
    category: { 
        type: String,
        required: true,
        enum: categoriesEnum
    },
    productName: { 
        type: String,
        required: true
    },
    priceWithCommission: { 
        type: Number,
        required: true
    },
    discount: { 
        type: Number,
        required: true,
        default: 0
    },
    expiryDate: { 
        type: Date,
        required: true
    },
    validDate: { 
        type: Date
    },
    vendorId: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendors', 
        required: true
    },
    quantity: { 
        type: Number,
        required: true
    },
    isDeliverable: {
        type: Boolean,
        required: true
    },
    imgUrl: { 
        type: String,
        required: true
    },
    description: { 
        type: String,
    },
    tags: { 
        type: [String], 
    }
}, { timestamps: true });

// Modern asynchronous pre-save hook (no 'next' parameter = no hanging bugs)
productSchema.pre("save", async function() {

    if (!this.isModified("category") && !this.isModified("expiryDate")) return; // Only recalculate if category or expiryDate has changed

    if (!this.expiryDate) return; // If expiryDate is not set, we can't calculate validDate, so we skip the calculation

    // 3. Define subtraction rules per category
    const daysToSubtractBeforeExpiry = {
        bakery: 7,  
        dairy: 10,   
        snacks: 30   
    };

    const bufferDays = daysToSubtractBeforeExpiry[this.category] || 0;
   
    const calculatedDate = new Date(this.expiryDate);
   
    calculatedDate.setDate(calculatedDate.getDate() - bufferDays); // Subtract the buffer days from the expiry date
   
    this.validDate = calculatedDate;   // Update the field natively
});

const Products = mongoose.model('Product', productSchema);
export default Products;