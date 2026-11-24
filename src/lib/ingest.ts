import { prisma } from "@/lib/prisma";
import { prismaBackground } from "@/lib/prismaBackground";
import { fetchChampionMastery, fetchMatch, fetchMatchIds, fetchTimeline } from "@/lib/riot";
import { findCleanDuels, MAX_DUELS_PER_MATCH, type CleanDuel } from "@/lib/championDuels";

const MIN_MASTERY_FOR_DUEL = 7;

// Los duelos 1v1 solo tienen sentido como dato de carril real en las colas
// clasificatorias — en ARAM no hay carriles (todos pelean revueltos desde
// el inicio) y en normales el nivel es demasiado variable, asi que un
// "duelo" ahi no refleja nada comparable. Limitar el analisis a estas dos
// colas tambien evita gastar tiempo/llamadas de maestria en partidas que
// de todos modos no alimentarian la pestaña de Campeones con datos utiles.
const RANKED_QUEUE_IDS = new Set([420, 440]); // Solo/Duo, Flex

// Con el resync en paralelo (dailyResync.ts), dos cuentas trackeadas que son
// compañeras de equipo en la misma partida pueden caer en workers distintos
// y guardar esa partida al mismo tiempo — ambas ven "no existe todavia" y
// las dos intentan crearla, la segunda choca contra la restriccion unica en
// vez de convertirse en un update solo (asi es el upsert de Postgres bajo
// una carrera real). No es un error real: la fila ya quedo bien creada por
// la otra, asi que esto lo trata como exito en vez de tumbar la sincronizacion.
function isUniqueConstraintRace(err: unknown) {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: string }).code === "P2002";
}

// better-sqlite3 es sincrono: cada escritura bloquea todo el proceso de
// Node por un instante. En un loop largo (muchas partidas/cuentas
// seguidas) eso se acumula y deja sin aire al event loop, haciendo que
// otras peticiones (como una busqueda que alguien esta esperando ver en
// pantalla) queden congeladas aunque tengan prioridad alta en el
// limitador de Riot. Esto le da un respiro entre cada escritura pesada.
function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

// Traer solo los datos basicos de una partida (sin linea de tiempo) es lo
// minimo que hace falta para mostrarla en el historial (campeon, K/D/A,
// items, W/L) — la linea de tiempo solo la necesitan las estadisticas por
// tramo y los duelos, que se calculan despues en segundo plano sin que el
// usuario tenga que esperarlas (ver enrichMatchInBackground). Con 20
// partidas nuevas de una cuenta recien descubierta, traerlas una por una
// tardaria minutos por la suma de los viajes de ida y vuelta a Riot, asi que
// se traen varias a la vez — el limitador de riot.ts sigue siendo el que
// manda cuanto se le puede pedir a Riot realmente, esto solo evita esperar
// de a una.
const CONCURRENT_MATCH_FETCHES = 5;

