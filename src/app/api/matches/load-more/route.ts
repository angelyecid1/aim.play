import { NextRequest } from "next/server";
import { fetchOlderMatches } from "@/lib/ingest";

/**
 * Se llama antes de volver a pedir /api/matches con un limite mas alto,
 * solo cuando lo ya guardado no alcanza para cubrir ese limite — trae mas
 * partidas viejas de Riot en el momento en vez de esperar al resync.
 */
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { riotAccountId, additionalCount } = body as {
    riotAccountId?: string;
    additionalCount?: number;
  };

  if (!riotAccountId || !additionalCount) {
    return Response.json({ error: "Faltan riotAccountId o additionalCount" }, { status: 400 });
  }

  try {
    const result = await fetchOlderMatches(riotAccountId, additionalCount);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
