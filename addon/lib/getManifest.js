require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const catalogsTranslations = require("../static/translations.json");
const packageJson = require("../../package.json");
const CATALOG_TYPES = require("../static/catalog-types.json");

const DEFAULT_LANGUAGE = "en-US";

/* ---------------- DEFAULT CATALOGS ---------------- */
function getDefaultCatalogs() {
  return [
    { id: "tmdb.top", type: "movie", showInHome: true },
    { id: "tmdb.top", type: "series", showInHome: true },
    { id: "tmdb.trending", type: "movie", showInHome: true },
    { id: "tmdb.trending", type: "series", showInHome: true },
    { id: "tmdb.year", type: "movie", showInHome: true },
    { id: "tmdb.year", type: "series", showInHome: true },
    { id: "tmdb.latest", type: "movie", showInHome: true },
    { id: "tmdb.latest", type: "series", showInHome: true }
  ];
}

/* ---------------- HELPERS ---------------- */

function loadTranslations(language) {
  const base = catalogsTranslations[DEFAULT_LANGUAGE] || {};
  const selected = catalogsTranslations[language] || {};
  return { ...base, ...selected };
}

function generateArrayOfYears(maxYears) {
  const max = new Date().getFullYear();
  const min = max - maxYears;
  return Array.from({ length: max - min + 1 }, (_, i) =>
    (max - i).toString()
  );
}

function setOrderLanguage(language, languagesArray) {
  const langObj = languagesArray.find((l) => l.iso_639_1 === language);
  if (!langObj) return languagesArray.map((l) => l.name);

  const copy = [...languagesArray];
  const index = copy.indexOf(langObj);

  if (index > -1) {
    copy.splice(index, 1);
    copy.sort((a, b) => (a.name > b.name ? 1 : -1));
    copy.unshift(langObj);
  }

  return copy.map((l) => l.name);
}

function getCatalogDefinition(catalogId) {
  const [, type] = catalogId.split(".");
  for (const cat of Object.values(CATALOG_TYPES)) {
    if (cat[type]) return cat[type];
  }
  return null;
}

function createCatalog(id, type, def, options, tmdbPrefix, t, showInHome) {
  const extra = [];

  if (def?.extraSupported?.includes("genre")) {
    extra.push({
      name: "genre",
      options,
      isRequired: !showInHome
    });
  }

  if (def?.extraSupported?.includes("search")) extra.push({ name: "search" });
  if (def?.extraSupported?.includes("skip")) extra.push({ name: "skip" });

  return {
    id,
    type,
    name: `${tmdbPrefix ? "TMDB - " : ""}${t[def.nameKey] || def.nameKey}`,
    pageSize: 20,
    extra
  };
}

function getOptions(def, type, showInHome, opts) {
  if (!def) return [];

  const movie = showInHome ? opts.genres_movie : ["Top", ...opts.genres_movie];
  const series = showInHome ? opts.genres_series : ["Top", ...opts.genres_series];

  switch (def.nameKey) {
    case "year":
      return opts.years;
    case "language":
      return opts.filterLanguages;
    default:
      return type === "movie" ? movie : series;
  }
}

/* ---------------- MAIN ---------------- */

async function getManifest(config = {}) {
  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";

  const translated = loadTranslations(language);

  // ✅ SAFE HOST
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

  const languagesArray = await getLanguages(config).catch(() => []);
  const filterLanguages = setOrderLanguage(language, languagesArray);

  const options = { years, genres_movie, genres_series, filterLanguages };

  // 🔥 FIX: NEVER allow empty catalogs
  const userCatalogs =
    config.catalogs && config.catalogs.length
      ? config.catalogs
      : getDefaultCatalogs();

  let catalogs = userCatalogs
    .map((c) => {
      const def = getCatalogDefinition(c.id);
      if (!def) return null;

      const opts = getOptions(def, c.type, c.showInHome, options);

      return createCatalog(
        c.id,
        c.type,
        def,
        opts,
        tmdbPrefix,
        translated,
        c.showInHome
      );
    })
    .filter(Boolean);

  return {
    id: "tmdb-addon",
    version: packageJson.version,

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