async function fetchMatchesConcurrently(
  matchIds: string[],
  priority: "high" | "low"
): Promise<Array<{ matchId: string; matchData: any }>> {
  const results: Array<{ matchId: string; matchData: any }> = new Array(matchIds.length);
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const current = nextIndex++;
      if (current >= matchIds.length) return;
      const matchId = matchIds[current];
      const matchData = await fetchMatch(matchId, priority);
      results[current] = { matchId, matchData };
    }
  }

  const workerCount = Math.min(CONCURRENT_MATCH_FETCHES, matchIds.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

// Riot solo da 20 ids de partida por pedido — si alguien jugo mas de 20
// desde la ultima revision (una racha larga, o una cuenta que no se
// chequeaba hace tiempo y de repente jugo mucho), pedir siempre "las
// ultimas 20" deja fuera todo lo anterior para siempre, sin que nadie se
// entere. Esto va pidiendo tandas hacia atras hasta toparse con una
// partida que ya tenemos guardada (ahi para, ya no hace falta seguir mas
// atras) — un tope de seguridad evita que una cuenta muy inactiva dispare
// un catch-up gigante de una sola vez.
const MATCH_ID_PAGE_SIZE = 20;
const MAX_MATCH_ID_PAGES = 10;

// Para una cuenta completamente nueva (nadie la conocia todavia) esto se
// achica a 1 sola pagina — no tiene sentido traer y analizar hasta 200
// partidas de una sola vez cuando la pantalla solo muestra 20 al principio,
// y multiplicaria el costo real por cada cuenta nueva que alguien busque.
// El resto de su historial mas viejo lo va alcanzando solo, de a poco, en
// las pasadas de resync siguientes (ahi ya no es "nueva" y usa el tope
// completo de 10 paginas, igual que cualquier cuenta activa).
const MAX_MATCH_ID_PAGES_NEW_ACCOUNT = 1;

async function fetchNewMatchIds(
  puuid: string,
  riotAccountId: string,
  db: typeof prisma,
  priority: "high" | "low",
  isNewAccount: boolean
) {
  const newIds: string[] = [];
  const maxPages = isNewAccount ? MAX_MATCH_ID_PAGES_NEW_ACCOUNT : MAX_MATCH_ID_PAGES;

  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchMatchIds(puuid, MATCH_ID_PAGE_SIZE, priority, page * MATCH_ID_PAGE_SIZE);
    if (batch.length === 0) break;

    // Ojo: se compara contra el historial de ESTA cuenta puntual (via
    // MatchParticipant), no contra la tabla Match entera — una partida
    // puede ya existir ahi porque un companero de equipo (otra cuenta que
    // seguimos) la trajo primero, sin que esta cuenta tenga su propio
    // registro todavia.
    const existing = await db.matchParticipant.findMany({
      where: { riotAccountId, matchId: { in: batch } },
      select: { matchId: true },
    });
    const existingIds = new Set(existing.map((m) => m.matchId));

    let hitKnownMatch = false;
    for (const id of batch) {
      if (existingIds.has(id)) {
        hitKnownMatch = true;
        break;
      }
      newIds.push(id);
    }

    if (hitKnownMatch || batch.length < MATCH_ID_PAGE_SIZE) break;
  }

  return newIds;
}

// Cache de maestria compartido entre partidas y entre cuentas (no solo
// dentro de una misma partida): el nivel de un jugador con un campeon no
// cambia de un minuto a otro, asi que si dos partidas nuevas comparten un
// mismo jugador/campeon no hace falta pedirselo a Riot dos veces. El
// espaciado entre llamadas ya lo maneja el limitador global en riot.ts.
const MASTERY_CACHE_TTL_MS = 10 * 60 * 1000;
const masteryCache = new Map<string, { level: number; fetchedAt: number }>();

async function getMastery(platform: string, puuid: string, championId: number) {
  const key = `${platform}:${puuid}:${championId}`;
  const cached = masteryCache.get(key);
  if (cached && Date.now() - cached.fetchedAt < MASTERY_CACHE_TTL_MS) {
    return cached.level;
  }
  const level = await fetchChampionMastery(platform, puuid, championId);
  masteryCache.set(key, { level, fetchedAt: Date.now() });
  return level;
}

// El tope de MAX_DUELS_PER_MATCH por pareja se aplica dos veces en la
// pagina: aca (antes de gastar la llamada de maestria) y otra vez en la
// consulta que arma la pestaña de Campeones. Es a proposito — filtrar solo
// del lado de la consulta ya evitaba que el resultado mostrado se inflara,
// pero seguia gastando maestria (llamada real a Riot) en duelos que de
// antemano sabiamos que nunca iban a contar para nada (ej. una partida con
// 15 duelos de la misma pareja, donde los duelos 5 al 15 jamas se
// muestran). Filtrando aca tambien, esos de mas ni siquiera se revisan.
function capDuelsPerMatchup(duels: CleanDuel[]): CleanDuel[] {
  const grouped = new Map<string, CleanDuel[]>();
  for (const duel of duels) {
    const pairKey = [duel.killerChampion, duel.victimChampion].sort().join("|");
    const group = grouped.get(pairKey) ?? [];
    group.push(duel);
    grouped.set(pairKey, group);
  }

  const capped: CleanDuel[] = [];
  for (const group of grouped.values()) {
    group.sort((a, b) => a.timeBucket - b.timeBucket);
    capped.push(...group.slice(0, MAX_DUELS_PER_MATCH));
  }
  return capped;
}

