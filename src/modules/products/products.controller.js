import * as productService from "./products.service.js";
import { uploadToCloudinary, deleteFromCloudinary } from "../../utils/cloudinaryHelper.js";
import mongoose from "mongoose";
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

    res.status(200).json({
      success: true,
      data: products,
    });
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

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Get product by ID
 * @route GET /products/:id
 * @param {Object} req - Express request object (params: id)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 * @returns {JSON} Single product object
 */
export const getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // validate ID first
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid product ID",
      });
    }

    const product = await productService.getProductById(id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Create new product
 * @route POST /products
 * @param {Object} req - Express request object (body: product data, file: product image, user from auth)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 * @returns {JSON} Created product
 */
export const create = async (req, res, next) => {
  try {
    req.body.vendorId = req.user.id;

    if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer);
      req.body.imgUrl = uploadResult.secure_url;
      req.body.publicImgId = uploadResult.public_id;
    }

    const product = await productService.createProduct(req.body);

    res.status(201).json({
      success: true,
      data: product,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Update existing product
 * @route PUT /products/:id
 * @param {Object} req - Express request object (params: id, body: update data, file: optional new product image)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 * @returns {JSON} Updated product
 */
export const update = async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // ownership check
    if (product.vendorId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to update this product",
      });
    }

      if (req.file) {
      const uploadResult = await uploadToCloudinary(req.file.buffer);
      
      // Clean up the old image asset using the new utility
      await deleteFromCloudinary(product.publicImgId);

      req.body.imgUrl = uploadResult.secure_url;
      req.body.publicImgId = uploadResult.public_id;

    }

    const updatedProduct = await productService.updateProduct(
      req.params.id,
      req.body,
    );

    res.json({
      success: true,
      data: updatedProduct,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Delete product
 * @route DELETE /products/:id
 * @param {Object} req - Express request object (params: id)
 * @param {Object} res - Express response object
 * @param {Function} next - Next middleware
 * @returns {JSON} Deletion result message
 */
export const remove = async (req, res, next) => {
  try {
    const product = await productService.getProductById(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    // ownership check
    if (product.vendorId.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "You are not allowed to delete this product",
      });
    }

    // Clean up asset from Cloudinary
    await deleteFromCloudinary(product.publicImgId);

    await productService.deleteProduct(req.params.id);

    res.json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const recommend = async (req, res, next) => {
  try {
    const { cartItems } = req.body; // Expecting an array from frontend
    const suggestions = await productService.getCartRecommendations(cartItems);

    if (suggestions.length === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        message: "No recommendations available based on current cart items",
      });
    }
    res.status(200).json({
      success: true,
      data: suggestions,
    });
  } catch (error) {
    next(error);
  }
};
