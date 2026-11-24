# Aim.Play

Web companion para League of Legends: campeones, matchups, items, draft (comparador 5v5), historial de partidas vinculado a cuentas de Riot, y más.

No está afiliado ni respaldado por Riot Games.

## Stack

- Next.js (App Router) + React
- Prisma + Postgres
- Firebase (autenticación)
- Riot API (cuentas, partidas, ranked)

## Desarrollo local

1. Copia `.env.local` y `.env` con tus propias credenciales (Firebase, `RIOT_API_KEY`, `DATABASE_URL`).
2. Instala dependencias:

   ```bash
   npm install
   ```

3. Corre las migraciones de Prisma:

   ```bash
   npx prisma migrate deploy
   ```

4. Levanta el servidor de desarrollo:

   ```bash
   npm run dev
   ```

   Abre [http://localhost:3000](http://localhost:3000).
