import { Router } from 'express';
import { listSnapshots, scrapeAndSaveSnapshot, scrapeTop10 } from '../services/netflix';
import logger from '../helper/logger';

const router = Router();

router.get('/', (_req, res) => {
  logger.info({ route: '/netflix' }, 'index');
  res.json({
    ok: true,
    service: 'netflix',
    description: 'Endpoints for scraping Tudum Top 10 and listing snapshots',
    endpoints: [
      {
        path: '/netflix/top10',
        method: 'GET',
        description: 'Scrape preview (returns rows only, does not persist)',
        query: {
          country: "string (default: 'Global')",
          category: "movies_en | movies_non_en | shows_en | shows_non_en (default: 'movies_en')",
          sample: "1|true to use local sample HTML (default: false)",
          timeoutMs: 'optional number (milliseconds)'
        },
        example: '/netflix/top10?country=Global&category=movies_en&sample=1'
      },
      {
        path: '/netflix/scrape',
        method: 'POST',
        description: 'Scrape and persist a snapshot into the database',
        body: {
          useSample: 'boolean (optional; if true uses sample HTML)',
          country: "string (optional; default: 'Global')",
          category: "string (optional; default: 'movies_en')",
          timeoutMs: 'number (optional; milliseconds)'
        },
        exampleBody: {
          useSample: true,
          country: 'Global',
          category: 'movies_en',
          timeoutMs: 120000
        }
      },
      {
        path: '/netflix/snapshots',
        method: 'GET',
        description: 'List saved snapshots (paged, most recent first)',
        query: {
          country: "string (optional)",
          category: "string (optional)",
          take: 'number (1..100; default: 20)',
          cursor: 'string (opaque id for pagination)'
        },
        example: '/netflix/snapshots?country=Global&category=movies_en&take=5'
      }
    ]
  });
});

router.get('/top10', async (req, res) => {
  try {
    const useSample = req.query.sample === '1' || req.query.sample === 'true';
    const country = typeof req.query.country === 'string' ? req.query.country : 'Global';
    const category = (
      typeof req.query.category === 'string' ? req.query.category : 'movies_en'
    ) as any;
    logger.debug({ country, category, useSample }, 'GET /netflix/top10');
    const result = await scrapeTop10({ useSample, country, category });
    logger.info(
      { rows: Array.isArray((result as any)?.data) ? (result as any).data.length : 0, category, country },
      'netflix top10 scraped'
    );
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'Netflix top10 scrape failed');
    res.status(500).json({ error: 'Scrape failed', details: String(err) });
  }
});

router.post('/scrape', async (req, res) => {
  try {
    const body = req.body || {};
    const useSample = !!body.useSample;
    const country = typeof body.country === 'string' ? body.country : 'Global';
    const category = (typeof body.category === 'string' ? body.category : 'movies_en') as any;
    const timeoutMs = typeof body.timeoutMs === 'number' ? body.timeoutMs : undefined;
    logger.debug({ useSample, country, category, timeoutMs }, 'POST /netflix/scrape');
    const out = await scrapeAndSaveSnapshot({ useSample, country, category, timeoutMs });
    logger.info({ id: (out as any)?.netflixTop10Id, country, category }, 'netflix snapshot persisted');
    res.json({ ok: true, ...out });
  } catch (err) {
    logger.error({ err }, 'Netflix scrape+save failed');
    res.status(500).json({ error: 'Netflix scrape+save failed', details: String(err) });
  }
});

router.get('/snapshots', async (req, res) => {
  try {
    const take = Number(req.query.take ?? 20);
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    const country = typeof req.query.country === 'string' ? req.query.country : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const params: any = { take };
    if (cursor) params.cursor = cursor;
    if (country) params.country = country;
    if (category) params.category = category;
    logger.debug(params, 'GET /netflix/snapshots');
    const result = await listSnapshots(params);
    logger.info(
      { count: Array.isArray((result as any)?.items) ? (result as any).items.length : 0, nextCursor: (result as any)?.nextCursor },
      'netflix snapshots fetched'
    );
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'List Netflix snapshots failed');
    res.status(500).json({ error: 'List Netflix snapshots failed', details: String(err) });
  }
});

export default router;
