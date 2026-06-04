import express from "express";
import { createOrder , getMyOrders } from "./orders.controller.js";
const router = express.Router();

// POST /orders | Auth required (customer) | create order from cart items
// GET /orders/my-orders | Auth required (customer) | get logged-in customer orders
// GET /orders/:id | Auth required (customer owner, seller involved, admin) | get order details
// GET /orders/seller | Auth required (seller) | get all orders containing seller products
// PATCH /orders/:id/cancel | Auth required (customer owner) | cancel pending order
// PATCH /orders/:id/status | Auth required (seller owner, admin) | update order status lifecycle
// POST /orders/:id/rate | Auth required (customer owner) | rate completed order and update seller rating

router.post("/", createOrder);

//////////TEMPORARY MOCK AUTH MIDDLEWARE JUST FOR TESTING////////////////
const mockAuth = (req, res, next) => {
    req.user = { id: "65f1234567890abcdef12345" }; // The mock Customer ID from database
    next();
};

router.get("/my-orders", mockAuth, getMyOrders);

router.get("/:id", (req, res) => {
    res.json({message: "Get order by ID endpoint"});
});

router.get("/seller", (req, res) => {
    res.json({message: "Get seller orders endpoint"});
});

router.patch("/:id/cancel", (req, res) => {
    res.json({message: "Cancel order endpoint"});
});

router.patch("/:id/status", (req, res) => {
    res.json({message: "Update order status endpoint"});
});

router.post("/:id/rate", (req, res) => {
    res.json({message: "Rate order endpoint"});
});

export default router;