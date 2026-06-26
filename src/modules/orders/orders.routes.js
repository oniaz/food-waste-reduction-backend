import express from "express";
import {
    createOrder,
    getMyOrders,
    getOrderDetails,
    getVendorOrders,
    cancelOrder,
    updateOrderStatus,
    rateOrder,
} from "./orders.controller.js";
import {
    validateCreateOrder,
    validateOrderIdParam,
    validateUpdateOrderStatus,
    validateRateOrder,
} from "./orders.validation.js";
import authenticate from "../../middleware/authentication.middleware.js";
import authorizeRole from "../../middleware/authorization.middleware.js";
import authorizeStatus from "../../middleware/status.middleware.js";

const router = express.Router();

// POST /orders | Auth required (customer) | create order from cart items
// GET /orders/my-orders | Auth required (customer) | get logged-in customer orders
// GET /orders/:id | Auth required (customer owner, vendor involved, admin) | get order details
// GET /orders/vendor | Auth required (vendor) | get all orders containing vendor products
// PATCH /orders/:id/cancel | Auth required (customer owner) | cancel pending order
// PATCH /orders/:id/status | Auth required (vendor owner, admin) | update order status lifecycle
// POST /orders/:id/rate | Auth required (customer owner) | rate completed order and update vendor rating

router.post(
    "/",
    authenticate,
    authorizeRole("customer"),
    authorizeStatus("active"),
    validateCreateOrder,
    createOrder
);

router.get(
    "/my-orders",
    authenticate,
    authorizeRole("customer"),
    authorizeStatus("active", "suspended"),
    getMyOrders
);

router.get(
    "/vendor",
    authenticate,
    authorizeRole("vendor"),
    authorizeStatus("active", "suspended"),
    getVendorOrders
); //must be defined before the more general /:id route to avoid route conflicts

router.get(
    "/:id",
    authenticate,
    authorizeRole("vendor", "customer", "admin"),
    authorizeStatus("active", "suspended"),
    validateOrderIdParam,
    getOrderDetails
);

router.patch(
    "/:id/cancel",
    authenticate,
    authorizeRole("customer"),
    authorizeStatus("active", "suspended"),
    validateOrderIdParam,
    cancelOrder
);

router.patch(
    "/:id/status",
    authenticate,
    authorizeRole("vendor", "admin"),
    authorizeStatus("active", "suspended"),
    validateUpdateOrderStatus,
    updateOrderStatus
);

router.post(
    "/:id/rate",
    authenticate,
    authorizeRole("customer"),
    authorizeStatus("active"),
    validateRateOrder,
    rateOrder
);

export default router;