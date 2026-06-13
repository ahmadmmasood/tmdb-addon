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

/* ---------------- STRONG NORMALIZER ---------------- */

function normalize(str = "") {
  return str
    .toLowerCase()
    .replace(/\[.*?\]|\(.*?\)/g, "") // remove brackets/years
    .replace(/[^a-z0-9]/g, "") // remove everything else
    .trim();
}

/* ---------------- MOVIE STREAM FIX ---------------- */

async function findMovieStream(title, year, config) {
  const data = await xtreamRequest(config, "get_vod_streams");

  if (!Array.isArray(data)) return null;

  const target = normalize(title);

  // stronger match (fixes 90% of IPTV mismatches)
  const match = data.find((item) => {
    const name = normalize(item.name || "");
    return (
      name === target ||
      name.includes(target) ||
      target.includes(name)
    );
  });

  if (!match) {
    console.log("❌ No VOD match for:", title);
    return null;
  }

  const base = getBase(config);
  const auth = getAuth(config);

  return {
    url: `${base}/movie/${auth.username}/${auth.password}/${match.stream_id}.mp4`,
    title: match.name,
  };
}

/* ---------------- SERIES STREAM FIX ---------------- */

async function findSeriesStream(title, config) {
  let data = await xtreamRequest(config, "get_series");

  if (!Array.isArray(data) || data.length === 0) {
    console.log("⚠️ get_series empty, retrying fallback");

    // fallback attempt (some servers behave differently)
    data = await xtreamRequest(config, "get_series_categories");

    if (!Array.isArray(data)) return null;
  }

  const target = normalize(title);

  const match = data.find((item) => {
    const name = normalize(item.name || "");
    return (
      name === target ||
      name.includes(target) ||
      target.includes(name)
    );
  });

  if (!match) {
    console.log("❌ No SERIES match for:", title);
    return null;
  }

  const episodes = await xtreamRequest(config, "get_series_info", {
    series_id: match.series_id,
  });

  if (!episodes?.episodes) {
    console.log("❌ No episodes found for series:", title);
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
    console.log("❌ No playable episode for:", title);
    return null;
  }

  const base = getBase(config);
  const auth = getAuth(config);

  return {
    url: `${base}/series/${auth.username}/${auth.password}/${firstEpisode.id}.mp4`,
    title: match.name,
  };
}

/* ---------------- EXPORTS ---------------- */

module.exports = {
  findMovieStream,
  findSeriesStream,
};
