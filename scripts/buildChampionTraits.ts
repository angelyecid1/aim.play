// Compila los archivos curados a mano en .claude/ (mas manualChampionOverrides
// en codigo) en dos JSON estaticos que la app lee en tiempo real:
//   - data/champion-traits.json
//   - data/champion-off-role-matchups.json
//
// Se corre A MANO (npx tsx scripts/buildChampionTraits.ts) cada vez que se
// edite alguno de esos archivos fuente — no esta conectado a dailyResync.ts
// a proposito, porque esos archivos cambian por decision humana, no solo.
//
// Se escribe fuera de src/ para que Turbopack no trate la regeneracion como
// un cambio de codigo (mismo motivo que data/duels-snapshot.json).

import fs from "fs";
import path from "path";
import {
  buildChampionNameIndex,
  resolveChampionId,
  type ChampionNameIndex,
} from "../src/lib/championNameNormalization";
import { manualChampionOverrides } from "../src/lib/championRoles";

const CLAUDE_DIR = path.join(process.cwd(), ".claude");
const DATA_DIR = path.join(process.cwd(), "data");

// Suppression, Root/Snare y Ground se fusionaron dentro de Stun, y Charm y
// Taunt dentro de Pull (agresor) — ver ".claude/tipos de cc por campeon
// (borrador)". Pull se separa en dos variantes (agresor / centro de la
// habilidad) porque el usuario les da un valor distinto en el ranking por
// calidad de CC (ver CC_TYPE_TIER en draftRecommendation.ts).
type CcType =
  | "stun" | "knockback" | "fearFlee"
  | "polymorph" | "sleep" | "slow" | "silence" | "blind"
  | "disarm" | "knockupAirborne" | "cripple" | "stasis"
  | "nearsight" | "pullAggressor" | "pullCenter";

const AOE_GROUPING_CC_TYPES: CcType[] = ["pullAggressor", "pullCenter", "knockupAirborne"];
const HARD_CC_TYPES: CcType[] = [
  "stun", "knockupAirborne", "knockback",
  "fearFlee", "polymorph", "stasis", "sleep", "pullAggressor", "pullCenter",
];

interface ChampionTraits {
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
  // Separados porque el archivo fuente ya no los mezcla (antes era una sola
  // lista "cura o da escudos"). providesAllySustain se sigue derivando como
  // "cura O escudo" para no tener que tocar el motor de puntaje, que solo
  // necesitaba esa version combinada.
  providesShield?: boolean;
  providesHeal?: boolean;
  providesAllySustain?: boolean;
  roles?: string[];
  synergies?: string[];
}

type TraitsAccumulator = Record<string, ChampionTraits>;

function ensure(acc: TraitsAccumulator, id: string): ChampionTraits {
  if (!acc[id]) acc[id] = { cc: {}, hasHardCc: false, hasAoeGroupingCc: false };
  return acc[id];
}

// Contadores globales de resolucion de nombres, para el resumen final.
const stats = { exact: 0, normalized: 0, typoFallback: 0, unresolved: [] as string[] };

function resolve(index: ChampionNameIndex, rawName: string, sourceFile: string): string | null {
  const result = resolveChampionId(index, rawName);
  if (!result) {
    stats.unresolved.push(`${rawName} (en ${sourceFile})`);
    return null;
  }
  if (result.matchedVia === "exact") stats.exact++;
  else if (result.matchedVia === "normalized") stats.normalized++;
  else stats.typoFallback++;
  return result.id;
}

function readClaudeFile(name: string): string {
  return fs.readFileSync(path.join(CLAUDE_DIR, name), "utf-8");
}

