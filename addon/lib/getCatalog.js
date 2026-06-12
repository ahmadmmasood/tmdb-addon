require("dotenv").config();
const { getTmdbClient } = require("../utils/getTmdbClient");
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { parseMedia } = require("../utils/parseProps");
const { fetchMDBListItems, parseMDBListItems } = require("../utils/mdbList");
const CATALOG_TYPES = require("../static/catalog-types.json");

async function getCatalog(type, language, page, id, genre, config) {
  const moviedb = getTmdbClient(config);
  const mdblistKey = config.mdblistkey;

  /* ---------------- MDBLIST ---------------- */
  if (id.startsWith("mdblist.")) {
    const listId = id.split(".")[1];
    const results = await fetchMDBListItems(listId, mdblistKey, language, page);
    const parsed = await parseMDBListItems(results, type, genre, language, config);
    return parsed;
  }

  /* ---------------- BASE PARAMS ---------------- */
  const genreList = await getGenreList(language, type, config);
  const parameters = await buildParameters(type, language, page, id, genre, genreList, config);

  const fetchFunction =
    type === "movie"
      ? moviedb.discoverMovie.bind(moviedb)
      : moviedb.discoverTv.bind(moviedb);

  const providerId = id.split(".")[1];
  const isStreaming = Object.keys(CATALOG_TYPES.streaming).includes(providerId);

  const isStrictMode =
    config.strictRegionFilter === "true" || config.strictRegionFilter === true;

  const isDigitalFilterMode =
    config.digitalReleaseFilter === "true" || config.digitalReleaseFilter === true;

  /* ---------------- SAFE FETCH ---------------- */
  async function fetchPage(params) {
    try {
      const res = await fetchFunction(params);

      if (!res || !Array.isArray(res.results)) return [];

      // IMPORTANT: lightweight mapping only
      return res.results.map((item) => parseMedia(item));
    } catch (err) {
      console.error("[fetchPage error]", err.message);
      return [];
    }
  }

  try {
    /* ---------------- PAGINATION ---------------- */
    const needsExtraFetch =
      type === "movie" && !isStreaming && (isStrictMode || isDigitalFilterMode);

    const PAGES_TO_FETCH = needsExtraFetch ? 2 : 1;
    const startPage = parseInt(page) || 1;

    const pagePromises = [];

    for (let i = 0; i < PAGES_TO_FETCH; i++) {
      const pageParams = { ...parameters, page: startPage + i };
      pagePromises.push(fetchPage(pageParams));
    }

    const pageResults = await Promise.all(pagePromises);

    /* ---------------- MERGE RESULTS ---------------- */
    let metas = [];

    for (const pageMetas of pageResults) {
      for (const meta of pageMetas) {
        if (!metas.find((m) => m.id === meta.id)) {
          metas.push(meta);
        }
      }
    }

    /* ---------------- EMPTY STATE ---------------- */
    if (metas.length === 0) {
      return {
        metas: [
          {
            id: "tmdb:no-content",
            type,
            name: "No Content Available",
            poster: "",
            background: "",
            description: "No content found for this selection.",
            genres: []
          }
        ]
      };
    }

    /* ---------------- RETURN ---------------- */
    return {
      metas: metas.slice(0, 20)
    };
  } catch (error) {
    console.error("[getCatalog] Error:", error);

    return {
      metas: [
        {
          id: "tmdb:no-content",
          type,
          name: "Error Loading Content",
          poster: "",
          background: "",
          description: "Error loading catalog.",
          genres: []
        }
      ]
    };
  }
}

/* ---------------- PARAMETERS ---------------- */
async function buildParameters(type, language, page, id, genre, genreList, config) {
  const languages = await getLanguages(config);

  const parameters = {
    language,
    page,
    "vote_count.gte": 10
  };

  const providerId = id.split(".")[1];
  const isStreaming = Object.keys(CATALOG_TYPES.streaming).includes(providerId);

  if (id === "tmdb.year" && genre) {
    const year = genre;
    if (type === "movie") {
      parameters.primary_release_year = year;
    } else {
      parameters.first_air_date_year = year;
    }
  }

  if (id === "tmdb.language") {
    const lang = languages.find((l) => l.name === genre);
    parameters.with_original_language = lang
      ? lang.iso_639_1.split("-")[0]
      : language.split("-")[0];
  }

  if (id === "tmdb.top" && genre) {
    const genreData = genreList.find((g) => g.name === genre);
    if (genreData) parameters.with_genres = genreData.id;
  }

  return parameters;
}

module.exports = { getCatalog };
