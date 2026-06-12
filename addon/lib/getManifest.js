require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { getGenresFromMDBList } = require("../utils/mdbList");
const packageJson = require("../../package.json");
const catalogsTranslations = require("../static/translations.json");
const CATALOG_TYPES = require("../static/catalog-types.json");

const DEFAULT_LANGUAGE = "en-US";

/* ---------------- HELPERS ---------------- */

function generateArrayOfYears(maxYears) {
  const max = new Date().getFullYear();
  const min = max - maxYears;
  const years = [];
  for (let i = max; i >= min; i--) years.push(i.toString());
  return years;
}

function setOrderLanguage(language, languagesArray) {
  const languageObj = languagesArray.find((l) => l.iso_639_1 === language);
  const fromIndex = languagesArray.indexOf(languageObj);
  if (fromIndex > -1) {
    const element = languagesArray.splice(fromIndex, 1)[0];
    languagesArray = languagesArray.sort((a, b) => (a.name > b.name ? 1 : -1));
    languagesArray.splice(0, 0, element);
  }
  return [...new Set(languagesArray.map((el) => el.name))];
}

function loadTranslations(language) {
  const defaultTranslations = catalogsTranslations[DEFAULT_LANGUAGE] || {};
  const selectedTranslations = catalogsTranslations[language] || {};
  return { ...defaultTranslations, ...selectedTranslations };
}

/* ---------------- CATALOG HELPERS ---------------- */

function createCatalog(
  id,
  type,
  catalogDef,
  options,
  tmdbPrefix,
  translatedCatalogs,
  showInHome = false
) {
  const extra = [];

  if (catalogDef.extraSupported?.includes("genre")) {
    extra.push({
      name: "genre",
      options,
      isRequired: showInHome ? false : true
    });
  }

  if (catalogDef.extraSupported?.includes("search")) {
    extra.push({ name: "search" });
  }

  if (catalogDef.extraSupported?.includes("skip")) {
    extra.push({ name: "skip" });
  }

  return {
    id,
    type,
    name: `${tmdbPrefix ? "TMDB - " : ""}${translatedCatalogs[catalogDef.nameKey] || catalogDef.nameKey}`,
    pageSize: 20,
    extra
  };
}

function getCatalogDefinition(catalogId) {
  const [_, type] = catalogId.split(".");
  for (const category of Object.keys(CATALOG_TYPES)) {
    if (CATALOG_TYPES[category][type]) return CATALOG_TYPES[category][type];
  }
  return null;
}

function getOptionsForCatalog(catalogDef, type, showInHome, options) {
  if (!catalogDef) return [];

  const movieGenres = showInHome ? [...options.genres_movie] : ["Top", ...options.genres_movie];
  const seriesGenres = showInHome ? [...options.genres_series] : ["Top", ...options.genres_series];

  switch (catalogDef.nameKey) {
    case "year":
      return options.years;
    case "language":
      return options.filterLanguages;
    default:
      return type === "movie" ? movieGenres : seriesGenres;
  }
}

/* ---------------- MAIN MANIFEST ---------------- */

async function getManifest(config) {
  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";

  const sessionId = config.sessionId;
  const userCatalogs = config.catalogs || [];

  const translatedCatalogs = loadTranslations(language);

  // ✅ FIX: ALWAYS SAFE HOST
  const host =
    process.env.HOST_NAME?.replace(/\/$/, "") ||
    "https://tmdb-addon-n0uj.onrender.com";

  const years = generateArrayOfYears(20);

  const genres_movie = await getGenreList(language, "movie", config)
    .then((g) => (Array.isArray(g) ? g.map((x) => x.name).sort() : []))
    .catch(() => []);

  const genres_series = await getGenreList(language, "series", config)
    .then((g) => (Array.isArray(g) ? g.map((x) => x.name).sort() : []))
    .catch(() => []);

  const languagesArray = await getLanguages(config);
  const filterLanguages = setOrderLanguage(language, languagesArray);

  const options = { years, genres_movie, genres_series, filterLanguages };

  let catalogs = await Promise.all(
    userCatalogs.map((userCatalog) => {
      const catalogDef = getCatalogDefinition(userCatalog.id);
      if (!catalogDef) return null;

      const catalogOptions = getOptionsForCatalog(
        catalogDef,
        userCatalog.type,
        userCatalog.showInHome,
        options
      );

      return createCatalog(
        userCatalog.id,
        userCatalog.type,
        catalogDef,
        catalogOptions,
        tmdbPrefix,
        translatedCatalogs,
        userCatalog.showInHome
      );
    })
  );

  catalogs = catalogs.filter(Boolean);

  return {
    // ✅ FIX: stable ID (IMPORTANT for UHF / Stremio)
    id: "tmdb-addon",

    version: packageJson.version,

    // ✅ FIX: NEVER undefined
    favicon: `${host}/favicon.png`,
    logo: `${host}/logo.png`,
    background: `${host}/background.png`,

    name: "The Movie Database Addon",

    description:
      "TMDB addon providing catalogs and metadata for movies and TV shows.",

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
