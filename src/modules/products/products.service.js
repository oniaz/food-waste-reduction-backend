import Products from "../../models/products.model.js";
import UsersAuth from "../../models/usersAuth.model.js";
import { geminiModel } from "../../config/gemini.js";
import { groqClient, GROQ_MODEL } from "../../config/groq.js";
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
    console.warn(`Gemini AI Tagging Error for ${productName}. Falling back to Groq...`, error.message);
  }

  // === STRATEGY 2: Groq Tagging Generation ===
  try {
    const result = await groqClient.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: GROQ_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.1
    });
    const cleanedResponse = result.choices[0].message.content.trim();
    const parsedData = parseModelJson(cleanedResponse);
    const validTags = extractFlatArray(parsedData);
    if (validTags) {
      console.log(`🚀 FALLBACK SUCCESS: Tags for "${productName}" generated using GROQ (Llama 8B)`);
      return validTags;
    }
  } catch (error) {
    console.error(`Groq AI Tagging Error for ${productName}. Falling back to structural category tags:`, error.message);
  }

  // === STRATEGY 3: Local Mapping Baseline ===
  console.log(`🛡️ GROUND FALLBACK: Using local static category rules to tag "${productName}"`);
  return getCategoryFallbackTags(category);
};

/**
 * GET ALL PRODUCTS
 */
// ...existing code...
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
        from: "usersauths",
        localField: "vendor.authId",
        foreignField: "_id",
        as: "vendorAuth",
      },
    },

    { $unwind: "$vendorAuth" },

    {
      $match: {
        "vendorAuth.accountStatus": "active",
      },
    },

    // FINAL PRICE AFTER DISCOUNT
    {
      $addFields: {
        finalPrice: {
          $subtract: [
            "$price",
            { $multiply: ["$price", { $divide: ["$discount", 100] }] },
          ],
        },
      },
    },

    // Post-lookup filters that require vendor data or finalPrice
    ...(function () {
      const postMatch = {};

      // apply min/max price against finalPrice (if provided)
      if (filters?.minPrice || filters?.maxPrice) {
        postMatch.finalPrice = {};
        if (filters.minPrice)
          postMatch.finalPrice.$gte = Number(filters.minPrice);
        if (filters.maxPrice)
          postMatch.finalPrice.$lte = Number(filters.maxPrice);
      }

      // apply vendor location filters against the joined vendor document
      if (filters?.city) {
        postMatch["vendor.address.city"] = new RegExp(filters.city, "i");
      }
      if (filters?.governorate) {
        postMatch["vendor.address.governorate"] = new RegExp(
          filters.governorate,
          "i",
        );
      }

      return Object.keys(postMatch).length ? [{ $match: postMatch }] : [];
    })(),

    // PROJECT RESPONSE (expose vendor address/shopName)
    {
      $project: {
        productName: 1,
        price: 1,
        discount: 1,
        finalPrice: 1,
        expiryDate: 1,
        validDate: 1,
        quantity: 1,
        isDeliverable: 1,
        imgUrl: 1,
        description: 1,
        tags: 1,
        category: 1,
        "vendor.address.city": 1,
        "vendor.address.governorate": 1,
        shopName: "$vendor.shopName",
      },
    },

    { $sort: sortStage },

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
    const generatedTags = await generateProductTags(
      data.productName,
      data.description,
      data.category,
    );
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
