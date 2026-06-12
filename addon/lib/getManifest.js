require("dotenv").config();
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { getGenresFromMDBList } = require("../utils/mdbList");
const packageJson = require("../../package.json");
const catalogsTranslations = require("../static/translations.json");
const CATALOG_TYPES = require("../static/catalog-types.json");

const DEFAULT_LANGUAGE = "en-US";

function generateArrayOfYears(maxYears) {
  const max = new Date().getFullYear();
  const min = max - maxYears;
  const years = [];
  for (let i = max; i >= min; i--) years.push(i.toString());
  return years;
}

function setOrderLanguage(language, languagesArray) {
  const languageObj = languagesArray.find(l => l.iso_639_1 === language);
  if (!languageObj) return languagesArray.map(l => l.name);

  const filtered = languagesArray.filter(l => l.iso_639_1 !== language);
  filtered.sort((a, b) => (a.name > b.name ? 1 : -1));
  return [languageObj.name, ...filtered.map(l => l.name)];
}

function loadTranslations(language) {
  return {
    ...(catalogsTranslations[DEFAULT_LANGUAGE] || {}),
    ...(catalogsTranslations[language] || {})
  };
}

function createCatalog(id, type, name, options = []) {
  return {
    id,
    type,
    name,
    pageSize: 20,
    extra: [
      { name: "genre", options, isRequired: false },
      { name: "skip" }
    ]
  };
}

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

async function getManifest(config = {}) {
  const language = config.language || DEFAULT_LANGUAGE;
  const tmdbPrefix = config.tmdbPrefix === "true";

  const sessionId = config.sessionId;
  const userCatalogs = Array.isArray(config.catalogs) && config.catalogs.length
    ? config.catalogs
    : getDefaultCatalogs();

  const translatedCatalogs = loadTranslations(language);

  const years = generateArrayOfYears(20);

  let genres_movie = [];
  let genres_series = [];

  try {
    genres_movie = (await getGenreList(language, "movie", config)).map(g => g.name);
    genres_series = (await getGenreList(language, "series", config)).map(g => g.name);
  } catch (e) {
    console.error("Genre fetch failed:", e.message);
  }

  const languagesArray = await getLanguages(config).catch(() => []);
  const filterLanguages = setOrderLanguage(language, languagesArray);

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

  const safeCatalogs = catalogs.length
    ? catalogs
    : [{
        id: "tmdb.top",
        type: "movie",
        name: "Popular",
        pageSize: 20,
        extra: []
      }];

  return {
    id: packageJson.name,
    version: packageJson.version,
    name: "The Movie Database Addon",
    description: "TMDB addon providing catalogs and metadata for movies and TV shows.",

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
