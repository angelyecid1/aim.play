import fs from "fs";
import path from "path";

// Lee data/champion-traits.json y data/champion-off-role-matchups.json —
// generados a mano con scripts/buildChampionTraits.ts a partir de los 9
// archivos curados en .claude/. Se leen del disco en cada llamada (no
// import) para que un rebuild se vea sin reiniciar el server, mismo patron
// que duelsSnapshot.ts.

const TRAITS_PATH = path.join(process.cwd(), "data", "champion-traits.json");
const OFF_ROLE_PATH = path.join(process.cwd(), "data", "champion-off-role-matchups.json");

// Suppression, Root/Snare y Ground se fusionaron dentro de Stun, y Charm y
// Taunt dentro de Pull (agresor) — ver ".claude/tipos de cc por campeon
// (borrador)". Pull tiene dos variantes (agresor / centro de la habilidad)
// porque valen distinto en el ranking por calidad de CC (ver CC_TYPE_TIER
// en draftRecommendation.ts).
export type CcType =
  | "stun" | "knockback" | "fearFlee"
  | "polymorph" | "sleep" | "slow" | "silence" | "blind"
  | "disarm" | "knockupAirborne" | "cripple" | "stasis"
  | "nearsight" | "pullAggressor" | "pullCenter";

export interface ChampionTraits {
  cc: Partial<Record<CcType, boolean>>;
  hasHardCc: boolean;
  hasAoeGroupingCc: boolean;
  aoeDamage?: boolean;
  poke?: boolean;
  sustainedOnHit?: boolean;
  sustainedOnHitTier?: string;
  sustainedOnHitCondition?: string;
  sustainedOnHitExcluded?: boolean;
  initiator?: boolean;
  counterInitiator?: boolean;
  ranged?: boolean;
  melee?: boolean;
  tank?: boolean;
  damageType?: "physical" | "magic" | "mixed";
  providesShield?: boolean;
  providesHeal?: boolean;
  providesAllySustain?: boolean;
  roles?: string[];
  synergies?: string[];
}

interface ChampionTraitsFile {
  generatedAt: string;
  champions: Record<string, ChampionTraits>;
}

export type OffRoleMatchup = { winner: string; winnerWinPct: number } | "tie";

interface OffRoleMatchupsFile {
  generatedAt: string;
  pairs: Record<string, OffRoleMatchup>;
}

function readTraitsFile(): ChampionTraitsFile | null {
  try {
    return JSON.parse(fs.readFileSync(TRAITS_PATH, "utf-8")) as ChampionTraitsFile;
  } catch {
    return null;
  }
}

function readOffRoleFile(): OffRoleMatchupsFile | null {
  try {
    return JSON.parse(fs.readFileSync(OFF_ROLE_PATH, "utf-8")) as OffRoleMatchupsFile;
  } catch {
    return null;
  }
}

export function getChampionTraits(championId: string): ChampionTraits | null {
  return readTraitsFile()?.champions[championId] ?? null;
}

export function getAllChampionTraits(): Record<string, ChampionTraits> {
  return readTraitsFile()?.champions ?? {};
}

export function getOffRoleMatchup(championA: string, championB: string): OffRoleMatchup | null {
  const key = [championA, championB].sort().join("|");
  return readOffRoleFile()?.pairs[key] ?? null;
}
