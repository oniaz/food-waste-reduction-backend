import Order from "../../models/orders.model.js";
import Product from "../../models/products.model.js";
import Customer from "../../models/customers.model.js";
import Vendor from "../../models/vendors.model.js";
import express from "express";
import mongoose from "mongoose";

// POST /orders | Auth required (customer) | Create order from cart items
/**
 * @api {post} /api/orders Create Order
 * @apiName CreateOrder
 * @apiGroup Orders
 * @apiPermission customer
 * * @description Validates incoming cart items, evaluates transactional customer pricing by accounting 
 * for base prices, flat commissions, and active flat promotional discounts, saves the finalized 
 * pending order record, and sequentially updates matching product document inventory stocks.
 * * @param {import('express').Request} req - Express request object.
 * @param {Object} req.user - Authenticated user payload injected by your auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the customer checking out.
 * @param {Object} req.body - The request body payload.
 * @param {Array<Object>} req.body.products - Array of item configurations being purchased.
 * @param {string} req.body.products[].productId - The MongoDB ObjectId of the target product.
 * @param {number} req.body.products[].quantity - The physical amount of units requested.
 * @param {string} req.body.shippingAddress - The physical destination details for order shipment.
 * @param {string} req.body.paymentMethod - Choice of payment method (e.g., 'credit_card', 'cash_on_delivery').
 * * @param {import('express').Response} res - Express response object used to return JSON data.
 * @param {import('express').NextFunction} next - Express next middleware function for centralized global error management.
 * * @returns {Promise<void>} Sends a JSON response with status code 201 along with the created order object on success.
 * * @throws {400} If missing required payload fields, if input types are invalid, or if unit quantities violate stock limits.
 * @throws {404} If any specific product ID provided within the client payload cannot be found inside the database.
 */
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
            const finalCustomerPrice = product.price + (product.commission || 0) - (product.discount || 0);
            verifiedProductsList.push({
                productId: item.productId,
                vendorId: product.vendorId, //added to match schema edit
                quantity: item.quantity,
                priceAtPurchase: parseFloat(Math.max(0, finalCustomerPrice).toFixed(2)),
                isCommissioned: false 
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
/**
* @api {get} /api/orders/my-orders Get My Orders
 * @apiName GetMyOrders
 * @apiGroup Orders
 * @apiPermission customer
 * * @description Retrieves a chronological list of historical orders placed by the currently authenticated customer.
 * Supports optional pagination offsets, real-time backend pricing computations, and filtering by order status.
 * * @param {import('express').Request} req - Express request object.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the customer.
 * @param {Object} req.query - URL query parameters.
 * @param {string} [req.query.page=1] - Optional target page for pagination sets.
 * @param {string} [req.query.limit=10] - Optional numeric string to cap the total number of orders per page.
 * @param {string} [req.query.status] - Optional string to match specific order conditions ('pending', 'completed', etc.).
 * * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * * @returns {Promise<void>} Sends a JSON response with status 200 containing computed pricing data and orders array.
 * * @throws {401} If the request context is missing user verification data or the customer identity cannot be established.
 */
export const getMyOrders = async (req, res, next) => {  
    try {
        const customerId = req.user?.id; ////modify this to match auth middleware's user object structure
        if (!customerId) {
            return res.status(401).json({ message: "Unauthorized: Customer ID not found" });
        }
        // 1. Start with your working baseline filter
        const queryFilter = { customerId };
        
        // // 2. Strict validation check for the status string
        const incomingStatus = req.query.status;
        
        if (
            incomingStatus && 
            typeof incomingStatus === 'string' && 
            incomingStatus.trim() !== '' && 
            incomingStatus !== 'undefined' && // Guardrail against frontend string serialization bugs
            incomingStatus !== 'all'          // Guardrail if frontend uses 'all' for resetting filters
        ) {
            queryFilter.status = incomingStatus.trim().toLowerCase();
        }
        
        const page = parseInt(req.query.page, 10) || 1;   
        const limit = parseInt(req.query.limit, 10) || 10; 
        const skip = (page - 1) * limit;
        const totalOrders= await Order.countDocuments(queryFilter);
        const rawOrders = await Order.find( queryFilter )
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
                path: 'products.productId',
                select: 'price discount commission' // Pulls base price, commision and discount from Product schema
            })
            .populate({
                path: 'products.vendorId', // Targets vendorId inside the products array
                select: 'shopName address pickupTime' // Pulls shopName from Vendors schema
            });
        // 2. Map through orders to calculate summary pricing totals
        const orders = rawOrders.map(orderDoc => {
            // Convert Mongoose Document to raw JS object so we can append custom properties safely
            const order = orderDoc.toObject(); 
            
            let totalPriceBeforeDiscount = 0;
            let totalDiscount = 0;

            order.products.forEach(item => {
                const quantity = item.quantity || 0;
                // Fallback to schema values if product document populated successfully
                const basePrice = (item.productId?.price || item.priceAtPurchase)+(item.productId?.commission); 
                const itemDiscount = item.productId?.discount || 0; 

                totalPriceBeforeDiscount += basePrice * quantity;
                totalDiscount += itemDiscount * quantity;
            });

            const finalPrice = totalPriceBeforeDiscount - totalDiscount;

            // Attach computed values back to the order object root level
            return {
                ...order,
                summary: {
                    totalPriceBeforeDiscount,
                    totalDiscount,
                    finalPrice: finalPrice < 0 ? 0 : finalPrice // Ensure it doesn't drop below zero
                }
            };
        });

        return res.status(200).json({ 
            success: true, 
            count: orders.length, 
            totalOrders,
            totalPages: Math.ceil(totalOrders / limit),
            currentPage: page,
            orders 
        });

    } catch (error) {
        next(error);
    }
};

