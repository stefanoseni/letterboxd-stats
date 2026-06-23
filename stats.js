import fs from "fs";
import path from "path";
import Papa from "papaparse";
import "dotenv/config";

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_PATH = path.join(DATA_DIR, "cache.json");
const MIN_FILMS_FOR_FAVORITE_DIRECTOR = 2;

if (!TMDB_API_KEY) {
  console.error(
    "Missing TMDB_API_KEY. Copy .env.example to .env and add your free TMDB key."
  );
  process.exit(1);
}

// ---------- CSV loading ----------

function loadCSV(filename) {
  const filePath = path.join(DATA_DIR, filename);
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  const { data } = Papa.parse(raw, { header: true, skipEmptyLines: true });
  return data;
}

// ---------- TMDB enrichment (with local caching) ----------

function loadCache() {
  if (!fs.existsSync(CACHE_PATH)) return {};
  return JSON.parse(fs.readFileSync(CACHE_PATH, "utf8"));
}

function saveCache(cache) {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

async function fetchMovieData(title, year, cache) {
  const cacheKey = `${title}__${year}`;
  if (cache[cacheKey]) return cache[cacheKey];

  try {
    const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(
      title
    )}&year=${year}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.success === false) {
      throw new Error(searchData.status_message || "TMDB API request failed");
    }

    const match = searchData.results?.[0];
    if (!match) {
      cache[cacheKey] = null;
      return null;
    }

    const detailsUrl = `https://api.themoviedb.org/3/movie/${match.id}?api_key=${TMDB_API_KEY}&append_to_response=credits`;
    const detailsRes = await fetch(detailsUrl);
    const details = await detailsRes.json();

    const director = details.credits?.crew?.find((c) => c.job === "Director");
    const topCast = (details.credits?.cast || []).slice(0, 5).map((c) => c.name);

    const result = {
      director: director ? director.name : null,
      cast: topCast,
      runtime: details.runtime || null,
      genres: (details.genres || []).map((g) => g.name),
    };

    cache[cacheKey] = result;
    return result;
  } catch (err) {
    console.warn(`Could not fetch data for "${title}" (${year}): ${err.message}`);
    return null;
  }
}

async function enrichMovies(movies) {
  const cache = loadCache();
  const enriched = [];
  let matched = 0;

  for (const movie of movies) {
    const data = await fetchMovieData(movie.Name, movie.Year, cache);
    if (data && data.director) matched++;
    enriched.push({ ...movie, ...data });
  }

  saveCache(cache);

  if (matched === 0 && movies.length > 0) {
    console.error(
      "\n⚠️  None of your movies matched on TMDB — this almost always means TMDB_API_KEY in .env is missing, invalid, or has extra spaces/newlines.\n" +
        "   Double-check the key at https://www.themoviedb.org/settings/api and that .env has no quotes or trailing characters.\n"
    );
  } else if (matched < movies.length) {
    console.log(`(${matched}/${movies.length} movies matched on TMDB)\n`);
  }

  return enriched;
}

// ---------- Stat helpers ----------

