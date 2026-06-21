import mongoose from "mongoose";
import bcrypt from "bcrypt";
const usersAuthSchema = new mongoose.Schema({
   username: {
      type: String,
      required: true,
        unique: true,
        minlength: 5,
        maxlength: 30,
        trim: true
    },
    password: {
        type: String,
        required: true,
        minlength: 6 //no max length for password, since it will be hashed and the hash can be long
    },
    role: {
        type: String,
        required: true,
        enum: ["customer", "vendor", "admin"]
    },
    email: {
        type: String,
        required: true,
        trim: true,
        lowercase: true
    },
    accountStatus: {
        type: String,
        required: true,
        enum: ["active", "pending", "suspended"],
        default: "active"
    },
    resetToken: {
        type: String,
        default: null
    }}, { timestamps: true });
usersAuthSchema.pre("save", async function() {
    if (!this.isModified("password")) return;
    this.password = await bcrypt.hash(this.password, 10);
});
const UsersAuth = mongoose.model("UsersAuth", usersAuthSchema);
export default UsersAuth;