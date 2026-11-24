"use client";

import { useEffect, useMemo, useState } from "react";
import { RECENT_DUELS_PER_MATCHUP } from "@/lib/championDuels";
import { getChampionRoles } from "@/lib/championRoles";

interface Champion {
  id: string;
  name: string;
  icon: string;
  splash: string;
  roles: string[];
}

interface MatchupChampion {
  name: string;
  wins: number;
  losses: number;
}

interface MatchupGroups {
  counters: MatchupChampion[];
  contras: MatchupChampion[];
}

interface DataDragonChampion {
  id: string;
  name: string;
  tags: string[];
  image: {
    full: string;
  };
}

const roles = [
  {
    id: "Top",
    label: "Top",
    icon: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-top.png",
  },
  {
    id: "Jungla",
    label: "Jungla",
    icon: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-jungle.png",
  },
  {
    id: "Mid",
    label: "Mid",
    icon: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-middle.png",
  },
  {
    id: "ADC",
    label: "ADC",
    icon: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-bottom.png",
  },
  {
    id: "Soporte",
    label: "Soporte",
    icon: "https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-parties/global/default/icon-position-utility.png",
  },
];

const matchupSlotsPerSection = 3;
const matchupSlotsExpanded = 12;
// Minimo de duelos acumulados para que una pareja entre al ranking por
// porcentaje — evita que una sola partida suelta (1 de 1 = 100%) opaque a
// una pareja con muestra real (ej. 8 de 9 = 89%).
const MIN_DUELS_FOR_RANKING = 5;

const duelRegions = [
  { value: "todas", label: "Todas" },
  { value: "la1", label: "LAN" },
  { value: "la2", label: "LAS" },
  { value: "na1", label: "NA" },
  { value: "euw1", label: "EUW" },
  { value: "eun1", label: "EUNE" },
  { value: "br1", label: "BR" },
];

// Valores reales que da Riot en teamPosition por partida (no el heuristico
// de tags que usamos para los filtros de la lista de campeones).
const duelPositions = [
  { value: "todos", label: "Todos" },
  { value: "TOP", label: "Top" },
  { value: "JUNGLE", label: "Jungla" },
  { value: "MIDDLE", label: "Mid" },
  { value: "BOTTOM", label: "ADC" },
  { value: "UTILITY", label: "Soporte" },
];

const emptyMatchups: MatchupGroups = {
  counters: [],
  contras: [],
};

interface DuelMatchup {
  opponent: string;
  wins: number;
  losses: number;
}