function countBy(items, getKey) {
  const counts = {};
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

function topN(countedEntries, n = 5) {
  return countedEntries.slice(0, n);
}

function averageRatingByDirector(ratedMovies) {
  const byDirector = {};
  for (const movie of ratedMovies) {
    if (!movie.director || !movie.Rating) continue;
    if (!byDirector[movie.director]) byDirector[movie.director] = [];
    byDirector[movie.director].push(parseFloat(movie.Rating));
  }

  return Object.entries(byDirector)
    .filter(([, ratings]) => ratings.length >= MIN_FILMS_FOR_FAVORITE_DIRECTOR)
    .map(([director, ratings]) => ({
      director,
      avg: ratings.reduce((a, b) => a + b, 0) / ratings.length,
      count: ratings.length,
    }))
    .sort((a, b) => b.avg - a.avg);
}

function formatHours(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const days = (totalMinutes / 60 / 24).toFixed(1);
  return `${totalMinutes} min (~${hours} hours, ~${days} days)`;
}

// ---------- Main ----------

async function main() {
  const watched = loadCSV("watched.csv");
  const diary = loadCSV("diary.csv");
  const ratings = loadCSV("ratings.csv");

  if (!watched) {
    console.error("data/watched.csv not found. Export your data from Letterboxd and add it to /data.");
    process.exit(1);
  }

  console.log(`\nEnriching ${watched.length} movies with TMDB data (this may take a moment)...\n`);
  const enriched = await enrichMovies(watched);

  // Join ratings onto enriched movies via Letterboxd URI
  let ratedEnriched = [];
  if (ratings) {
    const ratingByUri = {};
    for (const r of ratings) ratingByUri[r["Letterboxd URI"]] = r.Rating;
    ratedEnriched = enriched
      .filter((m) => ratingByUri[m["Letterboxd URI"]])
      .map((m) => ({ ...m, Rating: ratingByUri[m["Letterboxd URI"]] }));
  }

  const lines = [];
  const log = (text) => {
    console.log(text);
    lines.push(text);
  };

  log("🎬 Letterboxd Stats\n");
  log(`Analyzed ${watched.length} movies`);

  // 1. Most watched director
  const directorCounts = countBy(enriched, (m) => m.director);
  log("\n── Most watched directors ──");
  topN(directorCounts).forEach(([name, count], i) => log(`${i + 1}. ${name} — ${count} films`));

  // 2. Favorite genre
  const genreCounts = countBy(
    enriched.flatMap((m) => (m.genres || []).map((g) => ({ genre: g }))),
    (g) => g.genre
  );
  log("\n── Favorite genres ──");
  topN(genreCounts).forEach(([genre, count], i) => log(`${i + 1}. ${genre} — ${count} films`));

  // 3. Time spent watching
  const totalMinutes = enriched.reduce((sum, m) => sum + (m.runtime || 0), 0);
  log("\n── Time spent watching ──");
  log(formatHours(totalMinutes));

  // 4. Most watched actors
  const actorCounts = countBy(
    enriched.flatMap((m) => (m.cast || []).map((a) => ({ actor: a }))),
    (a) => a.actor
  );
  log("\n── Most watched actors ──");
  topN(actorCounts).forEach(([name, count], i) => log(`${i + 1}. ${name} — ${count} films`));

  // 5 & 7. Favorite / least favorite director by rating
  if (ratedEnriched.length > 0) {
    const directorRatings = averageRatingByDirector(ratedEnriched);
    if (directorRatings.length > 0) {
      const favorite = directorRatings[0];
      const least = directorRatings[directorRatings.length - 1];
      log("\n── Favorite director (by your ratings) ──");
      log(`${favorite.director} — avg ${favorite.avg.toFixed(2)}★ across ${favorite.count} films`);
      log("\n── Least favorite director (by your ratings) ──");
      log(`${least.director} — avg ${least.avg.toFixed(2)}★ across ${least.count} films`);
    }
  } else {
    log("\n(Add ratings.csv to data/ to see favorite/least favorite director by rating)");
  }

  // 6. Best month (diary required)
  if (diary) {
    const monthCounts = countBy(diary, (d) => {
      if (!d["Watched Date"]) return null;
      return d["Watched Date"].slice(0, 7); // YYYY-MM
    });
    if (monthCounts.length > 0) {
      const [bestMonth, count] = monthCounts[0];
      log("\n── Month you watched the most movies ──");
      log(`${bestMonth} — ${count} movies`);
    }

    // 10. Rewatch count
    const rewatchCount = diary.filter((d) => d.Rewatch === "Yes").length;
    log("\n── Rewatches ──");
    log(`${rewatchCount} of your logged movies were rewatches`);
  } else {
    log("\n(Add diary.csv to data/ to see your best month and rewatch count)");
  }

  // 8. Decade you watch most
  const decadeCounts = countBy(watched, (m) => {
    const year = parseInt(m.Year, 10);
    if (!year) return null;
    return `${Math.floor(year / 10) * 10}s`;
  });
  log("\n── Decade you watch the most ──");
  topN(decadeCounts, 3).forEach(([decade, count], i) => log(`${i + 1}. ${decade} — ${count} films`));

  // 9. Longest & shortest movie
  const withRuntime = enriched.filter((m) => m.runtime);
  if (withRuntime.length > 0) {
    const longest = withRuntime.reduce((a, b) => (a.runtime > b.runtime ? a : b));
    const shortest = withRuntime.reduce((a, b) => (a.runtime < b.runtime ? a : b));
    log("\n── Longest & shortest movie ──");
    log(`Longest: ${longest.Name} (${longest.runtime} min)`);
    log(`Shortest: ${shortest.Name} (${shortest.runtime} min)`);
  }

  const reportPath = path.join(process.cwd(), "stats-report.md");
  fs.writeFileSync(reportPath, lines.join("\n"));
  console.log(`\n✓ Full report saved to stats-report.md\n`);
}

main();
