import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getChampionMatchups, readDuelsSnapshotForChampion, type Matchup } from "@/lib/duelsSnapshot";
import { getOffRoleMatchup } from "@/lib/championTraits";

// Junta en UNA sola peticion lo que antes hacia la caja de "% Win" con
// hasta 50 peticiones sueltas (5 aliados x 5 rivales x 2 fuentes de dato).
// En vez de consultar cada PAREJA por separado, se consulta cada aliado
// UNA vez (sus matchups ya traen a todos sus rivales reales adentro) y se
// buscan ahi los enemigos que interesan — mismo truco que ya usa
// gatherRecommendationData en el motor de recomendacion.

interface RequestBody {
  allies: string[];
  enemies: string[];
}

async function getMatchupsWithFallback(championId: string): Promise<Matchup[]> {
  try {
    return await getChampionMatchups(prisma, championId);
  } catch {
    return readDuelsSnapshotForChampion(championId)?.matchups ?? [];
  }
}

export async function POST(request: NextRequest) {
  const { allies, enemies } = (await request.json()) as RequestBody;

  if (!Array.isArray(allies) || !Array.isArray(enemies) || allies.length === 0 || enemies.length === 0) {
    return Response.json({ alliesWinRate: null, enemiesWinRate: null });
  }

  const uniqueAllies = [...new Set(allies)];
  const enemySet = new Set(enemies);

  const alliesMatchups = await Promise.all(uniqueAllies.map((id) => getMatchupsWithFallback(id)));
  const matchupsByAlly = new Map(uniqueAllies.map((id, i) => [id, alliesMatchups[i]]));

  const probabilities: number[] = [];

  for (const allyId of allies) {
    const byOpponent = new Map(matchupsByAlly.get(allyId)?.map((m) => [m.opponent, m]) ?? []);

    for (const enemyId of enemies) {
      if (!enemySet.has(enemyId)) continue;

      const real = byOpponent.get(enemyId);
      const realSample = real ? real.wins + real.losses : 0;
      const realProb = real && realSample > 0 ? real.wins / realSample : null;

      const off = getOffRoleMatchup(allyId, enemyId);
      let offProb: number | null = null;
      if (off === "tie") offProb = 0.5;
      else if (off) offProb = off.winner === allyId ? off.winnerWinPct / 100 : 1 - off.winnerWinPct / 100;

      const prob = realProb !== null && offProb !== null ? (realProb + offProb) / 2 : realProb ?? offProb;
      if (prob !== null) probabilities.push(prob);
    }
  }

  if (probabilities.length === 0) {
    return Response.json({ alliesWinRate: null, enemiesWinRate: null });
  }

  const avg = probabilities.reduce((a, b) => a + b, 0) / probabilities.length;
  return Response.json({
    alliesWinRate: Math.round(avg * 100),
    enemiesWinRate: Math.round((1 - avg) * 100),
  });
}
