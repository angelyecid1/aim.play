import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { syncRiotAccount } from "@/lib/ingest";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Debes iniciar sesion" }, { status: 401 });
  }

  const { riotAccountId } = (await request.json()) as { riotAccountId?: string };

  if (!riotAccountId) {
    return Response.json({ error: "Falta riotAccountId" }, { status: 400 });
  }

  const riotAccount = await prisma.riotAccount.findUnique({ where: { id: riotAccountId } });
  if (!riotAccount || riotAccount.userId !== user.id) {
    return Response.json({ error: "Cuenta de Riot no encontrada" }, { status: 404 });
  }

  try {
    const result = await syncRiotAccount(riotAccountId);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
