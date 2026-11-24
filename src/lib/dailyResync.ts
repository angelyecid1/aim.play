import { prismaBackground as prisma } from "@/lib/prismaBackground";
import { syncRiotAccount, processPendingEnrichment, cleanupStaleCaches } from "@/lib/ingest";
import { refreshLeaderboard } from "@/lib/leaderboard";
import { ROUTING_CLUSTER } from "@/lib/riot";
import { exportDuelsSnapshot } from "@/lib/duelsSnapshot";

// Ver la nota igual en ingest.ts: better-sqlite3 bloquea el proceso por
// cada escritura, asi que un loop largo sin pausas deja sin aire a otras
// peticiones (ej. una busqueda activa) aunque tengan prioridad alta.
function yieldToEventLoop() {
  return new Promise((resolve) => setImmediate(resolve));
}

const RESYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;

// Cuentas que nadie vio en este tiempo (y que ya no estan en el ranking
// actual) se dejan de revisar automaticamente — sus partidas ya guardadas
// siguen disponibles, solo se detiene el chequeo periodico hasta que
// alguien vuelva a buscarlas. Evita que la lista de "cuentas a revisar"
// crezca para siempre con gente que nadie volvio a mirar.
const INACTIVE_AFTER_MS = 30 * 24 * 60 * 60 * 1000;

// Convierte cada entrada del ranking en una cuenta real (si todavia no
// existia) para que el resync de abajo tambien le traiga su historial. Una
// vez creada la primera vez, ya queda como cualquier otra cuenta conocida
// y este paso no vuelve a hacer nada por ella.
async function ensureLeaderboardAccountsExist() {
  const leaderboardEntries = await prisma.leaderboardEntry.findMany();
  for (const entry of leaderboardEntries) {
    await prisma.riotAccount.upsert({
      where: { puuid: entry.puuid },
      update: {},
      create: {
        puuid: entry.puuid,
        gameName: entry.gameName,
        tagLine: entry.tagLine,
        region: ROUTING_CLUSTER,
        platform: entry.platform,
      },
    });
    await yieldToEventLoop();
  }
}

// Revisita cada cuenta que la pagina ya conoce (no solo las vinculadas a un
// usuario logueado) cada 12 horas, buscando partidas nuevas — incluyendo a
// los del ranking, que se auto-agregan aca mismo sin que nadie tenga que
// hacerles clic. Asi, con solo haber visto el historial de un jugador una
// vez (buscandolo, o porque aparecio en el ranking), la base de datos se
// sigue alimentando sola.
async function runResyncAll() {
  await refreshLeaderboard().catch((err) => console.error("[resync] error actualizando ranking:", err));
  await ensureLeaderboardAccountsExist().catch((err) =>
    console.error("[resync] error creando cuentas del ranking:", err)
  );

  const currentLeaderboardPuuids = (await prisma.leaderboardEntry.findMany({ select: { puuid: true } })).map(
    (e) => e.puuid
  );
  const recentlyViewedCutoff = new Date(Date.now() - INACTIVE_AFTER_MS);

  // Se revisan las cuentas vistas hace poco por alguien, o las que siguen
  // actualmente en el ranking (esas se mantienen frescas aunque nadie las
  // haya mirado, porque siguen siendo relevantes para el ranking en si).
  const accounts = await prisma.riotAccount.findMany({
    where: {
      OR: [
        { lastViewedAt: { gt: recentlyViewedCutoff } },
        { puuid: { in: currentLeaderboardPuuids } },
      ],
    },
    select: { id: true, gameName: true },
  });
  console.log(`[resync] revisando ${accounts.length} cuentas activas...`);

  // Antes esto era una cuenta a la vez: la cuenta 200 esperaba a que las 199
  // anteriores terminaran su propio viaje de ida y vuelta a Riot, aunque el
  // limitador compartido (riot.ts) igual tenia margen para atender varias
  // en simultaneo. Con un pool de workers, varias cuentas piden su chequeo
  // al mismo tiempo — el limitador sigue siendo el unico que decide cuanto
  // se le puede pedir a Riot realmente, esto solo evita que la cola de
  // cuentas se atrase esperando de a una. El pool de conexiones de fondo
  // (prismaBackground) tiene margen para esto (ver su comentario).
  const RESYNC_CONCURRENCY = 8;
  let nextIndex = 0;

  async function worker() {
    for (;;) {
      const current = nextIndex++;
      if (current >= accounts.length) return;
      const account = accounts[current];
      // Prioridad baja: esto es mantenimiento de fondo, no debe competir en
      // igualdad de condiciones con una busqueda que alguien esta esperando
      // ver en pantalla ahora mismo (ver el cupo reservado en riot.ts).
      await syncRiotAccount(account.id, "low").catch((err) => {
        console.error(`[resync] error con ${account.gameName} (${account.id}):`, err);
      });
      await yieldToEventLoop();
    }
  }

  const workerCount = Math.min(RESYNC_CONCURRENCY, accounts.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));

  console.log("[resync] listo.");

  // Foto de respaldo de los resultados de duelos, para que la pestaña de
  // Campeones pueda seguir mostrando algo (aunque congelado) si la base se
  // vuelve a bloquear (ej. tope del plan gratuito de Prisma) antes del
  // proximo resync. Si esto falla no debe tumbar el resync — ya se llego
  // hasta aca porque la base SI respondio arriba, pero por si acaso.
  try {
    const count = await exportDuelsSnapshot(prisma);
    console.log(`[resync] snapshot de duelos actualizado (${count} campeones).`);
  } catch (err) {
    console.error("[resync] error generando snapshot de duelos:", err);
  }
}

// Barrido de partidas pendientes de analizar (duelos/estadisticas) —
// separado del resync de cuentas de arriba porque es mucho mas barato de
// chequear (una consulta a la base de datos) y conviene que corra seguido,
// en lotes chicos, para que lo recien descubierto no espere horas a que
// llegue la proxima pasada de 12h. Ver processPendingEnrichment en
// ingest.ts para el porque del presupuesto por lote y el orden (mas nuevo
// primero).
const ENRICH_INTERVAL_MS = 5 * 60 * 1000;

let started = false;

/** Se llama una vez al arrancar el servidor (ver src/instrumentation.ts). */
export function startDailyResyncJob() {
  if (started) return;
  started = true;

  // Una pasada al arrancar el servidor, y despues una vez cada 12 horas
  // mientras el proceso siga corriendo.
  runResyncAll().catch((err) => console.error("[resync] error inicial:", err));
  setInterval(() => {
    runResyncAll().catch((err) => console.error("[resync] error:", err));
  }, RESYNC_INTERVAL_MS);

  processPendingEnrichment().catch((err) => console.error("[enrich] error inicial:", err));
  setInterval(() => {
    processPendingEnrichment().catch((err) => console.error("[enrich] error:", err));
    // Se aprovecha el mismo intervalo de 5 min para sacar de las cachés en
    // memoria (maestria, guardian de resync) lo que ya vencio — es barato
    // (solo recorrer dos mapas chicos), no necesita su propio temporizador.
    cleanupStaleCaches();
  }, ENRICH_INTERVAL_MS);
}
