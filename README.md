# Scraper Backend (Puppeteer + Express + Mongoose)

A Dockerized Node/Express backend that scrapes Netflix Tudum Top 10 with Puppeteer and persists data to MongoDB via Mongoose. It also exposes IMDb API passthrough and simple persistence endpoints.

## Project layout

- backend/
  - Dockerfile: Chrome-enabled build for Puppeteer in containers
  - package.json: scripts and dependencies
  - src/
    - server.ts: Express app, Mongo connect, routes
    - db.ts: Mongoose connection helper
    - clients/
      - imdbapi.ts: Lightweight client to api.imdbapi.dev
    - models/
      - imdb.ts: Saved IMDb title documents
      - netflix.ts: Netflix Top 10 snapshots
    - scrapers/
      - netflixTop10.ts: Tudum Top 10 scraper (filters, normalization)
  - sample/
    - tudum-top-10-global*.html: Example HTML for offline tests
- docker-compose.yml: Spins up MongoDB and the backend
- TODO.netflixTop10.md: Future enhancements for the Netflix module

## Quick start (from repo root)

- Dev (run backend locally)
  - npm run dev
- Build backend
  - npm run build
- Start built backend
  - npm start

## Quick start (Docker)

- Start services
  - npm run dc:up
- Tail backend logs
  - npm run dc:logs
- Stop services
  - npm run dc:down

Backend will be available at http://localhost:8000 by default.

Tip: You can also start just Mongo for local dev while running the app outside Docker:
- npm run dc:mongo

Persistence: MongoDB data is stored in a named volume `scraper_mongo_data` and survives container recreation. Use `docker compose down -v` to remove it.

## Endpoints

Base health
- GET `/` → { status: "ok" }

Netflix module
- GET `/netflix` → lists Netflix-related endpoints
- GET `/netflix/top10`
  - Query: `country` (default: Global), `category` (movies_en | movies_non_en | shows_en | shows_non_en; default: movies_en), `sample` (1|true for local sample), `timeoutMs` (optional)
  - Action: Scrape and return structured rows without saving
- POST `/netflix/scrape`
  - Body: { country?, category?, useSample?, timeoutMs? }
  - Action: Scrape and persist a snapshot to MongoDB; returns snapshot id and meta
- GET `/netflix/snapshots`
  - Query: `country?`, `category?`, `take` (1..100; default 20), `cursor?`
  - Action: List saved snapshots (most recent first) with cursor pagination

IMDb module
- GET `/imdb/search` → search titles via api.imdbapi.dev
  - Query: `q` (required), `limit` (optional)
- GET `/imdb/titles/:id` → fetch a single title by id (e.g., tt15398776)
- POST `/imdb/titles/:id/save` → fetch and upsert the title into MongoDB
- GET `/imdb/saved` → list saved titles with `take` and `cursor` pagination

### Examples

- Preview Netflix scrape from sample HTML
  - http://localhost:8000/netflix/top10?country=Global&category=movies_en&sample=1
- Persist a Netflix snapshot (sample data)
  - POST http://localhost:8000/netflix/scrape
    Body: { "country": "Global", "category": "movies_en", "useSample": true }
- List saved Netflix snapshots
  - http://localhost:8000/netflix/snapshots?country=Global&category=movies_en&take=5
- Fetch IMDb title
  - http://localhost:8000/imdb/titles/tt15398776
- Save IMDb title
  - POST http://localhost:8000/imdb/titles/tt15398776/save
- List saved IMDb titles
  - http://localhost:8000/imdb/saved?take=5

## Environment variables

Server
- `SERVER_PORT` (default 8000)

MongoDB
- `MONGODB_URI` (default `mongodb://mongo:27017/scraped` in Docker)
- `MONGODB_DB` (default `scraped`)

IMDb client
- `IMDBAPI_BASE_URL` (default https://api.imdbapi.dev)
- `IMDBAPI_API_KEY` (optional)
- `IMDBAPI_AUTH_STYLE` (optional: `header` or `query`)

Netflix scraper (sample mode)
- `USE_NETFLIX_SAMPLE` (default false)
- `NETFLIX_SAMPLE_PATH` (optional; defaults to `./sample/tudum-top-10-global-table.html`)

## Data model (MongoDB via Mongoose)

Collection: `imdb_title_docs`
- Fields: titleId (unique, indexed), data (JSON), createdAt, updatedAt

Collection: `netflix_top10_snapshots`
- Fields: sourceUrl, country (idx), category (idx), categoryLabel, timeWindowRaw, scrapedAt (idx), data (rows[]), createdAt, updatedAt
- Compound index: { country: 1, category: 1, scrapedAt: -1 }

Indexes are synchronized on app startup.

## Development

From repo root (recommended shortcuts):

- Dev server: `npm run dev`
- Build: `npm run build`
- Start (built): `npm start`

Or directly from `backend/`:

- Install deps: `npm install`
- Dev server: `npm run dev`
- Build: `npm run build`
- Start (built): `npm start`

Chrome/Chromium is installed in the Docker image. For local dev on Linux, Puppeteer downloads its own Chromium; ensure required libraries are present.

## Notes

- Puppeteer runs with container-safe flags; Docker compose sets `shm_size` and relaxed seccomp so Chrome can start.
- The legacy Prisma tooling was removed; persistence is now handled by Mongoose.
- The old `/test/netflix-top10` route was replaced with `/netflix/top10` and `/netflix/scrape`.

Local vs Docker Mongo
- Local dev uses `MONGODB_URI=mongodb://127.0.0.1:27017/scraped` (see `backend/.env`)
- Docker runtime uses `MONGODB_URI=mongodb://mongo:27017/scraped` (set via `docker-compose.yml`)

Sample mode
- Default sample file path: `backend/sample/tudum-top-10-global-table.html`
- Override by setting `NETFLIX_SAMPLE_PATH` in `backend/.env`
