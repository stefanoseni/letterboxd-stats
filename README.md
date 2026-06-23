# letterboxd-stats

Free, open-source CLI tool that generates deeper stats from your [Letterboxd](https://letterboxd.com) watch history — most of which Letterboxd's own **Stats** feature hides behind a Pro/Patron subscription.

Everything runs locally on your machine. Your data never leaves your computer.

## What it shows

- Most watched directors & actors
- Favorite genre
- Total time spent watching movies
- Favorite director, based on **your own ratings**
- Least favorite director, based on **your own ratings**
- The month you watched the most movies (if you have a diary export)
- The decade you watch the most
- Longest & shortest movie you've watched
- Rewatch count (if you have a diary export)

## Sample output

```
🎬 Letterboxd Stats

Analyzed 112 movies

── Most watched directors ──
1. Christopher Nolan — 9 films
2. Quentin Tarantino — 7 films
3. Martin Scorsese — 6 films

── Time spent watching ──
14466 min (~241 hours, ~10.0 days)

── Favorite director (by your ratings) ──
Christopher Nolan — avg 4.22★ across 9 films

── Decade you watch the most ──
1. 2000s — 31 films
2. 2010s — 28 films
3. 1990s — 19 films
```

## Setup

1. **Clone this repo**
   ```bash
   git clone https://github.com/your-username/letterboxd-stats.git
   cd letterboxd-stats
   npm install
   ```

2. **Get a free TMDB API key**
   This is needed because Letterboxd's export doesn't include director/cast/runtime — sign up at [themoviedb.org](https://www.themoviedb.org/settings/api) and request a free Developer API key.

3. **Add your key**
   ```bash
   cp .env.example .env
   ```
   Then open `.env` and paste in your key.

4. **Export your Letterboxd data**
   On Letterboxd: **Settings → Import & Export → Export Your Data**. Unzip it and copy these files into the `data/` folder:
   - `watched.csv` (required)
   - `ratings.csv` (optional — enables favorite/least favorite director)
   - `diary.csv` (optional — enables best month & rewatch count)

5. **Run it**
   ```bash
   npm start
   ```

   The first run will be slower since every movie is looked up on TMDB. Results are cached in `data/cache.json` so future runs are instant.

## Tech

- Node.js (built-in `fetch`, no extra HTTP library)
- [PapaParse](https://www.papaparse.com/) for CSV parsing
- [TMDB API](https://developer.themoviedb.org/docs) for director/cast/runtime/genre data

## License

MIT — see [LICENSE](LICENSE).
