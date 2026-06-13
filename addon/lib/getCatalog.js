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

/* 🔥 FIX: ROBUST GENRE + ID PARSING */
function parseCatalogId(rawId) {
  if (!rawId) return { baseId: null, genre: null };

  let id = String(rawId);

  try {
    id = decodeURIComponent(id);
  } catch {}

  id = id.replace(".json", "");

  let genre = null;

  const genreMatch = id.match(/genre=(.+)$/);
  if (genreMatch) {
    genre = genreMatch[1];
    id = id.split("/genre=")[0];
  }

  return {
    baseId: id,
    genre,
  };
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

  /* ---------------- DEBUG ---------------- */
  const parsed = parseCatalogId(id);

  console.log("👉 RAW ID:", id);
  console.log("👉 BASE ID:", parsed.baseId);
  console.log("👉 EXTRACTED GENRE:", parsed.genre);

  /* ---------------- GENRE FILTER ---------------- */

  if (parsed.genre && parsed.baseId?.includes("tmdb.top")) {
    const g = genreList.find((x) =>
      x?.name?.toLowerCase() === parsed.genre.toLowerCase()
    );

    if (g?.id) {
      console.log("👉 GENRE MATCHED:", g.name);
      params.with_genres = g.id;
    } else {
      console.log("⚠️ GENRE NOT FOUND - skipping filter");
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
      return {
        metas: [
          {
            id: "tmdb:no-content",
            name: "No Results Found",
            type,
            genre: ["Uncategorized"],
            poster: "",
            background: "",
            description: "No TMDB results returned.",
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
