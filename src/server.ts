import express = require('express');
import dotenv = require('dotenv');
import morgan = require('morgan');
import { connectMongo } from './db';
import { ImdbTitleModel } from './models/imdb';
import { NetflixTop10SnapshotModel } from './models/netflix';
import netflixRouter from './routes/netflix';
import imdbRouter from './routes/imdb';

dotenv.config();

const app = express();
app.use(express.json());
// Inbound request logging: log hit and completion timing for every endpoint
app.use((req, res, next) => {
  const start = Date.now();
  console.info(`[req] -> ${req.method} ${req.originalUrl}`);
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.info(`[req] <- ${req.method} ${req.originalUrl} ${res.statusCode} ${ms}ms`);
  });
  next();
});
app.use(morgan('dev'));

// Connect to Mongo on startup and sync indexes
(async () => {
  try {
    await connectMongo();
    await Promise.all([ImdbTitleModel.syncIndexes(), NetflixTop10SnapshotModel.syncIndexes()]);
    console.log('[mongo] indexes synced');
  } catch (err) {
    console.error('Mongo initialization failed at startup:', err);
  }
})();

app.get('/', async (_req, res) => {
  res.json({ status: 'ok', message: 'Scraper backend running' });
});

// Mount routes by domain
app.use('/netflix', netflixRouter);
app.use('/imdb', imdbRouter);

const port = Number(process.env.SERVER_PORT || 8000);

app.listen(port, () => {
  console.log(`App is listening on port ${port}`);
  // Ready
});
