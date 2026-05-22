require("dotenv").config();

const axios = require("axios");
const cheerio = require("cheerio");
const { addonBuilder, serveHTTP } = require("stremio-addon-sdk");

/*
========================================
CONFIG (from .env)
========================================
*/

const PORT = process.env.PORT || 7000;

const DRIVES = (process.env.DRIVES || "")
    .split(",")
    .map((u) => u.trim())
    .filter((u) => u.length > 0);

if (DRIVES.length === 0) {
    console.error("ERROR: No DRIVES found in .env");
    process.exit(1);
}

console.log("Drives loaded:", DRIVES);

/*
========================================
CACHE
========================================
*/

let MOVIES_CACHE = [];
let SERIES_CACHE = [];

/*
========================================
MANIFEST
========================================
*/

const builder = new addonBuilder({

    id: "community.rclone.ec2",

    version: "4.0.0",

    name: "EC2 Rclone Streams",

    description: "Movies & TV Shows from rclone",

    resources: ["catalog", "meta", "stream"],

    types: ["movie", "series"],

    catalogs: [
        { type: "movie", id: "rclone-movies", name: "Rclone Movies" },
        { type: "series", id: "rclone-series", name: "Rclone TV Shows" }
    ]
});

/*
========================================
HELPERS
========================================
*/

function cleanName(name) {
    return decodeURIComponent(name)
        .replace(/\.(mkv|mp4|avi)$/i, "")
        .replace(/\./g, " ")
        .trim();
}

function poster(title) {
    return (
        "https://dummyimage.com/300x450/000/fff.jpg&text=" +
        encodeURIComponent(title)
    );
}

function buildUrl(base, path) {
    return (base + "/" + path)
        .replace(/\/+/g, "/")
        .replace("http:/", "http://");
}

function isVideoFile(name) {
    return (
        name.endsWith(".mkv") ||
        name.endsWith(".mp4") ||
        name.endsWith(".avi")
    );
}

/* ─── PARSE TECH SPECS FROM FILENAME ─── */

function parseTechSpecs(filename) {
    const text = decodeURIComponent(filename).replace(/\.(mkv|mp4|avi)$/i, "");

    const sourceMatch = text.match(/\b(BluRay\s*REMUX|BluRay|WEB-DL|WEBRip|HDRip|DVDRip|HDTV|UHD)\b/i);
    const source = sourceMatch ? sourceMatch[1].replace(/\s+/g, " ").trim() : null;

    const codecMatch = text.match(/\b(HEVC|x265|x264|AVC|H\.?265|H\.?264)\b/i);
    let codec = codecMatch ? codecMatch[1] : null;
    if (codec && /H\.?265/i.test(codec)) codec = "HEVC";
    if (codec && /H\.?264/i.test(codec)) codec = "AVC";

    const hdr = [];
    if (/\bHDR10\b/i.test(text)) hdr.push("HDR10");
    else if (/\bHDR\b/i.test(text)) hdr.push("HDR");
    if (/\bDV\b/i.test(text) || /\bDolby\s*Vision\b/i.test(text)) hdr.push("DV");

    const audio = [];
    if (/\bAtmos\b/i.test(text)) audio.push("Atmos");
    if (/\bTrueHD\b/i.test(text)) audio.push("TrueHD");
    if (/\bDD\+?\s*5\.1\b/i.test(text) || /\bDD\b/i.test(text) || /\bAC3\b/i.test(text)) audio.push("DD");
    if (/\bDTS\b/i.test(text)) audio.push("DTS");

    let languages = [];
    const bracketMatch = text.match(/\[(.*?)\]/);
    if (bracketMatch) {
        languages = bracketMatch[1]
            .split(/[\+|\-]/)
            .map((l) => l.trim())
            .filter((l) => l.length > 0);
    }

    return { source, codec, hdr, audio, languages, raw: text };
}

/* ─── BUILD RICH STREAM TITLE ─── */

function buildStreamTitle(specs, size) {
    const lines = [];

    const tech = [specs.source, specs.codec].filter(Boolean).join(" | ");
    if (tech) lines.push(`🎬 ${tech}`);

    const av = [...specs.hdr, ...specs.audio].filter(Boolean).join(" | ");
    if (av) lines.push(`🎧 ${av}`);

    if (size) lines.push(`💾 ${size}`);

    if (specs.languages.length) lines.push(`🗣️ ${specs.languages.join(" | ")}`);

    lines.push(`📁 ${specs.raw}`);

    return lines.join("\n");
}

