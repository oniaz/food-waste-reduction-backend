import mongoose from "mongoose";
import AppError from "../../utils/AppError.js";
import * as productsRepo from "./products.repository.js";

import { geminiModel } from "../../config/gemini.js";
import { groqClient, GROQ_MODEL } from "../../config/groq.js";
import { SURPLUS_FOOD_TAGS } from "../../data/productTags.js";
import { parseModelJson } from "../../utils/modelJsonParser.js";

// ── AI Tag Generation ─────────────────────────────────────────────────────────

const getCategoryFallbackTags = (category) => {
    const cleanCategory =
        typeof category === "string" ? category.trim().toLowerCase() : "";

    switch (cleanCategory) {
        case "ready-to-eat meals":
            return ["ready to eat", "perishable / consume today", "single-serve portion"];
        case "bakery":
            return ["quick breakfast (fetoor)", "perishable / consume today", "crunchy bite"];
        case "dairy":
            return ["requires continuous fridge", "creamy texture", "clearance deal"];
        case "frozen food":
            return ["keep frozen", "heat & serve", "family pack / bulk"];
        case "snacks and desserts":
            return ["tea time companion", "sweet tooth & dessert", "sweet & syrupy"];
        case "drinks":
            return ["shelf-stable (pantry)", "single-serve portion"];
        case "pantry":
            return ["shelf-stable (pantry)", "family pack / bulk", "clearance deal"];
        case "meat and seafood":
            return ["requires cooking", "requires continuous fridge", "family pack / bulk"];
        default:
            return ["shelf-stable (pantry)", "clearance deal"];
    }
};

const extractFlatArray = (parsedData) => {
    if (!parsedData) return null;
    if (typeof parsedData === "object" && !Array.isArray(parsedData)) {
        if (Array.isArray(parsedData.tags)) return parsedData.tags;
        const values = Object.values(parsedData);
        if (Array.isArray(values[0])) return values[0];
    }
    if (Array.isArray(parsedData) && parsedData[0]?.tags) return parsedData[0].tags;
    return Array.isArray(parsedData) ? parsedData : null;
};

/**
 * AI Helper: Generates relevant tags for a product from the master list.
 * Cascade: Gemini → Groq → local static map.
 */
const generateProductTags = async (productName, description, category) => {
    const prompt = `
  You are an AI backend assistant for a surplus food marketplace minimizing food waste.
  Analyze the following product data and select ALL tags from the ALLOWED TAGS list that genuinely and accurately apply to the product. Do not guess; only select a tag if it is highly relevant based on the product name, category, and description.
  
  Product Name: ${productName}
  Description: ${description || "No description provided"}
  Category: ${category}

  ALLOWED TAGS: ${JSON.stringify(SURPLUS_FOOD_TAGS)}

  CRITICAL: Respond ONLY with a valid JSON array of strings containing the selected tags (e.g., ["vegan", "snack time", "requires refrigeration"]). Do not include any markdown syntax, formatting, backticks, or text before/after the array.
`;

    // === STRATEGY 1: Gemini Tagging Generation ===
    try {
        const result = await geminiModel.generateContent(prompt);
        const cleanedResponse = result.response.text().trim();
        const parsedData = parseModelJson(cleanedResponse);
        const validTags = extractFlatArray(parsedData);
        if (validTags) {
            console.log(`⚡ SUCCESS: Tags for "${productName}" generated using GEMINI FLASH`);
            return validTags;
        }
    } catch (error) {
        console.warn(
            `Gemini AI Tagging Error for ${productName}. Falling back to Groq...`,
            error.message
        );
    }

    // === STRATEGY 2: Groq Tagging Generation ===
    try {
        const result = await groqClient.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: GROQ_MODEL,
            response_format: { type: "json_object" },
            temperature: 0.1,
        });
        const cleanedResponse = result.choices[0].message.content.trim();
        const parsedData = parseModelJson(cleanedResponse);
        const validTags = extractFlatArray(parsedData);
        if (validTags) {
            console.log(
                `🚀 FALLBACK SUCCESS: Tags for "${productName}" generated using GROQ (Llama 8B)`
            );
            return validTags;
        }
    } catch (error) {
        console.error(
            `Groq AI Tagging Error for ${productName}. Falling back to structural category tags:`,
            error.message
        );
    }

    // === STRATEGY 3: Local Mapping Baseline ===
    console.log(`🛡️ GROUND FALLBACK: Using local static category rules to tag "${productName}"`);
    return getCategoryFallbackTags(category);
};

// ── GET ALL ───────────────────────────────────────────────────────────────────

