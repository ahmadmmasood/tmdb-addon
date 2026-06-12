require("dotenv").config();

const { getTmdbClient } = require("../utils/getTmdbClient");
const { getGenreList } = require("./getGenreList");
const { getLanguages } = require("./getLanguages");
const { parseMedia } = require("../utils/parseProps");
const { fetchMDBListItems, parseMDBListItems } = require("../utils/mdbList");
const CATALOG_TYPES = require("../static/catalog-types.json");

/* ---------------- MAIN ---------------- */

async function getCatalog(type, language, page, id, genre, config) {
  const moviedb = getTmdbClient(config);
  const mdblistKey = config.mdblistkey;

  /* ---------------- MDBLIST ---------------- */
  if (id && id.startsWith("mdblist.")) {
    const listId = id.split(".")[1];
    const results = await fetchMDBListItems(listId, mdblistKey, language, page);
    return await parseMDBListItems(results, type, genre, language, config);
  }

  /* ---------------- PARAMS ---------------- */
  const genreList = await getGenreList(language, type, config);
  const parameters = await buildParameters(type, language, page, id, genre, genreList, config);

  const fetchFunction =
    type === "movie"
      ? moviedb.discoverMovie.bind(moviedb)
      : moviedb.discoverTv.bind(moviedb);

  const isStreaming =
    id && id.split(".")[1]
      ? Object.keys(CATALOG_TYPES.streaming || {}).includes(id.split(".")[1])
      : false;

  const isStrictMode =
    config.strictRegionFilter === true || config.strictRegionFilter === "true";

  const isDigitalFilterMode =
    config.digitalReleaseFilter === true || config.digitalReleaseFilter === "true";

  /* ---------------- FETCH PAGE ---------------- */
  async function fetchPage(params) {
    try {
      const res = await fetchFunction(params);

      if (!res || !Array.isArray(res.results)) return [];

      return res.results.map((item) => parseMedia(item));
    } catch (err) {
      console.error("[fetchPage error]", err.message);
      return [];
    }
  }

  try {
    const needsExtraFetch =
      type === "movie" && !isStreaming && (isStrictMode || isDigitalFilterMode);

    const pages = needsExtraFetch ? 2 : 1;
    const startPage = parseInt(page) || 1;

    const pagePromises = [];

    for (let i = 0; i < pages; i++) {
      pagePromises.push(fetchPage({ ...parameters, page: startPage + i }));
    }

    const results = await Promise.all(pagePromises);

    /* ---------------- MERGE ---------------- */
    let metas = [];

    for (const pageItems of results) {
      for (const item of pageItems) {
        if (!item || !item.id) continue;

        if (!metas.find((m) => m.id === item.id)) {
          metas.push(item);
        }
      }
    }

    /* ---------------- SAFE EMPTY ---------------- */
    if (!metas.length) {
      return {
        metas: [
          {
            id: "tmdb:no-content",
            type,
            name: "No Content Found",
            poster: "",
            background: "",
            description: "No results returned from TMDB."
          }
        ]
      };
    }

    return {
      metas: metas.slice(0, 20)
    };
  } catch (error) {
    console.error("[getCatalog] Error:", error);

    return {
      metas: [
        {
          id: "tmdb:error",
          type,
          name: "Catalog Error",
          poster: "",
          background: "",
          description: error.message
        }
      ]
    };
  }
}

/* ---------------- PARAMETERS ---------------- */

async function buildParameters(type, language, page, id, genre, genreList, config) {
  let languages = [];

  try {
    languages = await getLanguages(config);
  } catch {
    languages = [];
  }

  const params = {
    language,
    page,
    "vote_count.gte": 10
  };

  /* ---------------- YEAR ---------------- */
  if (id === "tmdb.year" && genre) {
    if (type === "movie") {
      params.primary_release_year = genre;
    } else {
      params.first_air_date_year = genre;
    }
  }

  /* ---------------- LANGUAGE ---------------- */
  if (id === "tmdb.language" && genre) {
    const lang = languages.find((l) => l.name === genre);
    params.with_original_language =
      lang?.iso_639_1?.split("-")[0] || language.split("-")[0];
  }

  /* ---------------- GENRE ---------------- */
  if (id === "tmdb.top" && genre) {
    const g = genreList.find((x) => x.name === genre);
    if (g) params.with_genres = g.id;
  }

  return params;
}

module.exports = { getCatalog };
