const express = require("express");
const favicon = require("serve-favicon");
const path = require("path");

const addon = express();

const analytics = require("./utils/analytics");

const { getCatalog } = require("./lib/getCatalog");
const { getSearch } = require("./lib/getSearch");
const { getManifest, DEFAULT_LANGUAGE } = require("./lib/getManifest");
const { getMeta } = require("./lib/getMeta");
const { getTmdb } = require("./lib/getTmdb");
const { cacheWrapMeta } = require("./lib/getCache");
const { getTrending } = require("./lib/getTrending");

const { parseConfig } = require("./utils/parseProps");

const { getRequestToken, getSessionId } = require("./lib/getSession");

const { getFavorites, getWatchList } = require("./lib/getPersonalLists");

const {
  getTraktAuthUrl,
  getTraktAccessToken,
} = require("./lib/getTraktSession");

const {
  getTraktWatchlist,
  getTraktRecommendations,
} = require("./lib/getTraktLists");

const { blurImage } = require("./utils/imageProcessor");

const {
  testProxy,
  PROXY_CONFIG,
} = require("./utils/httpClient");

const {
  trackUser,
  getUserCount,
  getAggregatedUserCount,
  trackExternalUsers,
  startAutoReporting,
} = require("./utils/userCounter");

/* ---------------- MIDDLEWARE ---------------- */

addon.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  next();
});

addon.use(express.json());
addon.use(analytics.middleware);

addon.use(favicon(path.join(__dirname, "../public/favicon.png")));

addon.use(
  express.static(path.join(__dirname, "../public"), {
    setHeaders: (res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "*");
    },
  })
);

addon.use(
  express.static(path.join(__dirname, "../dist"), {
    setHeaders: (res) => {
      res.set("Access-Control-Allow-Origin", "*");
      res.set("Access-Control-Allow-Headers", "*");
    },
  })
);

/* ---------------- HELPERS ---------------- */

const respond = (res, data, cache = {}) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.setHeader("Content-Type", "application/json");
  res.json(data);
};

/* ---------------- ROUTES ---------------- */

addon.get("/", (_, res) => {
  res.redirect("/configure");
});

/* ---------- MANIFEST ---------- */

addon.get("/:catalogChoices?/manifest.json", async (req, res) => {
  try {
    const config = parseConfig(req.params.catalogChoices) || {};
    const manifest = await getManifest(config);
    respond(res, manifest);
  } catch (e) {
    console.error("Manifest error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- FIXED CATALOG ROUTE (IMPORTANT) ---------- */

addon.get(
  "/:catalogChoices?/catalog/:type/:id",
  async (req, res) => {
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

      respond(res, metas);
    } catch (e) {
      console.error("Catalog error:", e);
      res.status(500).json({ error: e.message });
    }
  }
);

/* ---------- META ---------- */

addon.get("/:catalogChoices?/meta/:type/:id.json", async (req, res) => {
  try {
    const config = parseConfig(req.params.catalogChoices) || {};
    const language = config.language || DEFAULT_LANGUAGE;

    const tmdbId = req.params.id.split(":")[1];
    const type = req.params.type;

    const resp = await cacheWrapMeta(
      `${language}:${type}:${tmdbId}`,
      async () => getMeta(type, language, tmdbId, config)
    );

    respond(res, resp);
  } catch (e) {
    console.error("Meta error:", e);
    res.status(500).json({ error: e.message });
  }
});

/* ---------- IMAGE ---------- */

addon.get("/api/image/blur", async (req, res) => {
  try {
    const buffer = await blurImage(req.query.url);
    res.setHeader("Content-Type", "image/jpeg");
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: "Image error" });
  }
});

/* ---------- STATS ---------- */

addon.post("/api/stats/track-user", async (req, res) => {
  await trackUser(req);
  const count = await getUserCount();
  res.json({ success: true, count });
});

addon.get("/api/stats/users", async (req, res) => {
  const count = await getAggregatedUserCount();
  res.json({ count });
});

addon.post("/api/stats/report-users", async (req, res) => {
  const { count, instanceId } = req.body || {};
  await trackExternalUsers(Number(count), instanceId);
  res.json({ success: true });
});

/* ---------- PROXY ---------- */

addon.get("/api/proxy/status", async (req, res) => {
  let working = false;
  if (PROXY_CONFIG.enabled) working = await testProxy();

  res.json({
    enabled: PROXY_CONFIG.enabled,
    working,
    host: PROXY_CONFIG.host,
  });
});

/* ---------- AUTO REPORT ---------- */

startAutoReporting(60);

/* ---------------- EXPORT ---------------- */

module.exports = addon;
