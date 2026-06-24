import mongoose from "mongoose";
import UsersAuth from "./src/models/usersAuth.model.js";
import Admin from "./src/models/admins.models.js";
import dotenv from "dotenv";

dotenv.config();

const createSystemAdmin = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected securely to the database...");

        // Load credentials from environment variables safely
        const explicitEmail = process.env.ADMIN_EMAIL || "admin@foodwasteapp.com";
        const explicitUsername = process.env.ADMIN_USERNAME || "masteradmin";
        const explicitPassword = process.env.ADMIN_PASSWORD;

        if (!explicitPassword) {
            console.error("Fatal: ADMIN_PASSWORD is not defined in your .env file!");
            process.exit(1);
        }

        const existingAuth = await UsersAuth.findOne({
            $or: [{ email: explicitEmail }, { username: explicitUsername }]
        });

        if (existingAuth) {
            console.log("An administrator with this email or username already exists!");
            process.exit(0);
        }

        // Create the central UsersAuth credential entry
        const adminAuth = new UsersAuth({
            username: explicitUsername,
            email: explicitEmail,
            password: explicitPassword, // Will be automatically hashed by your schema's pre-save hook
            role: "admin",
            accountStatus: "active"
        });

        const savedAuth = await adminAuth.save();
        console.log(`Step 1/2: Created Auth Entry (ID: ${savedAuth._id})`);

        const adminProfile = new Admin({
            authId: savedAuth._id
        });

        await adminProfile.save();
        console.log(`Step 2/2: Created Admin Profile record linked successfully!`);
        console.log("Done! Admin account fully provisioned.");

    } catch (error) {
        console.error("Fatal script error executing creation:", error.message);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
};

createSystemAdmin();