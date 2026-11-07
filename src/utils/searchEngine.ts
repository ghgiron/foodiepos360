/**
 * Universal flexible search engine for Foodie POS.
 * Tolerant to accents/diacritics, punctuation, word order, and case.
 */

/**
 * Normalizes text for search indexing and querying:
 * 1. Converts to lowercase.
 * 2. Decomposes Unicode diacritics (accents/tildes) and strips them (NFD).
 * 3. Replaces punctuation and orthographic symbols with spaces.
 * 4. Collapses multiple whitespace characters and trims.
 */
export function normalizeSearchText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[¿?¡!.,;:_\-–—()[\]{}"'#/\\+*~^`%$@&<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Performs flexible multi-token matching:
 * - If queryString is empty or whitespace-only, returns true.
 * - Splits queryString into individual words/tokens.
 * - Unifies all target texts into a single normalized search string.
 * - Returns true only if EVERY query token is contained in the unified target,
 *   regardless of token order (e.g., 'picara hamburguesa' or 'pi' matches 'Hamburguesa Pícara').
 */
export function flexibleMultiMatch(
  targetTexts: (string | undefined | null)[],
  queryString: string | undefined | null
): boolean {
  if (!queryString) return true;
  const cleanQuery = normalizeSearchText(queryString);
  if (!cleanQuery) return true;

  const queryTokens = cleanQuery.split(' ').filter(Boolean);
  if (queryTokens.length === 0) return true;

  const validTargets = targetTexts.filter((t): t is string => typeof t === 'string' && t.length > 0);
  if (validTargets.length === 0) return false;

  const unifiedTarget = normalizeSearchText(validTargets.join(' '));

  return queryTokens.every(token => unifiedTarget.includes(token));
}

/**
 * Generic helper to filter an array of items using flexibleMultiMatch.
 */
export function filterByFlexibleSearch<T>(
  items: T[],
  getSearchableFields: (item: T) => (string | undefined | null)[],
  queryString: string | undefined | null
): T[] {
  if (!queryString || !queryString.trim()) return items;
  return items.filter(item => flexibleMultiMatch(getSearchableFields(item), queryString));
}
