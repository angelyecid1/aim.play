import type { PrismaClient } from "@/generated/prisma/client";
import { getChampionMatchups, readDuelsSnapshotForChampion, type Matchup } from "@/lib/duelsSnapshot";
import type { CcType, ChampionTraits, OffRoleMatchup } from "@/lib/championTraits";

// Ranking del usuario por "que tan bueno" es cada tipo de CC (no es lo
// mismo que duro/blando — cruza esa clasificacion, ver
// ".claude/tipos de cc por campeon (borrador)"). De menor a mayor valor:
// 1) Polimorfia, Ceguera, Estasis, reduccion de Velocidad de Ataque
// 2) Silencio
// 3) Empujon, Huye, Lentitud, Miopia, Atraccion hacia el agresor
// 4) Stun, Levantamiento, Atraccion hacia el centro de la habilidad
// Sleep y Disarm no tienen ningun campeon real todavia (ver ese archivo),
// quedan en el nivel mas bajo por defecto hasta que aparezca un caso real.
const CC_TYPE_TIER: Record<CcType, number> = {
  polymorph: 10,
  blind: 10,
  stasis: 10,
  cripple: 10,
  sleep: 10,
  disarm: 10,
  silence: 15,
  knockback: 20,
  fearFlee: 20,
  slow: 20,
  nearsight: 20,
  pullAggressor: 20,
  stun: 25,
  knockupAirborne: 25,
  pullCenter: 25,
};

/** El mejor tipo de CC que tiene un campeon, segun la tabla de arriba (0 si no tiene ninguno). */
function bestCcWeight(t?: ChampionTraits): number {
  if (!t?.cc) return 0;
  let max = 0;
  for (const [type, present] of Object.entries(t.cc)) {
    if (present) max = Math.max(max, CC_TYPE_TIER[type as CcType] ?? 0);
  }
  return max;
}

// Mismo umbral que MIN_DUELS_FOR_RANKING en ChampionsSection.tsx — se
// repite el VALOR aca (no se importa desde ahi) porque ese archivo es
// "use client" y este modulo corre en el servidor.
const MIN_REAL_SAMPLE_FOR_COUNTER = 5;

const POINTS = {
  counter: 20,
  // "Empate" en la lista manual no es un 50/50 neutro — el usuario lo
  // define como "se puede ganar jugando bien, aunque no es un counter
  // claro". Por eso suma, pero menos que un counter real.
  evenMatchup: 10,
  tankGap: 30,
  damageBalance: 10,
  synergy: 10,
  aoeCombo: 8,
  roleGap: 5,
  sustainedOnHitVsTank: 15,
  survivesHeavyEngage: 15,
  rangeBalance: 10,
} as const;

// Cuantos iniciadores rivales hacen falta para considerar el enfrentamiento
// "de mucho engage" — con 2 o mas (ej. Amumu + Malphite), cualquier pick
// con contra-iniciacion propia vale la pena, no solo el primero que cubra
// el hueco del equipo (eso ya lo maneja la regla de huecos, esta es aparte
// y reacciona al rival, no a lo que le falte al equipo propio).
const HEAVY_ENGAGE_ENEMY_INITIATORS = 2;

// Cada nivel del archivo de on-hit tiene su PROPIA condicion completa, no
// solo "hay tanque rival" — hay que verificar todo lo que el nivel pide,
// no solo la mitad mas obvia:
// - "vs-tank" (Kog'Maw, Vayne, Kalista, Varus): pide tanque RIVAL *y*
//   tanque ALIADO que los proteja.
// - "vs-tank-shielded" (Jinx, Twitch, Kai'Sa, Tristana): pide tanque rival
//   *y* un aliado que cure o de escudos (traits.providesAllySustain).
// - "versatile"/"flexible": el propio archivo dice "con tanque rival O
//   sin el" — no es una condicion de tanque real, no le corresponde nada
//   de este bono (antes le daba la mitad sin base real, se quito).
// - "secondary-dps": el archivo dice que es mejor SIN tanque rival — no
//   aplica aca.
// - "melee-onhit": su condicion real es "poco CC rival", no tanques —
//   tampoco aplica a este bono en particular.
const TANK_SPECIALIST_ONHIT_TIER = "marksman-vs-tank";
const TANK_SHIELDED_ONHIT_TIER = "marksman-vs-tank-shielded";

// Los huecos de composicion (tanque, CC duro, iniciacion) no deben pesar
// desde el primer pick — recien importan cuando ya hay suficientes aliados
// puestos como para que un hueco sea real. El balance de daño pesa mas
// tarde todavia, porque recien se nota cerca del ultimo pick.
const COMPOSITION_GAP_MIN_ALLIES = 3;
const DAMAGE_BALANCE_MIN_ALLIES = 4;

