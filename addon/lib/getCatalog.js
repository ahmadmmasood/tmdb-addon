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

/* ---------------- SAFE DECODE ---------------- */

function safeDecode(str) {
  if (!str) return null;

  try {
    let out = str;

    for (let i = 0; i < 3; i++) {
      out = decodeURIComponent(out);
    }

    return out
      .replace(/\.json$/, "")
      .trim();
  } catch {
    return String(str).replace(/\.json$/, "").trim();
  }
}

/* ---------------- FIXED PARSER (CRITICAL) ---------------- */

function parseCatalogId(id) {
  if (!id) return { baseId: null, genre: null };

  let clean = safeDecode(id);

  // CASE 1: old format -> tmdb.top/genre=Comedy
  if (clean.includes("/genre=")) {
    const parts = clean.split("/genre=");
    return {
      baseId: parts[0],
      genre: parts[1] || null,
    };
  }

  // CASE 2: new format -> tmdb.topComedy / tmdb.latestDrama
  const match = clean.match(/^(tmdb\.(top|latest|trending))(.+)$/);

  if (match) {
    return {
      baseId: match[1], // tmdb.top
      genre: match[3] ? match[3].trim() : null,
    };
  }

  return {
    baseId: clean,
    genre: null,
  };
}

/* ---------------- MAP RESULTS ---------------- */

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
  const tmdb = getTmdbClient(config);

  const fetchFunction =
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
    page,
    include_adult: false,
  };

  /* ---------------- PARSE ID ---------------- */

  const parsed = parseCatalogId(id);

  console.log("\n👉 RAW ID:", id);
  console.log("👉 BASE ID:", parsed.baseId);
  console.log("👉 EXTRACTED GENRE:", parsed.genre);

  /* ---------------- APPLY GENRE FILTER SAFELY ---------------- */

  if (
    parsed.baseId?.includes("tmdb.top") &&
    parsed.genre
  ) {
    const match = genreList.find(
      (g) =>
        g?.name?.toLowerCase() === parsed.genre.toLowerCase()
    );

    if (match?.id) {
      console.log("👉 GENRE MATCHED:", match.name);
      params.with_genres = match.id;
    } else {
      console.log("⚠️ Genre not found, returning unfiltered results");
    }
  }

  /* ---------------- FETCH PAGE ---------------- */

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

    const [a, b] = await Promise.all([
      fetchPage({ ...params, page: startPage }),
      fetchPage({ ...params, page: startPage + 1 }),
    ]);

    let metas = dedupe([...a, ...b]);

    /* ---------------- FALLBACK ---------------- */

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
            description: "TMDB returned no results.",
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
