const express = require("express");
const path = require("path");

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

/* ---------------- XTREAM IMPORT ---------------- */
const { findMovieStream, findSeriesStream } = require("./lib/xtream");

/* ---------------- MIDDLEWARE ---------------- */

addon.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

addon.use(express.json());
addon.use(analytics.middleware);

/* ---------------- ROOT ---------------- */

addon.get("/", (req, res) => {
  res.json({
    name: "TMDB + Xtream Addon",
    manifest: "/manifest.json",
    status: "running"
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
  const config = parseConfig(catalogChoices) || {};
  const language = config.language || DEFAULT_LANGUAGE;

  const { genre, skip, search } = req.query;
  const page = skip ? Math.floor(skip / 20) + 1 : 1;

  let metas = [];

  try {
    const args = [type, language, page];

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
          if (!config.traktAccessToken)
            throw new Error("Missing Trakt token");
          metas = await getTraktWatchlist(...args, genre, config.traktAccessToken);
          break;

        case "trakt.recommendations":
          if (!config.traktAccessToken)
            throw new Error("Missing Trakt token");
          metas = await getTraktRecommendations(...args, genre, config.traktAccessToken);
          break;

        default:
          metas = await getCatalog(...args, id, genre, config);
          break;
      }
    }

    res.json(metas);
  } catch (e) {
    console.error("Catalog error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- META ---------------- */

addon.get("/:catalogChoices?/meta/:type/:id.json", async (req, res) => {
  try {
    const config = parseConfig(req.params.catalogChoices) || {};
    const language = config.language || DEFAULT_LANGUAGE;

    const tmdbId = req.params.id.split(":")[1];
    const type = req.params.type;

    const resp = await cacheWrapMeta(
      `${language}:${type}:${tmdbId}`,
      () => getMeta(type, language, tmdbId, config)
    );

    res.json(resp);
  } catch (e) {
    console.error("Meta error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- XTREAM STREAM ---------------- */

addon.get("/:catalogChoices?/stream/:type/:id.json", async (req, res) => {
  const { type } = req.params;
  const config = parseConfig(req.params.catalogChoices) || {};

  try {
    const title = req.query.title || "";
    const year = req.query.year || "";

    let stream = null;

    if (type === "movie") {
      stream = await findMovieStream(title, year, config);
    } else {
      stream = await findSeriesStream(title, config);
    }

    if (!stream) {
      return res.json({
        streams: [
          {
            title: "No match found in Xtream",
            url: "",
            behaviorHints: { notWebReady: true }
          }
        ]
      });
    }

    return res.json({
      streams: [
        {
          url: stream.url,
          title: stream.title,
          behaviorHints: {
            bingeGroup: "default"
          }
        }
      ]
    });
  } catch (e) {
    console.error("Stream error:", e);

    res.json({
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
