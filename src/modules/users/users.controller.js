import Order from "../../models/orders.model.js";
import Product from "../../models/products.model.js";
import Customer from "../../models/customers.model.js";
import Vendor from "../../models/vendors.model.js";
import express from "express";
import mongoose from "mongoose";
import UsersAuth from "../../models/usersAuth.model.js";
import bcrypt from 'bcrypt';

// GET /users/me | Auth required (all roles) | get current user profile with role data
export const getCurrentUser = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'vendor' && currentUserRole !== 'customer') {
            return res.status(403).json({ message: "Forbidden: Only authorized vendors and customers can access this endpoint" });
        }

        // Handle Vendor Fetching
        if (currentUserRole === "vendor") {
            
            const sellerData = await Vendor.findById(userId).lean(); // .lean() allows us to freely modify and spread the object safely
            
            if (!sellerData) {
                return res.status(404).json({ message: "Vendor profile not found" });
            }

            // Calculate rating, protecting against division by zero (0 total ratings)
            const totalRatings = sellerData.rating?.totalRatingsNumber || 0;
            const score = sellerData.rating?.score || 0;
            const vendorRating = totalRatings > 0 ? (score / totalRatings) : 0;

            return res.status(200).json({
                success: true,
                sellerData: {
                    ...sellerData,
                    vendorRating 
                }
            });
        }

        // Handle Customer 
        if (currentUserRole === "customer") {
            const customerData = await Customer.findById(userId).lean(); // Added .lean() here too for consistency

            if (!customerData) {
                return res.status(404).json({ message: "Customer profile not found" });
            }
            //didn't handel loyalty points yet because still thinking about them//
            return res.status(200).json({
                success: true,
                customerData
            });
        }
        
    } catch (error) {
        next(error); 
    } 
};

// PATCH /users/me | Auth required (all roles) | update own profile information
export const updateUserInfo = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const userId = req.user?.id;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'vendor' && currentUserRole !== 'customer') {
            return res.status(403).json({ message: "Forbidden: Only authorized vendors and customers can access this endpoint" });
        }

        let allowedUpdates = {};
        if (currentUserRole === 'vendor') {
            const { shopName, address, phoneNumber } = req.body;
            allowedUpdates = { shopName, address, phoneNumber };
        } 
        
        if (currentUserRole === 'customer') {
            const { name, address, phoneNumber } = req.body;
            allowedUpdates = { name, address, phoneNumber };
        }

        
        Object.keys(allowedUpdates).forEach(
            key => allowedUpdates[key] === undefined && delete allowedUpdates[key] // No update for undefined edits
        );

        
        if (Object.keys(allowedUpdates).length === 0) { // Check if there's actually anything to update
            return res.status(400).json({ message: "Bad Request: No valid fields provided for update" });
        }

        let updatedUser;
        const updateOptions = { 
            new: true,          // Returns the document after update is applied
            runValidators: true // Ensures the new data adheres to your Mongoose Schema rules
        };

        if (currentUserRole === "vendor") {
            updatedUser = await Vendor.findByIdAndUpdate(userId, allowedUpdates, updateOptions).lean();
            
            if (!updatedUser) return res.status(404).json({ message: "Vendor profile not found" });

            return res.status(200).json({
                success: true,
                message: "Vendor profile updated successfully",
                sellerData: updatedUser
            });
        }

        if (currentUserRole === "customer") {
            updatedUser = await Customer.findByIdAndUpdate(userId, allowedUpdates, updateOptions).lean();
            
            if (!updatedUser) return res.status(404).json({ message: "Customer profile not found" });

            return res.status(200).json({
                success: true,
                message: "Customer profile updated successfully",
                customerData: updatedUser
            });
        }
        
    } catch (error) {
         next(error); 
    } 
};

// PATCH /users/change-password | Auth required (all roles) | change password with old password verification
export const changePassword = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const userId = req.user?.id;
        const { oldPassword, newPassword } = req.body;
        

        
        if (!userId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'vendor' && currentUserRole !== 'customer') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }
        if (!oldPassword || !newPassword) {
            return res.status(400).json({ message: "Bad Request: Missing required parameters" });
        }
        if (typeof oldPassword !== 'string' || typeof newPassword !== 'string') {
            return res.status(400).json({ 
                message: "Bad Request: Password fields must be valid text strings." 
            });
        }

        
        let profile;
        if (currentUserRole === "vendor") {
            profile = await Vendor.findById(userId).select("authId");
        } else if (currentUserRole === "customer") {
            profile = await Customer.findById(userId).select("authId");
        }

        if (!profile || !profile.authId) {
            return res.status(404).json({ message: "authentication record not found" });
        }

        
        const userAuth = await UsersAuth.findById(profile.authId);
        if (!userAuth) {
            return res.status(404).json({ message: "Authentication record not found" });
        }

        
        const isMatch = await bcrypt.compare(oldPassword, userAuth.password);
        if (!isMatch) {
            return res.status(400).json({ message: "Can not change password" });
        }
        userAuth.password = newPassword;
        await userAuth.save();

        return res.status(200).json({
            success: true,
            message: "Password changed successfully"
        });

    } catch (error) {
        next(error);
    }
};