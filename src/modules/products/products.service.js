import Products from "../../models/products.model.js";
import UsersAuth from "../../models/usersAuth.model.js";

import { geminiModel } from "../../config/gemini.js";
import { SURPLUS_FOOD_TAGS } from "../../data/productTags.js";
import { parseModelJson } from "../../utils/modelJsonParser.js";
import mongoose from "mongoose";

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
    console.error("AI Tagging Error (falling back to empty tags):", error);
    return []; // Fail safely! If the AI breaks or times out, return empty tags so the user's product is still created.
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
      if (filters?.neighborhood) {
        postMatch["vendor.address.neighborhood"] = new RegExp(
          filters.neighborhood,
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
        vendorId: 1,
        "vendor.address.city": 1,
        "vendor.address.governorate": 1,
        "vendor.address.neighborhood": 1,
        "vendor.address.detailedAddress": 1,

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
// ...existing code...
// ...existing code...
export const getProductById = async (id) => {
  // validate id
  if (!mongoose.Types.ObjectId.isValid(id)) return null;

  const result = await Products.aggregate([
    {
      $match: {
        _id: new mongoose.Types.ObjectId(id),
      },
    },

    // 🟢 lookup vendor
    {
      $lookup: {
        from: "vendors",
        localField: "vendorId",
        foreignField: "_id",
        as: "vendor",
      },
    },

    {
      $unwind: {
        path: "$vendor",
        preserveNullAndEmptyArrays: true,
      },
    },

    // 🟢 حساب السعر النهائي
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

    // 🟢 رجّعي كل البيانات + العنوان
    {
      $project: {
        _id: 1,
        productName: 1,
        category: 1,
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
        vendorId: 1,
        createdAt: 1,
        updatedAt: 1,

        // 🔥 أهم جزء
        "vendor.address.governorate": 1,
        "vendor.address.city": 1,
        "vendor.address.neighborhood": 1,
        "vendor.address.detailedAddress": 1,

        shopName: "$vendor.shopName",
      },
    },
  ]);

  return result[0] || null;
};
// ...existing code...
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
