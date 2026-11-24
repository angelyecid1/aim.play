"use client";

import { useEffect, useMemo, useState } from "react";

interface DataDragonItem {
  name: string;
  description: string;
  plaintext?: string;
  tags?: string[];
  from?: string[];
  into?: string[];
  image: {
    full: string;
  };
  gold: {
    total: number;
    purchasable: boolean;
  };
  maps?: Record<string, boolean>;
  stats?: Record<string, number>;
  inStore?: boolean;
  requiredChampion?: string;
}

type ItemCategoryKey = "utility" | "ad" | "ap" | "health" | "boots";
type ItemTierKey = "starter" | "basic" | "epic" | "legendary";

// Lista fija de los items que de verdad importan para Ranked Solo/Duo y
// Flex ahora mismo, curada a mano y EN EL ORDEN EXACTO en que se quieren
// ver en pantalla — Data Dragon a veces ya trae variantes nuevas/de prueba
// (ej. una cadena de botas entera que todavia no esta en el juego real)
// marcadas como validas para el mapa, y eso metia items que no deberian
// aparecer. Con esta lista, la pagina siempre muestra exactamente estos,
// sin de mas ni de menos, aunque Data Dragon cambie — y siempre en este
// orden, no por costo ni alfabetico.
const CURATED_ITEM_ORDER = [
  "Botas de Lucidez Carmesí",
  "Camino Inmortal",
  "Botas de Marcha Rápida",
  "Grebas de Armacero",
  "Zapatos de Lanzahechizos",
  "Blindadas de Avance",
  "Trituradoras Aceradas",
  "El Sello de la Oscuridad",
  "Lágrima de la Diosa",
    "Sortija de Doran",
    "Arco de Doran",
    "Mapamundi",
    "Espada de Doran",
    "Sacrificar",
    "Casco de Doran",
    "Escudo de Doran",
    "Cachorro de Rasgafuegos",
    "Cría de Trotabrisas",
    "Retoño de Pisamusgo",
    "Amuleto de las Hadas",
    "Daga",
    "Mena Brillante",
    "Cristal de Zafiro",
    "Armadura de Tela",
    "Perla de Rejuvenecimiento",
    "Espada Larga",
    "Libro Amplificador",
    "Manto Anulamagia",
    "Cristal de Rubí",
    "Capa de Agilidad",
    "Varita Explosiva",
    "Picacha",
    "Vara Innecesariamente Grande",
    "Espadón",
    "Ídolo Prohibido",
    "Honda del Explorador",
    "Arco Recurvado",
    "Rectriz",
    "Orbe del Olvido",
    "El Llamado del Verdugo",
    "Gemaluz",
    "Cota de Malla",
    "Vesta Espinosa",
    "Brazal Cristalino",
    "Placa Lunar Alada",
    "Códice Diabólico",
    "Capa de Negatrones",
    "Escudo Glacial",
    "Brisa de Éter",
    "Cenizas Predestinadas",
    "Espejo de Vitrobandle",
    "Cetro Vampírico",
    "Brillo",
    "Ceniza de Bami",
    "Cinturón de Gigante",
    "Puñal Serrado",
    "Cota del Guardabosques",
    "Martillo de Guerra de Caulfield",
    "Alternador Hextech",
    "Joya Maldita",
    "Sello de Acero",
    "Bacteriófago",
    "Excavador de Túneles",
    "Capítulo Perdido",
    "Fervor",
    "Hacha Hogareña",
    "Tiamat",
    "Hábito del Espectro",
    "Catalizador de Eones",
    "Antifaz Embrujado",
    "Carcaj de Mediodía",
    "Sorbechizos",
    "Fajín de Mercurio",
    "El Brutalizador",
    "Último Suspiro",
    "Barrera Esmeralda",
    "Guardabrazo del Buscador",
    "Canción de Sangre",
    "Trineo del Solsticio",
    "Oposición Celestial",
    "Tejesueños",
    "Espina Dimensional de Zaz'Zak",
    "Robaalmas de Mejai",
    "Canto de Guerra de Shurelya",
    "Pebetero Ardiente",
    "Ecos de Helia",
    "Renovador de Piedra Lunar",
    "Relicario de los Solari de Hierro",
    "Convergencia de Zeke",
    "Tiara Susurrante",
    "Báculo de Agua Fluyente",
    "Redención",
    "Bendición de Mikael",
    "Flautas de Bandle",
    "Promesa del Caballero",
    "Umbral del Invierno",
    "Mandato Imperial",
    "Cota de Espinas",
    "Corazón de Hielo",
    "Esfera del Amanecer",
    "Colmillo de Serpiente",
    "Vara de las Edades",
    "Cetro de Cristal de Rylai",
    "Arnés de Protoplasma",
    "Cinturón Cohete Hextech",
    "Bailarín Espectral",
    "Proyectiles Cazademonios",
    "Cuchilla Rauda de Navori",
    "Huracán de Runaan",
    "Cañón de Fuego Rápido",
    "Máscara Abisal",
    "Maldad",
    "Enfoque al Horizonte",
    "Apariencia Espiritual",
    "Presagio de Randuin",
    "Eco de Luden",
    "Arco Axiomático",
    "Antorcha de Fuegoscuro",
    "Actualizador",
    "Descarga Tormentosa",
    "Espada de la Penumbra",
    "Arrogancia",
    "Espada Fantasma de Youmuu",
    "Hexóptica C44",
    "Al Filo de la Cordura",
    "Desesperación Eterna",
    "Resplandor Vacío",
    "Égida de Fuego Solar",
    "Fuerza de la Naturaleza",
    "Morellonomicón",
    "Hidra Profana",
    "Báculo del Arcángel",
    "Manamune",
    "Maldición del Liche",
    "Diente de Nashor",
    "Maldición de la Vampiresa",
    "Eclipse",
    "Guantelete del Hijo del Hielo",
    "Rukerno Kaénico",
    "Placa del Hombre Muerto",
    "Velo de la Banshee",
    "Báculo del Vacío",
    "Sablepistola Hextech",
    "Criptorretoño",
    "Impulso Cósmico",
    "El Tormento de Liandry",
    "Navaja de Statikk",
    "Espadafuria de Guinsoo",
    "Rompebastiones",
    "Filo de la Noche",
    "El Coleccionista",
    "Cicloespada Voltaica",
    "Arcoescudo Inmortal",
    "Recordatorio Mortal",
    "Flechas Salvajes de Yun Tal",
    "Matakrakens",
    "Terminus",
    "Placa Hexperimental",
    "Cuchilla Oscura",
    "Sierraespada Quimpunk",
    "Rencor de Serylda",
    "Rompecascos",
    "Corazón de Acero",
    "Saqueador de Esencias",
    "Agrietador",
    "Ocaso y Alba",
    "Hambre Infinita",
    "Fauces de Malmortius",
    "Lanza de Shojin",
    "Cielo Desgarrado",
    "Armadura de Warmog",
    "Lumbría",
    "Filo de la Tormenta",
    "Espada del Rey Arruinado",
    "Ángel Guardián",
    "Cimitarra Mercurial",
    "Jak'Sho, el Proteico",
    "Guantelete de Sterak",
    "Reloj de Arena de Zhonya",
    "Recuerdos de Lord Dominik",
    "Rompeavances",
    "Hidra Voraz",
    "Danza de la Muerte",
    "Hidra Titánica",
    "Cota Sangrienta del Soberano",
    "Fuerza de la Trinidad",
    "La Sanguinaria",
    "Filo del Infinito",
    "Sombrero Mortífero de Rabadon",
    "Poción Reutilizable",
    "Poción de Vida",
    "Alteración de Visión Lejana",
    "Lente del Oráculo",
    "Centinela Invisible",
    "Elixir de Hierro",
    "Elixir de Brujería",
    "Elixir de Furia",
    "Centinela de Control",
    "Botas de Rapidez",
    "Botas del Hechicero",
    "Botas",
    "Grebas Glotonas",
    "Botas Jonias de la Lucidez",
    "Botas de Mercurio",
    "Grebas del Berserker",
    "Punteras de Acero Revestidas",
];

