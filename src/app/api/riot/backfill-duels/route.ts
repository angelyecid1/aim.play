import { NextRequest } from "next/server";
import { processPendingEnrichment } from "@/lib/ingest";

// Ruta manual de recuperacion/adelanto: el barrido automatico (ver
// dailyResync.ts) ya procesa lo pendiente solo cada pocos minutos en lotes
// chicos, mas nuevo primero. Esta ruta sirve para forzar un lote mas grande
// a mano cuando hace falta (ej. despues de un rato sin resync, o para
// probar cambios). Acepta ?limit= para ajustar cuantas partidas tomar.
export async function POST(request: NextRequest) {
  const limit = Number(request.nextUrl.searchParams.get("limit") ?? 500);
  const result = await processPendingEnrichment(limit);
  return Response.json(result);
}
