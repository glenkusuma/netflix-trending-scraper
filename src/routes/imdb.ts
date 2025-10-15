import { Router } from 'express';
import { listSaved } from '../services/imdb';
import logger from '../helper/logger';

const router = Router();

router.get('/saved', async (req, res) => {
  try {
    const take = Math.min(100, Math.max(1, Number(req.query.take ?? 20)));
    const cursor = typeof req.query.cursor === 'string' ? req.query.cursor : undefined;
    logger.debug({ take, cursor }, 'GET /imdb/saved');
    const params: any = { take };
    if (cursor) params.cursor = cursor;
    const result = await listSaved(params);
    logger.info(
      { count: Array.isArray((result as any)?.items) ? (result as any).items.length : 0, nextCursor: (result as any)?.nextCursor },
      'imdb saved fetched'
    );
    res.json(result);
  } catch (err) {
    logger.error({ err }, 'List saved IMDb titles failed');
    res.status(500).json({ error: 'List saved IMDb titles failed', details: String(err) });
  }
});

export default router;