// ---------------------------------------------------------------------------
// 1. Tipos de CC por campeon
// ---------------------------------------------------------------------------
const CC_SECTION_TRAIT: Record<string, CcType> = {
  "Stun (Aturdimiento)": "stun",
  "Knockback (Empujón)": "knockback",
  "Fear / Flee (Miedo / Huye)": "fearFlee",
  "Polymorph (Polimorfia)": "polymorph",
  "Sleep (Sueño)": "sleep",
  "Slow (Lentitud)": "slow",
  "Silence (Silencio)": "silence",
  "Blind (Ceguera)": "blind",
  "Disarm (Desarme)": "disarm",
  "Knockup / Airborne (Levantamiento)": "knockupAirborne",
  "Cripple / reducción de Velocidad de Ataque": "cripple",
  "Stasis (Estasis)": "stasis",
  "Nearsight (Miopía / Visión reducida)": "nearsight",
  "Atracción hacia el agresor": "pullAggressor",
  "Atracción hacia el centro de la habilidad (no necesariamente el agresor)": "pullCenter",
};

function parseCcFile(acc: TraitsAccumulator, index: ChampionNameIndex) {
  const text = readClaudeFile("tipos de cc por campeon (borrador)");
  const lines = text.split("\n");
  let currentTrait: CcType | null = null;
  let stopped = false;
  let parsed = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line.startsWith("=== EXCLUIDOS") || line.startsWith("=== NOTAS SUELTAS")) {
      stopped = true;
      continue;
    }
    if (stopped) continue;

    if (CC_SECTION_TRAIT[line]) {
      currentTrait = CC_SECTION_TRAIT[line];
      continue;
    }
    if (!currentTrait) continue;
    if (!line.startsWith("- ")) continue;

    const match = line.match(/^- ([^(:]+)/);
    if (!match) continue;
    const championId = resolve(index, match[1].trim(), "tipos de cc");
    if (!championId) continue;

    ensure(acc, championId).cc[currentTrait] = true;
    parsed++;
  }
  console.log(`[cc] ${parsed} entradas parseadas`);
}

// ---------------------------------------------------------------------------
// 2. Daño en area y pockeo
// ---------------------------------------------------------------------------
function parseAoePokeFile(acc: TraitsAccumulator, index: ChampionNameIndex) {
  const text = readClaudeFile("campeones de daño en area y pockeo");
  const lines = text.split("\n");
  let section: "aoe" | "poke" | null = null;
  let parsed = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === "Campeones de Daño en Área (AoE)") { section = "aoe"; continue; }
    if (line === "Campeones de Pockeo (Poke)") { section = "poke"; continue; }
    if (!section || !line.startsWith("- ")) continue;

    const ambos = line.includes("(ambos)");
    const name = line.slice(2).replace(/\s*\(ambos\)\s*$/, "").trim();
    const championId = resolve(index, name, "area/pockeo");
    if (!championId) continue;

    const traits = ensure(acc, championId);
    if (section === "aoe") traits.aoeDamage = true;
    if (section === "poke") traits.poke = true;
    if (ambos) { traits.aoeDamage = true; traits.poke = true; }
    parsed++;
  }
  console.log(`[area/pockeo] ${parsed} entradas parseadas`);
}

// ---------------------------------------------------------------------------
// 3. Daño sostenido de basicos (on-hit)
// ---------------------------------------------------------------------------
function extractParenSpan(line: string): string | null {
  const start = line.indexOf("(");
  const end = line.lastIndexOf(")");
  if (start === -1 || end === -1 || end <= start) return null;
  return line.slice(start + 1, end).trim();
}

