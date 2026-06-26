import Products from "../../models/products.model.js";
import Customers from "../../models/customers.model.js";
import Vendors from "../../models/vendors.model.js";
import { geminiModel } from "../../config/gemini.js";
import { groqClient, GROQ_MODEL } from "../../config/groq.js";
import { normalizeRecommendationPayload, parseModelJson } from "../../utils/modelJsonParser.js";

const buildCartSignals = (cartItems) => {
  const categories = new Set();
  const tags = new Set();
  const productNames = new Set();
  const cartIds = new Set();
  const vendorIds = new Set(); // Track vendors currently in cart

  for (const item of cartItems) {
    if (item?._id) cartIds.add(item._id.toString());
    if (item?.vendorId) vendorIds.add(item.vendorId.toString());

    if (typeof item?.category === "string") {
      categories.add(item.category.trim().toLowerCase());
    }
    if (typeof item?.productName === "string") {
      productNames.add(item.productName.trim().toLowerCase());
    }
    if (Array.isArray(item?.tags)) {
      for (const tag of item.tags) {
        if (typeof tag === "string" && tag.trim()) {
          tags.add(tag.trim().toLowerCase());
        }
      }
    }
  }

  return { categories, tags, productNames, cartIds, vendorIds };
};

const getFallbackRecommendations = async (cartItems, customerAddress = null) => {
  const { categories, tags, productNames, cartIds, vendorIds } = buildCartSignals(cartItems);

  const customerNeighbourhood = customerAddress?.neighborhood || "";
  const customerCity = customerAddress?.city || "";
  const customerGov = customerAddress?.governorate || "";

  // Pre-resolve vendor IDs by location so the Products.find $or is valid
  let locationVendorIds = [];
  if (customerAddress) {
    const locationVendors = await Vendors.find({
      $or: [
        { "address.neighborhood": customerNeighbourhood },
        { "address.city": customerCity },
        { "address.governorate": customerGov },
      ]
    }).select("_id").lean();
    locationVendorIds = locationVendors.map(v => v._id);
  }

  const activeProducts = await Products.find({
    quantity: { $gt: 0 },
    _id: { $nin: Array.from(cartIds) },
    $or: [
      { category: { $in: Array.from(categories) } },
      { tags: { $in: Array.from(tags) } },
      { vendorId: { $in: [...Array.from(vendorIds), ...locationVendorIds] } },
    ]
  }).populate("vendorId");

  return activeProducts
    .filter((product) => {
      const productNameKey = product.productName?.trim().toLowerCase();
      return !productNames.has(productNameKey);
    })
    .map((product) => {
      const productCategory = product.category?.trim().toLowerCase();
      const productTags = Array.isArray(product.tags) ? product.tags.map(t => t.trim().toLowerCase()) : [];
      const vendor = product.vendorId;

      // 1. Base AI/Category/Tag score
      const categoryScore = categories.has(productCategory) ? 2 : 0;
      const tagScore = productTags.reduce((score, t) => (tags.has(t) ? score + 1 : score), 0);
      let score = categoryScore + tagScore;

      // 2. Add Location weight logic to fallback
      if (vendor) {
        if (vendorIds.has(vendor._id?.toString())) score += 5; // Same vendor

        if (customerAddress) {
          if (vendor.address?.neighborhood === customerNeighbourhood) {
            score += 3; // Same neighborhood
          }
          if (vendor.address?.city === customerCity) {
            score += 2; // Same city
          }
          if (vendor.address?.governorate === customerGov) {
            score += 1; // Same governorate
          }
        }
      }

      return { product, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(({ product }) => {
      // Clean up the populated vendor reference back to its native ID structure to match standard shape
      if (product.vendorId && product.vendorId._id) {
        product.vendorId = product.vendorId._id;
      }
      return product;
    });
};

const extractStructuredObject = (parsedData) => {
  if (!parsedData) return null;
  if (typeof parsedData === "object" && !Array.isArray(parsedData)) {
    if (Array.isArray(parsedData.suggestedCategories) || Array.isArray(parsedData.suggestedTags)) return parsedData;
    const values = Object.values(parsedData);
    if (values[0] && typeof values[0] === "object" && !Array.isArray(values[0])) return values[0];
  }
  if (Array.isArray(parsedData) && (parsedData[0]?.suggestedCategories || parsedData[0]?.suggestedTags)) return parsedData[0];
  return null;
};

export const getCartRecommendations = async (cartProductIds, customerId = null) => {
  if (!cartProductIds || cartProductIds.length === 0) return [];

  const cartItems = await Products.find({ _id: { $in: cartProductIds } }).lean();
  if (cartItems.length === 0) return [];

  const resolvedCartProductIds = cartItems.map(item => item._id);
  const cartVendorIds = cartItems.map(item => item.vendorId).filter(Boolean).map(id => id.toString());

  let customerAddress = null;
  if (customerId) {
    const customer = await Customers.findById(customerId).lean();
    if (customer?.address) customerAddress = customer.address;
  }

  const cartSummary = cartItems.map((item) => ({
    name: item.productName,
    category: item.category,
    tags: item.tags || [],
    description: item.description || "",
  }));

  const prompt = `
    Based on this user's shopping cart items in a food waste reduction marketplace:
    ${JSON.stringify(cartSummary)}

    Identify the core food theme or categories they are purchasing. Recommend up to 2 categories or tags that would complement their current cart selection to help them find additional matching deals.
    Respond ONLY with a valid JSON object matching this structure:
    { "suggestedCategories": ["bakery"], "suggestedTags": ["snack time"] }
  `;

  let recommendations = null;

  // === STRATEGY 1: Gemini Recommendation API ===
  try {
    const result = await geminiModel.generateContent(prompt);
    const parsedData = parseModelJson(result.response.text());
    const validObject = extractStructuredObject(parsedData);
    if (validObject) {
      recommendations = normalizeRecommendationPayload(validObject);
      console.log("⚡ SUCCESS: Recommendations generated using GEMINI FLASH");
    }
  } catch (error) {
    console.warn("Gemini Recommendation Error. Falling back to Groq...", error.message);
  }

  // === STRATEGY 2: Groq Fallback Recommendation API ===
  if (!recommendations) {
    try {
      const result = await groqClient.chat.completions.create({
        messages: [{ role: "user", content: prompt }],
        model: GROQ_MODEL,
        response_format: { type: "json_object" },
        temperature: 0.2
      });
      const parsedData = parseModelJson(result.choices[0].message.content.trim());
      const validObject = extractStructuredObject(parsedData);
      if (validObject) {
        recommendations = normalizeRecommendationPayload(validObject);
        console.log("🚀 FALLBACK SUCCESS: Recommendations generated using GROQ (Llama 8B)");
      }
    } catch (error) {
      console.error("Groq Recommendation Error. Running local DB fallback processing.", error.message);
    }
  }

  // === STRATEGY 3: Local Code Database Pipeline ===
  if (!recommendations) {
    console.log("🛡️ GROUND FALLBACK: Running completely offline local scoring algorithm for recommendations");
    return await getFallbackRecommendations(cartItems, customerAddress);
  }

  try {
    const customerGov = customerAddress?.governorate || "";
    const customerCity = customerAddress?.city || "";
    const customerNeighbourhood = customerAddress?.neighborhood || "";

    const aiMatches = await Products.aggregate([
      {
        $match: {
          quantity: { $gt: 0 },
          _id: { $nin: resolvedCartProductIds },
          $or: [
            { category: { $in: recommendations.suggestedCategories } },
            { tags: { $in: recommendations.suggestedTags } },
          ],
        },
      },
      {
        $lookup: {
          from: "vendors",
          localField: "vendorId",
          foreignField: "_id",
          as: "vendorDetails",
        },
      },
      { $unwind: "$vendorDetails" },
      {
        $addFields: {
          relevanceScore: {
            $add: [
              // Content Matching Points
              { $cond: [{ $setIsSubset: [["$category"], recommendations.suggestedCategories] }, 1, 0] },
              { $cond: [{ $gt: [{ $size: { $setIntersection: ["$tags", recommendations.suggestedTags] } }, 0] }, 2, 0] },

              // Location Matching Bonus Weights
              { $cond: [{ $in: [{ $toString: "$vendorId" }, cartVendorIds] }, 5, 0] }, // Same Vendor Bonus
              { $cond: [{ $eq: ["$vendorDetails.address.neighborhood", customerNeighbourhood] }, 3, 0] }, // Same Neighborhood Bonus
              { $cond: [{ $eq: ["$vendorDetails.address.city", customerCity] }, 2, 0] }, // New: Same City Bonus
              { $cond: [{ $eq: ["$vendorDetails.address.governorate", customerGov] }, 1, 0] } // Same Governorate Bonus
            ],
          },
        },
      },
      { $sort: { relevanceScore: -1, createdAt: -1 } },
      { $limit: 4 },
      { $project: { vendorDetails: 0 } }
    ]);

    if (aiMatches.length > 0) {
      return aiMatches;
    }

    return await getFallbackRecommendations(cartItems, customerAddress);
  } catch (error) {
    console.error("AI Recommendation Aggregation Pipeline Error. Running final fallback processing:", error);
    return await getFallbackRecommendations(cartItems, customerAddress);
  }
};