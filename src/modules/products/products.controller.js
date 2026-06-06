import * as productService from "./products.service.js";
import mongoose from "mongoose";
/**
 * GET ALL
 */
export const getAll = async (req, res, next) => {
  try {
    const products = await productService.getAllProducts(req.query);

    res.status(200).json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error); // ✅
  }
};

/**
 * SEARCH
 */
export const search = async (req, res, next) => {
  try {
    const products = await productService.searchProducts(req.query.q);

    res.json({
      success: true,
      data: products,
    });
  } catch (error) {
    next(error); // ✅
  }
};

/**
 * GET BY ID
 */
export const getById = async (req, res, next) => {
  try {
    const { id } = req.params;

    // 🟢 validate ID first
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
 * CREATE
 */
export const create = async (req, res, next) => {
  try {
    req.body.vendorId = req.user.id;

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
 * UPDATE
 */
export const update = async (req, res, next) => {
  try {
    const product = await productService.updateProduct(req.params.id, req.body);

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
    next(error); // ✅
  }
};

/**
 * DELETE
 */
export const remove = async (req, res, next) => {
  try {
    const product = await productService.deleteProduct(req.params.id);

    if (!product) {
      return res.status(404).json({
        success: false,
        message: "Product not found",
      });
    }

    res.json({
      success: true,
      message: "Deleted successfully",
    });
  } catch (error) {
    next(error); // ✅
  }
};
