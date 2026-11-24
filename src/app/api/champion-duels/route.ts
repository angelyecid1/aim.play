import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { RECENT_DUELS_PER_MATCHUP } from "@/lib/championDuels";
import { getChampionMatchups, readDuelsSnapshotForChampion } from "@/lib/duelsSnapshot";

// Tope de enfrentamientos recientes que cuentan por CADA rival por
// separado — antes se traian los 500 duelos mas recientes del campeon
// mezclados contra TODOS sus rivales juntos, asi que un rival muy comun
// (ej. muchos duelos seguidos contra el mismo campeon) podia "ocupar" gran
// parte de ese cupo compartido y dejar a rivales menos comunes mal
// representados aunque tuvieran historial real. Ahora cada pareja tiene su
// propia ventana de los 50 mas recientes, sin competir entre si.

// De esos 50, como maximo esta cantidad puede venir de UNA MISMA partida
// (ver MAX_DUELS_PER_MATCH en championDuels.ts) — sin este tope, una sola
// paliza (un jugador fed matando al mismo rival 10+ veces en una partida)
// podia por si sola definir todo el balance mostrado de una pareja —
// verificado con datos reales: hubo parejas con 15 duelos TODOS de una
// unica partida. Con el tope, esa partida aporta como maximo un "mejor de
// 4" (4-0, 3-1, 2-2...) en vez de inflar el resultado.

export async function GET(request: NextRequest) {
  const champion = request.nextUrl.searchParams.get("champion");
  const against = request.nextUrl.searchParams.get("against");
  const platform = request.nextUrl.searchParams.get("platform");
  const position = request.nextUrl.searchParams.get("position");
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? RECENT_DUELS_PER_MATCHUP);

  if (!champion) {
    return Response.json({ error: "Falta el parametro champion" }, { status: 400 });
  }

  const extraFilters = {
    ...(platform ? { platform } : {}),
    ...(position ? { position } : {}),
  };

  if (against) {
    try {
      const duels = await prisma.championDuel.findMany({
        where: {
          ...extraFilters,
          OR: [
            { killerChampion: champion, victimChampion: against },
            { killerChampion: against, victimChampion: champion },
          ],
        },
        orderBy: { gameCreation: "desc" },
        take: limit,
      });

      const championWins = duels.filter((d) => d.killerChampion === champion).length;
      const againstWins = duels.filter((d) => d.killerChampion === against).length;

      return Response.json({
        champion,
        against,
        platform: platform ?? "todas",
        position: position ?? "todos",
        sampleSize: duels.length,
        championWins,
        againstWins,
      });
    } catch (err) {
      // Mismo respaldo que la rama sin "against" — si la base no responde,
      // se busca la pareja puntual dentro de la ultima foto guardada en vez
      // de romper (esto es justo lo que usa la caja de "% Win").
      console.error("[champion-duels] fallo la consulta en vivo (against), probando snapshot:", err);
      if (platform || position) throw err;
      const fallback = readDuelsSnapshotForChampion(champion);
      const pair = fallback?.matchups.find((m) => m.opponent === against);
      if (!fallback || !pair) throw err;
      return Response.json({
        champion,
        against,
        platform: "todas",
        position: "todos",
        sampleSize: pair.wins + pair.losses,
        championWins: pair.wins,
        againstWins: pair.losses,
        stale: true,
        staleSince: fallback.generatedAt,
      });
    }
  }

  // Sin "against": balance resumido contra todos los rivales que se hayan
  // enfrentado, con cada pareja evaluada por separado sobre sus propios
  // RECENT_DUELS_PER_MATCHUP mas recientes (ver comentario arriba).
  try {
    const matchups = await getChampionMatchups(prisma, champion, { platform: platform ?? undefined, position: position ?? undefined });
    return Response.json({ champion, platform: platform ?? "todas", position: position ?? "todos", matchups });
  } catch (err) {
    // La base no respondio (ej. plan de Prisma bloqueado) — se cae a la
    // ultima foto guardada en disco en vez de romper la pantalla. Solo
    // aplica sin filtro de plataforma/posicion, que es lo unico que el
    // export guarda; con filtros no hay respaldo y se deja fallar.
    console.error("[champion-duels] fallo la consulta en vivo, probando snapshot:", err);
    if (platform || position) throw err;
    const fallback = readDuelsSnapshotForChampion(champion);
    if (!fallback) throw err;
    return Response.json({
      champion,
      platform: "todas",
      position: "todos",
      matchups: fallback.matchups,
      stale: true,
      staleSince: fallback.generatedAt,
    });
  }
}
