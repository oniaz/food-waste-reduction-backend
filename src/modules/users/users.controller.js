import Order from "../../models/orders.model.js";
import Product from "../../models/products.model.js";
import Customer from "../../models/customers.model.js";
import Vendor from "../../models/vendors.model.js";
import express from "express";
import mongoose from "mongoose";

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