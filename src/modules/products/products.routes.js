// GET /products | Public | get all active and non-expired products with filter
// GET /products/:id | Public | get single product by id
// POST /products | Auth required (seller) | create product listing with image upload
// PUT /products/:id | Auth required (seller owner, admin optional) | update product details
// DELETE /products/:id | Auth required (seller owner, admin) | delete product
// GET /products/search?q= | Public | search products
// POST /products/recommendation | Auth required (customer) | AI-based product recommendations

import express from "express";
import * as productController from "./products.controller.js";
import { validateCreateProduct } from "./products.validation.js";
import authMiddleware from "../../middleware/authentication.middleware.js";
const router = express.Router();

// Public
router.get("/search", productController.search);
router.get("/", productController.getAll);
router.get("/:id", productController.getById);

// Protected
router.post(
  "/",
  authMiddleware,
  validateCreateProduct,
  productController.create,
);

router.put("/:id", authMiddleware, productController.update);

router.delete("/:id", authMiddleware, productController.remove);
export default router;
