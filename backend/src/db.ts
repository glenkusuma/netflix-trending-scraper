// Prisma has been removed from this project. This module is kept to avoid breaking imports.
// If you see an import from './db', remove it from the caller.
import mongoose from 'mongoose';

let isConnected = false;

export async function connectMongo(uri?: string) {
  if (isConnected) return mongoose;
  const primaryUri = uri || process.env.MONGODB_URI || 'mongodb://mongo:27017/scraped';
  const dbName = process.env.MONGODB_DB || 'scraped';
  mongoose.set('strictQuery', true);
  mongoose.connection.on('connected', () => console.log('[mongo] connected'));
  mongoose.connection.on('error', (err) => console.error('[mongo] error', err));
  mongoose.connection.on('disconnected', () => console.warn('[mongo] disconnected'));

  const tryConnect = async (connUri: string) => {
    console.info(`[mongo] connecting ${connUri} dbName=${dbName}`);
    await mongoose.connect(connUri, { dbName });
  };

  try {
    await tryConnect(primaryUri);
  } catch (err: any) {
    const msg = String(err?.message || err);
    const isNameNotFound = msg.includes('ENOTFOUND') && msg.toLowerCase().includes('mongo');
    if (isNameNotFound && !uri && !process.env.MONGODB_URI) {
      const fallback = 'mongodb://127.0.0.1:27017/scraped';
      console.warn(`[mongo] primary host 'mongo' not found; falling back to ${fallback}`);
      await tryConnect(fallback);
    } else {
      throw err;
    }
  }

  isConnected = true;
  return mongoose;
}

export default mongoose;
