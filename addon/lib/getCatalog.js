require("dotenv").config();
const { getTmdbClient } = require("../utils/getTmdbClient");
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { parseMedia } = require("../utils/parseProps");
const { fetchMDBListItems, parseMDBListItems } = require("../utils/mdbList");
const { isMovieReleasedInRegion, isMovieReleasedDigitally } = require("./releaseFilter");
const { rateLimitedMapFiltered } = require("../utils/rateLimiter");
const CATALOG_TYPES = require("../static/catalog-types.json");

async function getCatalog(type, language, page, id, genre, config) {
  const moviedb = getTmdbClient(config);
  const mdblistKey = config.mdblistkey;

  if (id.startsWith("mdblist.")) {
    const listId = id.split(".")[1];
    const results = await fetchMDBListItems(listId, mdblistKey, language, page);
    const parseResults = await parseMDBListItems(results, type, genre, language, config);
    return parseResults;
  }

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

  const userRegion =
    language && language.split("-")[1] ? language.split("-")[1] : null;

  async function fetchPage(params) {
    try {
      const res = await fetchFunction(params);

      // IMPORTANT CHANGE:
      // No getMeta() calls anymore (this was freezing everything)

      let metas = res.results.map((item) => {
        return parseMedia(item);
      });

      return metas;
    } catch (err) {
      console.error("[fetchPage error]", err.message);
      return [];
    }
  }

  try {
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

    let metas = [];

    for (const pageMetas of pageResults) {
      for (const meta of pageMetas) {
        if (!metas.find((m) => m.id === meta.id)) {
          metas.push(meta);
        }
      }
    }

    if (metas.length === 0) {
      return {
        metas: [
          {
            id: "tmdb:no-content",
            type,
            name: "No Content Available",
            poster: "",
            background: "",
            description: "No content found.",
            genres: []
          }
        ]
      };
    }

    return { metas: metas.slice(0, 20) };
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

/* KEEP YOUR EXISTING FUNCTIONS BELOW (unchanged) */

async function buildParameters(type, language, page, id, genre, genreList, config) {
  const languages = await getLanguages(config);
  const parameters = { language, page, "vote_count.gte": 10 };

  return parameters;
}

module.exports = { getCatalog };
