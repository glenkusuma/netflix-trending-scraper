import express = require('express');
import dotenv = require('dotenv');
const scrapData = require('./scrapData');
const imdbapi = require('./clients/imdbapi');
const prisma = require('./db');

dotenv.config();

const app = express();
app.use(express.json());

app.get('/', async (_req, res) => {
  res.json({ status: 'ok', message: 'Scraper backend running' });
});

// Quick test route: scrape Netflix Top 10 and return the rows
app.get('/test/netflix-top10', async (req, res) => {
  try {
    const scrapeNetflixTop10 = require('./scrapers/netflixTop10') as (
      url?: string,
      opts?: { useSample?: boolean; samplePath?: string; country?: string; category?: 'movies_en' | 'movies_non_en' | 'shows_en' | 'shows_non_en'; timeoutMs?: number }
    ) => Promise<any>;

    const useSample = req.query.sample === '1' || req.query.sample === 'true';
    const country = typeof req.query.country === 'string' ? req.query.country : 'Global';
    const category = (typeof req.query.category === 'string' ? req.query.category : 'movies_en') as
      | 'movies_en'
      | 'movies_non_en'
      | 'shows_en'
      | 'shows_non_en';

    const result = await scrapeNetflixTop10(undefined, { useSample, country, category });
    res.json(result);
  } catch (err) {
    console.error('Netflix top10 scrape failed:', err);
    res.status(500).json({ error: 'Scrape failed', details: String(err) });
  }
});

// IMDb API passthrough: search titles
app.get('/imdb/search', async (req, res) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    const limit = typeof req.query.limit === 'string' ? Number(req.query.limit) : undefined;
    const data = await imdbapi.searchTitles(q, limit);
    res.json(data);
  } catch (err) {
    console.error('IMDb search failed:', err);
    res.status(500).json({ error: 'IMDb search failed', details: String(err) });
  }
});

// IMDb API passthrough: get title by ID
app.get('/imdb/titles/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const data = await imdbapi.getTitleById(id);
    res.json(data);
  } catch (err) {
    console.error('IMDb getTitle failed:', err);
    res.status(500).json({ error: 'IMDb getTitle failed', details: String(err) });
  }
});

// Save IMDb title doc into Mongo (upsert by titleId)
app.post('/imdb/titles/:id/save', async (req, res) => {
  try {
    const id = req.params.id;
    const data = await imdbapi.getTitleById(id);
    // Avoid Prisma transactions requirement on Mongo by performing create then update-on-conflict
    let saved;
    try {
      saved = await prisma.imdbTitleDoc.create({ data: { titleId: id, data } });
    } catch (e: any) {
      // If unique constraint on titleId, fallback to update
      const isUniqueViolation = e && e.code === 'P2002';
      if (!isUniqueViolation) throw e;
      saved = await prisma.imdbTitleDoc.update({
        where: { titleId: id },
        data: { data, updatedAt: new Date() },
      });
    }
    res.json({ ok: true, savedId: saved.id, titleId: saved.titleId });
  } catch (err) {
    console.error('Save IMDb title failed:', err);
    res.status(500).json({ error: 'Save IMDb title failed', details: String(err) });
  }
});

// List saved IMDb titles (paged)
app.get('/imdb/saved', async (req, res) => {
  try {
    const take = Math.min(100, Math.max(1, Number(req.query.take ?? 20)));
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const where = {} as any;
    const orderBy = { createdAt: 'desc' as const };

    const items = await prisma.imdbTitleDoc.findMany({
      where,
      take,
      skip: cursor ? 1 : 0,
      ...(cursor ? { cursor: { id: cursor } } : {}),
      orderBy,
    });
    const nextCursor = items.length === take ? items[items.length - 1]?.id : undefined;
    res.json({ items, nextCursor });
  } catch (err) {
    console.error('List saved IMDb titles failed:', err);
    res.status(500).json({ error: 'List saved IMDb titles failed', details: String(err) });
  }
});

const port = Number(process.env.SERVER_PORT || 8000);

app.listen(port, () => {
  console.log(`App is listening on port ${port}`);
  // Fire and forget main scraper only if enabled by env (prevents noisy errors during tests)
  if (process.env.SCRAPER_ENABLED === 'true') {
    (scrapData as () => Promise<void>)()
      .catch((err: unknown) => console.error('Scraping failed on startup:', err));
  }
});
