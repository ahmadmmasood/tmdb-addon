require("dotenv").config();
const { getTmdbClient } = require("../utils/getTmdbClient");
const Utils = require("../utils/parseProps");
const { getEpisodes } = require("./getEpisodes");
const { getLogo, getTvLogo } = require("./getLogo");
const { getImdbRating } = require("./getImdbRating");
const { getCachedAgeRating } = require("./getAgeRating");
const { checkSeasonsAndReport } = require("../utils/checkSeasons");
const { ramMetaCache, ramImdbCache } = require("./getCache");

const blacklistLogoUrls = [
  "https://assets.fanart.tv/fanart/tv/0/hdtvlogo/-60a02798b7eea.png"
];

/**
 * 🔧 CRITICAL FIX:
 * UHF sends "tmdb:12345"
 * TMDB expects "12345"
 */
const normalizeTmdbId = (id) => {
  if (!id) return id;
  return id.startsWith("tmdb:") ? id.replace("tmdb:", "") : id;
};

const extractAgeRating = (res, type, language) => {
  const countryCode = language.split('-')[1]?.toUpperCase();
  if (type === 'movie' && res.release_dates && res.release_dates.results) {
    let countryRelease = res.release_dates.results.find(r => r.iso_3166_1 === countryCode);
    if (!countryRelease && countryCode !== 'US') {
      countryRelease = res.release_dates.results.find(r => r.iso_3166_1 === 'US');
    }
    if (countryRelease && Array.isArray(countryRelease.release_dates)) {
      let ratingObj = countryRelease.release_dates.find(d => d.certification && d.type === 3);
      if (!ratingObj) {
        ratingObj = countryRelease.release_dates.find(d => d.certification);
      }
      return ratingObj ? ratingObj.certification : null;
    }
  } else if (type === 'series' && res.content_ratings && res.content_ratings.results) {
    let ratingObj = res.content_ratings.results.find(r => r.iso_3166_1 === countryCode);
    if (!ratingObj && countryCode !== 'US') {
      ratingObj = res.content_ratings.results.find(r => r.iso_3166_1 === 'US');
    }
    return ratingObj ? ratingObj.rating : null;
  }
  return null;
};

const normalizeConfig = (config) => {
  const {
    rpdbkey,
    rpdbMediaTypes = null,
    topposterskey,
    toppostersConfig = null,
    castCount,
    hideEpisodeThumbnails,
  } = config;

  return {
    rpdbkey,
    rpdbMediaTypes,
    topposterskey,
    toppostersConfig,
    castCount,
    hideEpisodeThumbnails,
    enableAgeRating: config.enableAgeRating === true || config.enableAgeRating === "true",
    showAgeRatingInGenres: config.showAgeRatingInGenres !== false && config.showAgeRatingInGenres !== "false",
    showAgeRatingWithImdbRating: config.showAgeRatingWithImdbRating === true || config.showAgeRatingWithImdbRating === "true",
    returnImdbId: config.returnImdbId === true || config.returnImdbId === "true",
    hideInCinemaTag: config.hideInCinemaTag === true || config.hideInCinemaTag === "true",
  };
};

async function fetchMovieData(moviedb, tmdbId, language) {
  try {
    return await moviedb.movieInfo({
      id: tmdbId,
      language,
      append_to_response: "videos,credits,external_ids,release_dates"
    });
  } catch (e) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
}

async function fetchTvData(moviedb, tmdbId, language) {
  try {
    return await moviedb.tvInfo({
      id: tmdbId,
      language,
      append_to_response: "videos,credits,external_ids,content_ratings"
    });
  } catch (e) {
    if (e?.response?.status === 404) return null;
    throw e;
  }
}

async function getMeta(type, language, tmdbId, config = {}) {

  console.log("================================");
  console.log("GETMETA CALLED");
  console.log("TYPE:", type);
  console.log("LANGUAGE:", language);
  console.log("TMDBID RAW:", tmdbId);
  console.log("================================");

  const cleanId = normalizeTmdbId(tmdbId);

  console.log("TMDBID CLEAN:", cleanId);

  const cacheKey = `${type}-${language}-${cleanId}`;

  if (ramMetaCache) {
    const cached = await ramMetaCache.get(cacheKey);
    if (cached) {
      console.log("META CACHE HIT:", cleanId);
      return { meta: cached };
    }
  }

  if (cleanId === "no-content" || cleanId === "0") {
    return {
      meta: {
        id: "tmdb:no-content",
        type,
        name: "No Content Available",
        description: "No content found",
        genres: ["No Results"]
      }
    };
  }

  const moviedb = getTmdbClient(config);

  console.log("FETCHING TMDB DATA FOR:", cleanId);

  const tmdbRes =
    type === "movie"
      ? await fetchMovieData(moviedb, cleanId, language)
      : await fetchTvData(moviedb, cleanId, language);

  if (!tmdbRes) {
    console.error("TMDB NOT FOUND:", cleanId);
    return { meta: {} };
  }

  const meta = type === "movie"
    ? {
        id: `tmdb:${cleanId}`,
        type,
        name: tmdbRes.title,
        description: tmdbRes.overview,
        poster: tmdbRes.poster_path
          ? `https://image.tmdb.org/t/p/w500${tmdbRes.poster_path}`
          : null,
        background: tmdbRes.backdrop_path
          ? `https://image.tmdb.org/t/p/original${tmdbRes.backdrop_path}`
          : null,
        year: tmdbRes.release_date?.slice(0, 4)
      }
    : {
        id: `tmdb:${cleanId}`,
        type,
        name: tmdbRes.name,
        description: tmdbRes.overview,
        poster: tmdbRes.poster_path
          ? `https://image.tmdb.org/t/p/w500${tmdbRes.poster_path}`
          : null,
        background: tmdbRes.backdrop_path
          ? `https://image.tmdb.org/t/p/original${tmdbRes.backdrop_path}`
          : null,
        year: tmdbRes.first_air_date?.slice(0, 4)
      };

  console.log("META BUILT SUCCESSFULLY:", meta.name);

  if (ramMetaCache) {
    await ramMetaCache.set(cacheKey, meta);
  }

  return { meta };
}

module.exports = { getMeta };