// GET /orders/:id | Auth required (customer owner, seller involved, admin) | get order details 
//one end point used for all three roles with guardrails in controller
/**
 * @api {get} /api/orders/:id Get Order Details
 * @apiName GetOrderDetails
 * @apiGroup Orders
 * @apiPermission admin | customer | vendor
 * * @description Retrieves full invoice and tracking details for a specific order by its unique ID.
 * This endpoint implements a multi-role security guardrail allowing visibility only if the 
 * authenticated requester satisfies at least one of these conditions:
 * 1. The user is an Admin.
 * 2. The user is the Customer who originally placed the order.
 * 3. The user is a Vendor who owns at least one product within the requested order.
 * * @param {import('express').Request} req - Express request object.
 * @param {Object} req.params - URL route parameters.
 * @param {string} req.params.id - The unique MongoDB ObjectId of the target order.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the active requester.
 * @param {string} req.user.role - The authorization system role of the user ('admin', 'customer', or 'vendor').
 * * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * * @returns {Promise<void>} Sends a JSON response with status 200 containing the populated order document, or passes errors to next().
 * * @throws {400} If the provided order ID missing or fails basic MongoDB ObjectId structural validation formatting.
 * @throws {403} If the authenticated user is neither the buying customer, an involved vendor, nor a system administrator.
 * @throws {404} If no order document corresponds to the valid database ObjectId parameter.
 */