function splitChampionNames(clause: string): string[] {
  return clause
    .replace(/ y /g, ",")
    .replace(/\./g, ",")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const MARKSMAN_TIERS = [
  "marksman-vs-tank",
  "marksman-vs-tank-shielded",
  "marksman-versatile",
  "marksman-flexible",
] as const;

function parseOnHitFile(acc: TraitsAccumulator, index: ChampionNameIndex) {
  const text = readClaudeFile("campeones de daño sostenido de basicos");
  const lines = text.split("\n").map((l) => l.trim());
  let parsed = 0;

  function applyTier(championId: string, tier: string, condition?: string) {
    const traits = ensure(acc, championId);
    traits.sustainedOnHit = true;
    traits.sustainedOnHitTier = tier;
    if (condition) traits.sustainedOnHitCondition = condition;
    parsed++;
  }

  // La condicion de "Mele on-hit" vive en la linea entre el encabezado y el
  // primer "- ", asi que se busca antes de recorrer el resto del archivo.
  let meleeCondition: string | undefined;
  const meleeHeaderIdx = lines.findIndex((l) => l.startsWith("Mele on-hit / sostenido"));
  if (meleeHeaderIdx !== -1) {
    for (let j = meleeHeaderIdx + 1; j < lines.length; j++) {
      if (lines[j].startsWith("- ")) break;
      if (lines[j]) { meleeCondition = extractParenSpan(lines[j]) ?? undefined; break; }
    }
  }

  let i = 0;
  let marksmanTierIdx = 0;
  let secondaryCondition: string | undefined;
  let section: "marksmen" | "melee" | "secondary" | "excluded" | null = null;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("Marksmen / Tiradores")) { section = "marksmen"; i++; continue; }
    if (line.startsWith("Mele on-hit / sostenido")) { section = "melee"; i++; continue; }
    if (line.startsWith("DPS secundario")) {
      section = "secondary";
      secondaryCondition = extractParenSpan(line) ?? undefined;
      i++;
      continue;
    }
    if (line.startsWith("EXCLUIDOS A PROPOSITO")) { section = "excluded"; i++; continue; }

    if (section === "marksmen" && line.startsWith("- ")) {
      const condition = extractParenSpan(line) ?? undefined;
      const namesClause = line.slice(2).split("(")[0];
      const tier = MARKSMAN_TIERS[Math.min(marksmanTierIdx, MARKSMAN_TIERS.length - 1)];
      for (const name of splitChampionNames(namesClause)) {
        const championId = resolve(index, name, "on-hit");
        if (championId) applyTier(championId, tier, condition);
      }
      marksmanTierIdx++;
      i++;
      continue;
    }

    if (section === "melee" && line.startsWith("- ")) {
      const championId = resolve(index, line.slice(2).trim(), "on-hit");
      if (championId) applyTier(championId, "melee-onhit", meleeCondition);
      i++;
      continue;
    }

    if (section === "secondary" && line.startsWith("- ")) {
      const championId = resolve(index, line.slice(2).trim(), "on-hit");
      if (championId) applyTier(championId, "secondary-dps", secondaryCondition);
      i++;
      continue;
    }

    if (section === "excluded" && line.startsWith("- ")) {
      // "Zaahen y Locke: ..." -- nombres antes de los ":", separados por " y ".
      const namesClause = line.slice(2).split(":")[0];
      for (const name of splitChampionNames(namesClause)) {
        const championId = resolve(index, name, "on-hit");
        if (championId) {
          const traits = ensure(acc, championId);
          traits.sustainedOnHit = false;
          traits.sustainedOnHitExcluded = true;
        }
      }
      i++;
      continue;
    }

    i++;
  }

  console.log(`[on-hit] ${parsed} entradas parseadas`);
}

// ---------------------------------------------------------------------------
// 4. Iniciacion y contra iniciacion
// ---------------------------------------------------------------------------
function parseInitiationFile(acc: TraitsAccumulator, index: ChampionNameIndex) {
  const text = readClaudeFile("campeones de iniciacion y contra iniciacion");
  const lines = text.split("\n").map((l) => l.trim());
  let section: "init" | "counter" | null = null;
  let parsed = 0;

  for (const line of lines) {
    if (line === "Campeones de Iniciación") { section = "init"; continue; }
    if (line === "Campeones de Contra Iniciación") { section = "counter"; continue; }
    if (!section || !line.startsWith("- ")) continue;

    const championId = resolve(index, line.slice(2).trim(), "iniciacion");
    if (!championId) continue;
    const traits = ensure(acc, championId);
    if (section === "init") traits.initiator = true;
    if (section === "counter") traits.counterInitiator = true;
    parsed++;
  }
  console.log(`[iniciacion] ${parsed} entradas parseadas`);
}

