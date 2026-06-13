require("dotenv").config();

const { getGenreList } = require("./getGenreList");
const packageJson = require("../../package.json");

const DEFAULT_LANGUAGE = "en-US";

/* ---------------- FIXED LANGS ---------------- */
function getLanguages() {
  return ["English", "Spanish"];
}

/* ---------------- YEARS ---------------- */
function generateArrayOfYears(maxYears) {
  const now = new Date().getFullYear();
  return Array.from({ length: maxYears }, (_, i) =>
    String(now - i)
  );
}

/* ---------------- CATALOG ---------------- */
function createCatalog(id, type, name, options = []) {
  return {
    id,
    type,
    name,
    pageSize: 20,
    extra: [
      {
        name: "genre",
        options: options || [],
        isRequired: false,
      },
      {
        name: "skip",
      },
    ],
  };
}

/* ---------------- CLEAN DEFAULT CATEGORIES ---------------- */

function getDefaultCatalogs() {
  return [
    { id: "tmdb.top", type: "movie" },
    { id: "tmdb.top", type: "series" },

    // KEEP trending BUT NO Day/Week exposed
    { id: "tmdb.trending", type: "movie" },
    { id: "tmdb.trending", type: "series" },

    { id: "tmdb.latest", type: "movie" },
    { id: "tmdb.latest", type: "series" },
  ];
}

/* ---------------- SAFE GENRE GROUPING ---------------- */

function buildSafeGenres(genres) {
  if (!Array.isArray(genres)) return [];

  const list = genres.filter(Boolean);

  const hasAction = list.includes("Action");
  const hasAdventure = list.includes("Adventure");

  return [
    ...list,

    // virtual combined category (UI ONLY)
    ...(hasAction && hasAdventure ? ["Action & Adventure"] : []),
  ];
}

/* ---------------- MANIFEST ---------------- */

async function getManifest(config = {}) {
  const language = config.language || DEFAULT_LANGUAGE;

  const catalogs = config.catalogs?.length
    ? config.catalogs
    : getDefaultCatalogs();

  let movieGenres = [];
  let seriesGenres = [];

  try {
    const m = await getGenreList(language, "movie", config);
    const s = await getGenreList(language, "series", config);

    movieGenres = m?.map((g) => g.name) || [];
    seriesGenres = s?.map((g) => g.name) || [];
  } catch (e) {
    console.error("Genre error:", e.message);
  }

  const years = generateArrayOfYears(20);

  const final = catalogs.map((c) => {
    const base =
      c.type === "movie" ? movieGenres : seriesGenres;

    /* ---------------- YEAR ---------------- */
    if (c.id.includes("year")) {
      return createCatalog(c.id, c.type, "Year", years);
    }

    /* ---------------- LANGUAGE ---------------- */
    if (c.id.includes("language")) {
      return createCatalog(c.id, c.type, "Language", getLanguages());
    }

    /* ---------------- TRENDING (FIXED - NO DAY/WEEK UI) ---------------- */
    if (c.id.includes("trending")) {
      return {
        id: c.id,
        type: c.type,
        name: "Trending",
        pageSize: 20,
        extra: [
          {
            name: "range",
            options: ["all"], // 🔥 NO Day / Week exposed anymore
            isRequired: false,
          },
        ],
      };
    }

    /* ---------------- LATEST ---------------- */
    if (c.id.includes("latest")) {
      return createCatalog(
        c.id,
        c.type,
        "Latest",
        buildSafeGenres(base)
      );
    }

    /* ---------------- TOP / POPULAR ---------------- */
    return createCatalog(
      c.id,
      c.type,
      "Popular",
      buildSafeGenres(base)
    );
  });

  return {
    id: packageJson.name,
    version: packageJson.version,
    name: "TMDB Addon",
    description: "Clean working TMDB addon",

    resources: ["catalog", "meta", "stream"],
    types: ["movie", "series"],
    idPrefixes: ["tmdb:"],

    catalogs: final,
  };
}

module.exports = {
  getManifest,
  DEFAULT_LANGUAGE,
};
