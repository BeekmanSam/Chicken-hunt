import { DurableObject } from 'cloudflare:workers';

const DEFAULT_STATE = { status: 'lobby', revision: 0, seed: null, start: null };
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0', 'x-content-type-options': 'nosniff' };
function json(data, status = 200) { return new Response(JSON.stringify(data), { status, headers: HEADERS }); }

// All clients sharing a room code use the *same* Durable Object.
// GPS, photos and role selections are NEVER transmitted or stored.
export class DuckHuntRoom extends DurableObject {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    const state = await this.ctx.storage.get('state') || DEFAULT_STATE;
    if (request.method === 'GET' && path === '/api/game') {
      return json({ ...state, serverTime: Date.now() });
    }
    if (request.method === 'POST' && path === '/api/game/start') {
      if (state.status === 'running') return json({ ...state, serverTime: Date.now(), message: 'Het spel is al gestart. Gebruik reset om opnieuw te beginnen.' }, 409);
      const random = new Uint32Array(1);
      crypto.getRandomValues(random);
      const next = { status: 'running', revision: state.revision + 1, seed: random[0] >>> 0, start: Date.now() };
      await this.ctx.storage.put('state', next);
      return json({ ...next, serverTime: Date.now() });
    }
    if (request.method === 'POST' && path === '/api/game/reset') {
      const next = { status: 'lobby', revision: state.revision + 1, seed: null, start: null };
      await this.ctx.storage.put('state', next);
      return json({ ...next, serverTime: Date.now() });
    }
    return json({ error: 'Onbekende actie' }, 404);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const room = (url.searchParams.get('room') || '').toUpperCase();
    if (!/^[A-Z2-9]{8,12}$/.test(room)) return json({ error: 'Ongeldige spelcode' }, 400);
    if (!['/api/game', '/api/game/start', '/api/game/reset'].includes(url.pathname)) return json({ error: 'Niet gevonden' }, 404);
    if ((url.pathname === '/api/game' && request.method !== 'GET') || (url.pathname !== '/api/game' && request.method !== 'POST')) return json({ error: 'Niet toegestaan' }, 405);
    // Explicitly route only game APIs; public assets are otherwise static.
    const stub = env.DUCK_ROOMS.get(env.DUCK_ROOMS.idFromName('dublin-' + room));
    return stub.fetch(new Request(url, { method: request.method, headers: request.headers }));
  }
};
