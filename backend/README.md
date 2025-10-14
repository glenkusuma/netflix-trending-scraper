# Scraper Backend – IMDb API integration

This backend exposes small HTTP endpoints to interact with the IMDb API (api.imdbapi.dev) and optionally save responses into MongoDB via Prisma.

## Endpoints

- GET /imdb/search
  - Query params
    - q: string (required) – search keyword
    - limit: number (optional) – max results
  - Response
    - { titles?: ImdbTitle[] }

- GET /imdb/titles/:id
  - Path params
    - id: string like tt1234567
  - Response
    - ImdbTitle

- POST /imdb/titles/:id/save
  - Behavior
    - Fetches the title from the API and upserts into Mongo collection `ImdbTitleDoc` by `titleId`.
  - Response
    - { ok: true, savedId, titleId }

- GET /imdb/saved
  - Query params
    - take: number (1..100, default 20)
    - cursor: string (optional; use the `id` from the last item for paging)
  - Response
    - { items: ImdbTitleDoc[], nextCursor?: string }

## Environment configuration

The IMDb client reads the following environment variables:

- IMDBAPI_BASE_URL: default https://api.imdbapi.dev
- IMDBAPI_API_KEY: optional
- IMDBAPI_AUTH_STYLE: optional, one of:
  - `header` → sends `Authorization: Bearer <IMDBAPI_API_KEY>`
  - `query` → appends `?apiKey=<IMDBAPI_API_KEY>` to the URL

MongoDB connection (via Prisma):

- DATABASE_URL: e.g. `mongodb://mongo:27017/scraped` (in docker-compose) or `mongodb://localhost:27017/scraped` (local dev)

Server:

- SERVER_PORT: default 8000

## Prisma model

A collection to store IMDb title documents:

```
model ImdbTitleDoc {
  id         String   @id @default(auto()) @map("_id") @db.ObjectId
  titleId    String   @unique
  data       Json
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")
  @@index([createdAt])
}
```

Generate Prisma client:

```
npx prisma generate
```

Apply schema (optional for indexes):

```
npx prisma db push
```

## Docker Compose

Compose file starts Mongo and this backend service:

- MongoDB reachable inside compose as `mongodb://mongo:27017`
- Backend exposes port 8000

Quick checks (inside the backend container):

- Title:
  ```
  curl -s "http://localhost:8000/imdb/titles/tt15398776" | jq .
  ```
- Save:
  ```
  curl -s -X POST "http://localhost:8000/imdb/titles/tt15398776/save" | jq .
  ```
- List saved:
  ```
  curl -s "http://localhost:8000/imdb/saved?take=10" | jq .
  ```

## MongoDB Compass connection

When running via docker-compose, MongoDB is exposed on host port 27017.

- Connection string in Compass:
  - `mongodb://localhost:27017`
- Database name:
  - `scraped` (as in `DATABASE_URL`)
- Collections:
  - `ImdbTitleDoc` is stored as a collection named `ImdbTitleDoc` in MongoDB.

To validate a saved title in Compass:

1) Open Compass → connect to `mongodb://localhost:27017`
2) Select database `scraped`
3) Open collection `ImdbTitleDoc`
4) Find by `titleId: "tt15398776"`

## IMDb client usage and notes

- The HTTP client uses Node 20 global `fetch`. No extra dependency required.
- API key handling is optional and controlled by `IMDBAPI_API_KEY` + `IMDBAPI_AUTH_STYLE`.
- Title ID validation: the client enforces ids like `tt1234567`.
- The batch endpoint helper supports up to 5 IDs as per IMDb API docs.
- Error handling: non-2xx responses throw an Error with status and body text snippet.

Assumptions:
- The IMDb API may require an API key depending on environment—configure if needed.
- Network access from the backend container to `api.imdbapi.dev` is permitted.
- Prisma client is generated in the image or before running `npm start`.

Limitations / next steps:
- Add basic rate limiting and caching for IMDb calls.
- Add GET `/imdb/saved/:titleId` to retrieve a single saved record.
- Add background enrichment using additional IMDb endpoints if needed.

## Troubleshooting

- Prisma client not updated:
  - Run `npx prisma generate` inside `backend` folder.
- Cannot connect to MongoDB from host:
  - Ensure compose exposes `27017:27017` and no other local Mongo is colliding.
- IMDb API returns 401/403:
  - Set `IMDBAPI_API_KEY` and choose the proper `IMDBAPI_AUTH_STYLE`.