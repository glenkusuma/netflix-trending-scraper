import { createHash } from 'crypto';
import { ImdbTitleModel } from '../../models/imdb';
import imdbapi from './clients/imdbapi';
import logger from '../../helper/logger';

export async function searchTitles(query: string, limit?: number) {
  if (!query || !query.trim()) throw new Error('query is required');
  logger.debug({ query, limit }, 'imdb searchTitles');
  const out = await imdbapi.searchTitles(query, limit);
  logger.debug({ count: Array.isArray(out?.titles) ? out.titles!.length : 0 }, 'imdb searchTitles done');
  return out;
}

export async function getTitle(id: string) {
  try {
    logger.debug({ id }, 'imdb getTitle start');
    const data = await imdbapi.getTitleById(id);

    const idInput = `imdb_api|${id || ''}`;
    const stableId = createHash('sha1').update(idInput).digest('hex');

    // Flatten data into top-level fields per updated model
    await (ImdbTitleModel as any).updateOne(
      { _id: stableId },
      { $set: { _id: stableId, ...data, id: (data as any)?.id ?? id } },
      { upsert: true }
    );
    logger.info({ _id: stableId }, 'imdb getTitle upserted');
    const saved = await (ImdbTitleModel as any).findOne({ _id: stableId }).lean();
    logger.debug({ _id: stableId, found: !!saved }, 'imdb getTitle fetched');
    return { ok: true, titleId: id, _id: saved?._id, data };
  } catch (error) {
    logger.error({ err: error }, 'Error fetching title');
    return { ok: false, error: 'Failed to fetch title' };
  }
}

export async function listSaved(params: { take?: number; cursor?: string }) {
  const take = Math.min(100, Math.max(1, Number(params.take ?? 20)));
  const cursor = params.cursor;
  const query = cursor ? { _id: { $lt: cursor } } : {};
  logger.debug({ take, cursor }, 'imdb listSaved query');
  const items = await (ImdbTitleModel as any)
    .find(query as any)
    .sort({ _id: -1 })
    .limit(take)
    .lean();
  logger.debug({ count: items.length }, 'imdb listSaved fetched');
  const nextCursor = items.length === take ? String(items[items.length - 1]!._id) : undefined;
  return { items, nextCursor };
}

export default { searchTitles, getTitle, listSaved };