function MatchupSection({
  title,
  entries,
  nameToIcon,
  idToDisplayName,
  onSelect,
}: {
  title: string;
  entries: MatchupChampion[];
  nameToIcon: Map<string, string>;
  idToDisplayName: Map<string, string>;
  onSelect: (championId: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleCount = expanded ? matchupSlotsExpanded : matchupSlotsPerSection;
  const topEntries = entries.slice(0, visibleCount);
  const canExpand = entries.length > matchupSlotsPerSection;

  return (
    <div className="border-t border-slate-700 pt-2.5">
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
      <div className="grid grid-cols-3 gap-2">
        {topEntries.map((entry) => {
          const icon = nameToIcon.get(entry.name) ?? "";
          const displayName = idToDisplayName.get(entry.name) ?? entry.name;
          return (
            <button
              key={`${title}-${entry.name}`}
              type="button"
              onClick={() => onSelect(entry.name)}
              title={`${entry.wins}-${entry.losses}`}
              className="flex flex-col items-center gap-0.5 text-center"
            >
              <div className="h-12 w-12 overflow-hidden rounded-full border border-slate-600 bg-slate-800 transition hover:border-cyan-400/70">
                {icon ? (
                  <img src={icon} alt={displayName} className="h-full w-full object-cover" />
                ) : null}
              </div>
              <span className="min-h-4 text-[11px] font-medium leading-tight text-slate-300">
                {displayName}
              </span>
            </button>
          );
        })}
      </div>
      {canExpand ? (
        <button
          onClick={() => setExpanded((prev) => !prev)}
          className="mt-2 text-[11px] font-semibold text-cyan-300/80 hover:text-cyan-200"
        >
          {expanded ? "Ver menos" : "Ver más"}
        </button>
      ) : null}
    </div>
  );
}


export default function ChampionsSection({
  favoriteChampionIds,
  onToggleFavoriteChampion,
  onNavigateToGuides,
}: {
  favoriteChampionIds: string[];
  onToggleFavoriteChampion: (championId: string) => void;
  onNavigateToGuides: (championId: string) => void;
}) {
  const [championsData, setChampionsData] = useState<Champion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [selectedRoles, setSelectedRoles] = useState<string[]>([]);
  const [prioritizeFavorites, setPrioritizeFavorites] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedChampion, setSelectedChampion] = useState<Champion | null>(null);
  const [duelMatchups, setDuelMatchups] = useState<DuelMatchup[]>([]);
  const [duelsLoading, setDuelsLoading] = useState(false);
  const [duelRegion, setDuelRegion] = useState<string>("todas");
  const [duelPosition, setDuelPosition] = useState<string>("todos");

  // Enfrentamientos reales, calculados de duelos 1v1 limpios entre jugadores
  // de maestria alta (ver /api/champion-duels), filtrados por region (el
  // meta puede variar por servidor) y por rol (solo cuentan si ambos
  // jugaron el mismo rol en esa partida, ej. top vs top).
  useEffect(() => {
    if (!selectedChampion) return;
    let active = true;
    setDuelsLoading(true);

    const platformParam = duelRegion === "todas" ? "" : `&platform=${duelRegion}`;
    const positionParam = duelPosition === "todos" ? "" : `&position=${duelPosition}`;
    // "id" (ej. "MonkeyKing", "Kaisa"), no "name" (ej. "Wukong", "Kai'Sa"):
    // los duelos guardan el championName que da la API de Riot, que
    // coincide con "id", no con el nombre en español mostrado en pantalla.
    fetch(
      `/api/champion-duels?champion=${encodeURIComponent(selectedChampion.id)}${platformParam}${positionParam}`
    )
      .then((res) => res.json())
      .then((data) => {
        if (active) setDuelMatchups(data.matchups ?? []);
      })
      .catch(() => {
        if (active) setDuelMatchups([]);
      })
      .finally(() => {
        if (active) setDuelsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [selectedChampion, duelRegion, duelPosition]);

  useEffect(() => {
    let active = true;

    const loadChampions = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        if (!versionsRes.ok) throw new Error("No se pudo obtener la version de Data Dragon.");

        const versions = (await versionsRes.json()) as string[];
        const latestVersion = versions[0];

        const championsRes = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/es_MX/champion.json`
        );
        if (!championsRes.ok) throw new Error("No se pudo obtener la lista de campeones.");

        const championsJson = (await championsRes.json()) as {
          data: Record<string, DataDragonChampion>;
        };

        const mappedChampions = Object.values(championsJson.data)
          .map((champion) => ({
            id: champion.id,
            name: champion.name,
            icon: `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${champion.image.full}`,
            splash: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`,
            roles: getChampionRoles(champion.id, champion.tags),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (active) {
          setChampionsData(mappedChampions);
          setSelectedChampion((prev) => {
            if (!prev) return mappedChampions[0] ?? null;
            return mappedChampions.find((champ) => champ.id === prev.id) ?? mappedChampions[0] ?? null;
          });
        }
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Error al cargar campeones.");
        }
      } finally {
        if (active) setIsLoading(false);
      }
    };

    void loadChampions();
    return () => { active = false; };
  }, []);

  // Mapa id → icono generado automaticamente desde los datos cargados. Usa
  // "id" (identificador interno, ej. "Leblanc", "MonkeyKing") y no "name"
  // (nombre en español, ej. "LeBlanc", "Wukong") porque los duelos guardan
  // el championName que devuelve la API de Riot, que coincide con "id".
  const nameToIcon = useMemo(
    () => new Map(championsData.map((c) => [c.id, c.icon])),
    [championsData]
  );
  const idToDisplayName = useMemo(
    () => new Map(championsData.map((c) => [c.id, c.name])),
    [championsData]
  );
  const idToChampion = useMemo(
    () => new Map(championsData.map((c) => [c.id, c])),
    [championsData]
  );

  const filteredChampions = useMemo(() => {
    let result = [...championsData];

    if (searchTerm.trim()) {
      result = result.filter((champ) =>
        champ.name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    if (selectedRoles.length > 0) {
      result = result.filter((champ) =>
        champ.roles.some((role) => selectedRoles.includes(role))
      );
    }

    result.sort((a, b) => {
      if (prioritizeFavorites) {
        const aIsFavorite = favoriteChampionIds.includes(a.id);
        const bIsFavorite = favoriteChampionIds.includes(b.id);
        if (aIsFavorite !== bIsFavorite) return aIsFavorite ? -1 : 1;
      }
      const comparison = a.name.localeCompare(b.name);
      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [championsData, favoriteChampionIds, prioritizeFavorites, sortOrder, selectedRoles, searchTerm]);

  const toggleRole = (roleId: string) => {
    setSelectedRoles((prev) =>
      prev.includes(roleId) ? prev.filter((r) => r !== roleId) : [...prev, roleId]
    );
  };

  const toggleAllRoles = () => {
    if (selectedRoles.length === roles.length) {
      setSelectedRoles([]);
    } else {
      setSelectedRoles(roles.map((r) => r.id));
    }
  };

  const selectedMatchups: MatchupGroups = useMemo(() => {
    // Ordena por porcentaje de victorias (quien le gana "mas facilmente"),
    // pero solo entran parejas con suficiente muestra — si no, una sola
    // partida suelta (1 de 1 = 100%) apareceria arriba de una pareja con
    // 8 de 9 (89%) bien establecida. Antes de eso, las parejas que ya
    // juntaron la muestra completa (RECENT_DUELS_PER_MATCHUP) van siempre
    // primero, sin importar el %, porque su numero ya no puede cambiar de
    // golpe con la siguiente partida como si podria pasarle a una con
    // pocos duelos.
    const withEnoughSample = duelMatchups.filter(
      (m) => m.wins + m.losses >= MIN_DUELS_FOR_RANKING
    );
    const isFullSample = (m: DuelMatchup) =>
      m.wins + m.losses >= RECENT_DUELS_PER_MATCHUP ? 1 : 0;

    const wins = withEnoughSample
      .filter((m) => m.wins > m.losses)
      .sort((a, b) => {
        const fullDiff = isFullSample(b) - isFullSample(a);
        if (fullDiff !== 0) return fullDiff;
        return b.wins / (b.wins + b.losses) - a.wins / (a.wins + a.losses);
      })
      .map((m) => ({ name: m.opponent, wins: m.wins, losses: m.losses }));
    const losses = withEnoughSample
      .filter((m) => m.losses > m.wins)
      .sort((a, b) => {
        const fullDiff = isFullSample(b) - isFullSample(a);
        if (fullDiff !== 0) return fullDiff;
        return b.losses / (b.wins + b.losses) - a.losses / (a.wins + a.losses);
      })
      .map((m) => ({ name: m.opponent, wins: m.wins, losses: m.losses }));

    return { ...emptyMatchups, counters: wins, contras: losses };
  }, [duelMatchups, selectedChampion]);

  return (
    <div className="flex flex-col gap-6">
      {/* Barra de Filtro — fija al hacer scroll, igual que el filtro de
          tiempo en Partidas, para no tener que subir hasta arriba cada vez
          que se quiere cambiar de rol. */}
      <div className="sticky top-[52px] z-20 rounded-xl border border-slate-700/60 bg-panel/95 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Orden:
            </span>
            <button
              onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
                sortOrder === "asc"
                  ? "bg-brand text-slate-900 shadow-md"
                  : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              {sortOrder === "asc" ? "A-Z" : "Z-A"}
            </button>
          </div>

          <div className="h-6 w-px bg-slate-600" aria-hidden="true" />

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Roles:
            </span>
            <button
              onClick={toggleAllRoles}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                selectedRoles.length === roles.length
                  ? "bg-brand text-slate-900"
                  : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Todos
            </button>
            {roles.map((role) => (
              <button
                key={role.id}
                onClick={() => toggleRole(role.id)}
                title={role.label}
                className={`rounded-lg px-2 py-1.5 transition ${
                  selectedRoles.includes(role.id)
                    ? "bg-brand text-slate-900 shadow-md"
                    : "border border-slate-600 bg-slate-800 hover:bg-slate-700"
                }`}
              >
                <img src={role.icon} alt={role.label} className="h-5 w-5 object-contain" />
              </button>
            ))}
            <button
              onClick={() => setPrioritizeFavorites((prev) => !prev)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                prioritizeFavorites
                  ? "border border-amber-200/90 bg-[linear-gradient(180deg,rgba(255,235,140,0.98),rgba(217,119,6,0.96))] text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.55)]"
                  : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
              }`}
            >
              Fav
            </button>
          </div>

          <div className="h-6 w-px bg-slate-600" aria-hidden="true" />

          <div className="flex-1 md:min-w-64">
            <input
              type="text"
              placeholder="Buscar campeón..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-sm text-slate-200 placeholder-slate-500 transition focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
            />
          </div>
        </div>
      </div>

      {/* Layout Dual-Pane */}
      <div className="flex items-start gap-5">
        {/* Pane Izquierdo: Lista de Campeones */}
        <div className="flex-1 rounded-xl border border-slate-700/60 bg-panel p-6 shadow-sm">
          <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Campeones ({filteredChampions.length})
          </h3>
          {isLoading && (
            <p className="mb-4 text-sm text-slate-500">Cargando campeones...</p>
          )}
          {loadError && (
            <p className="mb-4 text-sm text-rose-400">{loadError}</p>
          )}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
            {filteredChampions.map((champion) => (
              <button
                key={champion.id}
                onClick={() => setSelectedChampion(champion)}
                className={`flex flex-col items-center gap-2 rounded-lg p-3 transition ${
                  selectedChampion?.id === champion.id
                    ? "bg-brand/10 ring-2 ring-brand"
                    : favoriteChampionIds.includes(champion.id)
                      ? "border border-amber-300/75 bg-[linear-gradient(180deg,rgba(255,248,220,0.98),rgba(252,211,77,0.62))] shadow-[0_0_12px_rgba(251,191,36,0.16)] hover:bg-[linear-gradient(180deg,rgba(255,248,220,0.98),rgba(252,211,77,0.62))]"
                      : "hover:bg-slate-700/50"
                }`}
              >
                <div
                  className={`relative h-16 w-16 overflow-hidden rounded-full border-2 ${
                    favoriteChampionIds.includes(champion.id)
                      ? "border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.18)]"
                      : "border-slate-600"
                  }`}
                >
                  <img src={champion.icon} alt={champion.name} className="h-full w-full object-cover" />
                </div>
                <span
                  className={`text-xs font-semibold ${
                    favoriteChampionIds.includes(champion.id) ? "text-slate-950" : "text-slate-200"
                  }`}
                >
                  {champion.name}
                </span>
              </button>
            ))}
          </div>
          {!isLoading && filteredChampions.length === 0 && (
            <p className="py-8 text-center text-sm text-slate-500">
              No hay campeones que coincidan con tu búsqueda.
            </p>
          )}
        </div>

        {/* Pane Derecho: Tarjeta de Presentación */}
        {selectedChampion && (
          <div className="sticky top-[8.5rem] flex max-h-[calc(100vh-9.5rem)] w-[21.5rem] shrink-0 self-start flex-col gap-2 overflow-y-auto rounded-xl border border-slate-700/60 bg-panel p-5 shadow-sm xl:w-[25rem]">
            <div className="relative aspect-[3/2] min-h-56 overflow-hidden rounded-lg bg-gradient-to-b from-slate-800 to-slate-900">
              <div className="absolute right-2 top-2 z-10 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onToggleFavoriteChampion(selectedChampion.id)}
                  className={`rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide backdrop-blur-sm transition ${
                    favoriteChampionIds.includes(selectedChampion.id)
                      ? "border-amber-200/90 bg-[linear-gradient(180deg,rgba(255,235,140,0.98),rgba(217,119,6,0.96))] text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.7)]"
                      : "border-white/70 bg-black/45 text-white"
                  }`}
                >
                  Fav
                </button>
                <button
                  type="button"
                  onClick={() => onNavigateToGuides(selectedChampion.id)}
                  className="rounded-md border border-white/70 bg-black/45 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white backdrop-blur-sm"
                >
                  Guia
                </button>
              </div>
              <img
                src={selectedChampion.splash}
                alt={selectedChampion.name}
                className="h-full w-full object-cover"
              />
            </div>

            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-extrabold leading-tight text-slate-100">
                {selectedChampion.name}
              </h2>
              <div className="flex flex-wrap justify-end gap-1">
                {selectedChampion.roles.map((role) => {
                  const roleObj = roles.find((r) => r.id === role);
                  return (
                    <span
                      key={role}
                      title={role}
                      className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-brand/10"
                    >
                      {roleObj ? (
                        <img src={roleObj.icon} alt={roleObj.label} className="h-4 w-4 object-contain" />
                      ) : null}
                    </span>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-slate-700 pt-2.5">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Región
              </span>
              <select
                value={duelRegion}
                onChange={(event) => setDuelRegion(event.target.value)}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none focus:border-brand"
              >
                {duelRegions.map((region) => (
                  <option key={region.value} value={region.value}>
                    {region.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Rol
              </span>
              <select
                value={duelPosition}
                onChange={(event) => setDuelPosition(event.target.value)}
                className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 outline-none focus:border-brand"
              >
                {duelPositions.map((pos) => (
                  <option key={pos.value} value={pos.value}>
                    {pos.label}
                  </option>
                ))}
              </select>
            </div>

            {duelsLoading ? (
              <p className="text-xs text-slate-500">Calculando enfrentamientos...</p>
            ) : duelMatchups.length === 0 ? (
              <p className="border-t border-slate-700 pt-2.5 text-xs text-slate-500">
                Todavia no hay duelos 1v1 registrados con este campeon (se van sumando a medida
                que se buscan/sincronizan cuentas con maestria alta).
              </p>
            ) : selectedMatchups.counters.length === 0 && selectedMatchups.contras.length === 0 ? (
              <p className="border-t border-slate-700 pt-2.5 text-xs text-slate-500">
                Hay duelos registrados, pero ninguna pareja todavia junta las {MIN_DUELS_FOR_RANKING}{" "}
                partidas minimas para mostrar un porcentaje confiable.
              </p>
            ) : (
              <>
                <MatchupSection
                  title="Gana vs"
                  entries={selectedMatchups.counters}
                  nameToIcon={nameToIcon}
                  idToDisplayName={idToDisplayName}
                  onSelect={(championId) => {
                    const champion = idToChampion.get(championId);
                    if (champion) setSelectedChampion(champion);
                  }}
                />
                <MatchupSection
                  title="Pierde vs"
                  entries={selectedMatchups.contras}
                  nameToIcon={nameToIcon}
                  idToDisplayName={idToDisplayName}
                  onSelect={(championId) => {
                    const champion = idToChampion.get(championId);
                    if (champion) setSelectedChampion(champion);
                  }}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
