import { DurableObject } from 'cloudflare:workers';

// V6: Cloudflare Durable Object is the single source of truth for each room.
// No GPS coordinates, phone numbers, names, media or challenge evidence are stored.
const GAME_MS = 120 * 60000;
const HEADSTART_MS = 10 * 60000;
const CHALLENGE_MS = 5 * 60000;
const DEFAULT_STATE = {
  status: 'lobby', revision: 0, seed: null, start: null,
  powerups: { bombUsed: false, bombActive: false, honeyUsed: false, celebrityUsed: false },
  challenge: { type: null, status: 'none', startedAt: null, deadline: null, finishedAt: null },
  duel: { used: false, status: 'none', winner: null, escapeUntil: null },
  eventSeq: 0, events: []
};
const HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store, max-age=0', 'x-content-type-options': 'nosniff' };
const clone = x => JSON.parse(JSON.stringify(x));
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: HEADERS });
function normalise(st) {
  return { ...clone(DEFAULT_STATE), ...(st || {}),
    powerups: { ...DEFAULT_STATE.powerups, ...(st?.powerups || {}) },
    challenge: { ...DEFAULT_STATE.challenge, ...(st?.challenge || {}) },
    duel: { ...DEFAULT_STATE.duel, ...(st?.duel || {}) },
    events: Array.isArray(st?.events) ? st.events.slice(-24) : [],
    eventSeq: Number.isInteger(st?.eventSeq) ? st.eventSeq : 0 };
}
function event(st, type, now) {
  st.eventSeq++;
  st.events.push({ id: st.eventSeq, type, at: now });
  st.events = st.events.slice(-24);
}
function markFailed(st, now) {
  const c = st.challenge;
  if (c.status !== 'active') return;
  c.status = 'failed'; c.finishedAt = now;
  event(st, c.type + '-failed', now);
}
function expire(st, now) {
  let changed = false;
  if (st.challenge.status === 'active' && now >= st.challenge.deadline) {
    markFailed(st, now); changed = true;
  }
  if (st.status === 'running' && Number.isFinite(st.start) && now - st.start >= GAME_MS) {
    st.status = 'finished'; event(st, 'chickens-win', now); changed = true;
  }
  return changed;
}
function freshRound(st, now) {
  const revision = st.revision + 1;
  const random = new Uint32Array(1); crypto.getRandomValues(random);
  Object.assign(st, clone(DEFAULT_STATE), { status: 'running', revision, seed: random[0] >>> 0, start: now });
}
function applyAction(st, body, now) {
  const { action, role, winner, type } = body || {};
  if (st.status !== 'running' || !Number.isFinite(st.start)) throw new Error('Het spel is niet actief.');
  if (now - st.start < HEADSTART_MS && !['bomb', 'disarm'].includes(action)) throw new Error('De jagers mogen pas na tien minuten in actie komen.');
  if (!['chicken', 'hunter'].includes(role)) throw new Error('Kies eerst een team.');
  const chickens = role === 'chicken', hunters = role === 'hunter';
  const p = st.powerups, d = st.duel, c = st.challenge;
  switch (action) {
    case 'bomb':
      if (!chickens) throw new Error('Alleen chickens kunnen de Jägerbomb droppen.');
      if (p.bombUsed) throw new Error('Jägerbomb is al gebruikt.');
      // Chickens may drop their one bomb at ANY point during an active round, even in the head start or Split the G.
      if (c.status === 'active') markFailed(st, now); // a bomb sabotages a live hunter challenge
      p.bombUsed = true; p.bombActive = true; event(st, 'bomb', now); break;
    case 'disarm':
      if (!hunters || !p.bombActive) throw new Error('Er is geen actieve Jägerbomb.');
      p.bombActive = false; event(st, 'disarm', now); break;
    case 'challenge-start':
      if (!hunters) throw new Error('Alleen jagers kunnen een challenge starten.');
      if (!['honey', 'celebrity'].includes(type)) throw new Error('Ongeldige challenge.');
      if (p.bombActive || d.status === 'pending') throw new Error('Jullie kunnen nu geen challenge beginnen.');
      if (c.status === 'active') throw new Error('Er loopt al een challenge.');
      if (p[type + 'Used']) throw new Error('Deze challenge is in deze ronde al geprobeerd.');
      p[type + 'Used'] = true; // attempted only once per round (including failures)
      st.challenge = { type, status: 'active', startedAt: now, deadline: now + CHALLENGE_MS, finishedAt: null };
      event(st, type + '-start', now); break;
    case 'challenge-success':
      if (!hunters || c.status !== 'active') throw new Error('Er loopt geen challenge.');
      if (now >= c.deadline) { markFailed(st, now); break; } // server clock decides
      c.status = 'won'; c.finishedAt = now; event(st, c.type + '-won', now); break;
    case 'challenge-fail':
      if (!hunters || c.status !== 'active') throw new Error('Er loopt geen challenge.');
      markFailed(st, now); break;
    case 'catch':
      if (!hunters) throw new Error('Alleen jagers kunnen een vangst melden.');
      if (p.bombActive) throw new Error('De Jägerbomb is nog actief.');
      if (d.status === 'pending') throw new Error('Split the G is al bezig.');
      if (d.escapeUntil && now < d.escapeUntil) throw new Error('Chickens hebben nog ontsnappingstijd.');
      if (c.status === 'active') markFailed(st, now);
      if (!d.used) { d.used = true; d.status = 'pending'; event(st, 'catch', now); }
      else { d.status = 'finished'; d.winner = 'hunter'; st.status = 'captured'; event(st, 'captured', now); }
      break;
    case 'duel-result':
      if (p.bombActive) throw new Error('Maak eerst de Jägerbomb onschadelijk.');
      if (!hunters || d.status !== 'pending') throw new Error('Er is geen Split the G-challenge.');
      if (!['chicken', 'hunter'].includes(winner)) throw new Error('Kies wie Split the G heeft gewonnen.');
      d.winner = winner; d.status = 'finished';
      if (winner === 'chicken') { d.escapeUntil = now + 60000; event(st, 'chickens-escape', now); }
      else { st.status = 'captured'; event(st, 'captured', now); }
      break;
    default: throw new Error('Onbekende power-up.');
  }
}

