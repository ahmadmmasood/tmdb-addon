const express = require("express");
const path = require("path");

const addon = express();

/* ---------------- IMPORTS ---------------- */

const analytics = require("./utils/analytics");

const { getCatalog } = require("./lib/getCatalog");
const { getSearch } = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta } = require("./lib/getMeta");
const { getTmdb } = require("./lib/getTmdb");
const { cacheWrapMeta } = require("./lib/getCache");
const { getTrending } = require("./lib/getTrending");

const { parseConfig } = require("./utils/parseProps");

const { getFavorites, getWatchList } = require("./lib/getPersonalLists");

const {
  getTraktWatchlist,
  getTraktRecommendations,
} = require("./lib/getTraktLists");

/* ---------------- BASIC MIDDLEWARE ---------------- */

addon.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

addon.use(express.json());
addon.use(analytics.middleware);

/* ---------------- ROOT ---------------- */

addon.get("/", (req, res) => {
  res.redirect("/manifest.json");
});

/* ---------------- SIMPLE CONFIG PAGE (NO UI / NO DIST) ---------------- */

addon.get("/configure", (req, res) => {
  res.json({
    status: "running",
    message: "TMDB Addon is active",
    manifest: "/manifest.json",
    catalog_example: "/catalog/movie/tmdb.top",
    meta_example: "/meta/movie/tmdb:123"
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

/* ---------------- FIXED CATALOG ROUTE ---------------- */

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
          metas = await getTraktWatchlist(
            ...args,
            genre,
            config.traktAccessToken
          );
          break;

        case "trakt.recommendations":
          if (!config.traktAccessToken)
            throw new Error("Missing Trakt token");
          metas = await getTraktRecommendations(
            ...args,
            genre,
            config.traktAccessToken
          );
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

/* ---------------- HEALTH CHECK ---------------- */

addon.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

/* ---------------- EXPORT ---------------- */

module.exports = addon;
