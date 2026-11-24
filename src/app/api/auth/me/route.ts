import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncRiotAccount } from "@/lib/ingest";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json({ user: null });
  }

  const riotAccounts = await prisma.riotAccount.findMany({
    where: { userId: user.id },
  });

  // Cada visita a la pagina con sesion activa re-sincroniza las cuentas de
  // Riot ya vinculadas, sin bloquear la respuesta. Asi con solo tener sesion
  // abierta y entrar al sitio ya se aportan partidas nuevas, sin depender de
  // que vuelva a escribir email/contraseña cada vez.
  for (const account of riotAccounts) {
    syncRiotAccount(account.id).catch((err) => {
      console.error(`Error sincronizando cuenta ${account.id} en /auth/me:`, err);
    });
  }

  return Response.json({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      emailVerified: user.emailVerified,
    },
    riotAccounts,
  });
}
