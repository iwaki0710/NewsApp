const MAX_ARRAY_ITEMS = 5;

/** @param {unknown} value @param {number} maxLength */
function cleanText(value, maxLength) {
  if (typeof value !== "string") return "";
  return value.replace(/\u0000/g, "").trim().slice(0, maxLength);
}

/** @param {unknown} value */
function safeHttpUrl(value) {
  const text = cleanText(value, 2_048);
  if (!text) return null;
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

/** @param {unknown} value */
function cleanStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => cleanText(item, 80))
    .filter((item, index, all) => item && all.indexOf(item) === index)
    .slice(0, MAX_ARRAY_ITEMS);
}

/**
 * Validate and bound every client-provided field before it reaches D1.
 * @param {unknown} input
 * @returns {{
 *   id: string;
 *   title: string;
 *   description: string;
 *   url: string;
 *   imageUrl: string | null;
 *   source: string;
 *   sourceUrl: string | null;
 *   publishedAt: string | null;
 *   country: string[];
 *   category: string[];
 *   language: string | null;
 * } | null}
 */
export function sanitizeBookmarkArticle(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const article = /** @type {Record<string, unknown>} */ (input);
  const id = cleanText(article.id, 240);
  const title = cleanText(article.title, 500);
  const url = safeHttpUrl(article.url);
  const source = cleanText(article.source, 200);

  if (!id || !title || !url || !source) return null;

  return {
    id,
    title,
    description: cleanText(article.description, 5_000),
    url,
    imageUrl: safeHttpUrl(article.imageUrl),
    source,
    sourceUrl: safeHttpUrl(article.sourceUrl),
    publishedAt: cleanText(article.publishedAt, 80) || null,
    country: cleanStringArray(article.country),
    category: cleanStringArray(article.category),
    language: cleanText(article.language, 20) || null,
  };
}
