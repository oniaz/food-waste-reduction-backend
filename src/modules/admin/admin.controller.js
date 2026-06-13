import Order from "../../models/orders.model.js";
import Product from "../../models/products.model.js";
import Customer from "../../models/customers.model.js";
import Vendor from "../../models/vendors.model.js";
import express from "express";
import mongoose from "mongoose";
import UsersAuth from "../../models/usersAuth.model.js";
import bcrypt from 'bcrypt';
import Logs from "../../models/adminLogs.model.js"
import Admin from "../../models/admins.models.js"
// GET /admin/pending-sellers | Auth required (admin) | list sellers awaiting approval
export const getPendingSellers = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const authId = req.user?.authId;
        
        if (!authId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }

        const page = parseInt(req.query.page, 10) || 1;   
        const limit = parseInt(req.query.limit, 10) || 10; 
        const skip = (page - 1) * limit;

        const allPendingSellerIds = await UsersAuth.distinct(
            "_id", 
            { role: "vendor", accountStatus: "pending" }
        );

        const totalVendors = allPendingSellerIds.length;

        //Slice the IDs array for pagination OR let the second query handle skip/limit
        const paginatedIds = allPendingSellerIds.slice(skip, skip + limit);

        const pendingSellers = await Vendor.find({ 
            authId: { $in: paginatedIds } 
        }).lean(); // .lean() makes this dashboard query much faster

        return res.status(200).json({ 
            success: true, 
            pagination: {
                totalVendors,
                currentPage: page,
                totalPages: Math.ceil(totalVendors / limit),
                limit
            },
            count: pendingSellers.length, // Shows how many are on THIS page
            pendingSellers 
        });
        
    } catch (error) {
        console.log(error);
        next(error);
    }
};

// PATCH /admin/sellers/:sellerId/status | Auth required (admin) | approve or reject seller account
export const changeSellerStatus = async (req, res, next) => {
    try {
        const currentUserRole = req.user?.role;
        const authId = req.user?.authId; // This is the UsersAuth ID
        const { sellerId } = req.params; 
        const { status } = req.body;
        const validStatuses = ['pending', 'active', 'suspended'];

        if (!authId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }

        if (!sellerId || !mongoose.Types.ObjectId.isValid(sellerId)) {
            return res.status(400).json({ message: "Invalid seller ID format" });
        }
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ message: "Invalid or missing status value" });
        }

        const adminProfile = await Admin.findOne({ authId });
        if (!adminProfile) {
            return res.status(404).json({ message: "Admin profile record not found" });
        }

        const vendorProfile = await Vendor.findById(sellerId);
        if (!vendorProfile) {
            return res.status(404).json({ message: "Vendor profile not found" });
        }

        // get current account status before overwrite 
        const currentAuth = await UsersAuth.findById(vendorProfile.authId);
        if (!currentAuth) {
            return res.status(404).json({ message: "Associated authentication account not found" });
        }
        const previousStatus = currentAuth.accountStatus;

        if (previousStatus === status) {
            return res.status(400).json({ message: `Seller account is already ${status}` });
        }

        // update
        const updatedAuth = await UsersAuth.findByIdAndUpdate(
            vendorProfile.authId,
            { accountStatus: status },
            { new: true, runValidators: true }
        );

        // 4. Map the action string to match your exact schema enum values
        let logAction;
        if (status === 'active') {
            logAction = 'approve_vendor';
        } else if (status === 'suspended') {
            if (previousStatus === 'pending') {
                logAction = 'reject_vendor';
            } else if (previousStatus === 'active') {
                logAction = 'suspend_user'; 
            }
        } else if (status === 'pending') {
            logAction = 'suspend_user'; 
        }

        // Create the system log 
        Logs.create({
            adminId: adminProfile._id, // Now referencing the real '_id' from the Admin collection
            userId: vendorProfile.authId, // Targets 'UsersAuth' of the vendor being updated
            action: logAction,
            description: `Changed seller with Id ${sellerId} status from '${previousStatus}' to '${status}'.`
        })

        return res.status(200).json({
            success: true,
            message: `Seller account status successfully updated to ${status}`,
            data: {
                vendorId: vendorProfile._id,
                authId: updatedAuth._id,
                newStatus: updatedAuth.accountStatus
            }
        });
        
    } catch (error) {
        console.log(error);
        next(error);
    }
};
// GET /admin/logs | Auth required (admin) | get all system admin logs
export const getAllLogs = async (req, res, next) => { 
    try {
        const currentUserRole = req.user?.role;
        const authId = req.user?.authId;
        
        if (!authId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }

        const page = parseInt(req.query.page, 10) || 1;   
        const limit = parseInt(req.query.limit, 10) || 10; 
        const skip = (page - 1) * limit;

        const totalLogs = await Logs.countDocuments(); 

        const logs = await Logs.find()
            .sort({ createdAt: -1 }) // -1 sorts descending (newest first)
            .skip(skip)
            .limit(limit)
            .lean(); // Converts Mongoose docs to lightweight JSON objects

    
        return res.status(200).json({
            success: true,
            pagination: {
                totalLogs,
                currentPage: page,
                totalPages: Math.ceil(totalLogs / limit),
                limit
            },
            count: logs.length,
            logs
        });

    } catch (error) {
        next(error); 
    }
};
// GET /admin/:id/logs | Auth required (admin) | get logs for specific admin user 
export const getAdminLogs = async (req, res, next) => { 
    try {
        const currentUserRole = req.user?.role;
        const currentAuthId = req.user?.authId;
        const targetAdminAuthId = req.params.id;  //admin Id from admin table
        
        // Authorization Guards
        if (!currentAuthId) {
            return res.status(401).json({ message: "Unauthorized: User ID not found in session" });
        }
        if (currentUserRole !== 'admin') {
            return res.status(403).json({ message: "Forbidden: Unauthorized access" });
        }
        if (!mongoose.Types.ObjectId.isValid(targetAdminAuthId)) {
            return res.status(400).json({ message: "Invalid Admin ID format" });
        }

        const adminProfile = await Admin.findById(targetAdminAuthId);
        if (!adminProfile) {
            return res.status(404).json({ message: "Admin profile not found" });
        }

        const page = parseInt(req.query.page, 10) || 1;   
        const limit = parseInt(req.query.limit, 10) || 10; 
        const skip = (page - 1) * limit;

        const logQuery = { adminId: adminProfile._id };
        const totalLogs = await Logs.countDocuments(logQuery); 

        const logs = await Logs.find(logQuery)
            .sort({ createdAt: -1 }) 
            .skip(skip)
            .limit(limit)
            .lean(); 

        return res.status(200).json({
            success: true,
            pagination: {
                totalLogs,
                currentPage: page,
                totalPages: Math.ceil(totalLogs / limit),
                limit
            },
            count: logs.length,
            logs
        });

    } catch (error) {
        console.log(error);
        next(error); 
    }
};