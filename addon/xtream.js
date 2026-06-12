const axios = require("axios");

function getBase(config) {
  return (
    config.xtreamUrl ||
    process.env.XTREAM_URL
  );
}

function getAuth(config) {
  return {
    username: config.xtreamUser || process.env.XTREAM_USER,
    password: config.xtreamPass || process.env.XTREAM_PASS
  };
}

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
      ...extra
    },
    timeout: 15000
  });

  return res.data;
}

/* ---------------- MOVIE SEARCH ---------------- */
async function findMovieStream(title, year, config) {
  const data = await xtreamRequest(config, "get_vod_streams");

  if (!Array.isArray(data)) return null;

  const cleanTitle = title.toLowerCase();

  const match = data.find((item) => {
    const name = (item.name || "").toLowerCase();
    return name.includes(cleanTitle);
  });

  if (!match) return null;

  const base = getBase(config);
  const auth = getAuth(config);

  return {
    url: `${base}/movie/${auth.username}/${auth.password}/${match.stream_id}.mp4`,
    title: match.name
  };
}

/* ---------------- SERIES EPISODE ---------------- */
async function findSeriesStream(title, config) {
  const data = await xtreamRequest(config, "get_series");

  if (!Array.isArray(data)) return null;

  const cleanTitle = title.toLowerCase();

  const match = data.find((item) =>
    (item.name || "").toLowerCase().includes(cleanTitle)
  );

  if (!match) return null;

  const episodes = await xtreamRequest(config, "get_series_info", {
    series_id: match.series_id
  });

  const firstEpisode =
    episodes?.episodes &&
    Object.values(episodes.episodes)[0]?.[0];

  if (!firstEpisode) return null;

  const base = getBase(config);
  const auth = getAuth(config);

  return {
    url: `${base}/series/${auth.username}/${auth.password}/${firstEpisode.id}.mp4`,
    title: match.name
  };
}

module.exports = {
  findMovieStream,
  findSeriesStream
};
