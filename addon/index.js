const express = require("express");
const addon = express();

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

/* ---------------- MIDDLEWARE ---------------- */

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
    manifest: "/manifest.json"
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
  const { catalogChoices, type, id } = req.params;

  let config = {};
  try {
    config = parseConfig(catalogChoices) || {};
  } catch (e) {
    config = {};
  }

  const language = config.language || DEFAULT_LANGUAGE;
  const { genre, skip, search } = req.query;
  const page = skip ? Math.floor(skip / 20) + 1 : 1;

  try {
    const args = [type, language, page];
    let metas = [];

    if (search) {
      metas = await getSearch(id, type, language, search, config);
    } else {
      switch (id) {
        case "tmdb.trending":
          metas = await getTrending(...args, genre, config);
          break;

        case "tmdb.favorites":
          metas = await getFavorites(...args, genre, config);
          break;

        case "tmdb.watchlist":
          metas = await getWatchList(...args, genre, config);
          break;

        case "trakt.watchlist":
          metas = await getTraktWatchlist(...args, genre, config.traktAccessToken);
          break;

        case "trakt.recommendations":
          metas = await getTraktRecommendations(...args, genre, config.traktAccessToken);
          break;

        default:
          metas = await getCatalog(...args, id, genre, config);
          break;
      }
    }

    // ✅ IMPORTANT FIX FOR UHF
    res.json({ metas });

  } catch (e) {
    console.error("Catalog error:", e);
    res.status(500).json({
      metas: [
        {
          id: "tmdb:error",
          name: "Error loading catalog",
          type,
          description: e.message
        }
      ]
    });
  }
});

/* ---------------- META ---------------- */

addon.get("/:catalogChoices?/meta/:type/:id.json", async (req, res) => {
  try {
    let config = {};
    try {
      config = parseConfig(req.params.catalogChoices) || {};
    } catch (e) {
      config = {};
    }

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
  } catch (e) {
    config = {};
  }

  try {
    const title = req.query.title || "";
    const year = req.query.year || "";

    if (!title) {
      return res.json({
        streams: [
          {
            title: "Missing title",
            url: "",
            behaviorHints: { notWebReady: true }
          }
        ]
      });
    }

    let stream = null;

    if (type === "movie") {
      stream = await findMovieStream(title, year, config);
    } else {
      stream = await findSeriesStream(title, config);
    }

    if (!stream || !stream.url) {
      return res.json({
        streams: [
          {
            title: "No stream found",
            url: "",
            behaviorHints: { notWebReady: true }
          }
        ]
      });
    }

    return res.json({
      streams: [
        {
          title: stream.title || "Xtream Stream",
          url: stream.url,
          behaviorHints: {
            bingeGroup: "default"
          }
        }
      ]
    });

  } catch (e) {
    console.error("Stream error:", e);

    return res.json({
      streams: [
        {
          title: "Stream error",
          url: "",
          behaviorHints: { notWebReady: true }
        }
      ]
    });
  }
});

/* ---------------- HEALTH ---------------- */

addon.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/* ---------------- EXPORT ---------------- */

module.exports = addon;