/**
 * Trabajo de fondo por partida, despues de que ya se guardo y se le mostro
 * al usuario: calcula los duelos 1v1 limpios entre campeones de maestria
 * alta para la pestaña de Campeones. Las estadisticas por tramo (oro/dano
 * por cada 5 min) YA NO se calculan aca — eso quedo bajo demanda, solo
 * cuando alguien pide ver una partida puntual en detalle (ver
 * /api/matches/[matchId]/analyze), para no gastar la linea de tiempo de
 * partidas que nadie va a revisar a fondo. Se procesa una sola vez por
 * partida.
 */
export async function enrichMatchInBackground(matchId: string, matchData: any, priority: "high" | "low" = "low") {
  // Siempre corre en el fondo (nunca bloquea una respuesta a un usuario),
  // asi que usa el pool de conexiones de mantenimiento, no el principal.
  const match = await prismaBackground.match.findUnique({
    where: { id: matchId },
    select: { championDuelsProcessed: true, gameCreation: true },
  });
  if (!match || match.championDuelsProcessed) return;

  // Fuera de ranked no hay nada que hacer aca (los duelos solo aplican a
  // Solo/Duo y Flex) — ni vale la pena pedir la linea de tiempo.
  if (RANKED_QUEUE_IDS.has(matchData.info.queueId)) {
    const timeline = await fetchTimeline(matchId, priority);
    const platform = (matchData.info.platformId as string).toLowerCase();
    const duels = capDuelsPerMatchup(findCleanDuels(matchData, timeline));

    for (const duel of duels) {
      const killerMastery = await getMastery(platform, duel.killerPuuid, duel.killerChampionId);
      const victimMastery = await getMastery(platform, duel.victimPuuid, duel.victimChampionId);
      if (killerMastery < MIN_MASTERY_FOR_DUEL || victimMastery < MIN_MASTERY_FOR_DUEL) continue;

      await prismaBackground.championDuel.create({
        data: {
          matchId,
          gameCreation: match.gameCreation,
          timeBucket: duel.timeBucket,
          platform,
          position: duel.position,
          killerChampion: duel.killerChampion,
          victimChampion: duel.victimChampion,
          killerMastery,
          victimMastery,
        },
      });
      await yieldToEventLoop();
    }
  }

  // Una vez calculados los duelos, el JSON crudo ya no sirve para nada mas
  // (el resumen que usa la pestaña Partidas se guardo aparte al momento de
  // ingerir la partida) — se vacia para no dejarlo ocupando espacio para
  // siempre sin usarse. Si alguien pide el analisis por tiempo despues, se
  // vuelve a traer todo fresco desde Riot (ver el endpoint de analyze).
  await prismaBackground.match.update({
    where: { id: matchId },
    data: { championDuelsProcessed: true, rawData: null, timelineData: null },
  });
}

// Evita re-sincronizar la misma cuenta si la acaban de sincronizar hace
// poco — ni por un doble-fetch nuestro (AuthWidget + MatchesSection piden
// /api/auth/me por separado) ni porque varios visitantes distintos vean al
// mismo jugador seguido (ej. uno popular del ranking). Nadie termina una
// partida nueva en menos de unos minutos, asi que no hace falta volver a
// preguntarle a Riot mas seguido que eso.
const SYNC_GUARD_MS = 5 * 60 * 1000;
const recentSyncAt = new Map<string, number>();

// Las dos cachés de arriba (maestria y este guardian de resync) nunca
// borran nada por si solas — cada entrada nueva se queda para siempre en
// memoria aunque ya haya vencido su TTL y nadie la vuelva a leer. Con miles
// de duelos y cientos de cuentas procesadas, eso se acumula sin limite
// mientras el proceso siga corriendo. Esto se llama periodicamente (ver
// dailyResync.ts) para sacar lo que ya vencio, igual que se hace con las
// partidas viejas en la base de datos.
export function cleanupStaleCaches() {
  const now = Date.now();
  let masteryRemoved = 0;
  for (const [key, entry] of masteryCache) {
    if (now - entry.fetchedAt >= MASTERY_CACHE_TTL_MS) {
      masteryCache.delete(key);
      masteryRemoved++;
    }
  }

  let syncGuardRemoved = 0;
  for (const [key, lastSync] of recentSyncAt) {
    if (now - lastSync >= SYNC_GUARD_MS) {
      recentSyncAt.delete(key);
      syncGuardRemoved++;
    }
  }

  return { masteryRemoved, syncGuardRemoved };
}

