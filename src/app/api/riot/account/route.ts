import { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ROUTING_CLUSTER, resolveRiotAccount } from "@/lib/riot";

export async function GET(request: NextRequest) {
  const gameName = request.nextUrl.searchParams.get("gameName");
  const tagLine = request.nextUrl.searchParams.get("tagLine");

  if (!gameName || !tagLine) {
    return Response.json(
      { error: "Faltan los parámetros gameName y tagLine" },
      { status: 400 }
    );
  }

  const { status, data } = await resolveRiotAccount(gameName, tagLine);
  return Response.json(data, { status });
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Debes iniciar sesion" }, { status: 401 });
  }
  if (!user.emailVerified) {
    return Response.json(
      { error: "Debes verificar tu correo antes de vincular una cuenta" },
      { status: 403 }
    );
  }

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

  const existingLink = await prisma.riotAccount.findUnique({ where: { puuid: data.puuid } });
  if (existingLink && existingLink.userId && existingLink.userId !== user.id) {
    return Response.json(
      { error: "Esta cuenta de Riot ya esta vinculada a otro usuario" },
      { status: 409 }
    );
  }

  // Maximo 3 cuentas de Riot por usuario (no aplica si ya era tuya, eso es
  // solo re-confirmarla).
  const isAlreadyMine = existingLink?.userId === user.id;
  if (!isAlreadyMine) {
    const linkedCount = await prisma.riotAccount.count({ where: { userId: user.id } });
    if (linkedCount >= 3) {
      return Response.json(
        { error: "Ya tienes 3 cuentas de Riot asociadas, el maximo permitido" },
        { status: 409 }
      );
    }
  }

  const riotAccount = await prisma.riotAccount.upsert({
    where: { puuid: data.puuid },
    update: { gameName: data.gameName, tagLine: data.tagLine, platform, userId: user.id },
    create: {
      userId: user.id,
      puuid: data.puuid,
      gameName: data.gameName,
      tagLine: data.tagLine,
      region: ROUTING_CLUSTER,
      platform,
    },
  });

  return Response.json(
    { user: { id: user.id, email: user.email, displayName: user.displayName }, riotAccount },
    { status: 201 }
  );
}

/**
 * Desasocia una cuenta de Riot de tu perfil (libera un cupo de las 3). No
 * borra la cuenta ni sus partidas: siguen publicas y consultables por ID,
 * solo deja de aparecer en "Mis cuentas".
 */
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ error: "Debes iniciar sesion" }, { status: 401 });
  }

  const { riotAccountId } = (await request.json()) as { riotAccountId?: string };
  if (!riotAccountId) {
    return Response.json({ error: "Falta riotAccountId" }, { status: 400 });
  }

  const account = await prisma.riotAccount.findUnique({ where: { id: riotAccountId } });
  if (!account || account.userId !== user.id) {
    return Response.json({ error: "Esa cuenta no esta asociada a tu perfil" }, { status: 404 });
  }

  await prisma.riotAccount.update({ where: { id: riotAccountId }, data: { userId: null } });

  return Response.json({ ok: true });
}
