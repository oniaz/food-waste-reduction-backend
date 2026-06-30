import AppError from "../../utils/AppError.js";
import * as productsRepo from "./products.repository.js";

import { geminiModel } from "../../config/gemini.js";
import { groqClient, GROQ_MODEL } from "../../config/groq.js";
import { parseModelJson } from "../../utils/modelJsonParser.js";

/**
 * Pulls out a usable { suggestedDiscount, reasoning } object from whatever
 * shape the model returned. Mirrors the defensive extraction pattern used
 * in products.recommendation.service.js's extractStructuredObject.
 */
const extractDiscountSuggestion = (parsedData) => {
    if (!parsedData || typeof parsedData !== "object" || Array.isArray(parsedData)) return null;

    // Direct shape: { suggestedDiscount: 25, reasoning: "..." }
    if (typeof parsedData.suggestedDiscount === "number") return parsedData;

    // Nested shape: some models wrap the object under a single key
    const values = Object.values(parsedData);
    const nested = values.find(
        (v) => v && typeof v === "object" && typeof v.suggestedDiscount === "number"
    );
    return nested || null;
};

/**
 * Clamps and rounds the AI's suggested discount into a safe, valid range.
 * Never trust the raw model output directly — it could hallucinate 150% or -10%.
 */
const normalizeDiscount = (rawDiscount, currentDiscount) => {
    let discount = Number(rawDiscount);
    if (isNaN(discount)) discount = currentDiscount;

    discount = Math.round(discount);
    discount = Math.max(0, Math.min(100, discount)); // clamp to 0–100

    return discount;
};

/**
 * Builds the prompt fed to the AI, using only data already on the product document.
 */
const buildPrompt = (product, daysUntilExpiry) => `
You are a pricing assistant for a surplus food marketplace fighting food waste.
A vendor wants to know what discount percentage to apply to this product to maximize the chance it sells before it expires, without giving away unnecessary margin.

Product details:
- Name: ${product.productName}
- Category: ${product.category}
- Base price: ${product.price} EGP
- Current discount: ${product.discount}%
- Quantity remaining: ${product.quantity}
- Days until expiry: ${daysUntilExpiry}
- Description: ${product.description || "No description provided"}

Guidance:
- More days until expiry and low quantity → lower or no discount needed.
- Few days until expiry and/or high remaining quantity → higher discount needed to move stock fast.
- Discount must be a whole number between 0 and 100 (percentage off the base price).
- Briefly justify the number in one short sentence.

CRITICAL: Respond ONLY with a valid JSON object in this exact shape, no markdown, no backticks, no extra text:
{ "suggestedDiscount": 25, "reasoning": "Expires in 2 days with high stock remaining, so a strong discount will help clear it in time." }
`;

/**
 * Generates a discount suggestion for a single product using the same
 * three-tier cascade pattern as tag generation and recommendations:
 * Gemini → Groq → unavailable (no local fallback — a recommendation
 * without real reasoning would be misleading rather than helpful).
 *
 * @param {string} productId
 * @param {string} vendorId - req.user.id of the calling vendor, used to enforce ownership
 */
export const suggestDiscountForProduct = async (productId, vendorId) => {
    const product = await productsRepo.findProductById(productId);
    if (!product) throw new AppError("Product not found", 404);

    if (product.vendorId.toString() !== vendorId) {
        throw new AppError("You are not allowed to view suggestions for this product", 403);
    }

    const today = new Date();
    const expiry = new Date(product.expiryDate);
    const daysUntilExpiry = Math.max(
        0,
        Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))
    );

    const prompt = buildPrompt(product, daysUntilExpiry);

    // === STRATEGY 1: Gemini Discount Suggestion ===
    try {
        const result = await geminiModel.generateContent(prompt);
        const cleanedResponse = result.response.text().trim();
        const parsedData = parseModelJson(cleanedResponse);
        const suggestion = extractDiscountSuggestion(parsedData);

        if (suggestion) {
            console.log(`⚡ SUCCESS: Discount suggestion for "${product.productName}" generated using GEMINI FLASH`);
            return {
                productId: product._id,
                currentDiscount: product.discount,
                suggestedDiscount: normalizeDiscount(suggestion.suggestedDiscount, product.discount),
                reasoning: suggestion.reasoning || null,
                daysUntilExpiry,
                source: "gemini",
            };
        }
    } catch (error) {
        console.warn(
            `Gemini Discount Suggestion Error for ${product.productName}. Falling back to Groq...`,
            error.message
        );
    }

    // === STRATEGY 2: Groq Fallback Discount Suggestion ===
    try {
        const result = await groqClient.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: GROQ_MODEL,
            response_format: { type: "json_object" },
            temperature: 0.2,
        });
        const cleanedResponse = result.choices[0].message.content.trim();
        const parsedData = parseModelJson(cleanedResponse);
        const suggestion = extractDiscountSuggestion(parsedData);

        if (suggestion) {
            console.log(`🚀 FALLBACK SUCCESS: Discount suggestion for "${product.productName}" generated using GROQ (Llama 8B)`);
            return {
                productId: product._id,
                currentDiscount: product.discount,
                suggestedDiscount: normalizeDiscount(suggestion.suggestedDiscount, product.discount),
                reasoning: suggestion.reasoning || null,
                daysUntilExpiry,
                source: "groq",
            };
        }
    } catch (error) {
        console.error(
            `Groq Discount Suggestion Error for ${product.productName}.`,
            error.message
        );
    }

    // === STRATEGY 3: No local fallback ===
    // Unlike tagging (where a static category-based guess is still useful) or
    // recommendations (where a DB scoring algorithm can substitute), a discount
    // number invented without real reasoning could mislead a vendor's pricing
    // decision. We surface unavailability instead of guessing.
    throw new AppError("AI pricing assistant is currently unavailable. Please try again shortly.", 503);
};