// ---------------------------------------------------------------------------
// 5. Rango a distancia y melee
// ---------------------------------------------------------------------------
function parseRangeMeleeFile(acc: TraitsAccumulator, index: ChampionNameIndex) {
  const text = readClaudeFile("campeones de rango a distancia y melee");
  const lines = text.split("\n").map((l) => l.trim());
  let section: "ranged" | "melee" | null = null;
  let parsed = 0;

  for (const line of lines) {
    if (line === "Campeones de Rango a Distancia") { section = "ranged"; continue; }
    if (line === "Campeones Cuerpo a Cuerpo (Melee)") { section = "melee"; continue; }
    if (!section || !line.startsWith("- ")) continue;

    const ambos = line.includes("(ambos)");
    const name = line.slice(2).replace(/\s*\(ambos\)\s*$/, "").trim();
    const championId = resolve(index, name, "rango/melee");
    if (!championId) continue;

    const traits = ensure(acc, championId);
    if (section === "ranged") traits.ranged = true;
    if (section === "melee") traits.melee = true;
    if (ambos) { traits.ranged = true; traits.melee = true; }
    parsed++;
  }
  console.log(`[rango/melee] ${parsed} entradas parseadas`);
}

// ---------------------------------------------------------------------------
// 6. AD, AP y tanques
// ---------------------------------------------------------------------------
function parseTankDamageFile(acc: TraitsAccumulator, index: ChampionNameIndex) {
  const text = readClaudeFile("campeones ad, ap y tanques");
  const lines = text.split("\n").map((l) => l.trim());
  let section: "tank" | "physical" | "magic" | "mixed" | "shield" | "heal" | null = null;
  let parsed = 0;

  for (const line of lines) {
    if (line === "Campeones Tanque") { section = "tank"; continue; }
    if (line === "Daño Físico") { section = "physical"; continue; }
    if (line === "Daño Mágico") { section = "magic"; continue; }
    if (line.startsWith("Daño Mixto")) { section = "mixed"; continue; }
    if (line === "Escudos") { section = "shield"; continue; }
    if (line === "Curación") { section = "heal"; continue; }
    if (!section || !line.startsWith("- ")) continue;

    // Algunas lineas de Mixto traen una nota entre parentesis al final.
    const name = line.slice(2).split("(")[0].trim();
    const championId = resolve(index, name, "ad/ap/tanques");
    if (!championId) continue;

    const traits = ensure(acc, championId);
    if (section === "tank") traits.tank = true;
    else if (section === "shield") traits.providesShield = true;
    else if (section === "heal") traits.providesHeal = true;
    else traits.damageType = section as "physical" | "magic" | "mixed";
    parsed++;
  }
  console.log(`[ad/ap/tanques] ${parsed} entradas parseadas`);
}

// ---------------------------------------------------------------------------
// 7. Enfrentamientos fuera de rol (mayormente vacio todavia, esperado)
// ---------------------------------------------------------------------------
interface OffRoleMatchupsFile {
  generatedAt: string;
  pairs: Record<string, { winner: string; winnerWinPct: number } | "tie">;
}

// "gana"/"pierde" sin numero (el usuario casi siempre lo escribe asi, sin
// porcentaje) se toman como "favorito claro sin cifra exacta en mente" —
// mismo valor que el 65% que el propio usuario uso en su ejemplo original.
const DEFAULT_CLEAR_WIN_PCT = 65;

