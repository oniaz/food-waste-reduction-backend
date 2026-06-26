import * as productService from "./products.service.js";
import * as recommendationService from "./products.recommendation.service.js";
import { findProductById } from "./products.repository.js";
import {
    uploadToCloudinary,
    deleteFromCloudinary,
} from "../../utils/cloudinaryHelper.js";
import { CATEGORY_CONFIG } from "../../data/productCategories.js";

/**
 * Get all products
 * @route GET /products
 * @param {Object} req - Express request object (query params for filtering/pagination)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 * @returns {JSON} List of products
 */
export const getAll = async (req, res, next) => {
    try {
        const products = await productService.getAllProducts(req.query);

        res.status(200).json({ success: true, data: products });
    } catch (error) {
        next(error);
    }
};

/**
 * Search products by keyword
 * @route GET /products/search
 * @param {Object} req - Express request object (query: q)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 * @returns {JSON} Filtered products list
 */
export const search = async (req, res, next) => {
    try {
        const products = await productService.searchProducts(req.query.q);

        res.json({ success: true, data: products });
    } catch (error) {
        next(error);
    }
};

/**
 * Get product by ID
 * @route GET /products/:id
 * Validation of ID format is handled by validateProductIdParam middleware.
 * @param {Object} req - Express request object (params: id)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 * @returns {JSON} Single product object
 */
export const getById = async (req, res, next) => {
    try {
        const product = await productService.getProductById(req.params.id);

        res.json({ success: true, data: product });
    } catch (error) {
        next(error);
    }
};

/**
 * Create new product
 * @route POST /products
 * Auth, role, and field validation are handled by upstream middleware.
 * vendorId is injected onto req.body by validateCreateProduct.
 * @param {Object} req - Express request object (body: product data, file: product image)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 * @returns {JSON} Created product
 */
export const create = async (req, res, next) => {
    try {
        // Handle image upload — file was validated by uploadMiddleware already
        if (req.file) {
            const uploadResult = await uploadToCloudinary(req.file.buffer);
            req.body.imgUrl = uploadResult.secure_url;
            req.body.publicImgId = uploadResult.public_id;
        }

        const product = await productService.createProduct(req.body);

        res.status(201).json({ success: true, data: product });
    } catch (error) {
        next(error);
    }
};

/**
 * Update existing product
 * @route PUT /products/:id
 * Auth and role checks are handled by upstream middleware.
 * Ownership check is handled by the service.
 * @param {Object} req - Express request object (params: id, body: update data, file: optional image)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 * @returns {JSON} Updated product
 */
export const update = async (req, res, next) => {
    try {
        if (req.file) {
            // Fetch the current product doc to get the old publicImgId for Cloudinary cleanup.
            // Static top-level import of findProductById (no dynamic import).
            const existing = await findProductById(req.params.id);

            if (existing) {
                // Clean up the old image asset before uploading the replacement
                await deleteFromCloudinary(existing.publicImgId);
            }

            const uploadResult = await uploadToCloudinary(req.file.buffer);
            req.body.imgUrl = uploadResult.secure_url;
            req.body.publicImgId = uploadResult.public_id;
        }

        const updatedProduct = await productService.updateProduct(
            req.params.id,
            req.body,
            req.user.id
        );

        res.json({ success: true, data: updatedProduct });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete product
 * @route DELETE /products/:id
 * Auth and role checks are handled by upstream middleware.
 * Ownership check and DB deletion are both handled by the service atomically.
 * @param {Object} req - Express request object (params: id)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 * @returns {JSON} Deletion result message
 */
export const remove = async (req, res, next) => {
    try {
        // Service verifies ownership, deletes from DB, and returns publicImgId for cleanup
        const publicImgId = await productService.deleteProduct(req.params.id, req.user.id);

        // Cloudinary cleanup happens after the DB delete succeeds
        await deleteFromCloudinary(publicImgId);

        res.json({ success: true, message: "Deleted successfully" });
    } catch (error) {
        next(error);
    }
};

/**
 * Recommend products based on current cart items
 * @route POST /products/recommendations
 * cartItems validation is handled by validateRecommendCartItems middleware.
 * @param {Object} req - Express request object (body: cartItems array)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 * @returns {JSON} Recommendation list or empty result message
 */
export const recommend = async (req, res, next) => {
    try {
        const { cartItems } = req.body; // Expecting an array from frontend
        const suggestions = await recommendationService.getCartRecommendations(
            cartItems,
            req.user?.id
        );

        if (suggestions.length === 0) {
            return res.status(200).json({
                success: true,
                data: [],
                message: "No recommendations available based on current cart items",
            });
        }

        res.status(200).json({ success: true, data: suggestions });
    } catch (error) {
        next(error);
    }
};

export const getCategories = async (req, res, next) => {
    try {
        return res.status(200).json({ success: true, data: CATEGORY_CONFIG });
    } catch (error) {
        next(error);
    }
};