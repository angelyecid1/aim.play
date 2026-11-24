// Un solo lugar para corregir cosas por campeon a mano — dos tipos de dato
// que no se pueden sacar de forma confiable de datos reales de partidas:
//
// - roles: Data Dragon no da un "rol real" por campeon, solo etiquetas
//   generales (Fighter, Tank, Mage, etc.) que traducimos con una
//   heuristica — y a veces no coincide con como se juega de verdad (ej.
//   Alistar sale como Top/Jungla por ser "Tank", cuando en la practica es
//   casi siempre Soporte).
// - synergies: a diferencia de los duelos 1v1 (hechos reales sacados de
//   partidas), no hay forma de calcular "estos dos combinan bien" —  esto
//   se llena a criterio propio. Solo hace falta declararlo de UN lado
//   (ej. Yasuo: { synergies: ["Malphite"] }) — aparece solo en el perfil
//   de Malphite tambien, no hace falta repetirlo del otro lado.
//
// La clave es el "id" de Data Dragon (el mismo que usa la API de Riot, no
// el nombre en español — ver nameToIcon en ChampionsSection para los ids
// reales). Los roles validos son: "Top", "Jungla", "Mid", "ADC", "Soporte".
//
// Compartido entre ChampionsSection y RouletteSection para que el filtro
// de rol de la ruleta use la misma clasificacion corregida a mano, en vez
// de una heuristica de etiquetas separada.
export interface ChampionRoleOverride {
  roles?: string[];
  synergies?: string[];
}

