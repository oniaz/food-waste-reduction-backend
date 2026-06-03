import mongoose from 'mongoose';

const categoriesEnum = ["bakery", "dairy", "snacks"]; //will be expanded as needed

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
    discount: { // matches discount string NN (Kept as Number)
        type: Number,
        required: true,
        default: 0
    },
    expiryDate: { 
        type: Date,
        required: true
    },
    validDate: { //  Not required since it's calculated.
        type: Date
    },
    vendorId: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Vendors', // Targets your exported Vendors model name
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

const Product = mongoose.model('Product', productSchema);
export default Product;