// Guarda un lote de partidas ya traidas de Riot para una cuenta puntual —
// lo comparten syncRiotAccount (partidas nuevas desde la ultima revision) y
// fetchOlderMatches (partidas mas viejas pedidas a mano con "Ver mas"). El
// analisis (duelos/estadisticas) NO se dispara aca — queda con
// championDuelsProcessed=false y lo recoge el barrido periodico
// (processPendingEnrichment), que reparte el trabajo en el tiempo en vez de
// intentarlo todo de golpe apenas se descubre.
async function saveMatchesForAccount(
  db: typeof prisma,
  riotAccount: { id: string; puuid: string; platform: string },
  fetchedMatches: Array<{ matchId: string; matchData: any }>
) {
  const saved: string[] = [];
  let realPlatform: string | null = null;

  for (const { matchId, matchData } of fetchedMatches) {
    const info = matchData.info;
    const participant = info.participants.find(
      (p: { puuid: string }) => p.puuid === riotAccount.puuid
    );
    if (!participant) continue;

    realPlatform ??= (info.platformId as string).toLowerCase();

    const finalItems = [
      participant.item0,
      participant.item1,
      participant.item2,
      participant.item3,
      participant.item4,
      participant.item5,
      participant.item6,
    ];

    try {
      await db.match.upsert({
        where: { id: matchId },
        update: {},
        create: {
          id: matchId,
          gameCreation: new Date(info.gameCreation),
          gameDuration: info.gameDuration,
          queueId: info.queueId,
          patch: info.gameVersion.split(".").slice(0, 2).join("."),
          rawData: JSON.stringify(matchData),
          // La linea de tiempo no se pide todavia — solo hace falta para las
          // estadisticas por tramo y los duelos, que se calculan despues en
          // segundo plano (ver enrichMatchInBackground) sin bloquear lo que
          // el usuario esta esperando ver en el historial.
          timelineData: null,
        },
      });
    } catch (err) {
      if (!isUniqueConstraintRace(err)) throw err;
    }

    try {
      await db.matchParticipant.upsert({
        where: {
          matchId_riotAccountId: { matchId, riotAccountId: riotAccount.id },
        },
        update: {},
        create: {
          matchId,
          riotAccountId: riotAccount.id,
          championName: participant.championName,
          win: participant.win,
          kills: participant.kills,
          deaths: participant.deaths,
          assists: participant.assists,
          goldEarned: participant.goldEarned,
          totalDamageDealtToChampions: participant.totalDamageDealtToChampions,
          items: JSON.stringify(finalItems),
          roleBoundItem: participant.roleBoundItem || null,
          teamPosition: participant.teamPosition || null,
          customStats: null,
        },
      });
    } catch (err) {
      if (!isUniqueConstraintRace(err)) throw err;
    }

    saved.push(matchId);
    await yieldToEventLoop();
  }

  return { saved, realPlatform };
}

// El servidor real de la cuenta se saca del dato de la propia partida, no
// del selector que eligio quien la busco (puede estar mal, ej. si busca
// pensando que es LAN pero en realidad juega en BR). Solo sirve una
// partida que todavia tenga el JSON crudo (las ya procesadas lo tienen
// vacio) — si no queda ninguna asi, ya se habra corregido en una pasada
// anterior cuando esa partida todavia estaba fresca.
async function correctPlatformIfNeeded(
  db: typeof prisma,
  riotAccount: { id: string; platform: string },
  realPlatform: string | null
) {
  if (!realPlatform) {
    const anyMatch = await db.matchParticipant.findFirst({
      where: { riotAccountId: riotAccount.id, match: { rawData: { not: null } } },
      select: { match: { select: { rawData: true } } },
    });
    if (anyMatch?.match.rawData) {
      realPlatform = (JSON.parse(anyMatch.match.rawData).info.platformId as string).toLowerCase();
    }
  }
  if (realPlatform && realPlatform !== riotAccount.platform) {
    await db.riotAccount.update({
      where: { id: riotAccount.id },
      data: { platform: realPlatform },
    });
  }
}

