import Products from "../../models/products.model.js";
import UsersAuth from "../../models/usersAuth.model.js";
import { geminiModel } from "../../config/gemini.js";
import { SURPLUS_FOOD_TAGS } from "../../data/productTags.js";
import { parseModelJson } from "../../utils/modelJsonParser.js";
import mongoose from "mongoose";

const getCategoryFallbackTags = (category) => {
  const cleanCategory = typeof category === 'string' ? category.trim().toLowerCase() : '';

  switch (cleanCategory) {
    case 'ready-to-eat meals':
      return ['ready to eat', 'perishable / consume today', 'single-serve portion'];
    case 'bakery':
      return ['quick breakfast (fetoor)', 'perishable / consume today', 'crunchy bite'];
    case 'dairy':
      return ['requires continuous fridge', 'creamy texture', 'clearance deal'];
    case 'frozen food':
      return ['keep frozen', 'heat & serve', 'family pack / bulk'];
    case 'snacks and desserts':
      return ['tea time companion', 'sweet tooth & dessert', 'sweet & syrupy'];
    case 'drinks':
      return ['shelf-stable (pantry)', 'single-serve portion'];
    case 'pantry':
      return ['shelf-stable (pantry)', 'family pack / bulk', 'clearance deal'];
    case 'meat and seafood':
      return ['requires cooking', 'requires continuous fridge', 'family pack / bulk'];
    default:
      return ['shelf-stable (pantry)', 'clearance deal'];
  }
};

/**
 * AI Helper: Generates relevant tags for a product from the master list
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

  try {
    const result = await geminiModel.generateContent(prompt);
    const cleanedResponse = result.response.text().trim();

    // Parse the response string back into a real JavaScript array
    return parseModelJson(cleanedResponse);
  } catch (error) {
    // INTERCEPT ERROR: Instead of failing out with empty tags, use the bulletproof category map
    console.error(`AI Tagging Error for ${productName}. Falling back to structural category tags:`, error);

    return getCategoryFallbackTags(category);
  }
};

/**
 * GET ALL PRODUCTS
 */
export const getAllProducts = async (filters) => {
  const today = new Date();
  const matchStage = {
    validDate: { $gte: today },
    expiryDate: { $gt: today },
    quantity: { $gt: 0 },
  };

  if (filters?.category) matchStage.category = filters.category;

  if (filters?.minPrice || filters?.maxPrice) {
    matchStage.price = {};
    if (filters.minPrice) matchStage.price.$gte = Number(filters.minPrice);
    if (filters.maxPrice) matchStage.price.$lte = Number(filters.maxPrice);
  }

  if (filters?.q) {
    matchStage.$or = [
      { productName: { $regex: filters.q, $options: "i" } },
      { tags: { $in: [new RegExp(filters.q, "i")] } },
    ];
  }

  const page = Number(filters?.page) || 1;
  const limit = Number(filters?.limit) || 10;
  const skip = (page - 1) * limit;

  const pipeline = [
    { $match: matchStage },
    {
      $lookup: {
        from: "vendors",
        localField: "vendorId",
        foreignField: "_id",
        as: "vendor",
      },
    },
    { $unwind: "$vendor" },
    {
      $lookup: {
        from: UsersAuth.collection.name,
        localField: "vendor.authId",
        foreignField: "_id",
        as: "vendorAuth",
      },
    },
    { $unwind: "$vendorAuth" },
    { $match: { "vendorAuth.accountStatus": "active" } },
    { $project: { vendor: 0, vendorAuth: 0 } },
    { $sort: { expiryDate: 1 } },
    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const result = await Products.aggregate(pipeline);

  const total = result[0]?.metadata[0]?.total || 0;
  const products = result[0]?.data || [];

  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    data: products,
  };
};

/**
 * GET BY ID
 */
export const getProductById = async (id) => {
  return await Products.findById(id);
};

/**
 * CREATE
 */
export const createProduct = async (data) => {
  // Generate tags using AI if not provided
  if (!data.tags || data.tags.length === 0) {
    const generatedTags = await generateProductTags(data.productName, data.description, data.category);
    data.tags = generatedTags;
  }
  return await Products.create(data);
};

/**
 * UPDATE
 */
export const updateProduct = async (id, data) => {
  const product = await Products.findById(id);
  if (!product) return null;

  Object.assign(product, data);
  return await product.save();
};

/**
 * DELETE
 */
export const deleteProduct = async (id) => {
  return await Products.findByIdAndDelete(id);
};

/**
 * SEARCH
 */
export const searchProducts = async (q, filters = {}) => {
  const today = new Date();

  if (!q) q = "";
  const searchKey = q.trim();

  const page = Number(filters.page) || 1;
  const limit = Number(filters.limit) || 10;
  const skip = (page - 1) * limit;

  const pipeline = [
    {
      $match: {
        validDate: { $gte: today },
        expiryDate: { $gt: today },
        quantity: { $gt: 0 },
      },
    },

    {
      $lookup: {
        from: "vendors",
        localField: "vendorId",
        foreignField: "_id",
        as: "vendor",
      },
    },

    { $unwind: "$vendor" },

    {
      $match: {
        $or: [
          { productName: { $regex: searchKey, $options: "i" } },
          { "vendor.shopName": { $regex: searchKey, $options: "i" } },
          {
            tags: {
              $elemMatch: { $regex: searchKey, $options: "i" },
            },
          },
        ],
      },
    },
    { $sort: { expiryDate: 1 } },

    {
      $facet: {
        metadata: [{ $count: "total" }],
        data: [{ $skip: skip }, { $limit: limit }],
      },
    },
  ];

  const result = await Products.aggregate(pipeline);

  const total = result[0]?.metadata[0]?.total || 0;
  const data = result[0]?.data || [];

  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    data,
  };
};
