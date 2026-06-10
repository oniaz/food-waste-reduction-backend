import express from "express";
import {getCurrentUser , updateUserInfo} from "./users.controller.js";
import authenticate from "../../middleware/authentication.middleware.js" 
import authorizeRole from "../../middleware/authorization.middleware.js"

const router = express.Router();

// GET /users/me | Auth required (all roles) | get current user profile with role data
// PATCH /users/me | Auth required (all roles) | update own profile information
// PATCH /users/change-password | Auth required (all roles) | change password with old password verification
// GET /users/seller-dashboard | Auth required (seller) | get seller analytics summary
// GET /users | Auth required (admin) | get all users list

router.get("/me", authenticate, getCurrentUser);

router.patch("/me", authenticate, updateUserInfo);

router.patch("/change-password", (req, res) => {
    res.json({message: "Change password endpoint"});
});

router.get("/seller-dashboard", (req, res) => {
    res.json({message: "Seller dashboard endpoint"});
});

router.get("/", (req, res) => {
    res.json({message: "Get all users endpoint"});
});

export default router;