import { prismaBackground as prisma } from "@/lib/prismaBackground";
import { fetchAccountByPuuid, fetchLeagueEntries, type LeagueTier } from "@/lib/riot";

// Alcance a proposito reducido (solo LAN/LAS): cada region suma ~33
// llamadas a Riot por actualizacion (3 ligas + 10 resoluciones de nombre
// cada una), asi que ampliar la lista de regiones tiene costo real.
const PLATFORMS = ["la1", "la2"];
const TIERS: Array<{ tier: LeagueTier; label: string }> = [
  { tier: "challenger", label: "CHALLENGER" },
  { tier: "grandmaster", label: "GRANDMASTER" },
  { tier: "master", label: "MASTER" },
];
const TOP_N_PER_TIER = 10;
export const STALE_AFTER_MS = 30 * 60 * 1000;

export async function isLeaderboardStale() {
  const newest = await prisma.leaderboardEntry.findFirst({ orderBy: { updatedAt: "desc" } });
  if (!newest) return true;
  return Date.now() - newest.updatedAt.getTime() > STALE_AFTER_MS;
}

// Es el mismo dato para todos los visitantes (no depende de usuario), asi
// que solo un refresco a la vez tiene sentido — evita duplicar trabajo si
// varias visitas caen justo cuando esta vencido.
let refreshInFlight: Promise<void> | null = null;

export function refreshLeaderboard() {
  if (!refreshInFlight) {
    refreshInFlight = runRefresh().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

async function runRefresh() {
  for (const platform of PLATFORMS) {
    for (const { tier, label } of TIERS) {
      const league = await fetchLeagueEntries(platform, tier);

      const top = [...league.entries]
        .sort((a, b) => b.leaguePoints - a.leaguePoints)
        .slice(0, TOP_N_PER_TIER);

      for (let i = 0; i < top.length; i++) {
        const entry = top[i];
        const account = await fetchAccountByPuuid(entry.puuid);

        await prisma.leaderboardEntry.upsert({
          where: { platform_tier_rank: { platform, tier: label, rank: i + 1 } },
          update: {
            puuid: entry.puuid,
            gameName: account.gameName,
            tagLine: account.tagLine,
            leaguePoints: entry.leaguePoints,
            wins: entry.wins,
            losses: entry.losses,
          },
          create: {
            platform,
            tier: label,
            rank: i + 1,
            puuid: entry.puuid,
            gameName: account.gameName,
            tagLine: account.tagLine,
            leaguePoints: entry.leaguePoints,
            wins: entry.wins,
            losses: entry.losses,
          },
        });
      }
    }
  }
}
