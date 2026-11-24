import pg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: pg.Pool | undefined;
};

// Cupo de conexiones reservado para lo que un usuario esta esperando ver
// en pantalla ahora mismo (busquedas, ranking, matchups). El trabajo de
// mantenimiento (resync automatico) usa su propio pool aparte y mas chico
// (ver prismaBackground.ts) para que nunca le robe conexiones a esto.
const pool =
  globalForPrisma.pgPool ?? new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8 });
const adapter = new PrismaPg(pool);

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.pgPool = pool;
}
