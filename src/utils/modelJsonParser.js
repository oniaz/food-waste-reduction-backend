export const parseModelJson = (text) => {
  const trimmedText = text.trim();

  const unfencedText = trimmedText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(unfencedText);
  } catch {
    const objectStart = unfencedText.indexOf("{");
    const objectEnd = unfencedText.lastIndexOf("}");
    if (objectStart !== -1 && objectEnd > objectStart) {
      return JSON.parse(unfencedText.slice(objectStart, objectEnd + 1));
    }

    const arrayStart = unfencedText.indexOf("[");
    const arrayEnd = unfencedText.lastIndexOf("]");
    if (arrayStart !== -1 && arrayEnd > arrayStart) {
      return JSON.parse(unfencedText.slice(arrayStart, arrayEnd + 1));
    }

    throw new SyntaxError("Model response did not contain valid JSON");
  }
};

export const normalizeRecommendationPayload = (payload) => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { suggestedCategories: [], suggestedTags: [] };
  }

  return {
    suggestedCategories: Array.isArray(payload.suggestedCategories) ? payload.suggestedCategories : [],
    suggestedTags: Array.isArray(payload.suggestedTags) ? payload.suggestedTags : [],
  };
};