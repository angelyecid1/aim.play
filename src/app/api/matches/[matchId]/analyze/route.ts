import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchMatch, fetchTimeline } from "@/lib/riot";
import { computeTimeBucketStats, findParticipantId } from "@/lib/customStats";

/**
 * Estadisticas por tramo de 5 min (oro, dano, K/D/A) de una partida
 * puntual, bajo demanda — ya no se calculan solas para todas las partidas
 * en segundo plano (ver enrichMatchInBackground), asi que si nadie las
 * pidio todavia, se traen y calculan aca mismo, una sola vez.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ matchId: string }> }
) {
  const { matchId } = await params;
  const body = await request.json();
  const { riotAccountId } = body as { riotAccountId?: string };

  if (!riotAccountId) {
    return Response.json({ error: "Falta riotAccountId" }, { status: 400 });
  }

  const participant = await prisma.matchParticipant.findUnique({
    where: { matchId_riotAccountId: { matchId, riotAccountId } },
    select: { id: true, customStats: true, riotAccount: { select: { puuid: true } } },
  });

  if (!participant) {
    return Response.json({ error: "Partida no encontrada para esta cuenta" }, { status: 404 });
  }

  if (participant.customStats) {
    const parsed = JSON.parse(participant.customStats) as { timeBuckets: unknown };
    return Response.json({ timeBuckets: parsed.timeBuckets ?? null });
  }

  // El JSON crudo original ya se pudo haber borrado (la partida ya se
  // proceso y se vacio para no dejarla ocupando espacio) — se vuelve a
  // traer fresco, el resultado de una partida ya jugada no cambia con el
  // tiempo.
  const [matchData, timeline] = await Promise.all([
    fetchMatch(matchId, "high"),
    fetchTimeline(matchId, "high"),
  ]);

  const participantId = findParticipantId(matchData, participant.riotAccount.puuid);
  if (participantId === undefined) {
    return Response.json({ error: "No se encontro al jugador en esa partida" }, { status: 404 });
  }

  const timeBuckets = computeTimeBucketStats(timeline, participantId);

  await prisma.matchParticipant.update({
    where: { id: participant.id },
    data: { customStats: JSON.stringify({ timeBuckets }) },
  });

  return Response.json({ timeBuckets });
}
