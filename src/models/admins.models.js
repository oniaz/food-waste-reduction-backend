import mongoose from "mongoose";

const adminSchema = new mongoose.Schema({
    authId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "UsersAuth",
        required: true
    }
}, { timestamps: true });

const Admin = mongoose.model('Admin', adminSchema);
export default Admin;