# Scraper – Netflix Tudum Top 10 + IMDb + Mongo (Mongoose)

This service scrapes Netflix Tudum Top 10 with Puppeteer and persists data to MongoDB via Mongoose. It also exposes IMDb API passthrough endpoints and lets you save IMDb titles to Mongo.

## Project layout

- Dockerfile: Chrome-enabled build for Puppeteer in containers
- package.json: scripts and dependencies
- tsconfig.json: TypeScript config (src -> dist)
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
- docs/
  - TODO.netflixTop10.md: Future enhancements for the Netflix module
- docker-compose.yml: Spins up MongoDB and the scraper service

## Run with Docker

- From repo root:
  - npm run dc:up
  - npm run dc:logs
  - npm run dc:down

Default server: http://localhost:8000
Mongo data persists in named volume `scraper_mongo_data`.

## Endpoints

Base
- GET `/` → { status: "ok" }

Netflix
- GET `/netflix` → list of Netflix endpoints
- GET `/netflix/top10` → scrape preview
  - Query: `country` (default Global), `category` (movies_en | movies_non_en | shows_en | shows_non_en; default movies_en), `sample` (1|true), `timeoutMs` (optional)
- POST `/netflix/scrape` → scrape and persist snapshot
  - Body: { country?, category?, useSample?, timeoutMs? }
- GET `/netflix/snapshots` → list saved snapshots
  - Query: `country?`, `category?`, `take` (1..100; default 20), `cursor?`

IMDb
- GET `/imdb/search` → search titles
- GET `/imdb/titles/:id` → fetch a title
- POST `/imdb/titles/:id/save` → fetch + upsert title into Mongo
- GET `/imdb/saved` → list saved titles (paged)

### Quick examples

- Preview Netflix (sample):
  - http://localhost:8000/netflix/top10?country=Global&category=movies_en&sample=1
- Save a Netflix snapshot:
  - POST http://localhost:8000/netflix/scrape with `{ "country": "Global", "category": "movies_en", "useSample": true }`
- List Netflix snapshots:
  - http://localhost:8000/netflix/snapshots?country=Global&category=movies_en&take=5
- Fetch IMDb title:
  - http://localhost:8000/imdb/titles/tt15398776
- Save IMDb title:
  - POST http://localhost:8000/imdb/titles/tt15398776/save
- List saved IMDb titles:
  - http://localhost:8000/imdb/saved?take=5

## Environment variables

Server
- `SERVER_PORT` (default 8000)

MongoDB
- `MONGODB_URI` (default `mongodb://127.0.0.1:27017/scraped` for local dev; Docker overrides to `mongodb://mongo:27017/scraped`)
- `MONGODB_DB` (default `scraped`)

IMDb client
- `IMDBAPI_BASE_URL` (default https://api.imdbapi.dev)
- `IMDBAPI_API_KEY` (optional)
- `IMDBAPI_AUTH_STYLE` (optional: `header` | `query`)

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

From repo root (shortcuts):

- Dev server: `npm run dev`
- Build: `npm run build`
- Start (built): `npm start`

Tip: You can also start just Mongo for local dev while running the app outside Docker:

- `npm run dc:mongo`

## Notes

- Puppeteer runs with container-safe flags; Docker compose sets `shm_size` and relaxed seccomp so Chrome can start.
- The legacy Prisma tooling was removed; persistence is now handled by Mongoose.
- The old `/test/netflix-top10` route was replaced with `/netflix/top10` and `/netflix/scrape`.

Local vs Docker Mongo
- Local dev uses `MONGODB_URI=mongodb://127.0.0.1:27017/scraped` (see `.env` if you add one)
- Docker runtime uses `MONGODB_URI=mongodb://mongo:27017/scraped` (set via `docker-compose.yml`)

Sample mode
- Default sample file path: `./sample/tudum-top-10-global-table.html`
- Override by setting `NETFLIX_SAMPLE_PATH` in your environment