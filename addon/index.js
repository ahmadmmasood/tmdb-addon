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

/* ---------------- SAFE WRAPPER ---------------- */
function safeMetas(result) {
  if (!result) return { metas: [] };
  if (Array.isArray(result)) return { metas: result };
  if (Array.isArray(result.metas)) return result;
  return { metas: [] };
}

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
  const { catalogChoices, type, id } = req.params;

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
    const args = [type, language, page];
    let result;

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

    // ✅ FIX: ALWAYS normalize output
    res.json(safeMetas(result));

  } catch (e) {
    console.error("Catalog error:", e);

    res.json({
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

    if (!title) {
      return res.json({ streams: [] });
    }

    let stream =
      type === "movie"
        ? await findMovieStream(title, year, config)
        : await findSeriesStream(title, config);

    if (!stream?.url) {
      return res.json({ streams: [] });
    }

    return res.json({
      streams: [
        {
          title: stream.title || "Stream",
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
