require("dotenv").config();

const { getTmdbClient } = require("../utils/getTmdbClient");
const { getGenreList } = require("./getGenreList");

/* ---------------- HELPERS ---------------- */

function dedupe(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    if (!x || !x.id) return false;
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/* 🔥 FIX: DOUBLE SAFE DECODE */
function cleanGenre(input) {
  if (!input) return null;

  try {
    return decodeURIComponent(decodeURIComponent(input))
      .replace(/\.json$/, "")
      .replace(/\+/g, " ")
      .trim();
  } catch {
    return input
      .replace(/\.json$/, "")
      .replace(/\+/g, " ")
      .trim();
  }
}

function mapResults(results, genreList, type) {
  return results.map((el) => {
    const genres = Array.isArray(el.genre_ids)
      ? el.genre_ids
          .map((id) => genreList.find((g) => g.id === id)?.name)
          .filter(Boolean)
      : [];

    return {
      id: `tmdb:${el.id}`,
      name: type === "movie" ? el.title : el.name,

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

      type,

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

  const params = {
    page,
    include_adult: false,
  };

  const cleanGenreValue = cleanGenre(genre);

  /* ---------------- DEBUG (IMPORTANT) ---------------- */
  console.log("👉 RAW GENRE:", genre);
  console.log("👉 CLEAN GENRE:", cleanGenreValue);

  /* ---------------- YEAR FILTER ---------------- */
  if (id === "tmdb.year" && cleanGenreValue) {
    if (type === "movie") {
      params.primary_release_year = cleanGenreValue;
    } else {
      params.first_air_date_year = cleanGenreValue;
    }
  }

  /* ---------------- GENRE FILTER (FIXED SAFELY) ---------------- */
  if (id === "tmdb.top" && cleanGenreValue) {
    const g = genreList.find((x) => {
      if (!x?.name) return false;
      return x.name.toLowerCase() === cleanGenreValue.toLowerCase();
    });

    if (g?.id) {
      console.log("👉 GENRE MATCHED:", g.name, g.id);
      params.with_genres = g.id;
    } else {
      console.log("⚠️ GENRE NOT FOUND → NO FILTER APPLIED");
      // 🔥 IMPORTANT FIX: do NOT break results
    }
  }

  async function fetchPage(p) {
    try {
      const res = await fetchFunction(p);
      if (!res?.results || !Array.isArray(res.results)) return [];
      return mapResults(res.results, genreList, type);
    } catch (e) {
      console.error("TMDB fetch failed:", e.message);
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

    /* ---------------- SAFE FALLBACK ---------------- */

    if (!metas.length) {
      console.warn("⚠️ EMPTY RESULT SET");

      return {
        metas: [
          {
            id: "tmdb:no-content",
            name: "No Results Found",
            type,
            genre: ["Uncategorized"],
            poster: "",
            background: "",
            description: "No data returned from TMDB (check filters).",
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
          name: "Error Loading Content",
          type,
          genre: ["Uncategorized"],
          poster: "",
          background: "",
          description: error.message,
        },
      ],
    };
  }
}

module.exports = { getCatalog };
