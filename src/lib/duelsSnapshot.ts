import fs from "fs";
import path from "path";
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { MAX_DUELS_PER_MATCH, RECENT_DUELS_PER_MATCHUP } from "@/lib/championDuels";

// Guardado FUERA de src/ a proposito: si viviera adentro, cada vez que el
// export escribe el archivo, Turbopack lo detectaria como cambio de codigo
// y recompilaria/recargaria la app entera por nada. Se lee con fs en vez de
// import para que siempre se lea el contenido mas reciente del disco.
const SNAPSHOT_PATH = path.join(process.cwd(), "data", "duels-snapshot.json");

export interface Matchup {
  opponent: string;
  wins: number;
  losses: number;
}

interface DuelsSnapshotFile {
  generatedAt: string;
  champions: Record<string, Matchup[]>;
}

/**
 * Misma consulta que usa la ruta en vivo (api/champion-duels): cada pareja
 * evaluada sobre sus propios RECENT_DUELS_PER_MATCHUP mas recientes, con
 * MAX_DUELS_PER_MATCH tope por partida. Se comparte aca para que la ruta en
 * vivo y el export de respaldo usen exactamente la misma logica — asi el
 * respaldo no muestra numeros distintos a los que el usuario ya vio en vivo.
 */
export async function getChampionMatchups(
  prisma: PrismaClient,
  champion: string,
  filters?: { platform?: string; position?: string }
): Promise<Matchup[]> {
  let extraFilterSql = Prisma.empty;
  if (filters?.platform) extraFilterSql = Prisma.sql`${extraFilterSql} AND "platform" = ${filters.platform}`;
  if (filters?.position) extraFilterSql = Prisma.sql`${extraFilterSql} AND "position" = ${filters.position}`;

  const rows = await prisma.$queryRaw<Array<{ opponent: string; wins: number; losses: number }>>(
    Prisma.sql`
      WITH base AS (
        SELECT
          "matchId",
          "gameCreation",
          CASE WHEN "killerChampion" = ${champion} THEN "victimChampion" ELSE "killerChampion" END AS opponent,
          CASE WHEN "killerChampion" = ${champion} THEN 1 ELSE 0 END AS champion_won,
          ROW_NUMBER() OVER (
            PARTITION BY "matchId", CASE WHEN "killerChampion" = ${champion} THEN "victimChampion" ELSE "killerChampion" END
            ORDER BY "timeBucket"
          ) AS match_rn
        FROM "ChampionDuel"
        WHERE ("killerChampion" = ${champion} OR "victimChampion" = ${champion})
        ${extraFilterSql}
      ),
      capped AS (
        SELECT * FROM base WHERE match_rn <= ${MAX_DUELS_PER_MATCH}
      ),
      ranked AS (
        SELECT
          opponent,
          champion_won,
          ROW_NUMBER() OVER (PARTITION BY opponent ORDER BY "gameCreation" DESC) AS rn
        FROM capped
      )
      SELECT opponent, SUM(champion_won)::int AS wins, SUM(1 - champion_won)::int AS losses
      FROM ranked
      WHERE rn <= ${RECENT_DUELS_PER_MATCHUP}
      GROUP BY opponent
    `
  );

  return rows
    .map(({ opponent, wins, losses }) => ({ opponent, wins, losses }))
    .sort((a, b) => b.wins + b.losses - (a.wins + a.losses));
}

/**
 * Recorre todos los campeones que ya tienen algun duelo real guardado y
 * congela sus matchups (sin filtro de plataforma/posicion, el caso mas
 * general) en un archivo estatico. Se llama solo desde el resync de fondo,
 * nunca desde una peticion de usuario — si la base esta caida, esta misma
 * llamada ya fallo mas arriba y no llega hasta aca.
 */
export async function exportDuelsSnapshot(prisma: PrismaClient): Promise<number> {
  const distinctChampions = await prisma.$queryRaw<Array<{ champion: string }>>(
    Prisma.sql`
      SELECT DISTINCT "killerChampion" AS champion FROM "ChampionDuel"
      UNION
      SELECT DISTINCT "victimChampion" AS champion FROM "ChampionDuel"
    `
  );

  const champions: Record<string, Matchup[]> = {};
  for (const { champion } of distinctChampions) {
    const matchups = await getChampionMatchups(prisma, champion);
    if (matchups.length > 0) champions[champion] = matchups;
  }

  const snapshot: DuelsSnapshotFile = { generatedAt: new Date().toISOString(), champions };
  fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
  fs.writeFileSync(SNAPSHOT_PATH, JSON.stringify(snapshot));
  return Object.keys(champions).length;
}

/** Fallback de lectura — usado por la ruta en vivo solo si la consulta real fallo. */
export function readDuelsSnapshotForChampion(champion: string): { matchups: Matchup[]; generatedAt: string } | null {
  try {
    const raw = fs.readFileSync(SNAPSHOT_PATH, "utf-8");
    const snapshot = JSON.parse(raw) as DuelsSnapshotFile;
    const matchups = snapshot.champions[champion];
    if (!matchups) return null;
    return { matchups, generatedAt: snapshot.generatedAt };
  } catch {
    return null;
  }
}
