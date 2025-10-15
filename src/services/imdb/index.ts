import { createHash } from 'crypto';
import { ImdbTitleModel } from '../../models/imdb';
import imdbapi from './clients/imdbapi';

export async function searchTitles(query: string, limit?: number) {
  if (!query || !query.trim()) throw new Error('query is required');
  return imdbapi.searchTitles(query, limit);
}

export async function getTitle(id: string) {
  try {
    const data = await imdbapi.getTitleById(id);

    const idInput = `imdb_api|${id || ''}`;
    const stableId = createHash('sha1').update(idInput).digest('hex');

    // Flatten data into top-level fields per updated model
    await (ImdbTitleModel as any).updateOne(
      { _id: stableId },
      { $set: { _id: stableId, ...data, id: (data as any)?.id ?? id } },
      { upsert: true }
    );
    const saved = await (ImdbTitleModel as any).findOne({ _id: stableId }).lean();
    return { ok: true, titleId: id, _id: saved?._id, data };
  } catch (error) {
    console.error('Error fetching title:', error);
    return { ok: false, error: 'Failed to fetch title' };
  }
}

export async function listSaved(params: { take?: number; cursor?: string }) {
  const take = Math.min(100, Math.max(1, Number(params.take ?? 20)));
  const cursor = params.cursor;
  const query = cursor ? { _id: { $lt: cursor } } : {};
  const items = await (ImdbTitleModel as any)
    .find(query as any)
    .sort({ _id: -1 })
    .limit(take)
    .lean();
  const nextCursor = items.length === take ? String(items[items.length - 1]!._id) : undefined;
  return { items, nextCursor };
}

export default { searchTitles, getTitle, listSaved };
