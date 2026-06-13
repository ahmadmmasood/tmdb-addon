const express = require("express");
const addon = express();

/* ---------------- LOGGING ---------------- */

addon.use((req, res, next) => {
  console.log("👉 HIT:", req.method, req.originalUrl);
  next();
});

/* ---------------- IMPORTS ---------------- */

const analytics = require("./utils/analytics");

const { getCatalog } = require("./lib/getCatalog");
const { getSearch } = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta } = require("./lib/getMeta");
const { cacheWrapMeta } = require("./lib/getCache");
const { getTrending } = require("./lib/getTrending");

const { parseConfig } = require("./utils/parseProps");

const { getFavorites, getWatchList } = require("./lib/getPersonalLists");

const {
  getTraktWatchlist,
  getTraktRecommendations,
} = require("./lib/getTraktLists");

const { findMovieStream, findSeriesStream } = require("./lib/xtream");

/* ---------------- CORS ---------------- */

addon.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  next();
});

addon.use(express.json());
addon.use(analytics.middleware);

/* ---------------- ROOT ---------------- */

addon.get("/", (req, res) => {
  res.json({
    name: "TMDB + Xtream Addon",
    status: "running",
    manifest: "/manifest.json",
  });
});

/* ---------------- MANIFEST ---------------- */

addon.get("/:catalogChoices?/manifest.json", async (req, res) => {
  try {
    const config = parseConfig(req.params.catalogChoices) || {};
    const manifest = await getManifest(config);
    res.json(manifest);
  } catch (e) {
    console.error("Manifest error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- 🔥 FIXED CATALOG ROUTE ---------------- */

addon.get("/:catalogChoices?/catalog/:type/:id", async (req, res) => {
  try {
    const { catalogChoices, type } = req.params;

    let id = String(req.params.id || "");

    try {
      id = decodeURIComponent(id);
    } catch {}

    id = id
      .replace("/genre=", "")
      .replace("genre=", "")
      .replace(".json", "")
      .trim();

    const config = parseConfig(catalogChoices) || {};
    const language = config.language || DEFAULT_LANGUAGE;

    /* 🔥 FIX: EXTRACT GENRE FROM PATH (IMPORTANT) */
    let genre = null;

    if (id.includes("genre=")) {
      genre = id.split("genre=")[1];
      id = id.split("genre=")[0];
    }

    const { skip, search } = req.query;
    const page = skip ? Math.floor(skip / 20) + 1 : 1;

    console.log("👉 CLEAN ID:", id);
    console.log("👉 EXTRACTED GENRE:", genre);

    let result;

    if (search) {
      result = await getSearch(id, type, language, search, config);
    } else {
      switch (id) {
        case "tmdb.trending":
          result = await getTrending(type, language, page, genre, config);
          break;

        case "tmdb.favorites":
          result = await getFavorites(type, language, page, genre, config);
          break;

        case "tmdb.watchlist":
          result = await getWatchList(type, language, page, genre, config);
          break;

        case "trakt.watchlist":
          result = await getTraktWatchlist(type, language, page, genre, config.traktAccessToken);
          break;

        case "trakt.recommendations":
          result = await getTraktRecommendations(type, language, page, genre, config.traktAccessToken);
          break;

        default:
          result = await getCatalog(type, language, page, id, genre, config);
      }
    }

    return res.json({
      metas: result?.metas || [],
    });

  } catch (e) {
    console.error("Catalog error:", e);

    return res.json({
      metas: [
        {
          id: "tmdb:error",
          name: "Error loading catalog",
          type,
          description: e.message,
        },
      ],
    });
  }
});

/* ---------------- FALLBACK CATALOG ROUTE ---------------- */

addon.get("/:catalogChoices?/catalog/:type/*", async (req, res) => {
  try {
    const { catalogChoices, type } = req.params;

    let fullPath = req.params[0] || "";
    let id = String(fullPath);

    try {
      id = decodeURIComponent(id);
    } catch {}

    id = id
      .replace("/genre=", "")
      .replace("genre=", "")
      .replace(".json", "")
      .trim();

    let genre = null;

    if (id.includes("genre=")) {
      genre = id.split("genre=")[1];
      id = id.split("genre=")[0];
    }

    const config = parseConfig(catalogChoices) || {};
    const language = config.language || DEFAULT_LANGUAGE;

    const { skip, search } = req.query;
    const page = skip ? Math.floor(skip / 20) + 1 : 1;

    let result;

    if (search) {
      result = await getSearch(id, type, language, search, config);
    } else {
      result = await getCatalog(type, language, page, id, genre, config);
    }

    return res.json({
      metas: result?.metas || [],
    });

  } catch (e) {
    console.error("Catalog fallback error:", e);

    return res.json({
      metas: [],
    });
  }
});

/* ---------------- META ---------------- */

addon.get("/:catalogChoices?/meta/:type/:id.json", async (req, res) => {
  try {
    const config = parseConfig(req.params.catalogChoices) || {};
    const language = config.language || DEFAULT_LANGUAGE;

    let rawId = String(req.params.id || "");

    if (rawId.includes(":")) {
      rawId = rawId.split(":")[1];
    }

    const tmdbId = rawId;

    const key = `${language}:${req.params.type}:${tmdbId}`;

    const resp = await cacheWrapMeta(key, () =>
      getMeta(req.params.type, language, tmdbId, config)
    );

    res.json(resp);
  } catch (e) {
    console.error("Meta error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- STREAM ---------------- */

addon.get("/:catalogChoices?/stream/:type/:id.json", async (req, res) => {
  const { type } = req.params;

  let config = {};
  try {
    config = parseConfig(req.params.catalogChoices) || {};
  } catch {}

  try {
    const title = req.query.title || "";
    const year = req.query.year || "";

    if (!title) return res.json({ streams: [] });

    let stream = null;

    if (type === "movie") {
      stream = await findMovieStream(title, year, config);
    } else {
      stream = await findSeriesStream(title, config);
    }

    if (!stream?.url) return res.json({ streams: [] });

    return res.json({
      streams: [
        {
          title: stream.title || "Xtream Stream",
          url: stream.url,
          behaviorHints: {
            bingeGroup: "default",
          },
        },
      ],
    });

  } catch (e) {
    console.error("Stream error:", e);
    return res.json({ streams: [] });
  }
});

/* ---------------- HEALTH ---------------- */

addon.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/* ---------------- EXPORT ---------------- */

module.exports = addon;
