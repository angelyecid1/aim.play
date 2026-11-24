import { prisma } from "@/lib/prisma";
import { isLeaderboardStale, refreshLeaderboard } from "@/lib/leaderboard";

export async function GET() {
  let entries = await prisma.leaderboardEntry.findMany({
    orderBy: [{ platform: "asc" }, { tier: "asc" }, { rank: "asc" }],
  });

  if (entries.length === 0) {
    // Primera vez: no hay nada que mostrar todavia, asi que esta vez si
    // esperamos el refresco (toma unos segundos) en vez de devolver vacio.
    await refreshLeaderboard().catch((err) => console.error("Error generando leaderboard:", err));
    entries = await prisma.leaderboardEntry.findMany({
      orderBy: [{ platform: "asc" }, { tier: "asc" }, { rank: "asc" }],
    });
  } else if (await isLeaderboardStale()) {
    // Ya hay datos para mostrar: se refresca en el fondo sin bloquear esta
    // respuesta, la proxima visita ya lo ve actualizado.
    refreshLeaderboard().catch((err) => console.error("Error actualizando leaderboard:", err));
  }

  return Response.json(entries);
}