// Cuantas partidas pendientes se procesan como maximo por cada barrido
// (ver processPendingEnrichment). Antes cada partida nueva disparaba su
// propio analisis de inmediato, todas a la vez apenas se descubrian — eso
// satura el cupo compartido de Riot en rafagas y hace que algunos intentos
// fallen sin reintento (ver la nota en processPendingEnrichment). Con un
// presupuesto fijo por pasada, el trabajo se reparte parejo en el tiempo en
// vez de golpear todo de una. Subir este numero cuando se consiga mas cupo
// de Riot (clave de produccion), bajarlo si el pendiente crece muy rapido.
export const ENRICH_BATCH_SIZE = 60;

// Del presupuesto de cada pasada, esta porcion se reserva SIEMPRE para las
// partidas mas viejas pendientes, sin importar que tan fresco este el resto
// de la cola. Sin esto, una partida vieja podria no tener turno NUNCA: como
// el resto del cupo siempre prioriza lo mas reciente y constantemente
// siguen entrando partidas nuevas, algo viejo quedaria compitiendo contra
// un chorro infinito de cosas mas nuevas y jamas le tocaria — quedaria
// huerfano para siempre en vez de solo esperar mas. Con esta reserva, en el
// peor caso una partida vieja tarda mas pasadas en procesarse, pero siempre
// avanza.
const OLDEST_RESERVED_SHARE = 10;

// Una partida jugada hace mas de esto ya no refleja el meta actual, asi que
// insistir en analizarla solo gastaria cupo de Riot en un dato que casi no
// aporta — distinto del caso anterior (partidas esperando turno sin que
// nadie lo decidiera): aca se decide a propósito dejar de intentarlo. Se
// basa en cuando se JUGO la partida (gameCreation), no en cuando la
// descubrimos, porque lo que importa es que tan vieja es para el meta, no
// cuanto lleva en la cola.
const STALE_MATCH_DAYS = 30;

async function expireStaleMatches() {
  const cutoff = new Date(Date.now() - STALE_MATCH_DAYS * 24 * 60 * 60 * 1000);
  const result = await prismaBackground.match.updateMany({
    where: { championDuelsProcessed: false, gameCreation: { lt: cutoff } },
    data: { championDuelsProcessed: true, rawData: null, timelineData: null },
  });
  return result.count;
}

// Barrido periodico (ver dailyResync.ts) que reemplaza el disparo inmediato
// de antes: en vez de intentar analizar cada partida nueva apenas se
// descubre (lo que saturaba el cupo de Riot en rafagas y dejaba intentos
// fallidos sin reintento para siempre), esto primero descarta lo demasiado
// viejo para importar (ver expireStaleMatches) y despues toma un lote
// acotado de lo que queda pendiente — la mayoria de lo MAS RECIENTE (una
// partida vieja no aporta mas que una nueva al meta actual, asi que si el
// pendiente crece mas rapido de lo que se puede procesar, conviene
// priorizar lo fresco) mas una porcion reservada de lo mas viejo (que
// todavia no supera el corte de STALE_MATCH_DAYS), para que nada quede
// esperando para siempre sin que nadie lo decida (ver
// OLDEST_RESERVED_SHARE). El JSON crudo de cada partida sigue disponible
// hasta que se procesa o se descarta, asi que nada se pierde por quedar
// esperando varias pasadas.
export async function processPendingEnrichment(limit: number = ENRICH_BATCH_SIZE) {
  const expired = await expireStaleMatches();

  const oldestShare = Math.min(OLDEST_RESERVED_SHARE, limit);
  const newestShare = limit - oldestShare;

  const [newest, oldest] = await Promise.all([
    prismaBackground.match.findMany({
      where: { championDuelsProcessed: false, rawData: { not: null } },
      orderBy: { gameCreation: "desc" },
      take: newestShare,
      select: { id: true, rawData: true },
    }),
    prismaBackground.match.findMany({
      where: { championDuelsProcessed: false, rawData: { not: null } },
      orderBy: { gameCreation: "asc" },
      take: oldestShare,
      select: { id: true, rawData: true },
    }),
  ]);

  // Las viejas van PRIMERO en el lote a propósito: cada partida ranked
  // cuesta varios segundos reales (linea de tiempo + maestria) bajo el cupo
  // compartido actual, y el lote se procesa una por una en orden — si las
  // nuevas fueran primero, en la practica el barrido se queda trabajando en
  // esas 50 y nunca llega a alcanzar la reserva de viejas dentro de los 5
  // minutos antes de que arranque la siguiente pasada (esto paso de verdad
  // en una prueba: la reserva quedaba siempre sin tocar). Poniendo las
  // viejas primero, la garantia se cumple pase lo que pase con el resto.
  const seen = new Set<string>();
  const batch = [...oldest, ...newest].filter((match) => {
    if (seen.has(match.id)) return false;
    seen.add(match.id);
    return true;
  });

  let processed = 0;
  for (const match of batch) {
    if (!match.rawData) continue;
    try {
      const matchData = JSON.parse(match.rawData);
      await enrichMatchInBackground(match.id, matchData, "low");
      processed++;
    } catch (err) {
      console.error(`Error enriqueciendo partida ${match.id}:`, err);
    }
    await yieldToEventLoop();
  }

  return { checked: batch.length, processed, expired };
}

