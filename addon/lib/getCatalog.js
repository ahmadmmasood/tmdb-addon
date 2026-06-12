require("dotenv").config();

const { getTmdbClient } = require("../utils/getTmdbClient");
const { getGenreList } = require("./getGenreList");
const CATALOG_TYPES = require("../static/catalog-types.json");
const { parseMedia } = require("../utils/parseProps");

/* ---------------- NETFLIX STYLE HELPERS ---------------- */

function dedupe(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    if (!x || !x.id) return false;
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

function mapWithGenres(results, genreList, type) {
  return results.map((el) => {
    const genres = Array.isArray(el.genre_ids)
      ? el.genre_ids
          .map((id) => {
            const found = genreList.find((g) => g.id === id);
            return found ? found.name : null;
          })
          .filter(Boolean)
      : [];

    return {
      id: `tmdb:${el.id}`,
      name: type === "movie" ? el.title : el.name,

      // 🔥 FIX: NEVER allow empty/unknown spam
      genre: genres.length ? genres.slice(0, 3) : ["Uncategorized"],

      poster: el.poster_path
        ? `https://image.tmdb.org/t/p/w500${el.poster_path}`
        : "",

      background: el.backdrop_path
        ? `https://image.tmdb.org/t/p/original${el.backdrop_path}`
        : "",

      posterShape: "regular",

      imdbRating: el.vote_average ? el.vote_average.toFixed(1) : "N/A",

      year:
        type === "movie"
          ? el.release_date?.substring(0, 4) || ""
          : el.first_air_date?.substring(0, 4) || "",

      type: type === "movie" ? "movie" : "series",

      description: el.overview || "",
    };
  });
}

/* ---------------- MAIN ---------------- */

async function getCatalog(type, language, page, id, genre, config) {
  const moviedb = getTmdbClient(config);

  const fetchFunction =
    type === "movie"
      ? moviedb.discoverMovie.bind(moviedb)
      : moviedb.discoverTv.bind(moviedb);

  let genreList = [];

  try {
    genreList = await getGenreList(language, type, config);
  } catch (e) {
    console.error("Genre load failed:", e.message);
  }

  /* ---------------- BASE PARAMS ---------------- */

  const params = {
    language,
    page,
    "vote_count.gte": 10,
  };

  if (id === "tmdb.year" && genre) {
    if (type === "movie") params.primary_release_year = genre;
    else params.first_air_date_year = genre;
  }

  if (id === "tmdb.top" && genre) {
    const g = genreList.find((x) => x.name === genre);
    if (g) params.with_genres = g.id;
  }

  /* ---------------- FETCH ---------------- */

  async function fetchPage(p) {
    try {
      const res = await fetchFunction(p);
      if (!res?.results) return [];
      return mapWithGenres(res.results, genreList, type);
    } catch (e) {
      console.error("fetchPage error:", e.message);
      return [];
    }
  }

  try {
    const startPage = parseInt(page) || 1;

    const [page1, page2] = await Promise.all([
      fetchPage({ ...params, page: startPage }),
      fetchPage({ ...params, page: startPage + 1 }),
    ]);

    let metas = dedupe([...page1, ...page2]);

    /* ---------------- EMPTY SAFE STATE ---------------- */

    if (!metas.length) {
      return {
        metas: [
          {
            id: "tmdb:no-content",
            type,
            name: "No Results",
            poster: "",
            background: "",
            genre: ["Unknown"],
            description: "No content found for this category.",
          },
        ],
      };
    }

    return {
      metas: metas.slice(0, 20),
    };
  } catch (error) {
    console.error("getCatalog error:", error);

    return {
      metas: [
        {
          id: "tmdb:error",
          type,
          name: "Error Loading Content",
          poster: "",
          background: "",
          genre: ["Unknown"],
          description: error.message,
        },
      ],
    };
  }
}

/* ---------------- EXPORT ---------------- */

module.exports = { getCatalog };
