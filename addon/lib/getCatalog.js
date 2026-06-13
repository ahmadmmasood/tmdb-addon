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

    return out.replace(/\.json$/, "").trim();
  } catch {
    return String(str).replace(/\.json$/, "").trim();
  }
}

/* ---------------- PARSER ---------------- */

function parseCatalogId(id) {
  if (!id) return { baseId: null, genre: null };

  let clean = safeDecode(id);

  if (clean.includes("/genre=")) {
    const parts = clean.split("/genre=");
    return {
      baseId: parts[0],
      genre: parts[1] || null,
    };
  }

  const match = clean.match(/^(tmdb\.(top|latest|trending))(.+)$/);

  if (match) {
    return {
      baseId: match[1],
      genre: match[3] ? match[3].trim() : null,
    };
  }

  return {
    baseId: clean,
    genre: null,
  };
}

/* ---------------- NORMALIZE ---------------- */

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/&/g, "and")
    .trim();
}

/* ---------------- TRENDING FIX ---------------- */

function isTrendingCategory(baseId, genre) {
  return baseId?.includes("tmdb.trending") && (genre === "Day" || genre === "Week");
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

  const parsed = parseCatalogId(id);

  console.log("\n👉 RAW ID:", id);
  console.log("👉 BASE ID:", parsed.baseId);
  console.log("👉 EXTRACTED GENRE:", parsed.genre);

  /* ---------------- TRENDING HANDLING (IMPORTANT FIX) ---------------- */

  if (isTrendingCategory(parsed.baseId, parsed.genre)) {
    console.log("👉 TRENDING MODE DETECTED:", parsed.genre);

    const endpoint =
      parsed.genre === "Day"
        ? "day"
        : "week";

    // override fetch function for trending
    const trending = tmdb.getTrending?.bind(tmdb);

    if (trending) {
      const fetchTrending = async (p) => {
        try {
          const res = await trending(endpoint, p.page || 1);
          if (!res?.results) return [];
          return mapResults(res.results, genreList, type);
        } catch (e) {
          console.error("Trending fetch failed:", e.message);
          return [];
        }
      };

      const startPage = Number(page) || 1;

      const [a, b] = await Promise.all([
        fetchTrending({ page: startPage }),
        fetchTrending({ page: startPage + 1 }),
      ]);

      return {
        metas: dedupe([...a, ...b]).slice(0, 20),
      };
    }
  }

  /* ---------------- GENRE FILTER ---------------- */

  if (parsed.baseId?.includes("tmdb.top") && parsed.genre) {
    const normalizedTarget = normalize(parsed.genre);

    const match = genreList.find((g) => {
      if (!g?.name) return false;
      return normalize(g.name) === normalizedTarget;
    });

    if (match?.id) {
      console.log("👉 GENRE MATCHED:", match.name, match.id);
      params.with_genres = String(match.id);
    } else {
      console.log("⚠️ Genre not found → fallback to unfiltered");
    }
  }

  /* ---------------- FETCH NORMAL DISCOVER ---------------- */

  async function fetchPage(p) {
    try {
      const res = await fetchFunction(p);
      if (!res?.results) return [];
      return mapResults(res.results, genreList, type);
    } catch (e) {
      console.error("TMDB fetch failed:", e.message);
      return [];
    }
  }

  try {
    const startPage = Number(page) || 1;

    const [a, b] = await Promise.all([
      fetchPage({ ...params, page: startPage }),
      fetchPage({ ...params, page: startPage + 1 }),
    ]);

    let metas = dedupe([...a, ...b]);

    if (!metas.length) {
      console.warn("⚠️ EMPTY RESULT SET FOR:", parsed.genre);

      return {
        metas: [
          {
            id: "tmdb:no-content",
            name: parsed.genre
              ? `${parsed.genre} (No Results)`
              : "No Results Found",
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
