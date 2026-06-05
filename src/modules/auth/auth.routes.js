import express from "express";
import {register, login, logout , forgotPassword, resetPassword } from "./auth.controller.js";

const router = express.Router();

// POST /auth/login | Public | login user and return JWT cookie/token
// POST /auth/register | Public | create customer or seller account (no admin)
// POST /auth/logout | Auth required (all roles) | clear authentication session -> Delete cookie?
// POST /auth/forgot-password | Public | send password reset email/token
// POST /auth/reset-password | Public | reset password using valid token
// GET /auth/me | Auth required (all roles) | return current authenticated user profile

router.post("/login", login);

router.post("/register", register);

router.post("/logout", logout);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", resetPassword);

router.get("/me", (req, res) => {
    res.json({message: "Get current user profile endpoint"});
});

export default router;