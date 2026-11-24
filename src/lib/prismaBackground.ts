import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prismaBackground: PrismaClient | undefined;
  pgPoolBackground: pg.Pool | undefined;
};

// Pool separado, exclusivo para el resync automatico y el procesamiento de
// duelos — asi el mantenimiento de fondo nunca compite por conexiones con
// una peticion que un usuario esta esperando ver en pantalla (ver
// src/lib/prisma.ts para el pool principal). El limite real del plan de
// Postgres es 50 conexiones (verificado con SHOW max_connections); con el
// pool principal en 8, 10 aca deja bastante margen para el resync en
// paralelo sin arriesgar al pool interactivo.
const pool =
  globalForPrisma.pgPoolBackground ??
  new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
const adapter = new PrismaPg(pool);

export const prismaBackground = globalForPrisma.prismaBackground ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prismaBackground = prismaBackground;
  globalForPrisma.pgPoolBackground = pool;
}
