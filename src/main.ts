require('dotenv').config();

import Redis from 'ioredis';
import Fastify from 'fastify';
import FastifyCors from '@fastify/cors';

import gogoanime from './routes/anime/gogoanime';

export const redis =
  process.env.REDIS_HOST &&
  new Redis({
    host: process.env.REDIS_HOST,
    port: Number(process.env.REDIS_PORT),
    password: process.env.REDIS_PASSWORD,
  });

// Default TTL 1 hour
export const REDIS_TTL = Number(process.env.REDIS_TTL) || 3600;

const fastify = Fastify({
  maxParamLength: 1000,
  logger: false,
});

export const tmdbApi = process.env.TMDB_KEY && process.env.TMDB_KEY;

(async () => {
  const PORT = Number(process.env.PORT) || 3000;

  await fastify.register(FastifyCors, {
    origin: '*',
    methods: ['GET'],
  });

  // Let Vercel's CDN reuse good answers so repeat requests cost no CPU.
  // Empty results are never cached.
  fastify.addHook('onSend', async (request: any, reply: any, payload: any) => {
    try {
      if (request.method !== 'GET' || reply.statusCode !== 200) return payload;
      const path = String(request.raw.url || '').split('?')[0];
      const body = typeof payload === 'string' ? payload : '';
      let cc = '';
      if (path.indexOf('/anime/gogoanime/watch/') === 0) {
        if (body && body.indexOf('"sources":[]') === -1) cc = 'public, s-maxage=180';
      } else if (path === '/anime/gogoanime/info') {
        if (body && body.indexOf('"episodes":[]') === -1)
          cc = 'public, s-maxage=600, stale-while-revalidate=3600';
      } else if (/^\/anime\/gogoanime\/[^/]+$/.test(path)) {
        if (body && body.indexOf('"results":[]') === -1)
          cc = 'public, s-maxage=3600, stale-while-revalidate=86400';
      }
      if (cc) reply.header('Cache-Control', cc);
    } catch (e) {}
    return payload;
  });

  // Gogoanime only: the app asks this backend for nothing else.
  await fastify.register(gogoanime, { prefix: '/anime/gogoanime' });

  fastify.get('/', (_, reply) => {
    reply.status(200).send(`Welcome to consumet api! 🎉`);
  });

  fastify.get('/anime', async (_, reply) => {
    reply.status(200).send('Welcome to Consumet Anime 🗾');
  });

  fastify.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      error: 'Page not found',
    });
  });

  try {
    fastify.listen({ port: PORT, host: '0.0.0.0' }, (err, address) => {
      if (err) throw err;
      console.log(`Server listening at ${address}`);
    });
  } catch (err: any) {
    fastify.log.error(err);
    process.exit(1);
  }
})();

/**
 * Vercel / Serverless Handler
 */
export default async function handler(req: any, res: any) {
  await fastify.ready();
  fastify.server.emit('request', req, res);
}
