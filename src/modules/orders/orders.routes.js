import express from "express";
import { createOrder , getMyOrders , getOrderDetails , getSellerOrders, cancelOrder, updateOrderStatus , rateOrder} from "./orders.controller.js";
const router = express.Router();

// POST /orders | Auth required (customer) | create order from cart items
// GET /orders/my-orders | Auth required (customer) | get logged-in customer orders
// GET /orders/:id | Auth required (customer owner, seller involved, admin) | get order details
// GET /orders/seller | Auth required (seller) | get all orders containing seller products
// PATCH /orders/:id/cancel | Auth required (customer owner) | cancel pending order
// PATCH /orders/:id/status | Auth required (seller owner, admin) | update order status lifecycle
// POST /orders/:id/rate | Auth required (customer owner) | rate completed order and update seller rating


//////TEMPORARY MOCK AUTH MIDDLEWARE JUST FOR TESTING////////////////
const mockAuth = (req, res, next) => {
    req.user = { id: "65f1234567890abcdef12345", role: "customer" }; // The mock Customer ID from database
    next();
};

// const mockAuth = (req, res, next) => {
    //     req.user = { 
        //         id: "65f5555555555abcdef99999", 
        //         role: "vendor" 
        //     };
        //     next();
        // };
        
router.post("/", mockAuth,createOrder);
router.get("/my-orders", mockAuth, getMyOrders);

router.get("/seller", mockAuth, getSellerOrders); //must be defined before the more general /:id route to avoid route conflicts

router.get("/:id", mockAuth, getOrderDetails);


router.patch("/:id/cancel", mockAuth, cancelOrder);

router.patch("/:id/status", mockAuth, updateOrderStatus);

router.post("/:id/rate",mockAuth, rateOrder);

export default router;