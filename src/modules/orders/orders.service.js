import mongoose from "mongoose";
import Order from "../../models/orders.model.js";
import Product from "../../models/products.model.js";
import Customer from "../../models/customers.model.js";
import Vendor from "../../models/vendors.model.js";

// ── Order Creation ────────────────────────────────────────────────────────────

/**
 * Verifies each cart item (product exists, vendor is active, quantity is valid),
 * computes the server-side price snapshot, saves the order, and decrements stock.
 * Returns { order } on success or { error, status } on a business-rule violation.
 */
export async function createOrderForCustomer(customerId, products, shippingAddress, paymentMethod) {
    if (!shippingAddress) {
        const customer = await Customer.findById(customerId);
        const { detailedAddress, neighborhood, city, governorate } = customer.address;
        if (!detailedAddress || !neighborhood || !city || !governorate) {
            return { error: "Your profile address is incomplete. Please provide a full shipping address.", status: 400 };
        }

        shippingAddress = `${detailedAddress}, district:${neighborhood}, city: ${city},governorate: ${governorate}`;
    }
    
    if (!paymentMethod) {
        paymentMethod = "cash_on_delivery";
    }

    //must verify price from products collection and calculate total price here before creating order
    const verifiedProductsList = [];
    for (const item of products) {
        const product = await Product.findById(item.productId).populate({
            path: 'vendorId',
            populate: { path: 'authId' }
        });
        if (!product) {
            return { error: `Product with ID ${item.productId} not found`, status: 404 };
        }
        if (product.vendorId?.authId?.accountStatus !== 'active') {
            return { error: `Product ${product.productName} is currently unavailable because the vendor shop is inactive`, status: 400 };
        }
        if ((item.quantity < 1)|| (item.quantity > product.quantity)) {
            return { error: `Invalid quantity for product ID ${item.productId}`, status: 400 };
        }
        const finalCustomerPrice = product.price + (product.commission || 0) - (product.discount || 0)*product.price*0.01;
        verifiedProductsList.push({
            productId: item.productId,
            vendorId: product.vendorId?._id || product.vendorId, //added to match schema edit
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

    return { order };
}

// ── Order Summary ─────────────────────────────────────────────────────────────

/**
 * Computes a pricing summary for a plain order object (after .toObject()).
 * Attaches the summary onto the order and returns it.
 */
export function attachOrderSummary(order) {
    let totalPriceBeforeDiscount = 0;
    let totalDiscount = 0;

    order.products.forEach(item => {
        const quantity = item.quantity || 0;
        // Fallback to schema values if product document populated successfully
        const basePrice = (item.productId?.price || item.priceAtPurchase)+(item.productId?.commission); 
        const itemDiscount = (item.productId?.discount || 0)*(item.productId?.price)*0.01; 

        totalPriceBeforeDiscount += basePrice * quantity;
        totalDiscount += itemDiscount * quantity;
    });

    const finalPrice = totalPriceBeforeDiscount - totalDiscount;

    // Attach computed values back to the order object root level
    order.summary = {
        totalPriceBeforeDiscount,
        totalDiscount,
        finalPrice: finalPrice < 0 ? 0 : finalPrice // Ensure it doesn't drop below zero
    };

    return order;
}

// ── Status Filter Helper ──────────────────────────────────────────────────────

/**
 * Parses and sanitizes a status query string into a filter object.
 * Guards against frontend string serialization bugs ('undefined', 'all').
 */
export function buildStatusFilter(baseFilter, incomingStatus) {
    const queryFilter = { ...baseFilter };

    if (
        incomingStatus && 
        typeof incomingStatus === 'string' && 
        incomingStatus.trim() !== '' && 
        incomingStatus !== 'undefined' && // Guardrail against frontend string serialization bugs
        incomingStatus !== 'all'          // Guardrail if frontend uses 'all' for resetting filters
    ) {
        queryFilter.status = incomingStatus.trim().toLowerCase();
    }

    return queryFilter;
}

// ── Customer Orders ───────────────────────────────────────────────────────────

/**
 * Returns paginated orders for a customer, with summaries attached.
 */
export async function getCustomerOrders(customerId, incomingStatus, page, limit) {
    const queryFilter = buildStatusFilter({ customerId }, incomingStatus);
    const skip = (page - 1) * limit;

    const totalOrders = await Order.countDocuments(queryFilter);
    const rawOrders = await Order.find(queryFilter)
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
        return attachOrderSummary(order);
    });

    return { orders, totalOrders };
}

// ── Vendor Orders ─────────────────────────────────────────────────────────────

/**
 * Returns paginated orders that contain at least one product belonging to the vendor.
 */
export async function getOrdersForVendor(vendorId, incomingStatus, page, limit) {
    const skip = (page - 1) * limit;

    const vendorProductIds = await Product.distinct('_id', { vendorId: vendorId }); // Get array of all product IDs that belong to this vendor , distinct is used to optimize the query by only returning unique product IDs instead of full product documents

    if (vendorProductIds.length === 0) { //if no products, then no orders can contain vendor products
        return { orders: [], totalOrders: 0 };
    }

    const queryFilter = buildStatusFilter(
        { "products.productId": { $in: vendorProductIds } },
        incomingStatus
    );

    //Find orders containing any of those product IDs using $in operator
    const totalOrders = await Order.countDocuments(queryFilter);
    const orders = await Order.find(queryFilter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
            path: 'customerId',
            select: 'name phoneNumber address'
        })
        .populate({
            path: 'products.productId',
            select: 'productName priceWithCommission category'
        });

    return { orders, totalOrders };
}

