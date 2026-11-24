import { NextRequest } from "next/server";
import { syncRiotAccount } from "@/lib/ingest";
import { prisma } from "@/lib/prisma";
import { ROUTING_CLUSTER, resolveRiotAccount } from "@/lib/riot";

/**
 * Busqueda publica de cualquier Riot ID, sin necesidad de sesion — el
 * historial de partidas es informacion publica (igual que en OP.GG/U.GG).
 * No toca la propiedad de la cuenta si ya estaba vinculada a un usuario.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { gameName, tagLine, platform } = body as {
    gameName?: string;
    tagLine?: string;
    platform?: string;
  };

  if (!gameName || !tagLine || !platform) {
    return Response.json(
      { error: "Faltan gameName, tagLine o platform" },
      { status: 400 }
    );
  }

  const { ok, status, data } = await resolveRiotAccount(gameName, tagLine);
  if (!ok) {
    return Response.json(data, { status });
  }

  const riotAccount = await prisma.riotAccount.upsert({
    where: { puuid: data.puuid },
    update: { gameName: data.gameName, tagLine: data.tagLine },
    create: {
      puuid: data.puuid,
      gameName: data.gameName,
      tagLine: data.tagLine,
      region: ROUTING_CLUSTER,
      platform,
    },
  });

  try {
    const syncResult = await syncRiotAccount(riotAccount.id);
    return Response.json({ riotAccount, syncResult });
  } catch (err) {
    return Response.json({ riotAccount, syncError: (err as Error).message });
  }
}
