import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllChampionTraits, getOffRoleMatchup } from "@/lib/championTraits";
import { getChampionMatchups, readDuelsSnapshotForChampion, type Matchup } from "@/lib/duelsSnapshot";
import { scoreCandidates, buildReasonText, type DraftState, type RecommendationDataset } from "@/lib/draftRecommendation";

// Tooltip por cada campeon YA ELEGIDO en el tablero (hasta 10, aliados y
// rivales) explicando en que aspecto conviene jugarlo dado el resto del
// draft — distinto del panel de "siguiente pick" (que sugiere quien FALTA
// elegir). Reusa el mismo motor de puntaje: a cada campeon puesto se lo
// trata como si fuera "el candidato" evaluado contra el resto de su propio
// equipo (sin el mismo) y contra el equipo contrario — el puntaje en si no
// se devuelve, solo las razones ya convertidas a frases.

interface RequestBody {
  allies: Array<string | null>;
  enemies: Array<string | null>;
  idToDisplayName?: Record<string, string>;
}

interface PlacedChampion {
  team: "allies" | "enemies";
  index: number;
  championId: string;
}

async function getMatchupsWithFallback(championId: string): Promise<Matchup[]> {
  try {
    return await getChampionMatchups(prisma, championId);
  } catch {
    return readDuelsSnapshotForChampion(championId)?.matchups ?? [];
  }
}

export async function POST(request: NextRequest) {
  const { allies, enemies, idToDisplayName = {} } = (await request.json()) as RequestBody;

  if (!Array.isArray(allies) || !Array.isArray(enemies)) {
    return Response.json({ error: "allies/enemies deben ser arreglos" }, { status: 400 });
  }

  const placed: PlacedChampion[] = [
    ...allies.map((championId, index) => (championId ? { team: "allies" as const, index, championId } : null)),
    ...enemies.map((championId, index) => (championId ? { team: "enemies" as const, index, championId } : null)),
  ].filter((p): p is PlacedChampion => p !== null);

  if (placed.length === 0) {
    return Response.json({ insights: [] });
  }

  const traits = getAllChampionTraits();

  // Cada campeon puesto se consulta UNA sola vez sin importar en cuantas
  // casillas aparezca (mismo campeon en los dos equipos es raro pero
  // posible, ya que el chequeo de duplicados es solo dentro de un equipo).
  const uniqueChampionIds = [...new Set(placed.map((p) => p.championId))];
  const matchupsByChampion = new Map(
    await Promise.all(uniqueChampionIds.map(async (id) => [id, await getMatchupsWithFallback(id)] as const))
  );

  const insights = placed.map(({ team, index, championId }) => {
    const ownTeam = team === "allies" ? allies : enemies;
    const otherTeam = team === "allies" ? enemies : allies;
    const teammates = ownTeam.filter((id, i): id is string => id !== null && i !== index);
    const opponents = otherTeam.filter((id): id is string => id !== null);

    const byOpponent = new Map((matchupsByChampion.get(championId) ?? []).map((m) => [m.opponent, m]));
    const dataset: RecommendationDataset = { counterData: { [championId]: {} } };
    for (const opponentId of opponents) {
      dataset.counterData[championId][opponentId] = byOpponent.get(opponentId) ?? null;
    }

    const offRoleMatchups: Record<string, NonNullable<ReturnType<typeof getOffRoleMatchup>>> = {};
    for (const opponentId of opponents) {
      const key = [championId, opponentId].sort().join("|");
      const value = getOffRoleMatchup(championId, opponentId);
      if (value !== null) offRoleMatchups[key] = value;
    }

    const draft: DraftState = { allies: teammates, enemies: opponents };
    const [scored] = scoreCandidates(draft, [championId], traits, dataset, offRoleMatchups);
    const reasons = scored ? buildReasonText(scored.reasons, idToDisplayName) : [];

    return {
      team,
      index,
      championId,
      reasons: reasons.length > 0 ? reasons : ["Sin señales especiales para este draft todavía"],
    };
  });

  return Response.json({ insights });
}
