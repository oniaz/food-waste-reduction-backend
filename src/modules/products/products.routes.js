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

const router = express.Router();

router.get("/search", productController.search);

router.get("/", productController.getAll);

router.get("/:id", productController.getById);

router.post("/", productController.create);
router.post("/", validateCreateProduct, productController.create);
router.put("/:id", productController.update);

router.delete("/:id", productController.remove);

export default router;