export interface DraftState {
  allies: Array<string | null>;
  enemies: Array<string | null>;
}

export interface RecommendationDataset {
  // counterData[candidato][enemigo] = matchup real desde la perspectiva
  // del candidato (ya invertido si se obtuvo consultando al enemigo).
  counterData: Record<string, Record<string, Matchup | null>>;
}

export type ReasonTag =
  | { type: "counter"; targetChampionId: string }
  | { type: "even-matchup"; targetChampionId: string }
  | { type: "tank-gap" }
  | { type: "hard-cc-gap" }
  | { type: "damage-balance" }
  | { type: "synergy"; withChampionId: string }
  | { type: "aoe-combo"; withChampionId: string }
  | { type: "fills-initiator-gap" }
  | { type: "fills-counter-initiator-gap" }
  | { type: "fills-poke-gap" }
  | { type: "sustained-onhit-vs-tank" }
  | { type: "survives-heavy-engage" }
  | { type: "range-balance" };

export interface ScoredCandidate {
  championId: string;
  score: number;
  reasons: ReasonTag[];
}

/**
 * Junta los datos de duelos reales que necesita el puntaje. En vez de
 * consultar cada candidato (pueden ser mas de 150) contra cada enemigo, se
 * consulta cada ENEMIGO ya elegido (maximo 5) una sola vez — sus matchups
 * ya incluyen a la mayoria de los candidatos del otro lado, solo hay que
 * invertir la perspectiva (lo que el rival gana, el candidato lo pierde).
 */
export async function gatherRecommendationData(
  prisma: PrismaClient,
  draft: DraftState,
  candidateIds: string[]
): Promise<RecommendationDataset> {
  const enemiesPicked = draft.enemies.filter((e): e is string => e !== null);
  const counterData: Record<string, Record<string, Matchup | null>> = {};
  for (const candidateId of candidateIds) counterData[candidateId] = {};

  for (const enemyId of enemiesPicked) {
    let enemyMatchups: Matchup[];
    try {
      enemyMatchups = await getChampionMatchups(prisma, enemyId);
    } catch {
      enemyMatchups = readDuelsSnapshotForChampion(enemyId)?.matchups ?? [];
    }
    const byOpponent = new Map(enemyMatchups.map((m) => [m.opponent, m]));

    for (const candidateId of candidateIds) {
      const fromEnemyPerspective = byOpponent.get(candidateId);
      counterData[candidateId][enemyId] = fromEnemyPerspective
        ? { opponent: enemyId, wins: fromEnemyPerspective.losses, losses: fromEnemyPerspective.wins }
        : null;
    }
  }

  return { counterData };
}

/**
 * Probabilidad de victoria del candidato contra un rival puntual,
 * promediando dato real + manual cuando existan los dos. "Empate" manual
 * queda AFUERA de este calculo a proposito (no es un 50/50 neutro, ver
 * isEvenMatchup) — si el rival tiene datos reales, esos mandan solos.
 */
function counterWinProbability(
  candidateId: string,
  enemyId: string,
  dataset: RecommendationDataset,
  offRoleMatchups: Record<string, OffRoleMatchup>
): number | null {
  const real = dataset.counterData[candidateId]?.[enemyId];
  const realSample = real ? real.wins + real.losses : 0;
  const realWinProb = real && realSample >= MIN_REAL_SAMPLE_FOR_COUNTER ? real.wins / realSample : null;

  const offKey = [candidateId, enemyId].sort().join("|");
  const off = offRoleMatchups[offKey];
  let offWinProb: number | null = null;
  if (off && off !== "tie") {
    offWinProb = off.winner === candidateId ? off.winnerWinPct / 100 : 1 - off.winnerWinPct / 100;
  }

  if (realWinProb !== null && offWinProb !== null) return (realWinProb + offWinProb) / 2;
  if (realWinProb !== null) return realWinProb;
  if (offWinProb !== null) return offWinProb;
  return null;
}

/**
 * "Empate" en la lista manual — solo cuenta cuando no hay NINGUN otro dato
 * (ni real, ni gana/pierde manual) para esa pareja, porque si esos existen
 * ya definen algo mas fuerte que un empate.
 */
function isEvenMatchup(
  candidateId: string,
  enemyId: string,
  offRoleMatchups: Record<string, OffRoleMatchup>
): boolean {
  const offKey = [candidateId, enemyId].sort().join("|");
  return offRoleMatchups[offKey] === "tie";
}