/*
========================================
MOVIES SCRAPER
========================================
*/

async function scrapeMovies(url, depth, driveIdx) {

    if (!url)       url = DRIVES[driveIdx] + "/movies/";
    if (!depth)     depth = 0;
    if (!driveIdx)  driveIdx = 0;

    if (depth > 3) return;

    try {

        console.log("MOVIES:", url);

        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const links = [];
        const sizes = {};

        $("a").each(function (i, el) {
            const href = $(el).attr("href");
            if (
                href &&
                href !== "../" &&
                href !== "/" &&
                !href.startsWith("?") &&
                !href.startsWith("#") &&
                !href.includes("../../")
            ) {
                links.push(href);

                const row = $(el).closest("tr");
                if (row.length) {
                    const tds = row.find("td");
                    if (tds.length >= 2) {
                        const sizeText = $(tds[tds.length - 1]).text().trim();
                        if (sizeText && !sizeText.includes(href)) {
                            sizes[href] = sizeText;
                        }
                    }
                }
            }
        });

        for (const href of links) {

            const fullUrl = buildUrl(url, href);

            if (href.endsWith("/")) {
                await scrapeMovies(fullUrl, depth + 1, driveIdx);
                continue;
            }

            if (!isVideoFile(href)) continue;

            const title = cleanName(href);
            const specs = parseTechSpecs(href);
            const size = sizes[href] || null;

            MOVIES_CACHE.push({
                id: driveIdx + "_" + title,
                type: "movie",
                name: title,
                poster: poster(title),
                background: poster(title),
                description: "Movie streamed from EC2",
                url: fullUrl,
                _specs: specs,
                _size: size
            });
        }

    } catch (err) {
        console.log("MOVIE ERROR:", err.message);
    }
}

/*
========================================
TV SCRAPER
========================================
*/

async function scrapeTVShows(tvsUrl, driveIdx) {

    if (!tvsUrl)  tvsUrl = DRIVES[driveIdx] + "/tvs/";
    if (!driveIdx) driveIdx = 0;

    try {

        console.log("Scanning TV Shows...", tvsUrl);

        const response = await axios.get(tvsUrl);
        const $ = cheerio.load(response.data);
        const shows = [];

        $("a").each(function (i, el) {
            const href = $(el).attr("href");
            if (
                href &&
                href.endsWith("/") &&
                href !== "../"
            ) {
                shows.push(href);
            }
        });

        for (const showFolder of shows) {

            const showName = decodeURIComponent(showFolder)
                .replace("/", "")
                .trim();

            const showUrl = buildUrl(tvsUrl, showFolder);
            const videos = [];

            await scanShowEpisodes(showUrl, showName, videos, 0, 1, driveIdx);

            if (videos.length === 0) continue;

            SERIES_CACHE.push({
                id: driveIdx + "_" + showName,
                type: "series",
                name: showName,
                poster: poster(showName),
                background: poster(showName),
                description: "TV Show streamed from EC2",
                videos: videos
            });
        }

    } catch (err) {
        console.log("TV ERROR:", err.message);
    }
}

/*
========================================
SCAN EPISODES  ←  FIXED HERE
========================================
*/

