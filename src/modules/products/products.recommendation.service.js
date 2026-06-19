import Products from "../../models/products.model.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { normalizeRecommendationPayload, parseModelJson } from "../../utils/modelJsonParser.js";

const apiKey = process.env.GEMINI_API_KEY;
const ai = new GoogleGenerativeAI(apiKey);
const model = ai.getGenerativeModel({ model: "gemini-2.5-flash" });

const buildCartSignals = (cartItems) => {
  const categories = new Set();
  const tags = new Set();
  const productNames = new Set();

  for (const item of cartItems) {
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

  return { categories, tags, productNames };
};

const getFallbackRecommendations = async (cartItems) => {
  const { categories, tags, productNames } = buildCartSignals(cartItems);

  const activeProducts = await Products.find({ quantity: { $gt: 0 } });

  return activeProducts
    .filter((product) => {
      const productNameKey = product.productName?.trim().toLowerCase();
      return !productNames.has(productNameKey);
    })
    .map((product) => {
      const productCategory = product.category?.trim().toLowerCase();
      const productTags = Array.isArray(product.tags)
        ? product.tags.map((tag) => tag.trim().toLowerCase())
        : [];

      const categoryScore = categories.has(productCategory) ? 2 : 0;
      const tagScore = productTags.reduce(
        (score, tag) => (tags.has(tag) ? score + 1 : score),
        0,
      );

      return {
        product,
        score: categoryScore + tagScore,
      };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 4)
    .map(({ product }) => product);
};

export const getCartRecommendations = async (cartItems) => {
  if (!cartItems || cartItems.length === 0) return [];

  const cartSummary = cartItems.map((item) => ({
    name: item.productName,
    category: item.category,
    tags: item.tags || [],
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
    const recommendations = normalizeRecommendationPayload(parseModelJson(result.response.text()));

    const aiMatches = await Products.aggregate([
      {
        $match: {
          quantity: { $gt: 0 },
          $or: [
            { category: { $in: recommendations.suggestedCategories } },
            { tags: { $in: recommendations.suggestedTags } },
          ],
        },
      },
      {
        $addFields: {
          relevanceScore: {
            $add: [
              { $cond: [{ $setIsSubset: [["$category"], recommendations.suggestedCategories] }, 1, 0] },
              { $cond: [{ $gt: [{ $size: { $setIntersection: ["$tags", recommendations.suggestedTags] } }, 0] }, 2, 0] },
            ],
          },
        },
      },
      { $sort: { relevanceScore: -1, createdAt: -1 } },
      { $limit: 4 },
    ]);

    if (aiMatches.length > 0) {
      return aiMatches;
    }

    return await getFallbackRecommendations(cartItems);
  } catch (error) {
    console.error("AI Recommendation Error:", error);
    return await getFallbackRecommendations(cartItems);
  }
};