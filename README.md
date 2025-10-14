# Scraper Backend (Puppeteer + Express + Prisma + MongoDB)

A Dockerized Node/Express backend for web scraping with Puppeteer. Prisma (MongoDB provider) is used as ORM. Includes a Netflix Tudum Top 10 scraper module with a test endpoint.

## Project layout

- backend/
  - Dockerfile: Chrome-enabled build for Puppeteer in containers
  - package.json: scripts and deps
  - prisma/
    - schema.prisma: MongoDB datasource and models (Product model for base, Netflix planned)
  - src/
    - server.ts: Express app bootstrap and routes
    - db.ts: Prisma client instance
    - scrapData.ts: Generic tutorial-style scraper (placeholder selectors)
    - scrapers/
      - netflixTop10.ts: Netflix Tudum Top 10 scraper (structured output, filters)
  - sample/
    - tudum-top-10-global-table.html: Example table for offline tests
    - tadum-top-10-filter.html: Example filter DOM markup
- docker-compose.yml: Spins up Mongo and backend
- TODO.netflixTop10.md: Deferred tasks & schema plan for Netflix module

## How it works (high level)

- Puppeteer launches headless Chrome with container-safe flags (no sandbox, no gpu, larger shm via compose).
- Netflix scraper extracts rows from the Tudum Top 10 table (`data-uia="top10-table"`).
- Output is normalized for analytics-friendly querying: numeric views/hours, runtime in minutes, rank as number, plus raw strings retained.
- A dedicated test route lets you scrape the live site or a local sample file without changing code.

## Netflix Top 10 scraper

File: `backend/src/scrapers/netflixTop10.ts`

- Parameters
  - country: default "Global" (matches filter option text)
  - category: one of `movies_en | movies_non_en | shows_en | shows_non_en` (default `movies_en`)
  - useSample: boolean to render local HTML for offline tests
  - timeoutMs: navigation and selector wait budget

- Output
  - meta: { sourceUrl, country, category, categoryLabel, timeWindowRaw, length, scrapedAt }
  - data: Array of rows
    - rank (number)
    - title (string)
    - weeksInTop10 (number | null)
    - views { raw, value }
    - runtime { raw, minutes }
    - hoursViewed { raw, value }

- Live page filtering (best-effort)
  - Selectors:
    - Country: `[data-uia="top10-country-select"]` -> options `[data-uia="top10-country-select-option"]`
    - Category: `[data-uia="top10-category-select"]` -> options `[data-uia="top10-category-select-option"]`
  - If filters fail, scraper still returns what the page shows (often Global / Movies English). See TODO for improvements.

## Test endpoint

- GET `/test/netflix-top10`
  - Query params:
    - `sample` = 1|true to use local sample HTML
    - `country` = e.g., Global, Japan, United States (default Global)
    - `category` = movies_en | movies_non_en | shows_en | shows_non_en (default movies_en)
    - `timeoutMs` = number (optional)
  - Response: structured JSON described above

Examples:
- Local sample test:
  - http://localhost:8000/test/netflix-top10?sample=1
- Explicit defaults:
  - http://localhost:8000/test/netflix-top10?sample=1&country=Global&category=movies_en

## Docker usage

- Start services:
  - docker compose up --build -d
- Tail backend logs:
  - docker compose logs backend --tail 200
- Stop services:
  - docker compose down

Notes:
- The main tutorial scraper (`scrapData.ts`) is disabled at boot unless `SCRAPER_ENABLED=true`.
- Puppeteer in Docker: we add `--no-sandbox`, set shm_size, and relax seccomp to allow Chrome to start.

## Next (deferred) – Netflix module

See `TODO.netflixTop10.md` for:
- MongoDB schema design for snapshots
- POST /netflix-top10/scrape (persist)
- GET /netflix-top10 (query with filters and pagination)
- Filter robustness improvements
- Integration plan with imdbapi.dev (search + details + persistence)