export class DuckHuntRoom extends DurableObject {
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (request.method === 'GET' && path === '/api/game') {
      // Keep deadlines authoritative even when both clients were asleep.
      const st = await this.ctx.storage.transaction(async txn => {
        const game = normalise(await txn.get('state'));
        if (expire(game, Date.now())) await txn.put('state', game);
        return game;
      });
      return json({ ...st, serverTime: Date.now() });
    }
    if (request.method !== 'POST') return json({ error: 'Niet toegestaan' }, 405);
    let body = {};
    if (path === '/api/game/action') {
      try { body = await request.json(); } catch { return json({ error: 'Ongeldige opdracht' }, 400); }
    }
    try {
      const next = await this.ctx.storage.transaction(async txn => {
        const st = normalise(await txn.get('state'));
        const now = Date.now();
        expire(st, now);
        if (path === '/api/game/start') {
          if (st.status !== 'lobby') throw new Error('De ronde is al gestart.');
          freshRound(st, now);
        } else if (path === '/api/game/restart') {
          if (!['captured','finished'].includes(st.status)) throw new Error('Opnieuw spelen kan zodra de ronde is afgelopen. Gebruik RESET om eerder te stoppen.');
          freshRound(st, now);
        } else if (path === '/api/game/reset') {
          Object.assign(st, clone(DEFAULT_STATE), { revision: st.revision + 1 });
        } else if (path === '/api/game/action') {
          applyAction(st, body, now);
        } else throw new Error('Onbekende actie.');
        await txn.put('state', st);
        return st;
      });
      return json({ ...next, serverTime: Date.now() });
    } catch (error) { return json({ error: error.message || 'Actie mislukt' }, 409); }
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    const room = (url.searchParams.get('room') || '').toUpperCase();
    if (!/^[A-Z2-9]{8,12}$/.test(room)) return json({ error: 'Ongeldige spelcode' }, 400);
    const allowed = ['/api/game', '/api/game/start', '/api/game/restart', '/api/game/reset', '/api/game/action'];
    if (!allowed.includes(url.pathname)) return json({ error: 'Niet gevonden' }, 404);
    if ((url.pathname === '/api/game' && request.method !== 'GET') || (url.pathname !== '/api/game' && request.method !== 'POST')) return json({ error: 'Niet toegestaan' }, 405);
    const stub = env.DUCK_ROOMS.get(env.DUCK_ROOMS.idFromName('dublin-' + room));
    return stub.fetch(new Request(url, { method: request.method, headers: request.headers, body: request.method === 'POST' ? request.body : undefined, duplex: request.method === 'POST' ? 'half' : undefined }));
  }
};
