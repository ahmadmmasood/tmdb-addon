require("dotenv").config();
const { getTmdbClient } = require("../utils/getTmdbClient");
const { ramMetaCache } = require("./getCache");

// --------------------
// FIX: normalize ID
// --------------------
const normalizeId = (id) => {
    if (!id) return id;
    return id.startsWith("tmdb:") ? id.replace("tmdb:", "") : id;
};

// --------------------
// FETCH MOVIE
// --------------------
async function fetchMovie(moviedb, id, language) {
    try {
        return await moviedb.movieInfo({
            id,
            language,
            append_to_response: "videos,credits,external_ids"
        });
    } catch (e) {
        if (e?.response?.status === 404) return null;
        throw e;
    }
}

// --------------------
// FETCH TV
// --------------------
async function fetchTv(moviedb, id, language) {
    try {
        return await moviedb.tvInfo({
            id,
            language,
            append_to_response: "videos,credits,external_ids"
        });
    } catch (e) {
        if (e?.response?.status === 404) return null;
        throw e;
    }
}

// --------------------
// MAIN META FUNCTION
// --------------------
async function getMeta(type, language, tmdbId, config = {}) {

    console.log("GETMETA REQUEST:", { type, language, tmdbId });

    const cleanId = normalizeId(tmdbId);

    console.log("NORMALIZED ID:", cleanId);

    const cacheKey = `meta-${type}-${language}-${cleanId}`;

    // ---- cache ----
    if (ramMetaCache) {
        const cached = await ramMetaCache.get(cacheKey);
        if (cached) {
            console.log("META CACHE HIT:", cleanId);
            return { meta: cached };
        }
    }

    const moviedb = getTmdbClient(config);

    console.log("FETCHING TMDB:", { type, cleanId });

    const tmdbRes =
        type === "movie"
            ? await fetchMovie(moviedb, cleanId, language)
            : await fetchTv(moviedb, cleanId, language);

    if (!tmdbRes) {
        console.log("TMDB NOT FOUND:", cleanId);
        return { meta: {} };
    }

    // --------------------
    // UHF SAFE META OBJECT
    // --------------------
    const meta = {
        id: `tmdb:${cleanId}`,
        type,
        name: tmdbRes.title || tmdbRes.name,
        description: tmdbRes.overview || "",

        poster: tmdbRes.poster_path
            ? `https://image.tmdb.org/t/p/w500${tmdbRes.poster_path}`
            : null,

        background: tmdbRes.backdrop_path
            ? `https://image.tmdb.org/t/p/original${tmdbRes.backdrop_path}`
            : null,

        year:
            (tmdbRes.release_date || tmdbRes.first_air_date || "").slice(0, 4),

        posterShape: "regular",

        genres: (tmdbRes.genres || []).map(g => g.name),

        imdbRating: tmdbRes.vote_average
            ? tmdbRes.vote_average.toFixed(1)
            : "N/A",

        behaviorHints: {
            defaultVideoId: `tmdb:${cleanId}`
        }
    };

    console.log("META BUILT:", meta.name);

    // ---- cache result ----
    if (ramMetaCache) {
        await ramMetaCache.set(cacheKey, meta);
    }

    return { meta };
}

module.exports = { getMeta };
