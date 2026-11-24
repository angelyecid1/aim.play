import { NextRequest } from "next/server";
import { getOffRoleMatchup } from "@/lib/championTraits";

export async function GET(request: NextRequest) {
  const championA = request.nextUrl.searchParams.get("championA");
  const championB = request.nextUrl.searchParams.get("championB");

  if (!championA || !championB) {
    return Response.json({ error: "Faltan los parametros championA/championB" }, { status: 400 });
  }

  const result = getOffRoleMatchup(championA, championB);
  if (!result) return Response.json({ found: false });
  if (result === "tie") return Response.json({ tie: true });
  return Response.json({ winner: result.winner, winnerWinPct: result.winnerWinPct });
}
