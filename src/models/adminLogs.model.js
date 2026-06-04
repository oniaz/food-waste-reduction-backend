import mongoose from "mongoose";

const adminLogsSchema = new mongoose.Schema({
    adminId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Admin', // Targets your exported Admin model name
        required: true
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'UsersAuth', // Targets your exported UsersAuth model name
        // Not required since some actions may not target a specific user (e.g., system-wide actions)
    },
    action: {
        type: String,
        required: true,
        enum: ["suspend_user", "activate_user", "approve_vendor", "reject_vendor"] // Expand as needed
    },
    description: {
        type: String,
        trim: true,
        maxlength: 200
    }
}, { timestamps: true });

const AdminLogs = mongoose.model('AdminLogs', adminLogsSchema);
export default AdminLogs;