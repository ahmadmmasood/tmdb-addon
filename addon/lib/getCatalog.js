require("dotenv").config();

const { getTmdbClient } = require("../utils/getTmdbClient");
const { getGenreList } = require("./getGenreList");

/* ---------------- DEDUPE ---------------- */
function dedupe(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    if (!x || !x.id) return false;
    if (seen.has(x.id)) return false;
    seen.add(x.id);
    return true;
  });
}

/* ---------------- MAP TMDB RESULTS ---------------- */
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

      imdbRating: el.vote_average
        ? el.vote_average.toFixed(1)
        : "N/A",

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
  const tmdb = getTmdbClient(config);

  const fetchFn =
    type === "movie"
      ? tmdb.discoverMovie.bind(tmdb)
      : tmdb.discoverTv.bind(tmdb);

  let genreList = [];
  try {
    genreList = await getGenreList(language, type, config);
  } catch (e) {
    console.error("Genre load failed:", e.message);
  }

  const params = {
    language,
    page,
    "vote_count.gte": 10,
  };

  /* ---------------- FILTERS ---------------- */
  if (id === "tmdb.year" && genre) {
    params[
      type === "movie"
        ? "primary_release_year"
        : "first_air_date_year"
    ] = genre;
  }

  if (id === "tmdb.top" && genre) {
    const g = genreList.find((x) => x.name === genre);
    if (g) params.with_genres = g.id;
  }

  /* ---------------- FETCH ---------------- */
  async function fetchPage(p) {
    try {
      const res = await fetchFn(p);
      if (!res?.results) return [];
      return mapResults(res.results, genreList, type);
    } catch (e) {
      console.error("fetchPage error:", e.message);
      return [];
    }
  }

  try {
    const startPage = parseInt(page) || 1;

    const [p1, p2] = await Promise.all([
      fetchPage({ ...params, page: startPage }),
      fetchPage({ ...params, page: startPage + 1 }),
    ]);

    const metas = dedupe([...p1, ...p2]).slice(0, 20);

    /* ---------------- IMPORTANT FIX ---------------- */
    return {
      metas: metas.length
        ? metas
        : [
            {
              id: "tmdb:no-content",
              type,
              name: "No Results",
              poster: "",
              background: "",
              genre: [],
              description: "No content found.",
            },
          ],
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
          genre: [],
          description: error.message,
        },
      ],
    };
  }
}

module.exports = { getCatalog };
