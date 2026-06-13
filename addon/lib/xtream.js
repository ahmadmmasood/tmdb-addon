const axios = require("axios");

/* ---------------- CONFIG HELPERS ---------------- */

function getBase(config) {
  return config.xtreamUrl || process.env.XTREAM_URL;
}

function getAuth(config) {
  return {
    username: config.xtreamUser || process.env.XTREAM_USER,
    password: config.xtreamPass || process.env.XTREAM_PASS,
  };
}

/* ---------------- REQUEST ---------------- */

async function xtreamRequest(config, action, extra = {}) {
  const base = getBase(config);
  const auth = getAuth(config);

  if (!base || !auth.username || !auth.password) {
    throw new Error("Missing Xtream config");
  }

  const url = `${base}/player_api.php`;

  const res = await axios.get(url, {
    params: {
      username: auth.username,
      password: auth.password,
      action,
      ...extra,
    },
    timeout: 15000,
  });

  return res.data;
}

/* ---------------- NORMALIZE ---------------- */

function normalize(str = "") {
  return str
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/* ---------------- FIXED SCORE (IMPORTANT) ---------------- */

function score(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 100;

  // proper word-based scoring (NOT character-based)
  const aWords = a.match(/.{1,3}/g) || [];
  const bWords = b.match(/.{1,3}/g) || [];

  let match = 0;

  for (const w of aWords) {
    if (bWords.some((x) => x.includes(w))) {
      match++;
    }
  }

  return match;
}

/* ---------------- MOVIE STREAM ---------------- */

async function findMovieStream(title, year, config) {
  const data = await xtreamRequest(config, "get_vod_streams");

  if (!Array.isArray(data) || data.length === 0) {
    console.log("❌ No VOD data from provider");
    return null;
  }

  const target = normalize(title);

  let best = null;
  let bestScore = 0;

  for (const item of data) {
    const name = normalize(item.name || "");
    const s = score(target, name);

    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }

  if (!best || bestScore < 1) {
    console.log("❌ No VOD match:", title);
    return null;
  }

  const base = getBase(config);
  const auth = getAuth(config);

  return {
    url: `${base}/movie/${auth.username}/${auth.password}/${best.stream_id}.mp4`,
    title: best.name,
  };
}

/* ---------------- SERIES STREAM ---------------- */

async function findSeriesStream(title, config) {
  const data = await xtreamRequest(config, "get_series");

  if (!Array.isArray(data) || data.length === 0) {
    console.log("❌ No series list from provider");
    return null;
  }

  const target = normalize(title);

  let best = null;
  let bestScore = 0;

  for (const item of data) {
    const name = normalize(item.name || "");
    const s = score(target, name);

    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  }

  if (!best || bestScore < 1) {
    console.log("❌ No SERIES match:", title);
    return null;
  }

  const episodes = await xtreamRequest(config, "get_series_info", {
    series_id: best.series_id,
  });

  if (!episodes?.episodes) {
    console.log("❌ No episodes found:", title);
    return null;
  }

  const seasons = Object.values(episodes.episodes);

  let firstEpisode = null;

  for (const season of seasons) {
    if (Array.isArray(season) && season.length) {
      firstEpisode = season[0];
      break;
    }
  }

  if (!firstEpisode) {
    console.log("❌ No playable episode:", title);
    return null;
  }

  const base = getBase(config);
  const auth = getAuth(config);

  return {
    url: `${base}/series/${auth.username}/${auth.password}/${firstEpisode.id}.mp4`,
    title: best.name,
  };
}

/* ---------------- EXPORTS ---------------- */

module.exports = {
  findMovieStream,
  findSeriesStream,
};
