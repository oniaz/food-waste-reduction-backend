import dotenv from "dotenv";
dotenv.config();

import Products from "../../models/products.model.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SURPLUS_FOOD_TAGS } from "../../data/productTags.js";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenerativeAI(apiKey);
const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

/**
 * RECOMMENDATIONS BASED ON CART ITEMS
 */
export const getCartRecommendations = async (cartItems) => {
  if (!cartItems || cartItems.length === 0) return [];

  // Simplify cart data to minimize tokens sent to the API
  const cartSummary = cartItems.map(item => ({
    name: item.productName,
    category: item.category,
    tags: item.tags || []
  }));

  const prompt = `
    Based on this user's shopping cart items in a food waste reduction marketplace:
    ${JSON.stringify(cartSummary)}

    Identify the core food theme or categories they are purchasing. Recommend up to 2 categories or tags that would complement their current cart selection to help them find additional matching deals.
    Respond ONLY with a valid JSON object matching this structure:
    { "suggestedCategories": ["bakery"], "suggestedTags": ["snack time"] }
  `;

  try {
    const result = await model.generateContent(prompt);
    const recommendations = JSON.parse(result.response.text().trim());

    // Use MongoDB to fetch actual matching surplus products based on AI's keyword suggestions
    return await Products.aggregate([
      {
        $match: {
          quantity: { $gt: 0 }, // Ensure product is in stock
          $or: [
            { category: { $in: recommendations.suggestedCategories } },
            { tags: { $in: recommendations.suggestedTags } }
          ]
        }
      },
      {
        $addFields: {
          // Calculate a relevance score: 2 points for matching tags, 1 point for category
          relevanceScore: {
            $add: [
              { $cond: [{ $setIsSubset: [["$category"], recommendations.suggestedCategories] }, 1, 0] },
              { $cond: [{ $gt: [{ $size: { $setIntersection: ["$tags", recommendations.suggestedTags] } }, 0] }, 2, 0] }
            ]
          }
        }
      },
      // Sort by the highest score first, so the absolute best matches appear on the UI
      { $sort: { relevanceScore: -1, createdAt: -1 } },
      { $limit: 4 }
    ]);
  } catch (error) {
    console.error("AI Recommendation Error:", error);
    return []; // Return nothing if the AI call fails
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
    const result = await model.generateContent(prompt);
    const cleanedResponse = result.response.text().trim();

    // Parse the response string back into a real JavaScript array
    return JSON.parse(cleanedResponse);
  } catch (error) {
    console.error("AI Tagging Error (falling back to empty tags):", error);
    return []; // Fail safely! If the AI breaks or times out, return empty tags so the user's product is still created.
  }
};

/**
 * GET ALL PRODUCTS
 */
export const getAllProducts = async (filters) => {
  const today = new Date();
  const query = {
    validDate: { $gte: today },
    expiryDate: { $gt: today },
    quantity: { $gt: 0 },
  };

  if (filters?.category) query.category = filters.category;

  if (filters?.minPrice || filters?.maxPrice) {
    query.price = {};
    if (filters.minPrice) query.price.$gte = Number(filters.minPrice);
    if (filters.maxPrice) query.price.$lte = Number(filters.maxPrice);
  }

  if (filters?.q) {
    query.$or = [
      { productName: { $regex: filters.q, $options: "i" } },
      { tags: { $in: [new RegExp(filters.q, "i")] } },
    ];
  }

  const page = Number(filters?.page) || 1;
  const limit = Number(filters?.limit) || 10;
  const skip = (page - 1) * limit;

  const products = await Products.find(query)
    .sort({ expiryDate: 1 })
    .skip(skip)
    .limit(limit);

  const total = await Products.countDocuments(query);

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
