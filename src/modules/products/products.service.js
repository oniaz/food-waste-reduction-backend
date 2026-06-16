import dotenv from "dotenv";
dotenv.config();

import Products from "../../models/products.model.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenerativeAI(apiKey);
const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

// TAGS LISTS 
// yet to choose one or make a new one
// 
const SURPLUS_FOOD_TAGS_1 = [
  // Dietary Preferences & Lifestyles (Highly relevant locally)
  "siamee friendly", // Perfect for Coptic fasting periods (Siam)
  "vegan", "vegetarian", "gluten-free", "dairy-free", "sugar-free", "healthy choice",

  // Local Food & Grocery Groups (Matches Egyptian kitchen staples)
  "baladi bread & feteer", "oriental sweets", "baking & kahk staples",
  "cheese & dairy (gebna)", "charcuterie & cold cuts", "pantry essentials (khezin)",
  "rice, pasta & grains", "pulses & legumes", "spices & herbs", "beverages & tea",
  "fresh produce (khodar & fawakeh)",

  // Storage & Climate Context (Crucial for Egyptian summers)
  "requires continuous AC/fridge", "freezer-friendly", "shelf-stable (pantry)",
  "perishable / consume today", "keep frozen",

  // Meal Context & Everyday Habits
  "perfect for suhoor", "quick breakfast (fetoor)", "lunch helper",
  "snack time", "cooking oil & ghee", "canned goods", "frozen prepped meals",

  // Surplus & Deal Types (Appeals directly to local budget shoppers)
  "bulk discount (kameyat)", "bundle deal", "imperfect shape", "overstock surplus",
  "seasonal surplus (ramadan/eed)", "baker's daily surplus"
];

const SURPLUS_FOOD_TAGS_big = [
  // 🥪 Occasions & Meal Context (The ultimate cross-category bridges)
  "perfect for breakfast",     // Bridges: Baladi bread (bakery) + Gebna/Yogurt (dairy)
  "late night / suhoor",       // Bridges: Yogurt (dairy) + Light snacks
  "tea time companion",        // Bridges: Biscuits/Cakes (snacks) + Feteer/Paté (bakery)
  "school lunchbox snack",     // Bridges: Juice boxes (snacks) + Packaged cheese (dairy)
  "gathering & azouma",        // Bridges: Large trays of oriental sweets (bakery) + Mixed deli platters (dairy)

  // 🍰 Flavor Profiles & Textures (Matches user taste preferences)
  "savory & salty",            // If they buy Roumi cheese, recommend salty chips
  "sweet & syrupy",            // Matches Basbousa, honey, or sweet spreads
  "spicy kick",                // Chili chips, spiced cheeses
  "creamy texture",            // Spreads, yogurts, creams
  "crunchy bite",              // Crackers, dry baked goods, chips

  // 🛒 Sub-Category Classifications (Gives Gemini granular context)
  "baladi bread & feteer",     // Traditional local doughs
  "oriental sweets",           // Basbousa, Konafa, Zalabia
  "western bakery & cakes",    // Croissants, toast, muffins, cupcakes
  "cheese & deli (gebna)",     // Roumi, white feta, Cheddar, Flamank
  "yogurt & sour cream",       // Plain yogurt, Greek yogurt, Rayeb milk
  "chips & crisps",            // Potato chips, corn puffs
  "biscuits & cookies",        // Tea biscuits, wafer bars
  "nuts & crackers",           // Roasted nuts, bake stix, salted crackers

  // 🕌 Dietary & Religious Alignment (Essential for local e-commerce filtering)
  "siamee friendly",           // Bridges plant-based snacks & bakery items during Coptic fasting periods
  "vegetarian",                // General dairy/bakery items containing no meat
  "vegan",                     // 100% plant-based items
  "healthy choice",            // Low-fat dairy, whole-wheat bakery items
  "sugar-free",                // Diet snacks, plain dairy

  // ❄️ Storage Realities & Urgency (Crucial for a surplus marketplace)
  "requires continuous fridge",// Cold-chain items that cannot sit in a warm room
  "shelf-stable",              // Pantry items safe at room temperature
  "perishable / consume today",// High-urgency items like fresh-baked bread
  "freezer-friendly",          // Good for users buying surplus to freeze for later

  // 💰 Deal Style & Packaging
  "bulk discount (kameyat)",   // Large quantities or family packs
  "single-serve portion",      // Individual cups, small chip bags, single muffins
  "bundle deal",               // Items typically packaged together (e.g., bread + cheese)
  "imperfect shape"            // Oddly shaped but perfectly edible baked goods
];

const SURPLUS_FOOD_TAGS = [
  // 🥪 The "Breakfast / Fetoor & Suhoor" Bridge
  // (Perfect for connecting Baladi Bread/Feteer with Gebna Roumi, White Cheese, or Yogurt)
  "perfect for breakfast",
  "late night / suhoor",
  
  // ☕ The "Teatime & Chatting" Bridge
  // (Bridges Savory Snacks like chips/biscuits with bakery items like fresh bakes)
  "tea time companion",
  "quick snacking",

  // 🍰 The "Sweet Tooth" Bridge
  // (Connects Oriental Sweets/Basbousa with sweet dairy items like flavored yogurt or sweet snack packs)
  "sweet tooth & dessert",

  // 🍲 The "Kitchen Staples / Khezin" Bridge
  // (Connects bulk pantry items, long-life dairy, or dry snack packs that households stock up on)
  "pantry essential",

  // 🌶️ Flavor Profile Hooks (Super powerful for recommendations!)
  // (If they buy Roumi cheese, recommend savory/salty chips. If they buy Basbousa, recommend sweet items)
  "savory & salty",
  "sweet & syrupy",
  "spicy kick",

  // 🕌 Cultural & Dietary Lifestyles
  // (Essential for Egyptian consumer targeting)
  "siamee friendly", // Bridges plant-based/dairy-free snacks and bakery items during fasting
  "vegetarian",
  "healthy choice",

  // ❄️ Temperature/Storage Cross-Matches
  // (Helps recommend items that share logistics, like keeping things in the fridge)
  "requires continuous fridge",
  "shelf-stable"
];


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
