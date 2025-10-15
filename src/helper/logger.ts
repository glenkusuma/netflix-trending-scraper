import pino from 'pino';
import dotenv from 'dotenv';

// Ensure .env is loaded even if the entrypoint hasn't called dotenv yet
dotenv.config();

// Environment-driven logging configuration
const level = (process.env.LOG_LEVEL || 'info').toLowerCase();
const service = process.env.SERVICE_NAME || 'scraper';
const enablePretty = (process.env.LOG_PRETTY || '').toLowerCase() === 'true'
  || (process.env.NODE_ENV || '').toLowerCase() !== 'production';


// Pretty transport configuration for human-friendly colored output in dev
let destination: any = undefined;
if (enablePretty) {
  // pino.transport returns a destination stream compatible with pino as the second arg
  destination = pino.transport({
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:standard', // ISO-like human time
      ignore: 'pid,hostname',
      singleLine: false,
    },
  });
}

const logger = destination
  ? pino(
      {
        name: service,
        level,
        base: { service },
        timestamp: pino.stdTimeFunctions.isoTime, // ISO timestamp
      },
      destination
    )
  : pino({ name: service, level, base: { service }, timestamp: pino.stdTimeFunctions.isoTime });

export default logger;
export const createLogger = (bindings: Record<string, any>) => logger.child(bindings);