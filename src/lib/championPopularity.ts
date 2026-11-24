import { Prisma, type PrismaClient } from "@/generated/prisma/client";

// Fallback de "arranque en frio" para el panel de recomendaciones: cuando
// no hay ningun rival elegido todavia Y el usuario tampoco tiene favoritos
// marcados, se sugieren los campeones con mas presencia real en
// ChampionDuel (proxy razonable de "que se juega mucho ahorita"). No tiene
// snapshot propio — si la consulta en vivo falla, el panel simplemente
// muestra menos sugerencias, no rompe nada.
export async function getMostPopularChampions(
  prisma: PrismaClient,
  limit: number
): Promise<Array<{ championId: string; appearances: number }>> {
  const rows = await prisma.$queryRaw<Array<{ champion: string; appearances: number }>>(
    Prisma.sql`
      SELECT champion, COUNT(*)::int AS appearances
      FROM (
        SELECT "killerChampion" AS champion FROM "ChampionDuel"
        UNION ALL
        SELECT "victimChampion" AS champion FROM "ChampionDuel"
      ) AS combined
      GROUP BY champion
      ORDER BY appearances DESC
      LIMIT ${limit}
    `
  );
  return rows.map((r) => ({ championId: r.champion, appearances: r.appearances }));
}
