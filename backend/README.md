```markdown
# Backend – Scraper + IMDb + Mongo (Mongoose)

This service scrapes Netflix Tudum Top 10 with Puppeteer and persists data to MongoDB using Mongoose. It also exposes IMDb API passthrough endpoints and lets you save IMDb titles to Mongo.

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

## Environment

Server
- SERVER_PORT (default 8000)

MongoDB
- MONGODB_URI (default mongodb://127.0.0.1:27017/scraped for local dev; Docker overrides to mongodb://mongo:27017/scraped)
- MONGODB_DB (default scraped)
Netflix scraper (sample mode)
- USE_NETFLIX_SAMPLE (default false)
- NETFLIX_SAMPLE_PATH (optional; defaults to ./sample/tudum-top-10-global-table.html)

IMDb client
- IMDBAPI_BASE_URL (default https://api.imdbapi.dev)
- IMDBAPI_API_KEY (optional)
- IMDBAPI_AUTH_STYLE (optional: header | query)

## Data model

- imdb_title_docs: { titleId (unique), data, createdAt, updatedAt }
- netflix_top10_snapshots: { sourceUrl, country, category, categoryLabel, timeWindowRaw, scrapedAt, data[], createdAt, updatedAt }
  - Indexes: country, category, scrapedAt; compound { country, category, scrapedAt: -1 }

Indexes are synchronized automatically on startup.

## Development

From repo root (recommended shortcuts):
- npm run dev
- npm run build
- npm start

Or directly in `backend/`:
- npm install
- npm run dev (ts-node-dev)
- npm run build && npm start

## Troubleshooting

- Puppeteer fails to launch in Docker
  - Ensure compose uses provided image/Dockerfile with Chrome, shm_size, and seccomp profile
- Mongo connection errors
  - For local dev, ensure `MONGODB_URI` points to 127.0.0.1 and that Mongo is running (e.g., `npm run dc:mongo`)
  - In Docker, `MONGODB_URI` is set to `mongodb://mongo:27017/scraped` and the `mongo` service must be healthy
- IMDb 401/403
  - Provide `IMDBAPI_API_KEY` and set `IMDBAPI_AUTH_STYLE` appropriately
```