export async function syncRiotAccount(riotAccountId: string, priority: "high" | "low" = "high") {
  // "high" (alguien esperando en pantalla) usa el pool principal; "low"
  // (resync automatico) usa el pool de mantenimiento, aparte y mas chico,
  // para que nunca le robe conexiones a una peticion activa.
  const db = priority === "low" ? prismaBackground : prisma;

  const lastSync = recentSyncAt.get(riotAccountId);
  if (lastSync && Date.now() - lastSync < SYNC_GUARD_MS) {
    return { checked: 0, newMatches: 0, matchIds: [] };
  }
  recentSyncAt.set(riotAccountId, Date.now());

  const riotAccount = await db.riotAccount.findUniqueOrThrow({
    where: { id: riotAccountId },
  });

  const isNewAccount =
    (await db.matchParticipant.count({ where: { riotAccountId: riotAccount.id } })) === 0;
  const newMatchIds = await fetchNewMatchIds(
    riotAccount.puuid,
    riotAccount.id,
    db,
    priority,
    isNewAccount
  );

  const fetchedMatches = await fetchMatchesConcurrently(newMatchIds, priority);
  const { saved, realPlatform } = await saveMatchesForAccount(db, riotAccount, fetchedMatches);

  await correctPlatformIfNeeded(db, riotAccount, realPlatform);

  return { checked: newMatchIds.length, newMatches: saved.length, matchIds: saved };
}

// Trae partidas MAS VIEJAS que las que ya se conocen de esta cuenta —
// distinto de syncRiotAccount (que trae las nuevas desde la ultima
// revision). Esto es lo que dispara el boton "Ver mas" cuando ya no hay
// suficientes guardadas para completar el pedido: en vez de esperar a que
// el resync de fondo llegue a esta cuenta algun dia, se piden en el momento.
export async function fetchOlderMatches(riotAccountId: string, additionalCount: number) {
  const riotAccount = await prisma.riotAccount.findUniqueOrThrow({ where: { id: riotAccountId } });

  // Se asume que lo ya guardado son las N partidas mas recientes sin huecos
  // (asi es como las guarda syncRiotAccount) — pedir desde ese punto en
  // adelante trae exactamente las siguientes mas viejas.
  const existingCount = await prisma.matchParticipant.count({
    where: { riotAccountId: riotAccount.id },
  });

  const olderIds = await fetchMatchIds(riotAccount.puuid, additionalCount, "high", existingCount);
  if (olderIds.length === 0) return { fetched: 0 };

  const fetchedMatches = await fetchMatchesConcurrently(olderIds, "high");
  const { saved, realPlatform } = await saveMatchesForAccount(prisma, riotAccount, fetchedMatches);

  await correctPlatformIfNeeded(prisma, riotAccount, realPlatform);

  return { fetched: saved.length };
}