// Relaciones item-contra-item, curadas a mano. "contra" = a que le gana
// este item (cuando conviene comprarlo); "counter" = que le compra el
// rival para contrarrestar este item (cuando te lo van a contrarrestar a
// vos). No es reciproco automatico como las sinergias de campeones — cada
// relacion se declara del lado que corresponda, porque el motivo mecanico
// suele ser distinto para cada lado.
const ITEM_RELATIONSHIPS: Record<string, { counter: string[]; contra: string[] }> = {
  "Espada del Rey Arruinado": {
    // Su pasiva hace daño fisico segun la VIDA ACTUAL del objetivo — por
    // eso es especialmente fuerte contra quien acumula mucha vida plana.
    // Los 6 items que mas vida dan de verdad en el juego (dato real de
    // Riot, hay empate en el puesto 5-6 asi que entran los 6).
    contra: [
      "Armadura de Warmog",
      "Corazón de Acero",
      "Arnés de Protoplasma",
      "Hidra Titánica",
      "Cota Sangrienta del Soberano",
      "Umbral del Invierno",
    ],
    counter: [],
  },
};

function normalizeItemName(name: string) {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// 2 pociones, 3 wards activables, 3 elixires, 1 ward de control solo — asi
// se separa visualmente la pestaña de Utilidades. El resto de la pagina
// ahora ordena por oro (ver compareByGoldThenStatValue), pero esa agrupacion
// solo tiene sentido en el orden curado original (por tipo, no por precio),
// asi que aca se reordena aparte antes de separar en grupos.
const UTILITY_GROUP_SIZES = [2, 3, 3, 1];

function chunkUtilityItems(items: ItemEntry[]): ItemEntry[][] {
  const curated = [...items].sort((a, b) => {
    const orderA = ITEM_ORDER_INDEX.get(normalizeItemName(a.name)) ?? Number.MAX_SAFE_INTEGER;
    const orderB = ITEM_ORDER_INDEX.get(normalizeItemName(b.name)) ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });

  const groups: ItemEntry[][] = [];
  let index = 0;
  for (const size of UTILITY_GROUP_SIZES) {
    if (index >= curated.length) break;
    groups.push(curated.slice(index, index + size));
    index += size;
  }
  if (index < curated.length) {
    groups.push(curated.slice(index));
  }
  return groups;
}

// Orden manual de las botas (basicas y su mejora legendaria en la misma
// posicion relativa) — decision propia del usuario, no se deriva de oro ni
// estadisticas, y puede cambiar en el futuro si lo pide.
const BOOTS_ORDER: string[] = [
  "Botas de Mercurio",
  "Trituradoras Aceradas",
  "Punteras de Acero Revestidas",
  "Blindadas de Avance",
  "Botas del Hechicero",
  "Zapatos de Lanzahechizos",
  "Grebas del Berserker",
  "Grebas de Armacero",
  "Botas Jonias de la Lucidez",
  "Botas de Lucidez Carmesí",
  "Grebas Glotonas",
  "Camino Inmortal",
  "Botas de Rapidez",
  "Botas de Marcha Rápida",
];

const BOOTS_ORDER_INDEX = new Map<string, number>();
BOOTS_ORDER.forEach((name, index) => {
  BOOTS_ORDER_INDEX.set(normalizeItemName(name), index);
});

function sortBootsItems(items: ItemEntry[]): ItemEntry[] {
  return [...items].sort((a, b) => {
    const orderA = BOOTS_ORDER_INDEX.get(normalizeItemName(a.name)) ?? Number.MAX_SAFE_INTEGER;
    const orderB = BOOTS_ORDER_INDEX.get(normalizeItemName(b.name)) ?? Number.MAX_SAFE_INTEGER;
    return orderA - orderB;
  });
}

// Orden por defecto de toda la pagina (menos Utilidades y Botas, que usan su
// propio orden curado arriba): primero por oro, de menor a mayor. Entre
// items del mismo precio, se desempata por una jerarquia de "cual
// estadistica pesa
// mas" — Vida > Defensa magica > Defensa fisica > Daño magico > Daño
// fisico. No es la suma de todas las estadisticas: se compara posicion por
// posicion en ese orden de importancia, y la primera diferencia decide (asi
// que Vida+Defensa magica le gana a Vida+Defensa fisica, que a su vez le
// gana a Vida+Daño magico, que le gana a Vida+Daño fisico).
function statPriorityVector(item: ItemEntry): number[] {
  const s = item.stats;
  const hasAd =
    typeof s.FlatPhysicalDamageMod === "number" ||
    typeof s.FlatCritChanceMod === "number" ||
    typeof s.PercentAttackSpeedMod === "number";
  return [
    typeof s.FlatHPPoolMod === "number" ? 1 : 0,
    typeof s.FlatSpellBlockMod === "number" ? 1 : 0,
    typeof s.FlatArmorMod === "number" ? 1 : 0,
    typeof s.FlatMagicDamageMod === "number" ? 1 : 0,
    hasAd ? 1 : 0,
  ];
}

// Segunda jerarquia, mas fina — solo entra en juego si dos items ya
// empataron en oro Y en las 5 estadisticas principales de arriba:
// Regeneracion de vida > Regeneracion de mana > Velocidad de movimiento >
// Daño critico > Velocidad de ataque > Robo de vida > Aceleracion de
// Habilidad > Mana. La Aceleracion de Habilidad es la unica que se compara
// solo por si la tiene o no (presencia de la etiqueta "AbilityHaste") en
// vez de por numero real, porque Riot no expone ese numero en los datos
// estructurados — no hay forma de saber "cuanta" da, solo que la da.
function secondaryStatPriorityVector(item: ItemEntry): number[] {
  const s = item.stats;
  const hasMovementSpeed =
    typeof s.FlatMovementSpeedMod === "number" || typeof s.PercentMovementSpeedMod === "number";
  return [
    typeof s.FlatHPRegenMod === "number" ? 1 : 0,
    typeof s.FlatMPRegenMod === "number" ? 1 : 0,
    hasMovementSpeed ? 1 : 0,
    typeof s.FlatCritChanceMod === "number" ? 1 : 0,
    typeof s.PercentAttackSpeedMod === "number" ? 1 : 0,
    typeof s.PercentLifeStealMod === "number" ? 1 : 0,
    item.tags.includes("AbilityHaste") ? 1 : 0,
    typeof s.FlatMPPoolMod === "number" ? 1 : 0,
  ];
}

function compareByGoldThenStatValue(a: ItemEntry, b: ItemEntry) {
  if (a.totalGold !== b.totalGold) {
    return a.totalGold - b.totalGold;
  }

  const va = statPriorityVector(a);
  const vb = statPriorityVector(b);
  for (let i = 0; i < va.length; i++) {
    if (va[i] !== vb[i]) {
      return vb[i] - va[i];
    }
  }

  const sa = secondaryStatPriorityVector(a);
  const sb = secondaryStatPriorityVector(b);
  for (let i = 0; i < sa.length; i++) {
    if (sa[i] !== sb[i]) {
      return sb[i] - sa[i];
    }
  }

  const orderA = ITEM_ORDER_INDEX.get(normalizeItemName(a.name)) ?? Number.MAX_SAFE_INTEGER;
  const orderB = ITEM_ORDER_INDEX.get(normalizeItemName(b.name)) ?? Number.MAX_SAFE_INTEGER;
  return orderA - orderB;
}

const ALLOWED_ITEM_NAMES = new Set(CURATED_ITEM_ORDER.map((name) => normalizeItemName(name)));

// Posicion de cada item en la lista curada, para ordenarlos en pantalla
// exactamente como estan ahi (no por costo ni alfabetico). Si un nombre
// aparece mas de una vez por error, se queda con la primera posicion.
const ITEM_ORDER_INDEX = new Map<string, number>();
CURATED_ITEM_ORDER.forEach((name, index) => {
  const key = normalizeItemName(name);
  if (!ITEM_ORDER_INDEX.has(key)) {
    ITEM_ORDER_INDEX.set(key, index);
  }
});

interface ItemEntry {
  id: string;
  name: string;
  description: string;
  plaintext: string;
  tags: string[];
  from: string[];
  into: string[];
  image: string;
  totalGold: number;
  purchasable: boolean;
  stats: Record<string, number>;
  // Un item puede pertenecer a mas de una categoria a la vez (ej.
  // Sablepistola Hextech da daño fisico Y magico de verdad, segun sus
  // stats reales) — por eso es una lista, no un solo valor.
  categories: ItemCategoryKey[];
  tier: ItemTierKey;
}

const categoryConfig: Array<{ key: ItemCategoryKey; label: string; short: string }> = [
  { key: "utility", label: "Posiciones / Utilidad", short: "UT" },
  { key: "ad", label: "Daño Fisico", short: "AD" },
  { key: "ap", label: "Daño Magico", short: "AP" },
  { key: "health", label: "Vida", short: "HP" },
  { key: "boots", label: "Botas", short: "BT" },
];

const tierLabels: Record<ItemTierKey, string> = {
  starter: "Iniciales",
  basic: "Basicos",
  epic: "Epicos",
  legendary: "Legendarios",
};

const statLabels: Record<string, string> = {
  FlatHPPoolMod: "Vida",
  FlatMPPoolMod: "Mana",
  FlatPhysicalDamageMod: "Daño de Ataque",
  FlatMagicDamageMod: "Poder de Habilidad",
  FlatArmorMod: "Armadura",
  FlatSpellBlockMod: "Resistencia Magica",
  FlatMovementSpeedMod: "Velocidad de Movimiento",
  FlatCritChanceMod: "Critico",
  PercentAttackSpeedMod: "Velocidad de Ataque",
  PercentLifeStealMod: "Robo de Vida",
  PercentMovementSpeedMod: "Velocidad de Movimiento",
  FlatHPRegenMod: "Regeneracion de Vida",
  FlatMPRegenMod: "Regeneracion de Mana",
};

function stripDescriptionText(description: string) {
  return description
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function classifyTier(item: DataDragonItem, isBoots: boolean): ItemTierKey {
  const tags = item.tags ?? [];
  const totalGold = item.gold.total;
  const hasFrom = Boolean(item.from?.length);
  const hasInto = Boolean(item.into?.length);

  if (
    !hasFrom &&
    (tags.some((tag) => ["Lane", "Jungle", "Trinket", "Consumable", "Vision"].includes(tag)) || totalGold <= 500)
  ) {
    return "starter";
  }

  if (!hasFrom) {
    return "basic";
  }

  if (isBoots) {
    return hasInto ? "epic" : "legendary";
  }

  if (hasInto) {
    return "epic";
  }

  return "legendary";
}

// Unico inicial que no sirve de punto de partida para daño fisico — solo da
// poder de habilidad y vida (via su pasiva de acumulacion), a diferencia
// del resto de iniciales que son flexibles para cualquier build. El nombre
// real en los datos de Riot lleva el "El" al inicio.
const STARTER_CATEGORY_OVERRIDES: Record<string, ItemCategoryKey[]> = {
  "El Sello de la Oscuridad": ["ap", "health"],
};

// "Grebas de Armacero" es una bota real (mejora de Grebas del Berserker)
// pero a Riot se le olvido la etiqueta "Boots" en sus propios datos — sin
// este apaño quedaria mal clasificada como daño de ataque en vez de botas.
const BOOTS_NAME_OVERRIDES = new Set([normalizeItemName("Grebas de Armacero")]);

// Los 5 items de apoyo que cuestan 400 de oro y solo dan vida (200 HP) por
// estadistica real: Canción de Sangre, Trineo del Solsticio, Oposición
// Celestial, Tejesueños y Espina Dimensional de Zaz'Zak — todos de la misma
// familia de items de apoyo.
const SUPPORT_QUEST_ITEMS = new Set(
  [
    "Canción de Sangre",
    "Trineo del Solsticio",
    "Oposición Celestial",
    "Tejesueños",
    "Espina Dimensional de Zaz'Zak",
  ].map((name) => normalizeItemName(name))
);

function classifyCategories(item: DataDragonItem, tier: ItemTierKey): ItemCategoryKey[] {
  const tags = item.tags ?? [];
  const stats = item.stats ?? {};

  if (tags.includes("Boots") || BOOTS_NAME_OVERRIDES.has(normalizeItemName(item.name))) {
    return ["boots"];
  }

  // Solo lo que de verdad se consume o es un trinket puro va directo a
  // Utilidades sin mirar mas nada — "Vision"/"Active"/"Support" NO cuentan
  // aca, porque hay items de combate real con esas mismas etiquetas: Espada
  // de la Penumbra (Vision) da daño fisico real, Oposicion Celestial y
  // similares (Vision) dan vida real, Sablepistola (Active) da daño fisico
  // Y magico. "Trinket"/"Consumable" ya cubren los 9 items que de verdad
  // son solo pociones/elixires/wards.
  if (tags.some((tag) => ["Trinket", "Consumable"].includes(tag))) {
    return ["utility"];
  }

  // Los iniciales son flexibles a propósito — cualquiera sirve de punto de
  // partida sin importar hacia que build se vaya, asi que por defecto
  // aparecen en las tres categorias de daño/vida (con la unica excepcion
  // de arriba, que de verdad no aporta daño fisico).
  if (tier === "starter") {
    return STARTER_CATEGORY_OVERRIDES[item.name] ?? ["ad", "ap", "health"];
  }

  // Los 5 items de apoyo de 400 de oro (linea de Idolo Prohibido) son, igual
  // que los iniciales, flexibles para cualquier build a pesar de que su
  // unica estadistica real es vida — asi que tambien se muestran en las
  // tres categorias.
  if (SUPPORT_QUEST_ITEMS.has(normalizeItemName(item.name))) {
    return ["ad", "ap", "health"];
  }

  // De aca en adelante (basicos/epicos/legendarios) manda ESTRICTAMENTE la
  // estadistica numerica real del item, sin mirar etiquetas — las etiquetas
  // de Riot son mucho mas ruidosas de lo que parecen (ej. "AbilityHaste" u
  // "OnHit" aparecen hasta en items puramente de vida/armadura que no dan
  // ningun daño), asi que solo importa si el numero esta presente de
  // verdad. Un item puede quedar en varias categorias a la vez si de verdad
  // tiene varias estadisticas (ej. Sablepistola Hextech da daño fisico Y
  // magico juntos).
  const categories: ItemCategoryKey[] = [];

  if (
    typeof stats.FlatPhysicalDamageMod === "number" ||
    typeof stats.FlatCritChanceMod === "number" ||
    typeof stats.PercentAttackSpeedMod === "number"
  ) {
    categories.push("ad");
  }

  if (typeof stats.FlatMagicDamageMod === "number") {
    categories.push("ap");
  }

  if (
    typeof stats.FlatHPPoolMod === "number" ||
    typeof stats.FlatArmorMod === "number" ||
    typeof stats.FlatSpellBlockMod === "number"
  ) {
    categories.push("health");
  }

  // Componentes tempranos como "Idolo Prohibido" o "Brillo" no dan ninguna
  // estadistica de combate real por si mismos (solo etiquetas como
  // ManaRegen/OnHit/AbilityHaste sin numero detras) pero tampoco son un
  // consumible — no deberian caer en Utilidades por descarte junto con las
  // pociones/wards, asi que sin ninguna categoria real quedan sin mostrarse
  // en ninguna pestaña.
  return categories;
}

function BuildTreeNode({
  itemId,
  itemsById,
  path = itemId,
}: {
  itemId: string;
  itemsById: Record<string, ItemEntry>;
  path?: string;
}) {
  const item = itemsById[itemId];
  if (!item) {
    return null;
  }

  const hasChildren = item.from.length > 0;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="w-11 rounded-md border border-cyan-500/40 bg-slate-950/60 p-1 text-center shadow-[0_0_0_1px_rgba(34,211,238,0.08)]">
        <img src={item.image} alt={item.name} className="mx-auto h-7 w-7 rounded object-cover" />
        <p className="mt-1 text-[9px] font-semibold leading-none text-slate-100">{item.totalGold}</p>
      </div>
      {hasChildren ? (
        <div className="flex w-full flex-col items-center">
          <div className="h-2.5 w-px bg-cyan-400/50" />
          <div className="relative flex items-start justify-center gap-2 pt-2.5">
            {item.from.length > 1 ? (
              <div className="absolute left-[1.375rem] right-[1.375rem] top-0 h-px bg-cyan-400/40" aria-hidden="true" />
            ) : null}
            {item.from.map((childId, index) => (
              <div key={`${path}-${childId}-${index}`} className="relative flex flex-col items-center">
                <div className="absolute left-1/2 top-[-10px] h-2.5 w-px -translate-x-1/2 bg-cyan-400/40" aria-hidden="true" />
                <BuildTreeNode itemId={childId} itemsById={itemsById} path={`${path}-${childId}-${index}`} />
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function ItemsSection() {
  const [items, setItems] = useState<ItemEntry[]>([]);
  const [itemsById, setItemsById] = useState<Record<string, ItemEntry>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState<ItemCategoryKey>("utility");
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const loadItems = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        if (!versionsRes.ok) {
          throw new Error("No se pudo obtener la version de Data Dragon.");
        }

        const versions = (await versionsRes.json()) as string[];
        const latestVersion = versions[0];

        const itemsRes = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/es_MX/item.json`
        );
        if (!itemsRes.ok) {
          throw new Error("No se pudo obtener la lista de objetos.");
        }

        const itemsJson = (await itemsRes.json()) as {
          data: Record<string, DataDragonItem>;
        };

        const mappedItems = Object.entries(itemsJson.data)
          .filter(([id, item]) => {
            const numericId = Number(id);

            if (!item.name) {
              return false;
            }
            if (!Number.isFinite(numericId)) {
              return false;
            }
            // Ojo: NO se filtra por id numerico "alto" — Riot agrega items
            // nuevos con ids de 6 cifras (ej. Cefiro en 663172) que son
            // objetos reales y comprables, no ruido. El resto de estos
            // filtros (mapa 11, comprable, en tienda) ya se encarga de
            // sacar los duplicados de otros modos (Arena, etc.).
            if (item.requiredChampion) {
              return false;
            }
            if (!item.maps?.["11"]) {
              return false;
            }
            if (item.inStore === false) {
              return false;
            }
            if (!item.gold.purchasable) {
              return false;
            }
            if (!ALLOWED_ITEM_NAMES.has(normalizeItemName(item.name))) {
              return false;
            }
            return true;
          })
          .map(([id, item]) => {
            const isBoots =
              (item.tags ?? []).includes("Boots") || BOOTS_NAME_OVERRIDES.has(normalizeItemName(item.name));
            const tier = classifyTier(item, isBoots);
            const categories = classifyCategories(item, tier);
            return {
              id,
              name: item.name,
              description: stripDescriptionText(item.description),
              plaintext: item.plaintext ?? "",
              tags: item.tags ?? [],
              from: item.from ?? [],
              into: item.into ?? [],
              image: `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/item/${item.image.full}`,
              totalGold: item.gold.total,
              purchasable: item.gold.purchasable,
              stats: item.stats ?? {},
              categories,
              tier,
            } satisfies ItemEntry;
          })
          .filter(
            (item, index, array) =>
              array.findIndex((candidate) => candidate.name === item.name) === index
          )
          .sort(compareByGoldThenStatValue);

        const mappedById = Object.fromEntries(mappedItems.map((item) => [item.id, item]));

        if (active) {
          setItems(mappedItems);
          setItemsById(mappedById);
          const defaultItem = mappedItems.find((item) => item.categories.includes("utility")) ?? mappedItems[0] ?? null;
          setSelectedItemId(defaultItem?.id ?? null);
        }
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Error al cargar objetos.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadItems();

    return () => {
      active = false;
    };
  }, []);

  const categoryItems = useMemo(() => {
    return items.filter((item) => item.categories.includes(activeCategory));
  }, [activeCategory, items]);

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return categoryItems;
    }

    return categoryItems.filter((item) =>
      item.name.toLowerCase().includes(searchTerm.trim().toLowerCase())
    );
  }, [categoryItems, searchTerm]);

  const groupedItems = useMemo(() => {
    const groups: Record<ItemTierKey, ItemEntry[]> = {
      starter: [],
      basic: [],
      epic: [],
      legendary: [],
    };

    filteredItems.forEach((item) => {
      groups[item.tier].push(item);
    });

    return groups;
  }, [filteredItems]);

  const selectedItem = selectedItemId ? itemsById[selectedItemId] : null;
  const showTierSections = activeCategory !== "utility" && activeCategory !== "boots";

  // Las 4 secciones se intentan siempre, sin importar la categoria — la
  // seccion vacia simplemente no se dibuja (ver "sectionItems.length === 0"
  // mas abajo). Antes esto excluia "starter" para Utilidades/Botas
  // asumiendo que ahi nunca habria items de ese nivel, pero los 9 items
  // reales de Utilidades (pociones, elixires, wards) son justamente todos
  // de nivel inicial por su costo bajo — con la exclusion quedaban
  // completamente ocultos aunque si estaban bien clasificados.
  const visibleSections = ["starter", "basic", "epic", "legendary"] as ItemTierKey[];

  const itemsByName = useMemo(() => {
    const map = new Map<string, ItemEntry>();
    for (const item of items) map.set(normalizeItemName(item.name), item);
    return map;
  }, [items]);

  const relationships = selectedItem ? ITEM_RELATIONSHIPS[selectedItem.name] : undefined;
  const counterItems = (relationships?.counter ?? [])
    .map((name) => itemsByName.get(normalizeItemName(name)))
    .filter((item): item is ItemEntry => Boolean(item));
  const contraItems = (relationships?.contra ?? [])
    .map((name) => itemsByName.get(normalizeItemName(name)))
    .filter((item): item is ItemEntry => Boolean(item));

  return (
    <div className="space-y-5">
      <div className="grid gap-5 xl:grid-cols-[104px_minmax(0,1fr)_340px] xl:items-stretch">
        <aside className="rounded-2xl border border-cyan-900/40 bg-[radial-gradient(circle_at_top,_rgba(34,211,238,0.14),_rgba(15,23,42,0.98)_58%)] p-3 shadow-[0_18px_45px_rgba(2,12,27,0.45)] xl:h-[calc(100vh-12rem)] xl:overflow-y-auto">
        <div className="space-y-2">
          {categoryConfig.map((category) => {
            const active = activeCategory === category.key;
            return (
              <button
                key={category.key}
                type="button"
                onClick={() => setActiveCategory(category.key)}
                className={`flex w-full flex-col items-center gap-1 rounded-xl border px-2 py-3 text-center transition ${
                  active
                    ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-100 shadow-[0_0_20px_rgba(34,211,238,0.18)]"
                    : "border-slate-700/60 bg-slate-950/35 text-slate-300 hover:border-cyan-600/50 hover:text-white"
                }`}
              >
                <span className="text-lg font-black tracking-wider">{category.short}</span>
                <span className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em]">
                  {category.label}
                </span>
              </button>
            );
          })}
        </div>
        </aside>

        <section className="rounded-2xl border border-cyan-900/40 bg-[linear-gradient(180deg,rgba(8,47,73,0.9),rgba(2,12,27,0.98))] p-5 shadow-[0_18px_45px_rgba(2,12,27,0.45)] xl:flex xl:h-[calc(100vh-12rem)] xl:flex-col xl:overflow-hidden">
        <div className="mb-4 flex items-center justify-between gap-4 border-b border-cyan-900/40 pb-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Todos los objetos</p>
            <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white">
              {categoryConfig.find((category) => category.key === activeCategory)?.label}
            </h2>
          </div>
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Buscar objeto..."
            className="w-full max-w-xs rounded-lg border border-cyan-900/50 bg-slate-950/60 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/70"
          />
        </div>

        {isLoading ? <p className="text-sm text-slate-300">Cargando objetos...</p> : null}
        {loadError ? <p className="text-sm text-rose-300">{loadError}</p> : null}

        {!isLoading && !loadError ? (
          <div className="space-y-5 xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-2">
            {visibleSections.map((tier) => {
              const sectionItems = groupedItems[tier];
              if (sectionItems.length === 0) {
                return null;
              }

              const renderItemButton = (item: ItemEntry) => {
                const active = selectedItemId === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedItemId(item.id)}
                    className={`rounded-lg border p-2 text-center transition ${
                      active
                        ? "border-cyan-300 bg-cyan-400/10 shadow-[0_0_18px_rgba(34,211,238,0.2)]"
                        : "border-slate-700/60 bg-slate-950/35 hover:border-cyan-500/60 hover:bg-slate-900/80"
                    }`}
                  >
                    <img src={item.image} alt={item.name} className="mx-auto h-10 w-10 rounded-md object-cover" />
                    <p className="mt-1 text-[10px] font-semibold text-slate-100">{item.totalGold}</p>
                  </button>
                );
              };

              // Utilidades se separa visualmente en sus 4 grupos naturales
              // (2 pociones, 3 wards activables, 3 elixires, 1 ward de
              // control solo) con una linea vertical entre cada uno, en vez
              // de una sola grilla corrida.
              const isUtilityGroup = activeCategory === "utility" && tier === "starter";

              return (
                <div key={tier}>
                  <h3 className="mb-3 text-sm font-extrabold uppercase tracking-[0.18em] text-amber-200/90">
                    {showTierSections ? tierLabels[tier] : tier === "basic" ? "Objetos" : tierLabels[tier]}
                  </h3>
                  {isUtilityGroup ? (
                    <div className="flex flex-wrap items-stretch gap-4">
                      {chunkUtilityItems(sectionItems).map((group, groupIndex, groups) => (
                        <div key={groupIndex} className="flex items-stretch gap-4">
                          <div className="grid grid-cols-3 gap-2">{group.map(renderItemButton)}</div>
                          {groupIndex < groups.length - 1 ? (
                            <div className="w-px self-stretch bg-cyan-700/40" aria-hidden="true" />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-2 md:grid-cols-6 xl:grid-cols-8">
                      {(activeCategory === "boots" ? sortBootsItems(sectionItems) : sectionItems).map(
                        renderItemButton
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : null}
        </section>

        <aside className="overflow-x-hidden rounded-2xl border border-cyan-900/40 bg-[linear-gradient(180deg,rgba(5,46,72,0.92),rgba(2,12,27,0.98))] p-5 shadow-[0_18px_45px_rgba(2,12,27,0.45)] xl:h-[calc(100vh-12rem)] xl:overflow-y-auto">
        {selectedItem ? (
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Armado</p>
            <div className="mt-4 overflow-hidden pb-3">
              <div className="px-1">
                <BuildTreeNode itemId={selectedItem.id} itemsById={itemsById} />
              </div>
            </div>

            <div className="mt-2 border-t border-cyan-900/40 pt-4">
              <div className="flex items-start gap-3">
                <img src={selectedItem.image} alt={selectedItem.name} className="h-14 w-14 rounded-lg object-cover" />
                <div>
                  <h3 className="text-xl font-extrabold tracking-tight text-amber-200">{selectedItem.name}</h3>
                  <p className="mt-1 text-sm font-semibold text-slate-200">{selectedItem.totalGold} de oro</p>
                </div>
              </div>

              {Object.entries(selectedItem.stats).length > 0 ? (
                <div className="mt-4 space-y-1 text-sm text-slate-200">
                  {Object.entries(selectedItem.stats).map(([key, value]) => (
                    <p key={key}>
                      + {typeof value === "number" && value < 1 ? `${Math.round(value * 100)}%` : value} {statLabels[key] ?? key}
                    </p>
                  ))}
                </div>
              ) : null}

              {selectedItem.plaintext ? (
                <p className="mt-4 text-sm leading-relaxed text-slate-300">{selectedItem.plaintext}</p>
              ) : null}

              <div className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-300">
                {selectedItem.description}
              </div>
            </div>
          </div>
        ) : (
          <p className="text-sm text-slate-300">Selecciona un objeto para ver su armado.</p>
        )}
        </aside>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(420px,1.35fr)_minmax(0,1fr)]">
        <section className="rounded-2xl border border-cyan-900/40 bg-[linear-gradient(180deg,rgba(8,47,73,0.88),rgba(2,12,27,0.98))] p-5 shadow-[0_18px_45px_rgba(2,12,27,0.45)]">
          <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-amber-200/90">
            Items Counter
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            Lo que te compra el rival para contrarrestar este item
          </p>
          {counterItems.length > 0 ? (
            <div className="mt-4 grid grid-cols-4 gap-2">
              {counterItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItemId(item.id)}
                  title={item.name}
                  className="flex h-[60px] items-center justify-center overflow-hidden rounded-lg border border-slate-300/70 bg-white"
                >
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500">Todavia no hay dato cargado para este item.</p>
          )}
        </section>

        <aside className="rounded-2xl border border-cyan-900/40 bg-[linear-gradient(180deg,rgba(5,46,72,0.92),rgba(2,12,27,0.98))] p-5 shadow-[0_18px_45px_rgba(2,12,27,0.45)]">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">Videos</p>
          <h3 className="mt-2 text-xl font-extrabold tracking-tight text-amber-200">
            Guias visuales del item
          </h3>
          <div className="mt-4 flex min-h-52 items-center justify-center rounded-2xl border border-dashed border-cyan-700/50 bg-slate-950/35">
            <p className="px-6 text-center text-sm leading-relaxed text-slate-300">
              Aqui podremos mostrar videos o clips relacionados al item seleccionado.
            </p>
          </div>
        </aside>

        <section className="rounded-2xl border border-cyan-900/40 bg-[linear-gradient(180deg,rgba(8,47,73,0.88),rgba(2,12,27,0.98))] p-5 shadow-[0_18px_45px_rgba(2,12,27,0.45)]">
          <h3 className="text-sm font-extrabold uppercase tracking-[0.18em] text-amber-200/90">
            Items Contra
          </h3>
          <p className="mt-1 text-[11px] leading-snug text-slate-400">
            Lo que este item contrarresta — cuando te conviene comprarlo
          </p>
          {contraItems.length > 0 ? (
            <div className="mt-4 grid grid-cols-4 gap-2">
              {contraItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSelectedItemId(item.id)}
                  title={item.name}
                  className="flex h-[60px] items-center justify-center overflow-hidden rounded-lg border border-slate-300/70 bg-white"
                >
                  <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-4 text-xs text-slate-500">Todavia no hay dato cargado para este item.</p>
          )}
        </section>
      </div>
    </div>
  );
}
