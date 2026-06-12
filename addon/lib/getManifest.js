require("dotenv").config();
const packageJson = require("../../package.json");
const catalogsTranslations = require("../static/translations.json");
const CATALOG_TYPES = require("../static/catalog-types.json");

const DEFAULT_LANGUAGE = "en-US";

/* ---------------- HELPERS ---------------- */

function loadTranslations(language) {
  const defaultTranslations = catalogsTranslations[DEFAULT_LANGUAGE] || {};
  const selectedTranslations = catalogsTranslations[language] || {};
  return { ...defaultTranslations, ...selectedTranslations };
}

function getDefaultCatalogs() {
  const defaultTypes = ["movie", "series"];
  const catalogKeys = Object.keys(CATALOG_TYPES?.default || {});

  // HARD FALLBACK if config/static is broken
  if (!catalogKeys.length) {
    return [
      { id: "tmdb.top", type: "movie", showInHome: true },
      { id: "tmdb.top", type: "series", showInHome: true },
      { id: "tmdb.trending", type: "movie", showInHome: true },
      { id: "tmdb.trending", type: "series", showInHome: true }
    ];
  }

  return catalogKeys.flatMap(id =>
    defaultTypes.map(type => ({
      id: `tmdb.${id}`,
      type,
      showInHome: true
    }))
  );
}

/* ---------------- MAIN MANIFEST ---------------- */

async function getManifest(config = {}) {
  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";

  const translatedCatalogs = loadTranslations(language);

  // FORCE VALID CATALOGS (this fixes your UHF save error)
  const catalogs =
    Array.isArray(config.catalogs) && config.catalogs.length > 0
      ? config.catalogs
      : getDefaultCatalogs();

  const activeConfigs = [
    `Language: ${language}`,
    `TMDB Account: ${config.sessionId ? "Connected" : "Not Connected"}`,
    `Trakt Integration: ${config.traktAccessToken ? "Connected" : "Not Connected"}`,
    `MDBList Integration: ${config.mdblistkey ? "Connected" : "Not Connected"}`,
    `Search: ${config.searchEnabled !== "false" ? "Enabled" : "Disabled"}`,
    `Active Catalogs: ${catalogs.length}`
  ].join(" | ");

  const host = process.env.HOST_NAME || "https://tmdb-addon-n0uj.onrender.com";

  return {
    id: packageJson.name || "tmdb-addon",
    version: packageJson.version || "3.1.7",

    favicon: `${host}/favicon.png`,
    logo: `${host}/logo.png`,
    background: `${host}/background.png`,

    name: "The Movie Database Addon",

    description:
      "TMDB addon providing catalogs and metadata for movies and TV shows. " +
      "Current settings: " +
      activeConfigs,

    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    idPrefixes: ["tmdb:"],

    behaviorHints: {
      configurable: true,
      configurationRequired: false
    },

    catalogs
  };
}

module.exports = { getManifest, DEFAULT_LANGUAGE };