export const getOrderDetails = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: "Invalid order ID" });
        }

        const orderDoc = await Order.findById(orderId)
            .populate({
                path: 'customerId',
                select: 'name phoneNumber' 
            })
            .populate({
                path: 'products.productId', 
                select: 'price discount commission',
                populate: {
                    path: 'vendorId', 
                    select: 'shopName phoneNumber address pickupTime' 
                }
            });

        if (!orderDoc) {
            return res.status(404).json({ message: "Order not found" });
        }

        // --- MULTI-ROLE SECURITY GUARDRAIL ---
        const currentUserId = req.user?.id;
        const currentUserRole = req.user?.role;

        const isAdmin = currentUserRole === 'admin';
        const orderCustomerStrId = orderDoc.customerId?._id ? orderDoc.customerId._id.toString() : orderDoc.customerId?.toString();
        const isCustomerOwner = currentUserRole === 'customer' && orderCustomerStrId === currentUserId;

        const isSellerInvolved = currentUserRole === 'vendor' && orderDoc.products.some(item => { 
            const vendorRef = item.productId?.vendorId;
            if (!vendorRef) return false; 

            const vendorStrId = (typeof vendorRef === 'object' && '_id' in vendorRef) 
                ? vendorRef._id.toString() 
                : vendorRef.toString();

            return vendorStrId === currentUserId;
        });

        if (!isAdmin && !isCustomerOwner && !isSellerInvolved) {
            return res.status(403).json({ 
                success: false,
                message: "Forbidden: You do not have permission to view this order" 
            });
        }
        // Convert the single document safely into a plain object
        const order = orderDoc.toObject(); 
        
        let totalPriceBeforeDiscount = 0;
        let totalDiscount = 0;

        order.products.forEach(item => {
            const quantity = item.quantity || 0;
            const commission = item.productId?.commission || 0;
            const basePrice = (item.productId?.price || item.priceAtPurchase) + commission; 
            const itemDiscount = item.productId?.discount || 0; 

            totalPriceBeforeDiscount += basePrice * quantity;
            totalDiscount += itemDiscount * quantity;
        });

        const finalPrice = totalPriceBeforeDiscount - totalDiscount;

        // Directly attach the summary object onto the single order root
        order.summary = {
            totalPriceBeforeDiscount,
            totalDiscount,
            finalPrice: finalPrice < 0 ? 0 : finalPrice 
        };

        // Send the modified plain object response
        return res.status(200).json({
            success: true,
            order
        });

    } catch (error) {
        next(error);
    }
};
// GET /orders/seller | Auth required (seller) | get all orders containing seller products
/**
 * @api {get} /api/orders/seller Get Seller Orders
 * @apiName GetSellerOrders
 * @apiGroup Orders
 * @apiPermission vendor
 * * @description Retrieves a chronological list of customer orders containing products owned by the
 * currently authenticated vendor, with optional filtering by order status. It filters the product array
 * to expose only items belonging to the requesting seller and computes a seller-specific financial summary.
 * * @param {import('express').Request} req - Express request object.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the vendor/seller.
 * @param {string} req.user.role - The authorization system role of the user (must be 'vendor').
 * @param {Object} req.query - URL query parameters.
 * @param {string} [req.query.page=1] - Optional target page for pagination results.
 * @param {string} [req.query.limit=10] - Optional numeric string to cap the total number of orders per page.
 * @param {string} [req.query.status] - Optional order status filter ('ready', 'completed', 'cancelled', 'pending').
 * * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * * @returns {Promise<void>} Sends a JSON response with status 200 containing matching orders with a custom summary object.
 * * @throws {401} If the request context is missing authentication identifiers.
 * @throws {403} If the requester's system role is not explicitly verified as a 'vendor'.
 */
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

        const page = parseInt(req.query.page, 10) || 1;   // Default to page 1
        const limit = parseInt(req.query.limit, 10) || 10; // Default to 10 items per page
        const skip = (page - 1) * limit;

        const sellerProductIds = await Product.distinct('_id', { vendorId: sellerId }); // Get array of all product IDs that belong to this seller , distinct is used to optimize the query by only returning unique product IDs instead of full product documents

        if (sellerProductIds.length === 0) { //if no products, then no orders can contain seller products
                return res.status(200).json({ 
                success: true, 
                count: 0, 
                totalPages: 0,
                currentPage: page,
                orders: [] 
            });
        }
        const queryFilter = { 
            "products.productId": { $in: sellerProductIds } 
        };
        
        const incomingStatus = req.query.status;
        if (
            incomingStatus && 
            typeof incomingStatus === 'string' && 
            incomingStatus.trim() !== '' && 
            incomingStatus !== 'undefined' && 
            incomingStatus !== 'all'
        ) {
            queryFilter.status = incomingStatus.trim().toLowerCase();
        }
        //Find orders containing any of those product IDs using $in operator
        const totalOrders = await Order.countDocuments(queryFilter);
        const orders = await Order.find(queryFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
            path: 'customerId',
            select: 'name phoneNumber'
        })
        .populate({
            path: 'products.productId',
            select: 'productName priceWithCommission category'
        });

        return res.status(200).json({ 
            success: true, 
            count: orders.length, 
            totalOrders,                                 // Total matching records
            totalPages: Math.ceil(totalOrders / limit),  // Total pages available
            currentPage: page,                           // Current page number
            orders
        });

    } catch (error) {
        next(error);
    }
};