function damageBalanceHelps(
  alliesPicked: string[],
  candidateId: string,
  traits: Record<string, ChampionTraits>
): boolean {
  const alliesDamageTypes = alliesPicked.map((a) => traits[a]?.damageType).filter((d): d is NonNullable<typeof d> => Boolean(d));
  if (alliesDamageTypes.length === 0) return false;
  const dominant = alliesDamageTypes[0];
  const allSame = dominant !== "mixed" && alliesDamageTypes.every((d) => d === dominant);
  if (!allSame) return false;
  const candidateType = traits[candidateId]?.damageType;
  return candidateType === "mixed" || (Boolean(candidateType) && candidateType !== dominant);
}

type RangeType = "ranged" | "melee" | "both";

function rangeType(t?: ChampionTraits): RangeType | null {
  if (!t) return null;
  if (t.ranged && t.melee) return "both";
  if (t.ranged) return "ranged";
  if (t.melee) return "melee";
  return null;
}

// Mismo problema que el balance de daño, pero de alcance: un equipo todo
// melee se deja kitear/pokear sin poder cerrar la distancia, uno todo a
// distancia no tiene con que iniciar o aguantar un dive.
function rangeBalanceHelps(
  alliesPicked: string[],
  candidateId: string,
  traits: Record<string, ChampionTraits>
): boolean {
  const alliesRangeTypes = alliesPicked.map((a) => rangeType(traits[a])).filter((r): r is RangeType => Boolean(r));
  if (alliesRangeTypes.length === 0) return false;
  const dominant = alliesRangeTypes[0];
  const allSame = dominant !== "both" && alliesRangeTypes.every((r) => r === dominant);
  if (!allSame) return false;
  const candidateRange = rangeType(traits[candidateId]);
  return candidateRange === "both" || (Boolean(candidateRange) && candidateRange !== dominant);
}

/** Pura, sincronica — recibe todo ya juntado, no toca la base de datos. */
export function scoreCandidates(
  draft: DraftState,
  candidateIds: string[],
  traits: Record<string, ChampionTraits>,
  dataset: RecommendationDataset,
  offRoleMatchups: Record<string, OffRoleMatchup>
): ScoredCandidate[] {
  const alliesPicked = draft.allies.filter((a): a is string => a !== null);
  const enemiesPicked = draft.enemies.filter((e): e is string => e !== null);
  const alliesPickedCount = alliesPicked.length;

  const compositionGapsApply = alliesPickedCount >= COMPOSITION_GAP_MIN_ALLIES;
  const damageBalanceApplies = alliesPickedCount >= DAMAGE_BALANCE_MIN_ALLIES;

  // Señal reactiva al RIVAL, no a huecos propios — por eso no se gatea por
  // cuantos aliados van elegidos (aplica desde el primer pick, en cuanto el
  // rival ya tiene un tanque en su equipo).
  const enemyHasTank = enemiesPicked.some((e) => traits[e]?.tank);
  const enemyInitiatorCount = enemiesPicked.filter((e) => traits[e]?.initiator).length;

  const allyHasTank = alliesPicked.some((a) => traits[a]?.tank);
  const allyHasSustain = alliesPicked.some((a) => traits[a]?.providesAllySustain);
  const allyBestCcWeight = alliesPicked.reduce((max, a) => Math.max(max, bestCcWeight(traits[a])), 0);
  const allyHasInitiator = alliesPicked.some((a) => traits[a]?.initiator);
  const allyHasCounterInitiator = alliesPicked.some((a) => traits[a]?.counterInitiator);
  const allyHasPoke = alliesPicked.some((a) => traits[a]?.poke);
  const allyWithGroupingCc = alliesPicked.find((a) => traits[a]?.hasAoeGroupingCc);

  const results: ScoredCandidate[] = [];

  for (const candidateId of candidateIds) {
    const candidateTraits = traits[candidateId];
    let score = 0;
    const reasons: ReasonTag[] = [];

    for (const enemyId of enemiesPicked) {
      const winProb = counterWinProbability(candidateId, enemyId, dataset, offRoleMatchups);
      if (winProb !== null && winProb > 0.5) {
        score += POINTS.counter;
        reasons.push({ type: "counter", targetChampionId: enemyId });
      } else if (winProb === null && isEvenMatchup(candidateId, enemyId, offRoleMatchups)) {
        score += POINTS.evenMatchup;
        reasons.push({ type: "even-matchup", targetChampionId: enemyId });
      }
    }

    if (compositionGapsApply) {
      if (!allyHasTank && candidateTraits?.tank) {
        score += POINTS.tankGap;
        reasons.push({ type: "tank-gap" });
      }
      const candidateCcWeight = bestCcWeight(candidateTraits);
      if (candidateCcWeight > allyBestCcWeight) {
        score += candidateCcWeight;
        reasons.push({ type: "hard-cc-gap" });
      }
      if (!allyHasInitiator && candidateTraits?.initiator) {
        score += POINTS.roleGap;
        reasons.push({ type: "fills-initiator-gap" });
      }
      if (!allyHasCounterInitiator && candidateTraits?.counterInitiator) {
        score += POINTS.roleGap;
        reasons.push({ type: "fills-counter-initiator-gap" });
      }
      if (!allyHasPoke && candidateTraits?.poke) {
        score += POINTS.roleGap;
        reasons.push({ type: "fills-poke-gap" });
      }
    }

    if (damageBalanceApplies && damageBalanceHelps(alliesPicked, candidateId, traits)) {
      score += POINTS.damageBalance;
      reasons.push({ type: "damage-balance" });
    }

    if (damageBalanceApplies && rangeBalanceHelps(alliesPicked, candidateId, traits)) {
      score += POINTS.rangeBalance;
      reasons.push({ type: "range-balance" });
    }

    for (const allyId of alliesPicked) {
      const allySynergies = traits[allyId]?.synergies ?? [];
      const candidateSynergies = candidateTraits?.synergies ?? [];
      if (allySynergies.includes(candidateId) || candidateSynergies.includes(allyId)) {
        score += POINTS.synergy;
        reasons.push({ type: "synergy", withChampionId: allyId });
      }
    }

    if (candidateTraits?.aoeDamage && allyWithGroupingCc) {
      score += POINTS.aoeCombo;
      reasons.push({ type: "aoe-combo", withChampionId: allyWithGroupingCc });
    }

    if (enemyHasTank && candidateTraits?.sustainedOnHit && !candidateTraits.sustainedOnHitExcluded) {
      const tier = candidateTraits.sustainedOnHitTier;
      // "vs-tank" pide ADEMAS tanque aliado que proteja — no solo tanque
      // rival. Sin eso, esta pareja especifica no aplica todavia.
      if (tier === TANK_SPECIALIST_ONHIT_TIER && allyHasTank) {
        score += POINTS.sustainedOnHitVsTank;
        reasons.push({ type: "sustained-onhit-vs-tank" });
      }
      // "vs-tank-shielded" pide ademas un aliado que cure/de escudos.
      if (tier === TANK_SHIELDED_ONHIT_TIER && allyHasSustain) {
        score += POINTS.sustainedOnHitVsTank;
        reasons.push({ type: "sustained-onhit-vs-tank" });
      }
      // "versatile"/"flexible"/"secondary-dps"/"melee-onhit" no aplican a
      // esta condicion puntual (ver comentario en las constantes arriba).
    }

    if (enemyInitiatorCount >= HEAVY_ENGAGE_ENEMY_INITIATORS && candidateTraits?.counterInitiator) {
      score += POINTS.survivesHeavyEngage;
      reasons.push({ type: "survives-heavy-engage" });
    }

    results.push({ championId: candidateId, score, reasons });
  }

  return results.sort((a, b) => b.score - a.score).slice(0, 9);
}

