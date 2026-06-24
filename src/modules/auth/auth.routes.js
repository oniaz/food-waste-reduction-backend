import express from "express";
import {register, login, logout , forgotPassword, resetPassword } from "./auth.controller.js";
import authenticate from "../../middleware/authentication.middleware.js";
import authorizeRole from "../../middleware/authorization.middleware.js";
import authorizeStatus from "../../middleware/status.middleware.js";
import { authLimiter } from "../../middleware/rateLimit.middleware.js";

const router = express.Router();

// POST /auth/login | Public | login user and return JWT cookie/token
// POST /auth/register | Public | create customer or vendor account (no admin)
// POST /auth/logout | Auth required (all roles) | clear authentication session -> Delete cookie?
// POST /auth/forgot-password | Public | send password reset email/token
// POST /auth/reset-password | Public | reset password using valid token

router.post("/login",authLimiter, login);

router.post("/register", register);

router.post("/logout", authenticate, logout);

router.post("/forgot-password", forgotPassword);

router.post("/reset-password", resetPassword);

export default router;