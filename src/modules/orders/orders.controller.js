import Order from "../../models/orders.model.js";
import Product from "../../models/products.model.js";
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