// PATCH /orders/:id/cancel | Auth required (customer owner) | cancel pending order
/**
 * @api {patch} /api/orders/:id/cancel Cancel Order
 * @apiName CancelOrder
 * @apiGroup Orders
 * @apiPermission customer
 * * @description Cancels an active order if it is in an alterable state ('pending' or 'ready'). 
 * Upon validation, it transitions the order status to 'cancelled' and builds an array of write operations
 * to efficiently restock the product items back into the database via a native batch update.
 * * @param {import('express').Request} req - Express request object.
 * @param {Object} req.params - URL route parameters.
 * @param {string} req.params.id - The unique MongoDB ObjectId of the target order to cancel.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the active customer.
 * @param {string} req.user.role - The authorization system role of the user (must be 'customer').
 * * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * * @returns {Promise<void>} Sends a JSON response with status 200 on successful cancellation, or passes errors to next().
 * * @throws {400} If the order status is already finalized ('completed' or 'cancelled'), rendering it immutable.
 * @throws {403} If the customer attempting cancellation is not the original owner who placed the order.
 * @throws {404} If no order record corresponds to the provided database ObjectId parameter.
 */
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
// PATCH /orders/:id/status | Auth required (seller owner, admin) | Update order status lifecycle
/**
 * @api {patch} /api/orders/:id/status Update Order Status
 * @apiName UpdateOrderStatus
 * @apiGroup Orders
 * @apiPermission admin | vendor
 * @description Updates the tracking status lifecycle state of a specific order. 
 * This endpoint enforces strict multi-role permission loops and operational validation rules:
 * 1. Restricts caller scope to 'admin' or an involved 'vendor' who owns a product inside the order.
 * 2. Explicitly rejects incoming requests setting status to 'cancelled' (directing clients to use the explicit cancellation route).
 * 3. Enforces an immutability state-lock preventing any status updates if the order is already 'completed', 'cancelled', or 'abandoned'.
 * 4. When status is transitioned to 'completed', dynamically increments customer loyalty points and updates the vendor debt balance.
 * 5. When status is transitioned to 'abandoned', inventory stock counts are atomically reverted using a database bulkWrite matrix.
 * @param {import('express').Request} req - Express request object.
 * @param {Object} req.params - URL route parameters.
 * @param {string} req.params.id - The unique MongoDB ObjectId of the target order.
 * @param {Object} req.body - The request body payload.
 * @param {string} req.body.status - The target tracking status string to apply ('pending', 'ready', 'completed', 'abandoned').
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the active actor.
 * @param {string} req.user.role - The authorization system role of the user ('admin' or 'vendor').
 * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * @returns {Promise<void>} Sends a JSON response with status 200 on successful state change, or passes errors to next().
 * @throws {400} If parameters fail structural ID validation, the target status is missing/invalid, a client passes 'cancelled', or the order state is immutable.
 * @throws {403} If the actor is neither an administrator nor a vendor associated with items inside the target order.
 * @throws {404} If no order corresponds to the provided database ObjectId parameter.
 */