async function scanShowEpisodes(url, showName, videos, depth, currentSeason, driveIdx) {

    if (!depth)        depth = 0;
    if (!currentSeason) currentSeason = 1;
    if (!driveIdx)     driveIdx = 0;

    if (depth > 5) return;

    try {

        console.log("TV:", url);

        const response = await axios.get(url);
        const $ = cheerio.load(response.data);
        const links = [];
        const sizes = {};

        $("a").each(function (i, el) {
            const href = $(el).attr("href");
            if (
                href &&
                href !== "../" &&
                href !== "/" &&
                !href.includes("../../")
            ) {
                links.push(href);

                /* ─── grab file size from directory listing ─── */
                const row = $(el).closest("tr");
                if (row.length) {
                    const tds = row.find("td");
                    if (tds.length >= 2) {
                        const sizeText = $(tds[tds.length - 1]).text().trim();
                        if (sizeText && !sizeText.includes(href)) {
                            sizes[href] = sizeText;
                        }
                    }
                }
            }
        });

        let episodeCounter = 1;

        for (const href of links) {

            const fullUrl = buildUrl(url, href);

            if (href.endsWith("/")) {

                let detectedSeason = currentSeason;

                const seasonMatch = href.match(/s(?:eason)?\s?(\d+)/i);
                if (seasonMatch) {
                    detectedSeason = parseInt(seasonMatch[1]);
                }

                await scanShowEpisodes(
                    fullUrl,
                    showName,
                    videos,
                    depth + 1,
                    detectedSeason,
                    driveIdx
                );

                continue;
            }

            if (!isVideoFile(href)) continue;

            let season = currentSeason;
            let episode = episodeCounter;

            const match = href.match(/S(\d+)E(\d+)/i);
            if (match) {
                season = parseInt(match[1]);
                episode = parseInt(match[2]);
            }

            /* ─── parse tech specs & size for this episode ─── */
            const specs = parseTechSpecs(href);
            const size = sizes[href] || null;

            videos.push({
                id:
                    driveIdx + "_" + showName + ":" + season + ":" + episode,

                title:
                    "S" +
                    String(season).padStart(2, "0") +
                    "E" +
                    String(episode).padStart(2, "0"),

                season: season,
                episode: episode,
                released: new Date().toISOString(),
                url: fullUrl,

                _specs: specs,
                _size: size
            });

            episodeCounter++;
        }

    } catch (err) {
        console.log("EPISODE ERROR:", err.message);
    }
}

/*
========================================
LOAD LIBRARY
========================================
*/

async function loadLibrary() {

    MOVIES_CACHE = [];
    SERIES_CACHE = [];

    console.log("Loading library...");

    for (let i = 0; i < DRIVES.length; i++) {
        await scrapeMovies(DRIVES[i] + "/movies/", 0, i);
        await scrapeTVShows(DRIVES[i] + "/tvs/", i);
    }

    console.log("Movies:", MOVIES_CACHE.length);
    console.log("Series:", SERIES_CACHE.length);
}

/*
========================================
CATALOG HANDLER
========================================
*/

builder.defineCatalogHandler(async function (args) {

    if (
        MOVIES_CACHE.length === 0 &&
        SERIES_CACHE.length === 0
    ) {
        await loadLibrary();
    }

    if (args.type === "movie" && args.id === "rclone-movies") {
        return { metas: MOVIES_CACHE };
    }

    if (args.type === "series" && args.id === "rclone-series") {
        return { metas: SERIES_CACHE };
    }

    return { metas: [] };
});

/*
========================================
META HANDLER
========================================
*/

builder.defineMetaHandler(async function (args) {

    if (args.type === "movie") {
        const movie = MOVIES_CACHE.find(function (m) {
            return m.id === args.id;
        });
        return { meta: movie || null };
    }

    if (args.type === "series") {
        const series = SERIES_CACHE.find(function (s) {
            return s.id === args.id;
        });
        return { meta: series || null };
    }

    return { meta: null };
});

/*
========================================
STREAM HANDLER  ←  FIXED HERE
========================================
*/

builder.defineStreamHandler(async function (args) {

    if (args.type === "movie") {
        const movie = MOVIES_CACHE.find(function (m) {
            return m.id === args.id;
        });

        if (!movie) return { streams: [] };

        return {
            streams: [
                {
                    name: "☁️ EC2 Movie",
                    title: buildStreamTitle(movie._specs, movie._size),
                    url: movie.url
                }
            ]
        };
    }

    if (args.type === "series") {
        for (const show of SERIES_CACHE) {
            const video = show.videos.find(function (v) {
                return v.id === args.id;
            });

            if (video) {
                return {
                    streams: [
                        {
                            name: "☁️ EC2 Movie",
                            title: buildStreamTitle(video._specs, video._size),
                            url: video.url
                        }
                    ]
                };
            }
        }
    }

    return { streams: [] };
});

/*
========================================
START SERVER
========================================
*/

serveHTTP(builder.getInterface(), {
    port: PORT,
    host: "0.0.0.0"
});

console.log(
    "Addon Running:\n" +
    "http://yourEC2InstancePort(useElasticIP):" +
    PORT +
    "/manifest.json"
);

/*
========================================
INITIAL LOAD + AUTO REFRESH
========================================
*/

loadLibrary();

setInterval(loadLibrary, 1000 * 60 * 10);
