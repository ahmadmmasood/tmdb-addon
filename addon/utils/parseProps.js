const urlExists = require("url-exists");
const { decompressFromEncodedURIComponent } = require("lz-string");
const { get } = require("http");

/* ---------------- CERTIFICATION ---------------- */
function parseCertification(release_dates, language) {
  try {
    return release_dates.results
      .filter(
        (r) => r.iso_3166_1 === language.split("-")[1]
      )[0]
      ?.release_dates?.[0]?.certification || "";
  } catch {
    return "";
  }
}

/* ---------------- CAST ---------------- */
function parseCast(credits, count) {
  const list = credits?.cast || [];
  const sliced = count ? list.slice(0, count) : list;

  return sliced.map((el) => ({
    name: el.name,
    character: el.character,
    photo: el.profile_path
      ? `https://image.tmdb.org/t/p/w276_and_h350_face${el.profile_path}`
      : null,
  }));
}

/* ---------------- CREW ---------------- */
function parseDirector(credits) {
  return (credits?.crew || [])
    .filter((x) => x.job === "Director")
    .map((el) => el.name);
}

function parseWriter(credits) {
  return (credits?.crew || [])
    .filter((x) => x.job === "Writer")
    .map((el) => el.name);
}

/* ---------------- MEDIA PARSER (FIXED) ---------------- */
function parseMedia(el, type, genreList = []) {
  const genreMap = new Map();

  if (Array.isArray(genreList)) {
    for (const g of genreList) {
      if (g?.id && g?.name) {
        genreMap.set(g.id, g.name);
      }
    }
  }

  const genres = Array.isArray(el.genre_ids)
    ? el.genre_ids
        .map((id) => genreMap.get(id))
        .filter(Boolean)
    : [];

  return {
    id: `tmdb:${el.id}`,
    name: type === "movie" ? el.title : el.name,

    genre: genres.length ? genres : ["Unknown"],

    poster: el.poster_path
      ? `https://image.tmdb.org/t/p/w500${el.poster_path}`
      : "",

    background: el.backdrop_path
      ? `https://image.tmdb.org/t/p/original${el.backdrop_path}`
      : "",

    posterShape: "regular",

    imdbRating: el.vote_average
      ? el.vote_average.toFixed(1)
      : "N/A",

    year:
      type === "movie"
        ? el.release_date?.substring(0, 4) || ""
        : el.first_air_date?.substring(0, 4) || "",

    type: type === "movie" ? "movie" : "series",

    description: el.overview || "",
  };
}

/* ---------------- CONFIG ---------------- */
function parseConfig(catalogChoices) {
  let config = {};

  if (!catalogChoices) return config;

  try {
    const decoded = decompressFromEncodedURIComponent(catalogChoices);
    config = JSON.parse(decoded);
  } catch {
    try {
      config = JSON.parse(catalogChoices);
    } catch {
      config.language = catalogChoices;
    }
  }

  return config;
}

module.exports = {
  parseCertification,
  parseCast,
  parseDirector,
  parseWriter,
  parseMedia,
  parseConfig,
};
