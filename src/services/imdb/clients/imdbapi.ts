/**
 * Axios-based client for https://api.imdbapi.dev
 *
 * Env config:
 * - IMDBAPI_BASE_URL (default: https://api.imdbapi.dev)
 */
import axios from 'axios';

const BASE_URL = process.env.IMDBAPI_BASE_URL || 'https://api.imdbapi.dev';

const client = axios.create({
  baseURL: BASE_URL,
  headers: { Accept: 'application/json' },
});

// Minimal response types for ergonomics
export type ImdbTitle = {
  id: string;
  type?: string;
  primaryTitle?: string;
  originalTitle?: string;
  runtimeSeconds?: number;
  genres?: string[];
  rating?: { aggregateRating?: number; voteCount?: number };
  primaryImage?: { url?: string; width?: number; height?: number; type?: string };
  plot?: string;
};

export type SearchTitlesResponse = { titles?: ImdbTitle[] };

export async function searchTitles(query: string, limit?: number): Promise<SearchTitlesResponse> {
  if (!query || !query.trim()) throw new Error('query is required');
  const params: Record<string, any> = { query };
  if (limit !== undefined) params.limit = limit;
  const { data } = await client.get<SearchTitlesResponse>('/search/titles', { params });
  return data;
}

export async function getTitleById(titleId: string): Promise<ImdbTitle> {
  if (!/^tt\d{5,10}$/i.test(titleId)) throw new Error('titleId must look like tt1234567');
  const params: Record<string, any> = {};
  const { data } = await client.get<ImdbTitle>(`/titles/${titleId}`, { params });
  return data;
}

export async function batchGetTitles(titleIds: string[]): Promise<{ titles?: ImdbTitle[] }> {
  if (!Array.isArray(titleIds) || titleIds.length === 0) throw new Error('titleIds required');
  const qs = new URLSearchParams();
  for (const id of titleIds) qs.append('titleIds', id);
  const { data } = await client.get<{ titles?: ImdbTitle[] }>(`/titles:batchGet?${qs.toString()}`);
  return data;
}

export default { searchTitles, getTitleById, batchGetTitles };
