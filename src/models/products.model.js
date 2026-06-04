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
        required: true,
        trim: true,
        minlength: 3,
        maxlength: 50
    },
    priceWithCommission: { 
        type: Number,
        required: true,
        min: 0
    },
    discount: { 
        type: Number,
        required: true,
        default: 0,
        min: 0,
        validate: {
            validator: function(value) {
                return value <= this.priceWithCommission; //false if discount is greater than price with commission, which is invalid
            },
            message: "Discount cannot be greater than the price with commission."
        }
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
        required: true,
        min: 0
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
        trim: true,
        maxlength: 200
    },
    tags: { 
        type: [String], 
    }
}, { timestamps: true });


productSchema.pre("save", async function() {

    // Recalculate if either field is modified, or if validDate doesn't exist yet
    const isCategoryChanged = this.isModified("category");
    const isExpiryChanged = this.isModified("expiryDate");
    const isValidDateMissing = !this.validDate;

    if (!isCategoryChanged && !isExpiryChanged && !isValidDateMissing) {
        return; // Safe to skip only if nothing relevant changed and validDate already exists
    }

    if (!this.expiryDate) return; // If expiryDate is not set, we can't calculate validDate, so we skip the calculation

    //Define subtraction rules per category
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

const Products = mongoose.model('Products', productSchema);
export default Products;