function parseOffRoleFile(index: ChampionNameIndex): OffRoleMatchupsFile["pairs"] {
  const text = readClaudeFile("lista de enfrentamientos fuera de rol");
  const lines = text.split("\n").map((l) => l.trim());
  const pairs: OffRoleMatchupsFile["pairs"] = {};
  let currentChampionId: string | null = null;
  let parsed = 0;

  for (const line of lines) {
    // El bloque "EJEMPLO X" del principio del archivo es solo para mostrar
    // el formato — no cuenta como dato real, y puede pisar datos reales del
    // mismo campeon si se lo trata como una seccion normal (paso real: el
    // ejemplo de Aatrox decia "Zed: empate", tapando el "Zed: pierde" real).
    const exampleMatch = line.match(/^EJEMPLO /);
    const headerMatch = line.match(/^([A-ZÁÉÍÓÚÑ'’.\s]+) \(vs \d+\)$/);

    if (exampleMatch) {
      currentChampionId = null;
      continue;
    }
    if (headerMatch) {
      currentChampionId = resolve(index, headerMatch[1].trim(), "enfrentamientos fuera de rol");
      continue;
    }
    if (!currentChampionId || !line.startsWith("- ")) continue;

    const resultMatch = line.match(/^- (.+?): (gana|pierde|empate)(?:\s+(\d+)%)?/);
    if (!resultMatch) continue; // linea sin dato todavia (lista en blanco), se salta

    const [, opponentRaw, result, pctRaw] = resultMatch;
    const opponentId = resolve(index, opponentRaw.trim(), "enfrentamientos fuera de rol");
    if (!opponentId) continue;

    const key = [currentChampionId, opponentId].sort().join("|");
    if (result === "empate") {
      pairs[key] = "tie";
    } else if (result === "gana") {
      pairs[key] = { winner: currentChampionId, winnerWinPct: pctRaw ? Number(pctRaw) : DEFAULT_CLEAR_WIN_PCT };
    } else if (result === "pierde") {
      // "pierde X%" = el anfitrion pierde X% de las veces, o sea el rival
      // (quien de verdad gana) gana ESE MISMO X%, no el complemento.
      pairs[key] = { winner: opponentId, winnerWinPct: pctRaw ? Number(pctRaw) : DEFAULT_CLEAR_WIN_PCT };
    }
    parsed++;
  }
  console.log(`[enfrentamientos fuera de rol] ${parsed} parejas con dato real`);
  return pairs;
}

// ---------------------------------------------------------------------------
// 8. roles/synergies desde codigo (ya en TS, sin normalizar)
// ---------------------------------------------------------------------------
function applyManualOverrides(acc: TraitsAccumulator) {
  for (const [championId, override] of Object.entries(manualChampionOverrides)) {
    const traits = ensure(acc, championId);
    if (override.roles) traits.roles = override.roles;
    if (override.synergies) traits.synergies = override.synergies;
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const versions = (await (await fetch("https://ddragon.leagueoflegends.com/api/versions.json")).json()) as string[];
  const version = versions[0];
  const championListRes = await fetch(
    `https://ddragon.leagueoflegends.com/cdn/${version}/data/es_MX/champion.json`
  );
  const championListJson = (await championListRes.json()) as { data: Record<string, { id: string; name: string }> };
  const champions = Object.values(championListJson.data).map((c) => ({ id: c.id, name: c.name }));
  const index = buildChampionNameIndex(champions);

  const acc: TraitsAccumulator = {};

  parseCcFile(acc, index);
  parseAoePokeFile(acc, index);
  parseOnHitFile(acc, index);
  parseInitiationFile(acc, index);
  parseRangeMeleeFile(acc, index);
  parseTankDamageFile(acc, index);
  const offRolePairs = parseOffRoleFile(index);
  applyManualOverrides(acc);

  // Derivados: hasHardCc / hasAoeGroupingCc / providesAllySustain.
  for (const traits of Object.values(acc)) {
    traits.hasHardCc = HARD_CC_TYPES.some((t) => traits.cc[t]);
    traits.hasAoeGroupingCc = AOE_GROUPING_CC_TYPES.some((t) => traits.cc[t]);
    traits.providesAllySustain = Boolean(traits.providesShield || traits.providesHeal);
  }

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(
    path.join(DATA_DIR, "champion-traits.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), champions: acc }, null, 2)
  );
  fs.writeFileSync(
    path.join(DATA_DIR, "champion-off-role-matchups.json"),
    JSON.stringify({ generatedAt: new Date().toISOString(), pairs: offRolePairs }, null, 2)
  );

  console.log();
  console.log("=== RESUMEN ===");
  console.log(`Campeones con al menos un rasgo: ${Object.keys(acc).length}`);
  console.log(`Resoluciones: ${stats.exact} exactas, ${stats.normalized} normalizadas, ${stats.typoFallback} por typo-fallback`);
  console.log(`SIN RESOLVER: ${stats.unresolved.length}`);
  for (const u of stats.unresolved) console.log(`  - ${u}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
