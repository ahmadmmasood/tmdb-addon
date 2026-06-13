const express = require("express");
const addon = express();

/* ---------------- LOGGING (UHF DEBUG) ---------------- */

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

/* ---------------- CATALOG ---------------- */

addon.get("/:catalogChoices?/catalog/:type/:id", async (req, res) => {
  const { catalogChoices, type } = req.params;

  let id = req.params.id;

  if (id.includes("/genre=")) id = id.split("/genre=")[0];
  if (id.includes("genre=")) id = id.split("genre=")[0];
  if (id.endsWith(".json")) id = id.replace(".json", "");

  let config = {};
  try {
    config = parseConfig(catalogChoices) || {};
  } catch {
    config = {};
  }

  const language = config.language || DEFAULT_LANGUAGE;

  const { genre, skip, search } = req.query;
  const page = skip ? Math.floor(skip / 20) + 1 : 1;

  try {
    let result = [];

    const args = [type, language, page];

    if (search) {
      result = await getSearch(id, type, language, search, config);
    } else {
      switch (id) {
        case "tmdb.trending":
          result = await getTrending(...args, genre, config);
          break;

        case "tmdb.favorites":
          result = await getFavorites(...args, genre, config);
          break;

        case "tmdb.watchlist":
          result = await getWatchList(...args, genre, config);
          break;

        case "trakt.watchlist":
          result = await getTraktWatchlist(...args, genre, config.traktAccessToken);
          break;

        case "trakt.recommendations":
          result = await getTraktRecommendations(...args, genre, config.traktAccessToken);
          break;

        default:
          result = await getCatalog(type, language, page, id, genre, config);
          break;
      }
    }

    // ---------------- SAFE META NORMALIZATION FIX ----------------

    let metas = [];

    if (Array.isArray(result)) {
      metas = result;
    } else if (result?.metas) {
      metas = result.metas;
    } else {
      metas = [];
    }

    return res.json({ metas });

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

/* ---------------- META ---------------- */

addon.get("/:catalogChoices?/meta/:type/:id.json", async (req, res) => {
  try {
    const config = parseConfig(req.params.catalogChoices) || {};
    const language = config.language || DEFAULT_LANGUAGE;
    const tmdbId = req.params.id.split(":")[1];

    const resp = await cacheWrapMeta(
      `${language}:${req.params.type}:${tmdbId}`,
      () => getMeta(req.params.type, language, tmdbId, config)
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
  } catch {
    config = {};
  }

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
          behaviorHints: { bingeGroup: "default" },
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
