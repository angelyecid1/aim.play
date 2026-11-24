// Los datos reales (ChampionDuel, manualChampionOverrides) usan el ID de
// Riot ("MonkeyKing", "Kaisa", "Chogath"). Los 9 archivos curados en
// .claude/ usan nombres en español de Data Dragon ("Wukong", "Kai'Sa",
// "Cho'Gath"), con typos ocasionales. Todo tiene que pasar por aca antes
// de cruzarse, o los joins fallan en silencio sin que se note.

export interface DataDragonChampionRef {
  id: string;
  name: string;
}

export interface ChampionNameIndex {
  byExact: Map<string, string>;
  byNormalized: Map<string, string>;
}

export type MatchedVia = "exact" | "normalized" | "typo-fallback";

export interface ResolvedChampionName {
  id: string;
  matchedVia: MatchedVia;
}

// Solo para errores de tipeo reales — no para diferencias de acentos,
// apostrofes o espacios, eso ya lo cubre normalizeForLookup.
const KNOWN_TYPOS: Record<string, string> = {
  udir: "Udyr",
  blitzcrack: "Blitzcrank",
  gankplan: "Gangplank",
  ilaoi: "Illaoi",
};

export function normalizeForLookup(rawName: string): string {
  return rawName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function buildChampionNameIndex(champions: DataDragonChampionRef[]): ChampionNameIndex {
  const byExact = new Map<string, string>();
  const byNormalized = new Map<string, string>();
  for (const champ of champions) {
    byExact.set(champ.id, champ.id);
    byExact.set(champ.name, champ.id);
    byNormalized.set(normalizeForLookup(champ.id), champ.id);
    byNormalized.set(normalizeForLookup(champ.name), champ.id);
  }
  return { byExact, byNormalized };
}

export function resolveChampionId(index: ChampionNameIndex, rawName: string): ResolvedChampionName | null {
  const trimmed = rawName.trim();

  const exactId = index.byExact.get(trimmed);
  if (exactId) return { id: exactId, matchedVia: "exact" };

  const normalized = normalizeForLookup(trimmed);
  const normalizedMatch = index.byNormalized.get(normalized);
  if (normalizedMatch) return { id: normalizedMatch, matchedVia: "normalized" };

  const typoTarget = KNOWN_TYPOS[normalized];
  if (typoTarget) {
    const resolved = index.byNormalized.get(normalizeForLookup(typoTarget));
    if (resolved) return { id: resolved, matchedVia: "typo-fallback" };
  }

  return null;
}
