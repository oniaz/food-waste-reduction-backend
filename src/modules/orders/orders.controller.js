import Order from "../../models/orders.model.js";
import Product from "../../models/products.model.js";
import Customer from "../../models/customers.model.js";
import Vendor from "../../models/vendors.model.js";
import express from "express";
import mongoose from "mongoose";

// POST /orders | Auth required (customer) | create order from cart items
export const createOrder = async (req, res, next) => {
    try {
        // Implementation logic to create an order from cart items
        const { customerId, products, shippingAddress, paymentMethod } = req.body;
        // Validate input, calculate total price, and save the order
        if (!customerId || !products || products.length === 0 ||!Array.isArray(products)|| !shippingAddress || !paymentMethod) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        //must verify price from products collection and calculate total price here before creating order
        const verifiedProductsList = [];
        for (const item of products) {
            const product = await Product.findById(item.productId);
            if (!product) {
                return res.status(404).json({ message: `Product with ID ${item.productId} not found` });
            }
            if ((item.quantity < 1)|| (item.quantity > product.quantity)) {
                return res.status(400).json({ message: `Invalid quantity for product ID ${item.productId}` });
            }
            verifiedProductsList.push({
                productId: item.productId,
                quantity: item.quantity,
                priceAtPurchase: product.priceWithCommission, // Capture current price for order integrity
                isCommissioned: false // Default to false
            });
        }
  
        //create order 
        const order = await Order.create({
            customerId,
            products: verifiedProductsList,
            shippingAddress,
            paymentMethod,
            status: 'pending'
        });

        //Update Inventory
        for (const item of verifiedProductsList) {
            await Product.findByIdAndUpdate(item.productId, {
                $inc: { quantity: -item.quantity } // Decrements stock count natively in MongoDB
            });
        }


        res.status(201).json({ message: "Order created successfully", order });

    } catch (error) {
        next(error);
    }
};

// GET /orders/my-orders | Auth required (customer) | get logged-in customer orders
export const getMyOrders = async (req, res, next) => {  //mock auth was used for testing
    try {
        // Implementation logic to get orders for the logged-in customer
    
        
        const customerId = req.user?.id; ////modify this to match auth middleware's user object structure
        if (!customerId) {
            return res.status(401).json({ message: "Unauthorized: Customer ID not found" });
        }
        const limit = parseInt(req.query.limit, 10) || 10;
        const orders = await Order.find({ customerId }).sort({ createdAt: -1 }).limit(limit);

        return res.status(200).json({ 
            success: true, 
            count: orders.length, 
            orders 
        });

    } catch (error) {
        next(error);
    }
};

// GET /orders/:id | Auth required (customer owner, seller involved, admin) | get order details 
//one end point used for all three roles with guardrails in controller
export const getOrderDetails = async (req, res, next) => {
    try {
        // Implementation logic to get order details by ID 
            const orderId = req.params.id;
            if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
                return res.status(400).json({ message: "Invalid order ID" });
            }
            const order = await Order.findById(orderId).populate({
                path: 'customerId',
                select: 'name email' //only name and email of customer are needed in order details response
            }).populate({
                path: 'products.productId', 
                populate: {
                    path: 'vendorId', //populate the vendor details of each product in the order
                    select: 'shopName email detailedAddress' //only shop name and email of vendor are needed in order details response
                }
            });
            if (!order) {
                return res.status(404).json({ message: "Order not found" });
            }
            // --- MULTI-ROLE SECURITY GUARDRAIL ---
        const currentUserId = req.user?.id;
        const currentUserRole = req.user?.role;

        //Check if the user is an Admin
        const isAdmin = currentUserRole === 'admin';

        // Check if the user is the Customer who bought it
        const isCustomerOwner = order.customerId?._id.toString() === currentUserId && currentUserRole === 'customer';

        // Check if the user is a Vendor AND they own one of the products in this order
        const isSellerInvolved = currentUserRole === 'vendor' && order.products.some(item => { 
            const vendorId = item.productId?.vendorId?._id || item.productId?.vendorId;
            return vendorId?.toString() === currentUserId;
        });

        // If the current user is NOT an admin, NOT the buyer, and NOT an involved seller... block them!
        if (!isAdmin && !isCustomerOwner && !isSellerInvolved) {
            return res.status(403).json({ message: "Forbidden: You do not have permission to view this order" });
        }
        return res.status(200).json({
            success: true,
            order
        });

    } catch (error) {
        next(error);
    }
};
// GET /orders/seller | Auth required (seller) | get all orders containing seller products
export const getSellerOrders = async (req, res, next) => {
    try {
        const sellerId = req.user?.id;
        const currentUserRole = req.user?.role;
        //check if user is a vendor
        if (currentUserRole !== 'vendor') {
            return res.status(403).json({ message: "Forbidden: Only vendors can access this endpoint" });
        }
        // Validate seller ID presence
        if (!sellerId) {
            return res.status(401).json({ message: "Unauthorized: Seller ID not found" });
        }

        const limit = parseInt(req.query.limit, 10) || 10;
        const sellerProductIds = await Product.distinct('_id', { vendorId: sellerId }); // Get array of all product IDs that belong to this seller , distinct is used to optimize the query by only returning unique product IDs instead of full product documents

        if (sellerProductIds.length === 0) { //if no products, then no orders can contain seller products
            return res.status(200).json({ 
                success: true, 
                count: 0, 
                orders: [] 
            });
        }

        //Find orders containing any of those product IDs using $in operator
        const orders = await Order.find({ 
            "products.productId": { $in: sellerProductIds } 
        })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate({
            path: 'customerId',
            select: 'name email'
        })
        .populate({
            path: 'products.productId',
            select: 'productName priceWithCommission category'
        });

        return res.status(200).json({ 
            success: true, 
            count: orders.length, 
            orders 
        });

    } catch (error) {
        next(error);
    }
};