require('dotenv').config();

const { getTmdbClient } = require("../utils/getTmdbClient");

// Fanart removed to prevent startup crash
// Fanart.tv was causing missing API key failures

const TARGET_ASPECT_RATIO = 4.0;

function pickLogo(logos, language, originalLanguage) {
  const fullLang = language;
  const baseLang = language.split("-")[0];

  const sortedLogos = logos
    .map(logo => {
      let score = 0;

      const logoLang = logo.lang;

      if (logoLang === fullLang) score = 4;
      else if (logoLang?.startsWith(baseLang + "-")) score = 3;
      else if (logoLang === baseLang) score = 2;
      else if (logoLang === "en") score = 1;
      else if (logoLang === originalLanguage) score = 0.5;

      let aspectRatioDiff = 999;

      if (logo.source === "tmdb" && logo.aspect_ratio) {
        aspectRatioDiff = Math.abs(logo.aspect_ratio - TARGET_ASPECT_RATIO);
      }

      return {
        ...logo,
        score,
        tmdbVotes: logo.tmdbVotes || 0,
        aspectRatioDiff
      };
    })
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;

      if (a.aspectRatioDiff !== b.aspectRatioDiff) {
        return a.aspectRatioDiff - b.aspectRatioDiff;
      }

      return (b.tmdbVotes || 0) - (a.tmdbVotes || 0);
    });

  return sortedLogos[0];
}

async function getLogo(tmdbId, language, originalLanguage, config = {}) {
  try {
    if (!tmdbId) return "";

    const moviedb = getTmdbClient(config);

    const tmdbRes = await moviedb
      .movieImages({ id: tmdbId })
      .then(res => res.logos || [])
      .catch(() => []);

    const tmdbLogos = tmdbRes.map(l => ({
      url: `https://image.tmdb.org/t/p/original${l.file_path}`,
      lang: `${l.iso_639_1 || "en"}-${l.iso_3166_1 || ""}`,
      tmdbVotes: l.vote_average || 0,
      source: "tmdb"
    }));

    const combined = [...tmdbLogos];

    if (!combined.length) return "";

    const picked = pickLogo(combined, language, originalLanguage);

    return picked?.url || "";
  } catch (error) {
    console.error(`getLogo error for movie ${tmdbId}:`, error.message);
    return "";
  }
}

async function getTvLogo(tvdb_id, tmdbId, language, originalLanguage, config = {}) {
  try {
    if (!tvdb_id && !tmdbId) return "";

    const moviedb = getTmdbClient(config);

    const tmdbRes = tmdbId
      ? await moviedb.tvImages({ id: tmdbId }).then(res => res.logos || []).catch(() => [])
      : [];

    const tmdbLogos = tmdbRes.map(l => ({
      url: `https://image.tmdb.org/t/p/original${l.file_path}`,
      lang: `${l.iso_639_1 || "en"}-${l.iso_3166_1 || ""}`,
      tmdbVotes: l.vote_average || 0,
      source: "tmdb"
    }));

    const combined = [...tmdbLogos];

    if (!combined.length) return "";

    const picked = pickLogo(combined, language, originalLanguage);

    return picked?.url || "";
  } catch (error) {
    console.error(`getTvLogo error for series ${tmdbId}:`, error.message);
    return "";
  }
}

module.exports = { getLogo, getTvLogo };
