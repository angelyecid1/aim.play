import { NextRequest } from "next/server";
import { createSessionFromIdToken } from "@/lib/auth";

export async function POST(request: NextRequest) {
  const { idToken } = (await request.json()) as { idToken?: string };

  if (!idToken) {
    return Response.json({ error: "Falta idToken" }, { status: 400 });
  }

  try {
    const user = await createSessionFromIdToken(idToken);
    return Response.json({ id: user.id, email: user.email, displayName: user.displayName });
  } catch {
    return Response.json({ error: "Token invalido" }, { status: 401 });
  }
}
