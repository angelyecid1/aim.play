import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAllChampionTraits, getOffRoleMatchup } from "@/lib/championTraits";
import { getMostPopularChampions } from "@/lib/championPopularity";
import {
  gatherRecommendationData,
  scoreCandidates,
  buildReasonText,
  type DraftState,
} from "@/lib/draftRecommendation";

interface RequestBody {
  allies: Array<string | null>;
  enemies: Array<string | null>;
  favoriteChampionIds: string[];
  allChampionIds: string[];
  idToDisplayName?: Record<string, string>;
  // Rol fijo de la casilla que el usuario tiene seleccionada ahora mismo
  // (Top/Jungla/Mid/ADC/Soporte) — si viene, los candidatos se filtran a
  // solo los que de verdad se juegan en ese rol. Si no viene (nada
  // seleccionado todavia), la recomendacion queda general, sin filtrar.
  targetRole?: string | null;
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as RequestBody;
  const { allies, enemies, favoriteChampionIds, allChampionIds, idToDisplayName = {}, targetRole } = body;

  if (!Array.isArray(allies) || allies.length !== 5 || !Array.isArray(enemies) || enemies.length !== 5) {
    return Response.json({ error: "allies/enemies deben ser arreglos de 5" }, { status: 400 });
  }

  const alreadyPicked = new Set([...allies, ...enemies].filter((c): c is string => c !== null));
  const enemiesPicked = enemies.filter((e): e is string => e !== null);
  const traits = getAllChampionTraits();

  const matchesTargetRole = (championId: string) =>
    !targetRole || (traits[championId]?.roles ?? []).includes(targetRole);

  // Sin ningun rival elegido: no tiene sentido correr el motor de puntaje
  // (no hay nada contra que comparar) — se muestran favoritos, o si
  // tampoco hay, los campeones mas populares.
  if (enemiesPicked.length === 0) {
    if (favoriteChampionIds.length > 0) {
      const picks = favoriteChampionIds.filter((id) => !alreadyPicked.has(id) && matchesTargetRole(id)).slice(0, 9);
      return Response.json({
        mode: "cold-start-favorites",
        recommendations: picks.map((championId) => ({
          championId,
          isFavorite: true,
          reasons: ["Es uno de tus favoritos"],
        })),
      });
    }

    try {
      const popular = await getMostPopularChampions(prisma, 40);
      const picks = popular
        .map((p) => p.championId)
        .filter((id) => !alreadyPicked.has(id) && matchesTargetRole(id))
        .slice(0, 9);
      return Response.json({
        mode: "cold-start-popular",
        recommendations: picks.map((championId) => ({
          championId,
          isFavorite: false,
          reasons: ["Campeón muy jugado actualmente"],
        })),
      });
    } catch {
      return Response.json({ mode: "cold-start-popular", recommendations: [] });
    }
  }

  const candidateIds = allChampionIds.filter((id) => !alreadyPicked.has(id) && matchesTargetRole(id));
  const draft: DraftState = { allies, enemies };

  try {
    const dataset = await gatherRecommendationData(prisma, draft, candidateIds);
    const offRoleMatchups: Record<string, ReturnType<typeof getOffRoleMatchup>> = {};
    // scoreCandidates espera un mapa directo idA|idB -> resultado; se arma
    // aca solo para los pares que realmente hacen falta (candidato x rival).
    for (const candidateId of candidateIds) {
      for (const enemyId of enemiesPicked) {
        const key = [candidateId, enemyId].sort().join("|");
        if (!(key in offRoleMatchups)) offRoleMatchups[key] = getOffRoleMatchup(candidateId, enemyId);
      }
    }
    const filteredOffRole = Object.fromEntries(
      Object.entries(offRoleMatchups).filter(([, v]) => v !== null)
    ) as Record<string, NonNullable<ReturnType<typeof getOffRoleMatchup>>>;

    const scored = scoreCandidates(draft, candidateIds, traits, dataset, filteredOffRole);

    return Response.json({
      mode: "scored",
      recommendations: scored.map((s) => ({
        championId: s.championId,
        isFavorite: favoriteChampionIds.includes(s.championId),
        reasons: buildReasonText(s.reasons, idToDisplayName),
      })),
    });
  } catch (err) {
    console.error("[draft-recommendation] error:", err);
    return Response.json({ error: "No se pudo calcular la recomendación" }, { status: 500 });
  }
}
