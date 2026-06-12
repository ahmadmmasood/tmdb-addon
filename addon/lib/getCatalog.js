require("dotenv").config();

const { getTmdbClient } = require("../utils/getTmdbClient");
const { getGenreList } = require("./getGenreList");
const { parseMedia } = require("../utils/parseProps");
const CATALOG_TYPES = require("../static/catalog-types.json");

async function getCatalog(type, language, page, id, genre, config) {
  const tmdb = getTmdbClient(config);

  const mdblistKey = config.mdblistkey;

  /* ---------------- MDBLIST ---------------- */
  if (id?.startsWith("mdblist.")) {
    const { fetchMDBListItems, parseMDBListItems } = require("../utils/mdbList");
    const listId = id.split(".")[1];

    const results = await fetchMDBListItems(listId, mdblistKey, language, page);
    return await parseMDBListItems(results, type, genre, language, config);
  }

  const genreList = await getGenreList(language, type, config);

  const fetchFn =
    type === "movie"
      ? tmdb.discoverMovie.bind(tmdb)
      : tmdb.discoverTv.bind(tmdb);

  const providerId = id?.split(".")[1];
  const isStreaming = providerId
    ? Object.keys(CATALOG_TYPES.streaming || {}).includes(providerId)
    : false;

  const params = {
    language,
    page,
    "vote_count.gte": 10,
  };

  /* ---------------- FIXED FILTERS ---------------- */

  if (id === "tmdb.year" && genre) {
    if (type === "movie") params.primary_release_year = genre;
    else params.first_air_date_year = genre;
  }

  if (id === "tmdb.language" && genre) {
    const iso =
      language === "es" ? "es" : "en";

    params.with_original_language = iso;
  }

  if (id === "tmdb.top" && genre) {
    const g = genreList.find((x) => x.name === genre);
    if (g) params.with_genres = g.id;
  }

  if (id === "tmdb.latest") {
    params.sort_by = "release_date.desc";
  }

  if (id === "tmdb.trending") {
    // TMDB handles trending differently internally
    params.sort_by = "popularity.desc";
  }

  async function fetchPage(p) {
    try {
      const res = await fetchFn(p);
      if (!res?.results) return [];

      return res.results
        .map(parseMedia)
        .filter((x) => x && x.id);
    } catch (e) {
      console.error("[fetchPage]", e.message);
      return [];
    }
  }

  try {
    const pageResults = await Promise.all([
      fetchPage(params),
    ]);

    const metas = [];

    for (const list of pageResults) {
      for (const item of list) {
        if (!metas.find((m) => m.id === item.id)) {
          metas.push(item);
        }
      }
    }

    if (!metas.length) {
      return {
        metas: [
          {
            id: "tmdb:no-results",
            type,
            name: "No Results",
            description: "No content returned from TMDB",
          },
        ],
      };
    }

    return { metas: metas.slice(0, 20) };
  } catch (e) {
    console.error("[getCatalog]", e);
    return {
      metas: [
        {
          id: "tmdb:error",
          type,
          name: "Error Loading Catalog",
          description: e.message,
        },
      ],
    };
  }
}

module.exports = { getCatalog };