export const updateOrderStatus = async (req, res, next) => {
    try {
        const orderId = req.params.id;
        const { status } = req.body;
        const currentUserId = req.user?.id;
        const currentUserRole = req.user?.role;
        const validStatuses = ['ready', 'completed', 'cancelled', 'pending', 'abandoned'];

        if (!orderId || !mongoose.Types.ObjectId.isValid(orderId)) {
            return res.status(400).json({ message: "Invalid order ID" });
        }
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ message: "Invalid or missing status value" });
        }
        if (status === 'cancelled') {
            return res.status(400).json({ message: "Use the cancel endpoint to cancel orders" });
        }
        if (currentUserRole !== 'admin' && currentUserRole !== 'vendor') {
            return res.status(403).json({ message: "Forbidden: Only admins and vendors can update order status" });
        }

        const order = await Order.findById(orderId);
        if (!order) {
            return res.status(404).json({ message: "Order not found" });
        }
        
        //Add 'abandoned' to the state lock guardrail so finalized orders remain immutable
        if (['cancelled', 'completed', 'abandoned'].includes(order.status)) {
            return res.status(400).json({ 
                message: `Cannot update status. This order has already been finalized as '${order.status}'.` 
            });
        }

        const isSellerInvolved = currentUserRole === 'admin' || order.products.some(item => { 
            return item.vendorId?.toString() === currentUserId;
        });

        if (!isSellerInvolved) {
            return res.status(403).json({ message: "Forbidden: You can only update status of orders that contain your products" });
        }

        // 1. Process Status-Specific Side Effects BEFORE completing the request
        if (status === "completed") {
            // CUSTOMER LOYALTY POINTS 
            let totalPrice = 0;
            for (let i = 0; i < order.products.length; i++) {
                totalPrice += order.products[i].priceAtPurchase * order.products[i].quantity;
            }
            
            const pointsToAward = Math.floor(totalPrice * 0.01);
            if (pointsToAward > 0) {
                await Customer.findByIdAndUpdate(order.customerId, {
                    $inc: { loyaltyPoints: pointsToAward }
                });
            }
            
            // VENDOR COMMISSION (BULK WRITE)
            const vendorSalesMap = {};
            order.products.forEach(item => {
                const vId = item.vendorId?.toString();
                if (vId) {
                    const itemTotal = item.priceAtPurchase * item.quantity;
                    vendorSalesMap[vId] = (vendorSalesMap[vId] || 0) + itemTotal;
                }
            });

            const bulkOperations = Object.keys(vendorSalesMap).map(vId => {
                const grossSales = vendorSalesMap[vId];
                const platformDebt = parseFloat((grossSales * 0.1).toFixed(2)); 

                return {
                    updateOne: {
                        filter: { _id: vId }, 
                        update: { $inc: { moneyOwed: platformDebt } }
                    }
                };
            });

            if (bulkOperations.length > 0) {
                await Vendor.bulkWrite(bulkOperations);
            }            
        }

        if (status === "abandoned") {
            // Revert inventory levels cleanly for every item on the order invoice
            const updateStock = order.products.map(item => ({
                updateOne: {
                    filter: { _id: item.productId },
                    update: { $inc: { quantity: item.quantity } } 
                }
            }));

            if (updateStock.length > 0) {
                await Product.bulkWrite(updateStock); 
            }
        }

        // 2. Perform the update step after all logical hooks pass successfully
        const updatedOrder = await Order.findByIdAndUpdate(
            orderId,
            { $set: { status: status } },
            { new: true, runValidators: true }
        );

        // 3. Single clean response point serving all statuses consistently
        return res.status(200).json({
            success: true,
            message: status === 'abandoned' 
                ? "Order marked as abandoned and inventory returned successfully" 
                : `Order status updated to '${status}' successfully`,
            order: updatedOrder
        });

    } catch (error) {
        next(error);
    }
};
// POST /orders/:id/rate | Auth required (customer owner) | rate completed order and update seller rating
/**
 * @api {post} /api/orders/:id/rate Rate Order
 * @apiName RateOrder
 * @apiGroup Orders
 * @apiPermission customer
 * * @description Submits a 1-5 star rating for a finalized order. This endpoint protects
 * business and data logic through several integrated validation steps:
 * 1. Checks that the active requester is the explicitly authorized customer owner of the order.
 * 2. Enforces a strict state-lock ensuring only orders with a status of 'completed' can be rated.
 * 3. Integrates a duplicate prevention guardrail checking the 'isRated' status flag.
 * 4. Extracts and deduplicates unique Vendor IDs from the purchased products array using a JavaScript Set.
 * 5. Uses a highly optimized MongoDB '.bulkWrite()' matrix to update scores and transaction totals across all involved vendors in a single query packet.
 * * @param {import('express').Request} req - Express request object.
 * @param {Object} req.params - URL route parameters.
 * @param {string} req.params.id - The unique MongoDB ObjectId of the target order.
 * @param {Object} req.body - The request body payload.
 * @param {number} req.body.rating - An integer rating score ranging strictly between 1 and 5.
 * @param {Object} req.user - Authenticated user payload injected by auth middleware.
 * @param {string} req.user.id - The unique MongoDB ObjectId of the active customer.
 * @param {string} req.user.role - The authorization system role of the user (must be 'customer').
 * * @param {import('express').Response} res - Express response object used to return JSON payloads.
 * @param {import('express').NextFunction} next - Express next middleware function for global centralized error handling.
 * * @returns {Promise<void>} Sends a JSON response with status 200 on successful rating submission, or passes errors to next().
 * * @throws {400} If parameter IDs are structurally broken, the rating scale is invalid, the order is not fully completed, or it has been rated previously.
 * @throws {403} If the customer attempting to rate does not match the customer identity recorded on the order document.
 * @throws {404} If the target order cannot be found, or if no valid vendor associations remain linked to the items.
 */
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