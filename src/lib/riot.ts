export const ROUTING_CLUSTER = "americas";

function riotHeaders() {
  return { "X-Riot-Token": process.env.RIOT_API_KEY! };
}

// Limitador global de llamadas a Riot, compartido por TODA la app (no por
// cada funcion por separado). El motivo: pausar cada cadena de llamadas
// con su propio sleep() no evita que dos cadenas *distintas* corriendo al
// mismo tiempo (ej. el refresco del ranking y una busqueda de usuario) se
// sumen y pasen el limite compartido de la key — eso fue justo lo que paso
// (429 real) al probar el ranking. Un solo cupo por proceso, con margen
// bajo el limite real de Riot (20/1s, 100/120s), evita que se apilen.
const RATE_WINDOWS = [
  { maxCalls: 18, windowMs: 1_000 },
  { maxCalls: 95, windowMs: 120_000 },
];

// El trabajo de fondo (resync automatico, ranking) no debe poder ocupar
// TODO el cupo y dejar esperando a alguien que esta buscando algo ahora
// mismo en la pagina. Las llamadas "low" (fondo) respetan un tope mas
// chico, dejando siempre margen libre para las "high" (usuario esperando).
const LOW_PRIORITY_WINDOWS = [
  { maxCalls: 10, windowMs: 1_000 },
  { maxCalls: 55, windowMs: 120_000 },
];

type Priority = "high" | "low";

const callTimestamps: number[] = [];
const lowPriorityCallTimestamps: number[] = [];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function pruneOld(timestamps: number[], now: number) {
  while (timestamps.length && now - timestamps[0] > 120_000) {
    timestamps.shift();
  }
}

async function waitForSlot(priority: Priority) {
  for (;;) {
    const now = Date.now();
    pruneOld(callTimestamps, now);
    pruneOld(lowPriorityCallTimestamps, now);

    const blockedByGlobal = RATE_WINDOWS.some(
      (w) => callTimestamps.filter((t) => now - t <= w.windowMs).length >= w.maxCalls
    );
    const blockedByLowPriorityCap =
      priority === "low" &&
      LOW_PRIORITY_WINDOWS.some(
        (w) => lowPriorityCallTimestamps.filter((t) => now - t <= w.windowMs).length >= w.maxCalls
      );

    if (!blockedByGlobal && !blockedByLowPriorityCap) break;
    await sleep(100);
  }
  const now = Date.now();
  callTimestamps.push(now);
  if (priority === "low") lowPriorityCallTimestamps.push(now);
}

/** Todas las llamadas a Riot pasan por aqui: respeta el cupo global (y el
 * sub-cupo de fondo si aplica) y, si aun asi llega un 429, espera lo que
 * Riot pide (Retry-After) y reintenta una vez en vez de fallar de inmediato.
 * priority "high" (default) es para acciones que un usuario esta esperando
 * en pantalla; "low" es para mantenimiento automatico (resync, ranking). */
async function riotFetch(url: string, priority: Priority = "high"): Promise<Response> {
  await waitForSlot(priority);
  const res = await fetch(url, { headers: riotHeaders() });
  if (res.status === 429) {
    const retryAfterSeconds = Number(res.headers.get("Retry-After") ?? "1");
    await sleep((retryAfterSeconds + 0.5) * 1000);
    await waitForSlot(priority);
    return fetch(url, { headers: riotHeaders() });
  }
  return res;
}

export async function resolveRiotAccount(gameName: string, tagLine: string, priority: Priority = "high") {
  const riotRes = await riotFetch(
    `https://${ROUTING_CLUSTER}.api.riotgames.com/riot/account/v1/accounts/by-riot-id/${encodeURIComponent(
      gameName
    )}/${encodeURIComponent(tagLine)}`,
    priority
  );
  const data = await riotRes.json();
  return { ok: riotRes.ok, status: riotRes.status, data };
}

export async function fetchMatchIds(
  puuid: string,
  count = 20,
  priority: Priority = "high",
  start = 0
) {
  const res = await riotFetch(
    `https://${ROUTING_CLUSTER}.api.riotgames.com/lol/match/v5/matches/by-puuid/${puuid}/ids?start=${start}&count=${count}`,
    priority
  );
  if (!res.ok) {
    throw new Error(`Riot matchIds ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as string[];
}

export async function fetchMatch(matchId: string, priority: Priority = "high") {
  const res = await riotFetch(
    `https://${ROUTING_CLUSTER}.api.riotgames.com/lol/match/v5/matches/${matchId}`,
    priority
  );
  if (!res.ok) {
    throw new Error(`Riot match ${matchId} ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export async function fetchTimeline(matchId: string, priority: Priority = "high") {
  const res = await riotFetch(
    `https://${ROUTING_CLUSTER}.api.riotgames.com/lol/match/v5/matches/${matchId}/timeline`,
    priority
  );
  if (!res.ok) {
    throw new Error(`Riot timeline ${matchId} ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

/** Resuelve gameName/tagLine a partir de un puuid (para mostrar nombres del ranking). */
export async function fetchAccountByPuuid(puuid: string, priority: Priority = "low") {
  const res = await riotFetch(
    `https://${ROUTING_CLUSTER}.api.riotgames.com/riot/account/v1/accounts/by-puuid/${puuid}`,
    priority
  );
  if (!res.ok) {
    throw new Error(`Riot account by-puuid ${puuid} ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{ puuid: string; gameName: string; tagLine: string }>;
}

export type LeagueTier = "challenger" | "grandmaster" | "master";

/** Top de una liga de elite (Challenger/GM/Master) en una region, para una cola. */
export async function fetchLeagueEntries(platform: string, tier: LeagueTier, priority: Priority = "low") {
  const res = await riotFetch(
    `https://${platform}.api.riotgames.com/lol/league/v4/${tier}leagues/by-queue/RANKED_SOLO_5x5`,
    priority
  );
  if (!res.ok) {
    throw new Error(`Riot league ${platform}/${tier} ${res.status}: ${await res.text()}`);
  }
  return res.json() as Promise<{
    entries: Array<{ puuid: string; leaguePoints: number; wins: number; losses: number }>;
  }>;
}

/** Devuelve el nivel de maestria (1-10+) de un jugador con un campeon, o 0 si no ha jugado. */
export async function fetchChampionMastery(
  platform: string,
  puuid: string,
  championId: number,
  priority: Priority = "low"
) {
  const res = await riotFetch(
    `https://${platform}.api.riotgames.com/lol/champion-mastery/v4/champion-masteries/by-puuid/${puuid}/by-champion/${championId}`,
    priority
  );
  if (res.status === 404) return 0;
  if (!res.ok) {
    throw new Error(`Riot mastery ${puuid}/${championId} ${res.status}: ${await res.text()}`);
  }
  const data = (await res.json()) as { championLevel: number };
  return data.championLevel;
}
