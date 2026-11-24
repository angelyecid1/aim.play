import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

// 20 partidas por defecto, hasta 30 si se pide mas (boton "Ver mas" en
// vez de cargar las 30 de una) — el tope maximo por ahora es el mismo
// para todos, no hay todavia una version Pro que lo diferencie.
const DEFAULT_MATCH_LIMIT = 20;
const MAX_MATCH_LIMIT = 30;

export async function GET(request: NextRequest) {
  const riotAccountId = request.nextUrl.searchParams.get("riotAccountId");
  const requestedLimit = Number(request.nextUrl.searchParams.get("limit") ?? DEFAULT_MATCH_LIMIT);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), MAX_MATCH_LIMIT)
    : DEFAULT_MATCH_LIMIT;

  if (riotAccountId) {
    // Marca que alguien de verdad vio este historial ahora — el resync
    // automatico usa esto para dejar de revisar cuentas que nadie mira
    // hace rato (ver src/lib/dailyResync.ts).
    prisma.riotAccount
      .update({ where: { id: riotAccountId }, data: { lastViewedAt: new Date() } })
      .catch(() => {});
  }

  try {
    const participants = await prisma.matchParticipant.findMany({
      where: riotAccountId ? { riotAccountId } : undefined,
      orderBy: { match: { gameCreation: "desc" } },
      take: limit,
      // Solo los campos que de verdad se usan abajo — "match" completo trae
      // rawData/timelineData (el JSON crudo de Riot, pesado) que aca no hace
      // falta, y con la base de datos remota eso se nota mucho en la demora.
      select: {
        matchId: true,
        championName: true,
        win: true,
        kills: true,
        deaths: true,
        assists: true,
        goldEarned: true,
        totalDamageDealtToChampions: true,
        items: true,
        roleBoundItem: true,
        teamPosition: true,
        customStats: true,
        match: {
          select: {
            gameCreation: true,
            gameDuration: true,
            queueId: true,
            patch: true,
          },
        },
        riotAccount: {
          select: {
            gameName: true,
            tagLine: true,
          },
        },
      },
    });

    const results = participants.map((p) => ({
      matchId: p.matchId,
      gameCreation: p.match.gameCreation,
      gameDuration: p.match.gameDuration,
      queueId: p.match.queueId,
      patch: p.match.patch,
      playerName: `${p.riotAccount.gameName}#${p.riotAccount.tagLine}`,
      championName: p.championName,
      win: p.win,
      kills: p.kills,
      deaths: p.deaths,
      assists: p.assists,
      goldEarned: p.goldEarned,
      totalDamageDealtToChampions: p.totalDamageDealtToChampions,
      items: JSON.parse(p.items) as number[],
      roleBoundItem: p.roleBoundItem,
      teamPosition: p.teamPosition,
      timeBuckets: p.customStats
        ? (JSON.parse(p.customStats).timeBuckets as Array<{
            startMs: number;
            endMs: number;
            kills: number;
            deaths: number;
            assists: number;
            goldGained: number;
            damageToChampionsGained: number;
          }>)
        : null,
    }));

    return Response.json(results);
  } catch (err) {
    // Sin respaldo posible aca (no hay una "foto" guardada del historial de
    // partidas como si hay para los duelos) — solo se evita el 500 crudo,
    // con un mensaje que el cliente pueda mostrar tal cual.
    console.error("[matches] fallo la consulta:", err);
    return Response.json(
      { error: "No se pudieron cargar las partidas ahora mismo. Intenta más tarde." },
      { status: 503 }
    );
  }
}
