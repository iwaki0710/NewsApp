const supportedCountryCodes = new Set([
  "ae", "ar", "au", "br", "ca", "cn", "de", "eg", "es", "fr", "gb", "id", "in",
  "it", "jp", "ke", "kr", "mx", "ng", "nz", "sa", "se", "sg", "us", "za",
]);

const countryCodeAliases = {
  "united arab emirates": "ae",
  uae: "ae",
  argentina: "ar",
  australia: "au",
  brazil: "br",
  canada: "ca",
  china: "cn",
  germany: "de",
  egypt: "eg",
  spain: "es",
  france: "fr",
  "united kingdom": "gb",
  uk: "gb",
  indonesia: "id",
  india: "in",
  italy: "it",
  japan: "jp",
  kenya: "ke",
  "south korea": "kr",
  korea: "kr",
  mexico: "mx",
  nigeria: "ng",
  "new zealand": "nz",
  "saudi arabia": "sa",
  sweden: "se",
  singapore: "sg",
  "united states": "us",
  "united states of america": "us",
  usa: "us",
  "south africa": "za",
};

/** @param {unknown} value */
function safeCountryText(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/**
 * Convert NewsData.io country names into the country codes supported by the UI.
 * Unknown values are discarded so they cannot weaken the strict filter.
 * @param {unknown} values
 * @returns {string[]}
 */
export function normalizeArticleCountries(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map(safeCountryText)
    .map((value) => countryCodeAliases[value] || value)
    .filter((value, index, all) => supportedCountryCodes.has(value) && all.indexOf(value) === index);
}

/**
 * Select the canonical country for an article.
 *
 * Single-country mode is deliberately strict: an article must have exactly one
 * supported publisher country and it must be the selected country. Articles
 * with missing or multi-country metadata are rejected because the upstream
 * `country` field describes the publisher, not the event location.
 *
 * Mix mode retains the broader matching behavior required by that feature.
 * @param {unknown} rawCountries
 * @param {string[]} pickedCountries
 * @param {"single" | "mix"} mode
 * @returns {string | null}
 */
export function articleCountryForMode(rawCountries, pickedCountries, mode) {
  const normalizedCountries = normalizeArticleCountries(rawCountries);

  if (mode === "single") {
    const pickedCountry = pickedCountries[0];
    return normalizedCountries.length === 1 && normalizedCountries[0] === pickedCountry
      ? pickedCountry
      : null;
  }

  return pickedCountries.find((country) => normalizedCountries.includes(country)) || null;
}
