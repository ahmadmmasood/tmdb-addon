require("dotenv").config();
const { getTmdbClient } = require("../utils/getTmdbClient");
const { ramMetaCache } = require("./getCache");

// --------------------
// SAFE ID NORMALIZER (FIXES startsWith CRASH)
// --------------------
const normalizeId = (id) => {
    if (id === null || id === undefined) return null;

    // force string ALWAYS
    id = String(id);

    if (id.startsWith("tmdb:")) {
        return id.replace("tmdb:", "");
    }

    return id;
};

// --------------------
// SAFE NUMBER GUARD
// --------------------
const isValidId = (id) => {
    return id !== null && id !== undefined && id !== "" && !isNaN(Number(id));
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

    // 🔥 FIX: stop crashing early
    if (!isValidId(cleanId)) {
        console.error("INVALID TMDB ID:", cleanId);
        return { meta: {} };
    }

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
    // SAFE META OBJECT (UHF FRIENDLY)
    // --------------------
    const meta = {
        id: `tmdb:${cleanId}`,
        type,
        name: tmdbRes.title || tmdbRes.name,
        description: tmdbRes.overview || "",

        poster: tmdbRes.poster_path
            ? `https://image.tmdb.org/t/p/w500${tmdbRes.poster_path}`
            : "",

        background: tmdbRes.backdrop_path
            ? `https://image.tmdb.org/t/p/original${tmdbRes.backdrop_path}`
            : "",

        year: (tmdbRes.release_date || tmdbRes.first_air_date || "").slice(0, 4),

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

    // ---- cache ----
    if (ramMetaCache) {
        await ramMetaCache.set(cacheKey, meta);
    }

    return { meta };
}

module.exports = { getMeta };
