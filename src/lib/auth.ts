import { cookies } from "next/headers";
import { firebaseAdminAuth } from "@/lib/firebaseAdmin";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "aimplay_session";
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000;

/** Se llama con el ID token que entrega el SDK de Firebase en el navegador
 * tras iniciar sesion/registrarse. Crea la cookie de sesion (httpOnly) y
 * sincroniza el usuario en nuestra base de datos. */
export async function createSessionFromIdToken(idToken: string) {
  const decoded = await firebaseAdminAuth.verifyIdToken(idToken);

  const user = await prisma.user.upsert({
    where: { firebaseUid: decoded.uid },
    update: { email: decoded.email ?? "" },
    create: {
      firebaseUid: decoded.uid,
      email: decoded.email ?? "",
      displayName: decoded.name ?? decoded.email?.split("@")[0] ?? "Jugador",
    },
  });

  const sessionCookie = await firebaseAdminAuth.createSessionCookie(idToken, {
    expiresIn: SESSION_DURATION_MS,
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, sessionCookie, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_DURATION_MS / 1000,
    path: "/",
  });

  return user;
}

export async function destroySession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const sessionCookie = cookieStore.get(SESSION_COOKIE)?.value;
  if (!sessionCookie) return null;

  try {
    const decoded = await firebaseAdminAuth.verifySessionCookie(sessionCookie, true);
    const user = await prisma.user.findUnique({ where: { firebaseUid: decoded.uid } });
    if (!user) return null;

    return { ...user, emailVerified: decoded.email_verified ?? false };
  } catch {
    return null;
  }
}
