import express = require('express');
import dotenv = require('dotenv');
import morgan = require('morgan');
import logger from './helper/logger';
import { connectMongo } from './db';
import { ImdbTitleModel } from './models/imdb';
import { NetflixTop10SnapshotModel } from './models/netflix';
import netflixRouter from './routes/netflix';
import imdbRouter from './routes/imdb';

dotenv.config();

const app = express();
app.use(express.json());
// Inbound request logging integrated with pino
app.use((req, res, next) => {
  const start = Date.now();
  logger.info({ req: { method: req.method, url: req.originalUrl } }, 'request:start');
  res.on('finish', () => {
    const ms = Date.now() - start;
    logger.info(
      { res: { statusCode: res.statusCode }, durationMs: ms, req: { method: req.method, url: req.originalUrl } },
      'request:finish'
    );
  });
  next();
});
// Keep morgan but route to pino for concise access logs
app.use(
  morgan(':method :url :status :res[content-length] - :response-time ms', {
    stream: {
      write: (str: string) => logger.info({ access: str.trim() }),
    } as any,
  })
);

// Connect to Mongo on startup and sync indexes
(async () => {
  try {
    await connectMongo();
    await Promise.all([ImdbTitleModel.syncIndexes(), NetflixTop10SnapshotModel.syncIndexes()]);
    logger.info({ scopes: ['mongo'] }, 'indexes synced');
  } catch (err) {
    logger.error({ err }, 'Mongo initialization failed at startup');
  }
})();

app.get('/', async (_req, res) => {
  logger.info({ route: '/' }, 'health');
  res.json({ status: 'ok', message: 'Scraper backend running' });
});

// Mount routes by domain
app.use('/netflix', netflixRouter);
app.use('/imdb', imdbRouter);

const port = Number(process.env.SERVER_PORT || 8000);

app.listen(port, () => {
  logger.info({ port }, 'server listening');
});
