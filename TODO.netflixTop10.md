x# TODO – Netflix Top 10 module

This document tracks deferred work for the Netflix Top 10 scraper and API.

## 1) Database schema (MongoDB via Prisma) – planned

Collection: `netflix_top10_snapshots`
- _id: ObjectId
- sourceUrl: string (e.g., https://www.netflix.com/tudum/top10)
- country: string (e.g., "Global", "Japan", ...)
- category: enum("movies_en", "movies_non_en", "shows_en", "shows_non_en")
- categoryLabel: string (e.g., "Movies | English")
- timeWindowRaw: string | null (e.g., "Global | 9/29/25 - 10/5/25")
- scrapedAt: Date
- data: Array<{
  - rank: number
  - title: string
  - weeksInTop10: number | null
  - views: { raw: string | null, value: number | null }
  - runtime: { raw: string | null, minutes: number | null }
  - hoursViewed: { raw: string | null, value: number | null }
}>

Indexes:
- { country: 1, category: 1, scrapedAt: -1 }
- Optional: { "data.title": 1 } for text search.

## 2) API endpoints – planned

- POST /netflix-top10/scrape
  - Body: { country?: string, category?: enum, useSample?: boolean, timeoutMs?: number }
  - Action: run scraper, persist snapshot document, return _id and meta.

- GET /netflix-top10
  - Query: country, category, from (ISO), to (ISO), page, pageSize
  - Action: list snapshots with pagination, include meta, optionally summarize (top rank changes, etc.).

## 3) Country/category filter robustness – planned

- Improve live filter application to ensure both country and category are set reliably.
- Handle cookie/gdpr/region banners if present.
- Add fallback to verify the header (timeWindowRaw) matches requested country; if not, retry.

## 4) Integration with imdbapi.dev – planned (next module)

Flow:
1. Get Top 10 via scraper.
2. For each title, call `GET https://api.imdbapi.dev/search/titles?query=<encoded title>&limit=1`.
3. Retrieve details for the IMDb ID via `GET https://api.imdbapi.dev/titles/<imdb_id>`.
4. Persist documents:
   - `netflix_top10_snapshots` (as above)
   - `title_details` with IMDb metadata (keyed by imdb_id) for analytics.

Notes:
- Add rate limiting/backoff for API calls.
- Cache search results by (normalized title, category) to reduce calls.
- Add a background queue if needed for scale.
