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
        const customerId = req.user?.id; 
        const { products, shippingAddress, paymentMethod } = req.body;
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

// PATCH /orders/:id/cancel | Auth required (customer owner) | cancel pending order
export const cancelOrder = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: "Invalid order ID" });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        
        const currentUserId = req.user?.id;
        const currentUserRole = req.user?.role;

        if (currentUserRole !== 'customer' || order.customerId?.toString() !== currentUserId) {
            return res.status(403).json({ message: "Forbidden: You do not have permission to cancel this order" });
        }

        
        if (order.status !== 'pending' && order.status !== 'ready') {
            return res.status(400).json({ 
                message: `Cannot cancel order. Order is currently '${order.status}' and cannot be altered.` 
            });
        }

        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { $set: { status: 'cancelled' } },
            { new: true, runValidators: true } // runValidators ensures that any schema validations are re-applied during update, and new: true returns the updated document in the response
        );

        // When an order is cancelled, we need to restock the products in that order by incrementing their stock counts back up by the quantities in the cancelled order. We can use bulkWrite for efficient batch updates.
        const updateStock = order.products.map(item => ({
            updateOne: {
                filter: { _id: item.productId },
                update: { $inc: { quantity: item.quantity } } 
            }
        }));

        await Product.bulkWrite(updateStock); 
        //.bulkWrite() takes an array of update operations and executes
        // them directly on the database server in a single network request packet.
        //this prevents the overhead of multiple round-trip queries that would occur if we updated each product sequentially in a loop, which is especially beneficial when there are many products to update.
        return res.status(200).json({ 
            success: true,
            message: "Order cancelled successfully", 
            order: updatedOrder 
        });

    } catch (error) {
        next(error);
    } 
};

 // PATCH /orders/:id/status | Auth required (seller owner, admin) | update order status lifecycle
export const updateOrderStatus = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const { status } = req.body;
        const currentUserId = req.user?.id;
        const currentUserRole = req.user?.role;
        const validStatuses = ['ready', 'completed', 'cancelled', 'pending'];

        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: "Invalid order ID" });
        }
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ message: "Invalid or missing status value" });
        }
        
        // FIX: Only intercept 'cancelled' here. Let 'completed' pass through to the database update.
        if (status === 'cancelled') {
            return res.status(400).json({ message: "Use the cancel endpoint to cancel orders" });
        }
        
        if (currentUserRole !== 'admin' && currentUserRole !== 'vendor') {
            return res.status(403).json({ message: "Forbidden: Only admins and vendors can update order status" });
        }

        const order = await Order.findById(orderId).populate({
            path: 'products.productId',
            select: 'vendorId'
        });

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        
        if (order.status === 'cancelled' || order.status === 'completed') {
            return res.status(400).json({ 
                message: `Cannot update status. This order has already been finalized as '${order.status}'.` 
            });
        }

        const isSellerInvolved = currentUserRole === 'vendor' && order.products.some(item => { 
            const vendorId = item.productId?.vendorId?._id || item.productId?.vendorId;
            return vendorId?.toString() === currentUserId;
        });

        if (currentUserRole === 'vendor' && !isSellerInvolved) {
            return res.status(403).json({ message: "Forbidden: You can only update status of orders that contain your products" });
        }
       
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { $set: { status: status } },
            { new: true, runValidators: true }
        );

        return res.status(200).json({
            success: true,
            message: `Order status updated to '${status}' successfully`,
            order: updatedOrder
        });

    } catch (error) {
        next(error);
    }
};
// POST /orders/:id/rate | Auth required (customer owner) | rate completed order and update seller rating
export const rateOrder = async (req, res, next) => {
    try { 
        const orderId = req.params.id;
        const currentUserId = req.user?.id;
        const currentUserRole = req.user?.role;
        const { rating } = req.body;

        
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: "Invalid order ID" });
        }
        
        //Check rating range
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
            return res.status(400).json({ message: "Rating must be an integer between 1 and 5" });
        }

        
        const order = await Order.findById(orderId).populate({
            path: 'products.productId',
            select: 'vendorId'
        });

        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }

        //Check if the user is the owner of the product
        if (currentUserRole !== 'customer' || order.customerId?.toString() !== currentUserId) {
            return res.status(403).json({ message: "Forbidden: You do not have permission to rate this order" });
        }

        // State-Lock Guardrail
        if (order.status !== 'completed') {
            return res.status(400).json({ 
                message: `Cannot rate order. Only completed orders can be rated, but this order is currently '${order.status}'.` 
            });
        }

        //Duplicate Prevention Guardrail ///will be edited if we edit schema
        if (order.toObject().isRated === true) {
            return res.status(400).json({ message: "You have already submitted a rating for this order" });
        }

        //Deduplicate Vendor IDs using Spread and Set
        const vendorIdsInOrder = [
            ...new Set(
                order.products
                    .map(item => item.productId?.vendorId?._id?.toString() || item.productId?.vendorId?.toString())
                    .filter(id => id) // Remove any undefined values safely
            )
        ];

        if (vendorIdsInOrder.length === 0) {
            return res.status(404).json({ message: "No associated vendors found for this order" });
        }

        //Generate and execute bulk operations for unique vendors
        const vendorBulkOps = vendorIdsInOrder.map(vendorId => ({
            updateOne: {
                filter: { _id: vendorId },
                update: {
                    $inc: {
                        "rating.score": rating,             // Increment cumulative score by the stars given
                        "rating.totalRatingsNumber": 1      // Increment total count of ratings by 1
                    }
                }
            }
        }));

        await Vendor.bulkWrite(vendorBulkOps);

        //Mutate the order document dynamically to mark it as rated
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { $set: { isRated: true } },
            { new: true, strict: false } // strict: false lets us save fields not pre-defined in orderSchema
        );

        return res.status(200).json({
            success: true,
            message: "Order rated successfully! Vendor ratings have been updated.",
            order: updatedOrder
        });

    } catch (error) {
        next(error);
    }
};