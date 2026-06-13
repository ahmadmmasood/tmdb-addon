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
    for (let i = 0; i < 3; i++) out = decodeURIComponent(out);
    return out.replace(/\.json$/, "").trim();
  } catch {
    return String(str).replace(/\.json$/, "").trim();
  }
}

/* ---------------- PARSER ---------------- */

function parseCatalogId(id) {
  if (!id) return { baseId: null, genre: null };

  const clean = safeDecode(id);

  if (clean.includes("/genre=")) {
    const [baseId, genre] = clean.split("/genre=");
    return { baseId, genre: genre || null };
  }

  const match = clean.match(/^(tmdb\.(top|latest|trending))(.+)$/);

  if (match) {
    return {
      baseId: match[1],
      genre: match[3]?.trim() || null,
    };
  }

  return { baseId: clean, genre: null };
}

/* ---------------- NORMALIZE ---------------- */

function normalize(str) {
  return (str || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/&/g, "and")
    .trim();
}

/* ---------------- UNIFIED GENRE SYSTEM (FIX CORE ISSUE) ---------------- */

const GENRE_MAP = {
  "Action": ["Action", "Action & Adventure"],
  "Adventure": ["Adventure", "Action & Adventure"],
  "Animation": ["Animation"],
  "Comedy": ["Comedy"],
  "Crime": ["Crime"],
  "Drama": ["Drama"],
  "Documentary": ["Documentary"],
  "Family": ["Family", "Kids"],
  "Fantasy": ["Fantasy", "Sci-Fi & Fantasy"],
  "History": ["History"],
  "Horror": ["Horror"],
  "Music": ["Music"],
  "Mystery": ["Mystery"],
  "Romance": ["Romance"],
  "Science Fiction": ["Science Fiction", "Sci-Fi & Fantasy"],
  "Thriller": ["Thriller"],
  "War": ["War"],
  "Western": ["Western"],
};

function unifyGenre(name) {
  if (!name) return null;

  const n = normalize(name);

  for (const key of Object.keys(GENRE_MAP)) {
    if (GENRE_MAP[key].some((g) => normalize(g) === n)) {
      return key;
    }
  }

  return null;
}

/* ---------------- MAP RESULTS ---------------- */

function mapResults(results, genreList, type) {
  return results.map((el) => {
    const genres = Array.isArray(el.genre_ids)
      ? el.genre_ids
          .map((id) => genreList.find((g) => g.id === id)?.name)
          .filter(Boolean)
          .map(unifyGenre)
          .filter(Boolean)
      : [];

    return {
      id: `tmdb:${el.id}`,
      name: type === "movie" ? el.title : el.name,

      genre: genres.length ? [...new Set(genres)].slice(0, 3) : ["Uncategorized"],

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

  const parsed = parseCatalogId(id);

  console.log("\n👉 RAW ID:", id);
  console.log("👉 BASE ID:", parsed.baseId);
  console.log("👉 EXTRACTED GENRE:", parsed.genre);

  const params = {
    page,
    include_adult: false,
  };

  /* ---------------- TRENDING (UNCHANGED BUT SAFE) ---------------- */

  const isTrending =
    parsed.baseId?.includes("tmdb.trending") &&
    (parsed.genre === "Day" || parsed.genre === "Week");

  if (isTrending) {
    const endpoint = parsed.genre === "Day" ? "day" : "week";
    const trending = tmdb.getTrending?.bind(tmdb);

    if (trending) {
      const run = async (p) => {
        const res = await trending(endpoint, p.page || 1);
        return mapResults(res?.results || [], genreList, type);
      };

      const start = Number(page) || 1;

      const [a, b] = await Promise.all([
        run({ page: start }),
        run({ page: start + 1 }),
      ]);

      return {
        metas: dedupe([...a, ...b]).slice(0, 20),
      };
    }
  }

  /* ---------------- GENRE FILTER (FIXED MATCHING) ---------------- */

  if (parsed.baseId?.includes("tmdb.top") && parsed.genre) {
    const target = unifyGenre(parsed.genre);

    const match = genreList.find((g) => {
      const gName = unifyGenre(g?.name);
      return gName && gName === target;
    });

    if (match?.id) {
      params.with_genres = String(match.id);
      console.log("👉 GENRE MATCHED:", match.name, match.id);
    } else {
      console.log("⚠️ Genre not found → fallback unfiltered");
    }
  }

  /* ---------------- FETCH ---------------- */

  async function fetchPage(p) {
    const res = await fetchFunction(p);
    return mapResults(res?.results || [], genreList, type);
  }

  try {
    const start = Number(page) || 1;

    const [a, b] = await Promise.all([
      fetchPage({ ...params, page: start }),
      fetchPage({ ...params, page: start + 1 }),
    ]);

    const metas = dedupe([...a, ...b]);

    if (!metas.length) {
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

    return { metas: metas.slice(0, 20) };
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
