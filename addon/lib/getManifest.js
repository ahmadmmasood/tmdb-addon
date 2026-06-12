require("dotenv").config();
const { getGenreList } = require("./getGenreList");
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

/* ---------------- ONLY ENGLISH + SPANISH ---------------- */
function getLanguages() {
  return ["English", "Spanish"];
}

/* ---------------- TRANSLATIONS ---------------- */
function loadTranslations(language) {
  return {
    ...(catalogsTranslations[DEFAULT_LANGUAGE] || {}),
    ...(catalogsTranslations[language] || {}),
  };
}

/* ---------------- CATALOG FACTORY ---------------- */
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
        isRequired: false,
      },
      {
        name: "skip",
      },
    ],
  };
}

/* ---------------- DEFAULT CATALOGS ---------------- */
function getDefaultCatalogs() {
  const types = ["movie", "series"];
  const base = Object.keys(CATALOG_TYPES.default || {});

  return base.flatMap((id) =>
    types.map((type) => ({
      id: `tmdb.${id}`,
      type,
      showInHome: true,
    }))
  );
}

/* ---------------- MAIN MANIFEST ---------------- */
async function getManifest(config = {}) {
  const language = config.language || DEFAULT_LANGUAGE;

  const userCatalogs =
    Array.isArray(config.catalogs) && config.catalogs.length
      ? config.catalogs
      : getDefaultCatalogs();

  loadTranslations(language);

  const years = generateArrayOfYears(20);

  /* ---------------- GENRES ---------------- */
  let genres_movie = [];
  let genres_series = [];

  try {
    const movieGenres = await getGenreList(language, "movie", config);
    const seriesGenres = await getGenreList(language, "series", config);

    genres_movie = Array.isArray(movieGenres)
      ? movieGenres.map((g) => g.name)
      : [];

    genres_series = Array.isArray(seriesGenres)
      ? seriesGenres.map((g) => g.name)
      : [];
  } catch (e) {
    console.error("Genre fetch failed:", e.message);
  }

  /* ---------------- FILTER CATALOGS CLEAN ---------------- */
  const catalogs = userCatalogs
    .filter((c) => c && c.id && c.type)
    .map((c) => {
      const baseOptions =
        c.type === "movie" ? genres_movie : genres_series;

      if (c.id.includes("year")) {
        return createCatalog(c.id, c.type, "Year", years);
      }

      if (c.id.includes("language")) {
        return createCatalog(c.id, c.type, "Language", getLanguages());
      }

      if (c.id.includes("trending")) {
        return createCatalog(c.id, c.type, "Trending", ["Day", "Week"]);
      }

      if (c.id.includes("latest")) {
        return createCatalog(c.id, c.type, "Latest Releases", baseOptions);
      }

      return createCatalog(c.id, c.type, "Popular", baseOptions);
    });

  const host = process.env.HOST_NAME || "https://tmdb-addon-n0uj.onrender.com";

  return {
    id: packageJson.name,
    version: packageJson.version,

    name: "The Movie Database Addon",
    description: "TMDB addon with clean English/Spanish + working genres",

    favicon: `${host}/favicon.png`,
    logo: `${host}/logo.png`,
    background: `${host}/background.png`,

    resources: ["catalog", "meta"],
    types: ["movie", "series"],
    idPrefixes: ["tmdb:"],

    behaviorHints: {
      configurable: true,
      configurationRequired: false,
    },

    catalogs,
  };
}

module.exports = {
  getManifest,
  DEFAULT_LANGUAGE,
};
