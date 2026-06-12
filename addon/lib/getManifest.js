require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const packageJson = require("../../package.json");
const catalogsTranslations = require("../static/translations.json");
const CATALOG_TYPES = require("../static/catalog-types.json");

const DEFAULT_LANGUAGE = "en-US";

/* ---------------- YEARS ---------------- */
function generateArrayOfYears(maxYears) {
  const max = new Date().getFullYear();
  const min = max - maxYears;
  const years = [];
  for (let i = max; i >= min; i--) years.push(String(i));
  return years;
}

/* ---------------- SAFE LANGUAGE SORT ---------------- */
function setOrderLanguage(language, languagesArray) {
  if (!Array.isArray(languagesArray)) return [];

  const uniqueMap = new Map();

  for (const lang of languagesArray) {
    if (lang?.name) uniqueMap.set(lang.name, lang);
  }

  const list = [...uniqueMap.values()];
  list.sort((a, b) => a.name.localeCompare(b.name));

  const preferred = list.find(l => l.iso_639_1 === language);

  if (!preferred) return list.map(l => l.name);

  return [
    preferred.name,
    ...list.filter(l => l.name !== preferred.name).map(l => l.name)
  ];
}

/* ---------------- TRANSLATIONS ---------------- */
function loadTranslations(language) {
  return {
    ...(catalogsTranslations[DEFAULT_LANGUAGE] || {}),
    ...(catalogsTranslations[language] || {})
  };
}

/* ---------------- SAFE CATALOG BUILDER ---------------- */
function createCatalog(id, type, name, options = []) {
  return {
    id,
    type,
    name,
    pageSize: 20,
    extra: [
      {
        name: "genre",
        options: Array.isArray(options) ? [...new Set(options)] : [],
        isRequired: false
      },
      { name: "skip" }
    ]
  };
}

/* ---------------- DEFAULT CATALOGS ---------------- */
function getDefaultCatalogs() {
  const types = ["movie", "series"];
  const base = Object.keys(CATALOG_TYPES.default || {});

  return base.flatMap(id =>
    types.map(type => ({
      id: `tmdb.${id}`,
      type,
      showInHome: true
    }))
  );
}

/* ---------------- MAIN ---------------- */
async function getManifest(config = {}) {
  const language = config.language || DEFAULT_LANGUAGE;

  const sessionId = config.sessionId;

  const userCatalogs =
    Array.isArray(config.catalogs) && config.catalogs.length
      ? config.catalogs
      : getDefaultCatalogs();

  const translatedCatalogs = loadTranslations(language);

  const years = generateArrayOfYears(20);

  /* ---------------- SAFE GENRES ---------------- */
  let genres_movie = [];
  let genres_series = [];

  try {
    const movieGenres = await getGenreList(language, "movie", config);
    const seriesGenres = await getGenreList(language, "series", config);

    genres_movie = Array.isArray(movieGenres)
      ? [...new Set(movieGenres.map(g => g.name))]
      : [];

    genres_series = Array.isArray(seriesGenres)
      ? [...new Set(seriesGenres.map(g => g.name))]
      : [];
  } catch (e) {
    console.error("Genre fetch failed:", e.message);
  }

  /* ---------------- SAFE LANGUAGES ---------------- */
  let filterLanguages = [];

  try {
    const languagesArray = await getLanguages(config);
    filterLanguages = setOrderLanguage(language, languagesArray);
  } catch (e) {
    console.error("Language fetch failed:", e.message);
  }

  /* ---------------- BUILD CATALOGS ---------------- */
  const catalogs = userCatalogs
    .filter(c => c && c.id && c.type)
    .map(c => {
      if (c.id.includes("year")) {
        return createCatalog(c.id, c.type, "Year", years);
      }

      if (c.id.includes("language")) {
        return createCatalog(c.id, c.type, "Language", filterLanguages);
      }

      if (c.id.includes("trending")) {
        return createCatalog(c.id, c.type, "Trending", ["Day", "Week"]);
      }

      if (c.id.includes("latest")) {
        return createCatalog(c.id, c.type, "Latest Releases", genres_movie);
      }

      return createCatalog(c.id, c.type, "Popular", genres_movie);
    });

  /* ---------------- SAFE FALLBACK ---------------- */
  const safeCatalogs =
    Array.isArray(catalogs) && catalogs.length
      ? catalogs
      : [
          {
            id: "tmdb.top",
            type: "movie",
            name: "Popular",
            pageSize: 20,
            extra: []
          }
        ];

  /* ---------------- MANIFEST ---------------- */
  return {
    id: packageJson.name,
    version: packageJson.version,

    name: "The Movie Database Addon",
    description:
      "TMDB addon providing catalogs and metadata for movies and TV shows.",

    favicon: `${process.env.HOST_NAME}/favicon.png`,
    logo: `${process.env.HOST_NAME}/logo.png`,
    background: `${process.env.HOST_NAME}/background.png`,

    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    idPrefixes: ["tmdb:"],

    behaviorHints: {
      configurable: true,
      configurationRequired: false
    },

    catalogs: safeCatalogs
  };
}

module.exports = { getManifest, DEFAULT_LANGUAGE };