function displayName(id: string, idToDisplayName: Record<string, string>): string {
  return idToDisplayName[id] ?? id;
}

/** Convierte las razones estructuradas en frases en español — nunca menciona puntos ni nombres de señales. */
export function buildReasonText(reasons: ReasonTag[], idToDisplayName: Record<string, string>): string[] {
  return reasons.map((reason) => {
    switch (reason.type) {
      case "counter":
        return `Le gana a ${displayName(reason.targetChampionId, idToDisplayName)}`;
      case "even-matchup":
        return `Es parejo contra ${displayName(reason.targetChampionId, idToDisplayName)} — jugándolo bien se puede ganar`;
      case "tank-gap":
        return "Tu equipo necesita un tanque y este campeón lo cubre";
      case "hard-cc-gap":
        return "Trae mejor control que el que ya tiene tu equipo";
      case "damage-balance":
        return "Ayuda a mezclar el tipo de daño de tu equipo";
      case "synergy":
        return `Combina bien con ${displayName(reason.withChampionId, idToDisplayName)}`;
      case "aoe-combo":
        return `Su daño en área combina con el control de ${displayName(reason.withChampionId, idToDisplayName)}`;
      case "fills-initiator-gap":
        return "Tu equipo no tiene quién inicie la pelea";
      case "fills-counter-initiator-gap":
        return "Tu equipo no tiene respuesta si el rival inicia";
      case "fills-poke-gap":
        return "Aporta daño a distancia que tu equipo no tiene";
      case "sustained-onhit-vs-tank":
        return "Su daño sostenido perfora a los tanques rivales con el tiempo";
      case "survives-heavy-engage":
        return "El rival tiene mucha iniciación — este campeón puede responder o escapar de eso";
      case "range-balance":
        return "Ayuda a mezclar cuerpo a cuerpo y a distancia en tu equipo";
    }
  });
}