export const manualChampionOverrides: Record<string, ChampionRoleOverride> = {
  Aatrox: { roles: ["Top", "Jungla"], synergies: ["Malphite", "MasterYi", "Renekton"] },
  Ahri: { roles: ["Mid"] },
  Akali: { roles: ["Top", "Mid"] },
  Akshan: { roles: ["Mid"] },
  Alistar: { roles: ["Soporte"], synergies: ["Malphite", "MasterYi", "Renekton"] },
  Ambessa: { roles: ["Top", "Jungla"] },
  Amumu: { roles: ["Jungla"] },
  Anivia: { roles: ["Mid"] },
  Annie: { roles: ["Mid"] },
  Aphelios: { roles: ["ADC"] },
  Ashe: { roles: ["ADC", "Soporte"] },
  AurelionSol: { roles: ["Mid"] },
  Aurora: { roles: ["Top", "Mid"] },
  Azir: { roles: ["Mid"] },
  Bard: { roles: ["Soporte"] },
  Belveth: { roles: ["Jungla"] },
  Blitzcrank: { roles: ["Soporte"] },
  Brand: { roles: ["Jungla", "Mid", "Soporte"] },
  Braum: { roles: ["Soporte"] },
  Briar: { roles: ["Jungla"] },
  Caitlyn: { roles: ["ADC"] },
  Camille: { roles: ["Top", "Jungla"] },
  Cassiopeia: { roles: ["Mid"] },
  Chogath: { roles: ["Top", "Jungla"] },
  Corki: { roles: ["ADC", "Mid"] },
  Darius: { roles: ["Top", "Jungla"] },
  Diana: { roles: ["Jungla", "Mid"] },
  Draven: { roles: ["ADC"] },
  DrMundo: { roles: ["Top", "Jungla"] },
  Ekko: { roles: ["Jungla", "Mid"] },
  Elise: { roles: ["Jungla"] },
  Evelynn: { roles: ["Jungla"] },
  Ezreal: { roles: ["ADC"] },
  Fiddlesticks: { roles: ["Jungla"] },
  Fiora: { roles: ["Top"] },
  Fizz: { roles: ["Jungla", "Mid"] },
  Galio: { roles: ["Mid", "Soporte"] },
  Gangplank: { roles: ["Top"] },
  Garen: { roles: ["Top"] },
  Gnar: { roles: ["Top"] },
  Gragas: { roles: ["Top", "Jungla", "Mid"] },
  Graves: { roles: ["Jungla"] },
  Gwen: { roles: ["Top", "Jungla"] },
  Hecarim: { roles: ["Jungla"] },
  Heimerdinger: { roles: ["Top", "Mid"] },
  Hwei: { roles: ["Mid"] },
  Illaoi: { roles: ["Top"] },
  Irelia: { roles: ["Top", "Mid"] },
  Ivern: { roles: ["Jungla"] },
  Janna: { roles: ["Soporte"] },
  JarvanIV: { roles: ["Jungla"] },
  Jax: { roles: ["Top", "Jungla"] },
  Jayce: { roles: ["Top", "Mid"] },
  Jhin: { roles: ["ADC"] },
  Jinx: { roles: ["ADC"] },
  Kaisa: { roles: ["ADC"] },
  Kalista: { roles: ["ADC"] },
  Karma: { roles: ["Mid", "Soporte"] },
  Karthus: { roles: ["Jungla"] },
  Kassadin: { roles: ["Mid"] },
  Katarina: { roles: ["Mid"] },
  Kayle: { roles: ["Top", "Mid"] },
  Kayn: { roles: ["Top", "Jungla"] },
  Kennen: { roles: ["Top", "Mid"] },
  Khazix: { roles: ["Jungla"] },
  Kindred: { roles: ["Jungla"] },
  Kled: { roles: ["Top"] },
  KogMaw: { roles: ["ADC"] },
  KSante: { roles: ["Top"] },
  Leblanc: { roles: ["Mid"] },
  LeeSin: { roles: ["Jungla"] },
  Leona: { roles: ["Soporte"] },
  Lillia: { roles: ["Jungla"] },
  Lissandra: { roles: ["Mid"] },
  Locke: { roles: ["Mid"] },
  Lucian: { roles: ["Mid", "ADC"] },
  Lulu: { roles: ["Soporte"] },
  Lux: { roles: ["Mid", "Soporte"] },
  Malphite: { roles: ["Top", "Jungla", "Mid"] },
  Malzahar: { roles: ["Mid"] },
  Maokai: { roles: ["Jungla", "Soporte"] },
  MasterYi: { roles: ["Jungla"] },
  Mel: { roles: ["Mid", "Soporte"] },
  Milio: { roles: ["Soporte"] },
  MissFortune: { roles: ["ADC"] },
  MonkeyKing: { roles: ["Top", "Jungla"] },
  Mordekaiser: { roles: ["Top", "Jungla", "Mid"] },
  Morgana: { roles: ["Jungla", "Mid", "Soporte"] },
  Naafiri: { roles: ["Jungla", "Mid"] },
  Nami: { roles: ["Soporte"] },
  Nasus: { roles: ["Top"] },
  Nautilus: { roles: ["Jungla", "Soporte"] },
  Neeko: { roles: ["Jungla", "Mid", "Soporte"] },
  Nidalee: { roles: ["Jungla", "Soporte"] },
  Nilah: { roles: ["ADC"] },
  Nocturne: { roles: ["Jungla"] },
  Nunu: { roles: ["Jungla"] },
  Olaf: { roles: ["Top", "Jungla"] },
  Orianna: { roles: ["Mid"] },
  Ornn: { roles: ["Top"] },
  Pantheon: { roles: ["Top", "Jungla", "Mid", "Soporte"] },
  Poppy: { roles: ["Top", "Jungla", "Soporte"] },
  Pyke: { roles: ["Soporte"] },
  Qiyana: { roles: ["Jungla", "Mid"] },
  Quinn: { roles: ["Top", "Jungla", "Mid"] },
  Rakan: { roles: ["Soporte"] },
  Rammus: { roles: ["Jungla"] },
  RekSai: { roles: ["Jungla"] },
  Rell: { roles: ["Soporte"] },
  Renata: { roles: ["Soporte"] },
  Renekton: { roles: ["Top"] },
  Rengar: { roles: ["Jungla"] },
  Riven: { roles: ["Top", "Jungla"] },
  Rumble: { roles: ["Top"] },
  Ryze: { roles: ["Mid"] },
  Samira: { roles: ["ADC"] },
  Sejuani: { roles: ["Jungla"] },
  Senna: { roles: ["Soporte"] },
  Seraphine: { roles: ["Mid", "Soporte"] },
  Sett: { roles: ["Top"] },
  Shaco: { roles: ["Jungla"] },
  Shen: { roles: ["Top", "Jungla"] },
  Shyvana: { roles: ["Jungla"] },
  Singed: { roles: ["Top"] },
  Sion: { roles: ["Top"] },
  Sivir: { roles: ["ADC"] },
  Skarner: { roles: ["Top", "Jungla"] },
  Smolder: { roles: ["ADC"] },
  Sona: { roles: ["Soporte"] },
  Soraka: { roles: ["Soporte"] },
  Swain: { roles: ["Top", "Mid", "Soporte"] },
  Sylas: { roles: ["Jungla", "Mid"] },
  Syndra: { roles: ["Mid"] },
  TahmKench: { roles: ["Top", "Soporte"] },
  Taliyah: { roles: ["Mid"] },
  Talon: { roles: ["Jungla", "Mid"] },
  Taric: { roles: ["Soporte"] },
  Teemo: { roles: ["Top", "Mid"] },
  Thresh: { roles: ["Soporte"] },
  Tristana: { roles: ["ADC"] },
  Trundle: { roles: ["Top", "Jungla"] },
  Tryndamere: { roles: ["Top", "Jungla"] },
  TwistedFate: { roles: ["Mid"] },
  Twitch: { roles: ["ADC"] },
  Udyr: { roles: ["Top", "Jungla"] },
  Urgot: { roles: ["Top"] },
  Varus: { roles: ["ADC"] },
  Vayne: { roles: ["Top", "ADC"] },
  Veigar: { roles: ["Mid"] },
  Velkoz: { roles: ["Mid", "Soporte"] },
  Vex: { roles: ["Mid"] },
  Vi: { roles: ["Jungla"] },
  Viego: { roles: ["Jungla"] },
  Viktor: { roles: ["Mid"] },
  Vladimir: { roles: ["Top", "Mid"] },
  Volibear: { roles: ["Top", "Jungla"] },
  Warwick: { roles: ["Top", "Jungla"] },
  Xayah: { roles: ["ADC"] },
  Xerath: { roles: ["Mid", "Soporte"] },
  XinZhao: { roles: ["Jungla"] },
  Yasuo: { roles: ["Top", "Mid"] },
  Yone: { roles: ["Top", "Mid"] },
  Yorick: { roles: ["Top", "Jungla"] },
  Yunara: { roles: ["ADC"] },
  Yuumi: { roles: ["Soporte"] },
  Zaahen: { roles: ["Top", "Jungla"] },
  Zac: { roles: ["Jungla"] },
  Zed: { roles: ["Jungla", "Mid"] },
  Zeri: { roles: ["ADC"] },
  Ziggs: { roles: ["Mid"] },
  Zilean: { roles: ["Soporte"] },
  Zoe: { roles: ["Mid"] },
  Zyra: { roles: ["Jungla", "Mid", "Soporte"] },
};

export function mapTagsToRoles(tags: string[]): string[] {
  const roleSet = new Set<string>();

  if (tags.includes("Marksman")) roleSet.add("ADC");
  if (tags.includes("Support")) roleSet.add("Soporte");
  if (tags.includes("Mage") || tags.includes("Assassin")) roleSet.add("Mid");
  if (tags.includes("Fighter") || tags.includes("Tank")) {
    roleSet.add("Top");
    roleSet.add("Jungla");
  }
  if (roleSet.size === 0) roleSet.add("Top");

  return [...roleSet];
}

export function getChampionRoles(championId: string, tags: string[]): string[] {
  return manualChampionOverrides[championId]?.roles ?? mapTagsToRoles(tags);
}
