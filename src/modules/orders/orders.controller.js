import {
    createOrderForCustomer,
    getCustomerOrders,
    getOrdersForVendor,
    getOrderDetails as fetchOrderDetails,
    cancelOrderById,
    updateOrderStatusById,
    rateCompletedOrder,
} from "./orders.service.js";

// POST /orders | Auth required (customer) | create order from cart items
export const createOrder = async (req, res, next) => {
    try {
        const customerId = req.user.id;
        const { products, shippingAddress, paymentMethod } = req.body;

        const order = await createOrderForCustomer(
            customerId,
            products,
            shippingAddress,
            paymentMethod
        );

        return res.status(201).json({ success: true, message: "Order created successfully", order });
    } catch (error) {
        next(error);
    }
};

// GET /orders/my-orders | Auth required (customer) | get logged-in customer orders
export const getMyOrders = async (req, res, next) => {
    try {
        const customerId = req.user.id;
        const { status } = req.query;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;

        const { orders, totalOrders } = await getCustomerOrders(customerId, status, page, limit);

        return res.status(200).json({
            success: true,
            count: orders.length,
            totalOrders,
            totalPages: Math.ceil(totalOrders / limit),
            currentPage: page,
            orders,
        });
    } catch (error) {
        next(error);
    }
};

// GET /orders/vendor | Auth required (vendor) | get all orders containing vendor products
export const getVendorOrders = async (req, res, next) => {
    try {
        const vendorId = req.user.id;
        const { status } = req.query;
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;

        const { orders, totalOrders } = await getOrdersForVendor(vendorId, status, page, limit);

        return res.status(200).json({
            success: true,
            count: orders.length,
            totalOrders,
            totalPages: Math.ceil(totalOrders / limit),
            currentPage: page,
            orders,
        });
    } catch (error) {
        next(error);
    }
};

// GET /orders/:id | Auth required (customer owner, vendor involved, admin) | get order details
// ID format validation is handled by validateOrderIdParam middleware.
// Access control (ownership/involvement check) is handled by the service.
export const getOrderDetails = async (req, res, next) => {
    try {
        const { id } = req.params;
        const currentUserId = req.user.id;
        const currentUserRole = req.user.role;

        // Aliased import (fetchOrderDetails) prevents name collision with this exported function
        const order = await fetchOrderDetails(id, currentUserId, currentUserRole);

        return res.status(200).json({ success: true, order });
    } catch (error) {
        next(error);
    }
};

// PATCH /orders/:id/cancel | Auth required (customer owner) | cancel pending order
// ID format validation is handled by validateOrderIdParam middleware.
export const cancelOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const customerId = req.user.id;

        const order = await cancelOrderById(id, customerId);

        return res.status(200).json({ success: true, message: "Order cancelled successfully", order });
    } catch (error) {
        next(error);
    }
};

// PATCH /orders/:id/status | Auth required (vendor owner, admin) | update order status lifecycle
// Format validation is handled by validateUpdateOrderStatus middleware.
// Business rules ('cancelled' redirect, terminal-state lock, vendor ownership) are in the service.
export const updateOrderStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        const currentUserId = req.user.id;
        const currentUserRole = req.user.role;

        const { order, message } = await updateOrderStatusById(
            id,
            status,
            currentUserId,
            currentUserRole
        );

        return res.status(200).json({ success: true, message, order });
    } catch (error) {
        next(error);
    }
};

// POST /orders/:id/rate | Auth required (customer owner) | rate completed order and update vendor rating
// Format + rating range validation is handled by validateRateOrder middleware.
export const rateOrder = async (req, res, next) => {
    try {
        const { id } = req.params;
        const customerId = req.user.id;
        const { rating } = req.body;

        const order = await rateCompletedOrder(id, customerId, rating);

        return res.status(200).json({
            success: true,
            message: "Order rated successfully! Vendor ratings have been updated.",
            order,
        });
    } catch (error) {
        next(error);
    }
};