export const getAllProducts = async (filters) => {
    const today = new Date();

    const matchStage = {
        validDate: { $gte: today },
        expiryDate: { $gt: today },
        quantity: { $gt: 0 },
    };

    // CATEGORY (case-insensitive)
    if (filters?.category) {
        matchStage.category = new RegExp(`^${filters.category}$`, "i");
    }

    // IS DELIVERABLE
    if (filters?.isDeliverable !== undefined) {
        matchStage.isDeliverable =
            filters.isDeliverable === "true" || filters.isDeliverable === true;
    }

    // VENDOR FILTER
    if (filters?.vendorId && mongoose.Types.ObjectId.isValid(filters.vendorId)) {
        matchStage.vendorId = new mongoose.Types.ObjectId(filters.vendorId);
    }

    // NOTE: location filters and price filtering based on finalPrice are applied AFTER the vendor lookup
    // so DO NOT add address.city/governorate or finalPrice-based price filters here.

    // PAGINATION
    const page = Number(filters?.page) || 1;
    const limit = Number(filters?.limit) || 10;
    const skip = (page - 1) * limit;

    // SORT LOGIC
    let sortStage = { expiryDate: 1 };
    if (filters?.sort === "price_asc") sortStage = { finalPrice: 1 };
    if (filters?.sort === "price_desc") sortStage = { finalPrice: -1 };
    if (filters?.sort === "discount_desc") sortStage = { discount: -1 };

    // Post-lookup filters that require vendor data or finalPrice
    const postMatchStage = {};
    if (filters?.minPrice || filters?.maxPrice) {
        postMatchStage.finalPrice = {};
        if (filters.minPrice) postMatchStage.finalPrice.$gte = Number(filters.minPrice);
        if (filters.maxPrice) postMatchStage.finalPrice.$lte = Number(filters.maxPrice);
    }
    if (filters?.city) {
        postMatchStage["vendor.address.city"] = new RegExp(filters.city, "i");
    }
    if (filters?.governorate) {
        postMatchStage["vendor.address.governorate"] = new RegExp(filters.governorate, "i");
    }
    if (filters?.neighborhood) {
        postMatchStage["vendor.address.neighborhood"] = new RegExp(filters.neighborhood, "i");
    }

    const result = await productsRepo.aggregateProducts(
        matchStage,
        postMatchStage,
        sortStage,
        skip,
        limit
    );

    const total = result[0]?.metadata[0]?.total || 0;
    const products = result[0]?.data || [];

    return { page, limit, total, totalPages: Math.ceil(total / limit), data: products };
};

// ── GET BY ID ─────────────────────────────────────────────────────────────────

export const getProductById = async (id) => {
    if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new AppError("Invalid product ID", 400);
    }

    const result = await productsRepo.aggregateProductById(id);
    if (!result[0]) throw new AppError("Product not found", 404);

    return result[0];
};

// ── CREATE ────────────────────────────────────────────────────────────────────

export const createProduct = async (data) => {
    // Generate tags using AI if not provided
    if (!data.tags || data.tags.length === 0) {
        const generatedTags = await generateProductTags(
            data.productName,
            data.description,
            data.category
        );
        data.tags = generatedTags;
    }
    return productsRepo.createProduct(data);
};

// ── UPDATE ────────────────────────────────────────────────────────────────────

export const updateProduct = async (id, data, vendorId) => {
    const product = await productsRepo.findProductById(id);
    if (!product) throw new AppError("Product not found", 404);

    if (product.vendorId.toString() !== vendorId) {
        throw new AppError("You are not allowed to update this product", 403);
    }

    Object.assign(product, data);
    return productsRepo.saveProduct(product);
};

// ── DELETE ────────────────────────────────────────────────────────────────────

/**
 * Verifies ownership, deletes the product from the DB, and returns the
 * publicImgId so the controller can clean up Cloudinary after a successful delete.
 * Keeping the DB delete and ownership check together makes the operation atomic
 * from the controller's perspective — Cloudinary is only touched on success.
 */
export const deleteProduct = async (id, vendorId) => {
    const product = await productsRepo.findProductById(id);
    if (!product) throw new AppError("Product not found", 404);

    if (product.vendorId.toString() !== vendorId) {
        throw new AppError("You are not allowed to delete this product", 403);
    }

    // Delete from DB first — if this fails, Cloudinary is never touched
    await productsRepo.deleteProductById(id);

    // Return the Cloudinary ID so the controller can clean up the asset
    return product.publicImgId;
};

// ── SEARCH ────────────────────────────────────────────────────────────────────

export const searchProducts = async (q, filters = {}) => {
    if (!q) q = "";
    const searchKey = q.trim();

    const page = Number(filters.page) || 1;
    const limit = Number(filters.limit) || 10;
    const skip = (page - 1) * limit;

    const result = await productsRepo.aggregateSearch(searchKey, skip, limit);

    const total = result[0]?.metadata[0]?.total || 0;
    const data = result[0]?.data || [];

    return { page, limit, total, totalPages: Math.ceil(total / limit), data };
};