// ── Order Detail ──────────────────────────────────────────────────────────────

/**
 * Fetches a single order by ID with full population for detail views.
 */
export async function getOrderById(orderId) {
    return Order.findById(orderId)
        .populate({
            path: 'customerId',
            select: 'name phoneNumber address' 
        })
        .populate({
            path: 'products.productId', 
            select: 'price discount commission',
            populate: {
                path: 'vendorId', 
                select: 'shopName phoneNumber address pickupTime' 
            }
        });
}

// ── Order Cancellation ────────────────────────────────────────────────────────

/**
 * Cancels an order and restocks all product quantities atomically.
 * Returns { order } on success or { error, status } on a business-rule violation.
 */
export async function cancelOrderById(orderId, customerId) {
    const order = await Order.findById(orderId);
    if (!order) return { error: "Order not found", status: 404 };

    if (order.customerId?.toString() !== customerId) {
        return { error: "Forbidden: You do not have permission to cancel this order", status: 403 };
    }

    
    if (order.status !== 'pending' && order.status !== 'ready') {
        return { error: `Cannot cancel order. Order is currently '${order.status}' and cannot be altered.`, status: 400 };
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

    return { order: updatedOrder };
}

// ── Status Update ─────────────────────────────────────────────────────────────

/**
 * Updates order status with side-effect handling:
 * - 'completed': awards customer loyalty points + increments vendor moneyOwed via bulkWrite
 * - 'abandoned': restocks all product quantities via bulkWrite
 *
 * Returns { order, message } on success or { error, status } on a business-rule violation.
 */
export async function updateOrderStatusById(orderId, status, currentUserId, currentUserRole) {
    const validStatuses = ['ready', 'completed', 'cancelled', 'pending', 'abandoned'];

    if (!status || !validStatuses.includes(status)) {
        return { error: "Invalid or missing status value", status: 400 };
    }
    if (status === 'cancelled') {
        return { error: "Use the cancel endpoint to cancel orders", status: 400 };
    }
    if (currentUserRole !== 'admin' && currentUserRole !== 'vendor') {
        return { error: "Forbidden: Only admins and vendors can update order status", status: 403 };
    }

    const order = await Order.findById(orderId);
    if (!order) return { error: "Order not found", status: 404 };
    
    //Add 'abandoned' to the state lock guardrail so finalized orders remain immutable
    if (['cancelled', 'completed', 'abandoned'].includes(order.status)) {
        return { error: `Cannot update status. This order has already been finalized as '${order.status}'.`, status: 400 };
    }

    const isVendorInvolved = currentUserRole === 'admin' || order.products.some(item => { 
        return item.vendorId?.toString() === currentUserId;
    });

    if (!isVendorInvolved) {
        return { error: "Forbidden: You can only update status of orders that contain your products", status: 403 };
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
    const message = status === 'abandoned' 
        ? "Order marked as abandoned and inventory returned successfully" 
        : `Order status updated to '${status}' successfully`;

    return { order: updatedOrder, message };
}

// ── Rating ────────────────────────────────────────────────────────────────────

/**
 * Submits a star rating for a completed order.
 * Updates all involved vendors via a single bulkWrite.
 * Returns { order } on success or { error, status } on a business-rule violation.
 */
export async function rateCompletedOrder(orderId, customerId, rating) {
    //Check rating range
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
        return { error: "Rating must be an integer between 1 and 5", status: 400 };
    }

    
    const order = await Order.findById(orderId).populate({
        path: 'products.productId',
        select: 'vendorId'
    });

    if (!order) return { error: "Order not found", status: 404 };

    //Check if the user is the owner of the product
    if (order.customerId?.toString() !== customerId) {
        return { error: "Forbidden: You do not have permission to rate this order", status: 403 };
    }

    // State-Lock Guardrail
    if (order.status !== 'completed') {
        return { error: `Cannot rate order. Only completed orders can be rated, but this order is currently '${order.status}'.`, status: 400 };
    }

    //Duplicate Prevention Guardrail ///will be edited if we edit schema
    if (order.toObject().isRated === true) {
        return { error: "You have already submitted a rating for this order", status: 400 };
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
        return { error: "No associated vendors found for this order", status: 404 };
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

    return { order: updatedOrder };
}