"use client";

import { useEffect, useMemo, useRef, useState } from "react";

interface ChampionLite {
  id: string;
  name: string;
  icon: string;
}

interface Recommendation {
  championId: string;
  isFavorite: boolean;
  reasons: string[];
}

// Orden fijo de rol por casilla — la casilla 1 de aliados siempre es Top,
// la 2 Jungla, etc. Se usa para filtrar la recomendacion segun la casilla
// que se tenga seleccionada (no hace falta que el usuario "declare" su rol
// aparte, ya se sabe por cual casilla clickeo).
const ROLE_ORDER = ["Top", "Jungla", "Mid", "ADC", "Soporte"];

type TeamKey = "allies" | "enemies";

interface ActiveSlot {
  team: TeamKey;
  index: number;
}

interface DataDragonChampion {
  id: string;
  name: string;
  image: {
    full: string;
  };
}

function CompositionRow({
  title,
  team,
  champions,
  winRate,
  roleLabels,
  insights,
  onSlotClick,
  onSlotDoubleClick,
  onSlotDragStart,
  onSlotDragEnd,
  onSlotDragOver,
  onSlotDragLeave,
  onSlotDrop,
  activeSlot,
  dragOverSlot,
}: {
  title: string;
  team: TeamKey;
  champions: Array<ChampionLite | null>;
  winRate: string;
  roleLabels?: string[];
  insights: Record<string, string[]>;
  onSlotClick: (team: TeamKey, index: number) => void;
  onSlotDoubleClick: (team: TeamKey, index: number) => void;
  onSlotDragStart: (team: TeamKey, index: number, champion: ChampionLite) => void;
  onSlotDragEnd: () => void;
  onSlotDragOver: (team: TeamKey, index: number) => void;
  onSlotDragLeave: (team: TeamKey, index: number) => void;
  onSlotDrop: (team: TeamKey, index: number) => void;
  activeSlot: ActiveSlot | null;
  dragOverSlot: ActiveSlot | null;
}) {
  return (
    <div>
      <p className="mb-3 text-sm font-extrabold uppercase tracking-wide text-slate-200">{title}</p>
      <div className="flex items-start justify-between gap-4">
        <div className="grid flex-1 grid-cols-5 gap-2">
          {champions.map((champion, idx) => (
            <div key={`${team}-${idx}`} className="flex flex-col items-center gap-1">
              {roleLabels ? (
                <span className="text-[9px] font-bold uppercase tracking-wider text-slate-500">
                  {roleLabels[idx]}
                </span>
              ) : null}
              <button
              type="button"
              draggable={champion !== null}
              onClick={() => onSlotClick(team, idx)}
              onDoubleClick={() => onSlotDoubleClick(team, idx)}
              title={
                champion
                  ? [
                      ...(insights[`${team}-${idx}`] ?? []),
                      "Arrastra para mover a otra casilla — doble clic para quitar",
                    ].join("\n")
                  : undefined
              }
              onDragStart={() => {
                if (champion) onSlotDragStart(team, idx, champion);
              }}
              onDragEnd={onSlotDragEnd}
              onDragOver={(event) => {
                event.preventDefault();
                onSlotDragOver(team, idx);
              }}
              onDragLeave={() => onSlotDragLeave(team, idx)}
              onDrop={(event) => {
                event.preventDefault();
                onSlotDrop(team, idx);
              }}
              className={`group relative flex h-20 w-full items-center justify-center rounded-xl border transition ${
                dragOverSlot?.team === team && dragOverSlot.index === idx
                  ? "border-brand bg-brand/10"
                  : activeSlot?.team === team && activeSlot.index === idx
                    ? "border-brand/70 bg-brand/5"
                    : "border-slate-700 bg-slate-800/50 hover:border-brand hover:bg-brand/5"
              }`}
            >
              {champion ? (
                <div className="flex flex-col items-center gap-1">
                  <img
                    src={champion.icon}
                    alt={champion.name}
                    className="h-10 w-10 rounded-full border border-slate-600 object-cover"
                  />
                  <span className="max-w-[56px] truncate text-[10px] font-semibold text-slate-300">
                    {champion.name}
                  </span>
                </div>
              ) : (
                <span className="text-2xl font-light text-slate-500 transition group-hover:text-brand">+</span>
              )}
              </button>
            </div>
          ))}
        </div>

        <div className="w-20 rounded-lg border border-slate-700 bg-slate-800 p-2 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">% Win</p>
          <p className="mt-1 rounded-md border border-slate-600 px-2 py-1 text-xs font-bold text-slate-300">
            {winRate}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CompositionsSection({ favoriteChampionIds }: { favoriteChampionIds: string[] }) {
  const [champions, setChampions] = useState<ChampionLite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [showOnlyFavorites, setShowOnlyFavorites] = useState(false);
  const [activeSlot, setActiveSlot] = useState<ActiveSlot | null>(null);
  const [dragOverSlot, setDragOverSlot] = useState<ActiveSlot | null>(null);
  const [draggedChampion, setDraggedChampion] = useState<ChampionLite | null>(null);
  // Cuando el arrastre empieza desde una casilla ya llena (no desde el
  // buscador de campeones), se guarda de donde vino para poder moverlo /
  // intercambiarlo en vez de solo copiarlo.
  const [draggedFrom, setDraggedFrom] = useState<ActiveSlot | null>(null);

  const [allies, setAllies] = useState<Array<ChampionLite | null>>(Array(5).fill(null));
  const [enemies, setEnemies] = useState<Array<ChampionLite | null>>(Array(5).fill(null));

  const [alliesWinRate, setAlliesWinRate] = useState("--%");
  const [enemiesWinRate, setEnemiesWinRate] = useState("--%");
  const recommendationRequestId = useRef(0);

  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [recommendationsMode, setRecommendationsMode] = useState<string | null>(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  // Tooltip por cada campeon YA puesto en el tablero, clave "team-index".
  const [championInsights, setChampionInsights] = useState<Record<string, string[]>>({});
  const insightRequestId = useRef(0);

  useEffect(() => {
    let active = true;

    const loadChampions = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        if (!versionsRes.ok) {
          throw new Error("No se pudo obtener la version de Data Dragon.");
        }

        const versions = (await versionsRes.json()) as string[];
        const latestVersion = versions[0];

        const championsRes = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/es_MX/champion.json`
        );
        if (!championsRes.ok) {
          throw new Error("No se pudo obtener la lista de campeones.");
        }

        const championsJson = (await championsRes.json()) as {
          data: Record<string, DataDragonChampion>;
        };

        const mapped = Object.values(championsJson.data)
          .map((champion) => ({
            id: champion.id,
            name: champion.name,
            icon: `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${champion.image.full}`,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (active) {
          setChampions(mapped);
        }
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Error al cargar campeones.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadChampions();

    return () => {
      active = false;
    };
  }, []);

  // Porcentaje de victoria por equipo: una sola peticion al servidor que ya
  // promedia todas las parejas aliado x rival (datos reales + lista manual
  // de enfrentamientos fuera de rol), en vez de pedir cada pareja por
  // separado desde el cliente (hasta 50 peticiones para un tablero 5v5).
  useEffect(() => {
    const alliesFilled = allies.filter((c): c is ChampionLite => c !== null);
    const enemiesFilled = enemies.filter((c): c is ChampionLite => c !== null);

    if (alliesFilled.length === 0 || enemiesFilled.length === 0) {
      setAlliesWinRate("--%");
      setEnemiesWinRate("--%");
      return;
    }

    let cancelled = false;

    const computeTeamWinRates = async () => {
      try {
        const res = await fetch("/api/draft-team-winrate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            allies: alliesFilled.map((c) => c.id),
            enemies: enemiesFilled.map((c) => c.id),
          }),
        });
        const data = await res.json();
        if (cancelled) return;
        setAlliesWinRate(data.alliesWinRate !== null ? `${data.alliesWinRate}%` : "--%");
        setEnemiesWinRate(data.enemiesWinRate !== null ? `${data.enemiesWinRate}%` : "--%");
      } catch {
        if (cancelled) return;
        setAlliesWinRate("--%");
        setEnemiesWinRate("--%");
      }
    };

    void computeTeamWinRates();
    return () => {
      cancelled = true;
    };
  }, [allies, enemies]);

  // Rol fijo de la casilla seleccionada (solo aplica del lado de aliados,
  // las casillas de rival no tienen rol asignado). Null si no hay ninguna
  // casilla de aliados seleccionada — ahi la recomendacion queda general.
  const activeSlotRole =
    activeSlot?.team === "allies" ? (ROLE_ORDER[activeSlot.index] ?? null) : null;

  // Con los 5 aliados ya puestos no queda ninguna casilla donde colocar una
  // recomendacion — mostrar sugerencias ahi solo confunde (no queda claro
  // para quien son), asi que el panel avisa que el equipo ya esta completo
  // en vez de seguir calculando.
  const alliesComplete = allies.every((c) => c !== null);

  useEffect(() => {
    if (champions.length === 0) return;
    if (alliesComplete) {
      setRecommendations([]);
      setRecommendationsMode(null);
      setRecommendationsLoading(false);
      return;
    }

    setRecommendationsLoading(true);
    const timeout = setTimeout(() => {
      // Guarda contra respuestas que llegan desordenadas (una peticion vieja
      // que tarda mas y resuelve despues de una mas nueva) — solo se aplica
      // la respuesta si sigue siendo la ultima peticion pedida.
      const requestId = ++recommendationRequestId.current;
      const idToDisplayName = Object.fromEntries(champions.map((c) => [c.id, c.name]));
      fetch("/api/draft-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          allies: allies.map((c) => c?.id ?? null),
          enemies: enemies.map((c) => c?.id ?? null),
          favoriteChampionIds,
          allChampionIds: champions.map((c) => c.id),
          idToDisplayName,
          targetRole: activeSlotRole,
        }),
      })
        .then((res) => res.json())
        .then((data) => {
          if (recommendationRequestId.current !== requestId) return;
          setRecommendations(data.recommendations ?? []);
          setRecommendationsMode(data.mode ?? null);
        })
        .catch(() => {
          if (recommendationRequestId.current !== requestId) return;
          setRecommendations([]);
          setRecommendationsMode(null);
        })
        .finally(() => {
          if (recommendationRequestId.current === requestId) setRecommendationsLoading(false);
        });
    }, 300);

    return () => clearTimeout(timeout);
  }, [allies, enemies, favoriteChampionIds, champions, activeSlotRole, alliesComplete]);

  // Tooltip de "como jugar este pick" para cada campeon ya puesto en el
  // tablero (hasta 10) — se recalcula junto con el draft, en una sola
  // peticion que evalua a todos los puestos de una vez.
  useEffect(() => {
    if (champions.length === 0) return;
    const hasAnyPlaced = allies.some((c) => c !== null) || enemies.some((c) => c !== null);
    if (!hasAnyPlaced) {
      setChampionInsights({});
      return;
    }

    const requestId = ++insightRequestId.current;
    const idToDisplayName = Object.fromEntries(champions.map((c) => [c.id, c.name]));

    fetch("/api/draft-champion-insight", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        allies: allies.map((c) => c?.id ?? null),
        enemies: enemies.map((c) => c?.id ?? null),
        idToDisplayName,
      }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (insightRequestId.current !== requestId) return;
        const byKey: Record<string, string[]> = {};
        for (const insight of data.insights ?? []) {
          byKey[`${insight.team}-${insight.index}`] = insight.reasons;
        }
        setChampionInsights(byKey);
      })
      .catch(() => {
        if (insightRequestId.current !== requestId) return;
        setChampionInsights({});
      });
  }, [allies, enemies, champions]);

  const filteredChampions = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const visibleChampions = !normalizedSearch
      ? champions
      : champions.filter((champion) => champion.name.toLowerCase().includes(normalizedSearch));

    if (!showOnlyFavorites) {
      return visibleChampions;
    }

    return [...visibleChampions].sort((a, b) => {
      const aIsFavorite = favoriteChampionIds.includes(a.id);
      const bIsFavorite = favoriteChampionIds.includes(b.id);

      if (aIsFavorite !== bIsFavorite) {
        return aIsFavorite ? -1 : 1;
      }

      return a.name.localeCompare(b.name);
    });
  }, [champions, favoriteChampionIds, search, showOnlyFavorites]);

  const teamArray = (team: TeamKey) => (team === "allies" ? allies : enemies);
  const setTeamArray = (team: TeamKey) => (team === "allies" ? setAllies : setEnemies);

  // Un mismo campeon no puede repetirse dos veces en el MISMO equipo (si
  // puede estar en los dos equipos a la vez, eso no se revisa aca).
  // excludeIndex se usa para no comparar una casilla contra si misma al
  // mover/soltar sobre el mismo lugar de donde salio.
  const isDuplicateInTeam = (team: TeamKey, championId: string, excludeIndex: number) =>
    teamArray(team).some((c, i) => i !== excludeIndex && c?.id === championId);

  const handlePickChampion = (champion: ChampionLite) => {
    if (!activeSlot) {
      return;
    }
    const { team, index } = activeSlot;
    if (isDuplicateInTeam(team, champion.id, index)) return;

    setTeamArray(team)((prev) => {
      const next = [...prev];
      next[index] = champion;
      return next;
    });
    setActiveSlot(null);
  };

  const assignChampionToSlot = (team: TeamKey, index: number, champion: ChampionLite) => {
    if (isDuplicateInTeam(team, champion.id, index)) {
      setDragOverSlot(null);
      return;
    }
    setTeamArray(team)((prev) => {
      const next = [...prev];
      next[index] = champion;
      return next;
    });
    setDragOverSlot(null);
  };

  const clearSlot = (team: TeamKey, index: number) => {
    setTeamArray(team)((prev) => {
      const next = [...prev];
      next[index] = null;
      return next;
    });

    if (activeSlot?.team === team && activeSlot.index === index) {
      setActiveSlot(null);
    }
  };

  const handleSlotDragStart = (team: TeamKey, index: number, champion: ChampionLite) => {
    setDraggedChampion(champion);
    setDraggedFrom({ team, index });
  };

  const handleSlotDrop = (team: TeamKey, index: number) => {
    if (!draggedChampion) {
      return;
    }

    // Vino de otra casilla (no del buscador) — mover/intercambiar en vez de
    // solo copiar, para no duplicar el campeon en el origen. Se permite
    // cruzar de aliados a rivales (o al reves): cada campeon que aterriza
    // en un equipo se revisa contra los duplicados de ESE equipo nada mas.
    if (draggedFrom) {
      const { team: fromTeam, index: fromIndex } = draggedFrom;
      const isNoOp = fromTeam === team && fromIndex === index;
      if (isNoOp) {
        setDraggedChampion(null);
        setDraggedFrom(null);
        setDragOverSlot(null);
        return;
      }

      const destinationChampion = teamArray(team)[index];

      if (fromTeam === team) {
        // Reordenar dentro del MISMO equipo: los dos campeones ya estaban
        // unicos ahi, asi que intercambiarlos no puede crear un duplicado
        // nuevo — no hace falta revisar (revisar aca era el bug: el propio
        // campeon arrastrado aparecia en su casilla de origen, que no
        // estaba excluida, y eso lo marcaba como "duplicado de si mismo").
        setTeamArray(team)((prev) => {
          const next = [...prev];
          next[index] = draggedChampion;
          next[fromIndex] = destinationChampion;
          return next;
        });
      } else {
        // Cruzando de aliados a rivales (o al reves): aca si hace falta
        // revisar, cada campeon que aterriza en un equipo se compara solo
        // contra los duplicados de ESE equipo.
        const wouldDuplicateInDestination = isDuplicateInTeam(team, draggedChampion.id, index);
        const wouldDuplicateInOrigin = destinationChampion
          ? isDuplicateInTeam(fromTeam, destinationChampion.id, fromIndex)
          : false;

        if (wouldDuplicateInDestination || wouldDuplicateInOrigin) {
          setDraggedChampion(null);
          setDraggedFrom(null);
          setDragOverSlot(null);
          return;
        }

        setTeamArray(team)((prev) => {
          const next = [...prev];
          next[index] = draggedChampion;
          return next;
        });
        setTeamArray(fromTeam)((prev) => {
          const next = [...prev];
          next[fromIndex] = destinationChampion;
          return next;
        });
      }

      setDraggedChampion(null);
      setDraggedFrom(null);
      setDragOverSlot(null);
      return;
    }

    assignChampionToSlot(team, index, draggedChampion);
    setDraggedChampion(null);
  };

  const handlePickRecommendation = (championId: string) => {
    const champion = champions.find((c) => c.id === championId);
    if (!champion) return;
    // Si hay una casilla de aliados seleccionada, la recomendacion se
    // filtro justo para esa casilla (por su rol) — se coloca ahi. Si no
    // hay ninguna seleccionada, cae en la primera vacia como antes.
    const targetIndex =
      activeSlot?.team === "allies" ? activeSlot.index : allies.findIndex((c) => c === null);
    if (targetIndex === -1) return;
    assignChampionToSlot("allies", targetIndex, champion);
  };

  return (
    <div className="flex items-start gap-5">
      <section className="flex-1 rounded-2xl border border-slate-700/60 bg-panel p-6 shadow-sm">
        <h2 className="mb-5 text-2xl font-extrabold tracking-tight text-slate-100">
          Constructor de Draft
        </h2>

        <div className="space-y-6">
          <CompositionRow
            title="Aliados"
            team="allies"
            champions={allies}
            winRate={alliesWinRate}
            roleLabels={ROLE_ORDER}
            insights={championInsights}
            onSlotClick={(team, index) => setActiveSlot({ team, index })}
            onSlotDoubleClick={clearSlot}
            onSlotDragStart={handleSlotDragStart}
            onSlotDragEnd={() => {
              setDraggedChampion(null);
              setDraggedFrom(null);
              setDragOverSlot(null);
            }}
            onSlotDragOver={(team, index) => setDragOverSlot({ team, index })}
            onSlotDragLeave={(team, index) => {
              if (dragOverSlot?.team === team && dragOverSlot.index === index) {
                setDragOverSlot(null);
              }
            }}
            onSlotDrop={handleSlotDrop}
            activeSlot={activeSlot}
            dragOverSlot={dragOverSlot}
          />

          <CompositionRow
            title="Enemigos"
            team="enemies"
            champions={enemies}
            winRate={enemiesWinRate}
            insights={championInsights}
            onSlotClick={(team, index) => setActiveSlot({ team, index })}
            onSlotDoubleClick={clearSlot}
            onSlotDragStart={handleSlotDragStart}
            onSlotDragEnd={() => {
              setDraggedChampion(null);
              setDraggedFrom(null);
              setDragOverSlot(null);
            }}
            onSlotDragOver={(team, index) => setDragOverSlot({ team, index })}
            onSlotDragLeave={(team, index) => {
              if (dragOverSlot?.team === team && dragOverSlot.index === index) {
                setDragOverSlot(null);
              }
            }}
            onSlotDrop={handleSlotDrop}
            activeSlot={activeSlot}
            dragOverSlot={dragOverSlot}
          />
        </div>

        <div className="mt-6 rounded-xl border border-slate-700 bg-slate-800/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-300">
              Seleccionar Campeon
            </h3>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowOnlyFavorites((prev) => !prev)}
                className={`rounded-md px-2 py-1 text-xs font-semibold transition ${
                  showOnlyFavorites
                    ? "border border-amber-200/90 bg-[linear-gradient(180deg,rgba(255,235,140,0.98),rgba(217,119,6,0.96))] text-slate-950 shadow-[0_0_18px_rgba(251,191,36,0.55)]"
                    : "border border-slate-600 bg-slate-800 text-slate-300 hover:bg-slate-700"
                }`}
              >
                Fav
              </button>
              {activeSlot ? (
                <button
                  type="button"
                  onClick={() => setActiveSlot(null)}
                  className="rounded-md border border-slate-600 bg-slate-800 px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Cerrar
                </button>
              ) : null}
            </div>
          </div>

          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar campeon..."
            className="mb-3 w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-brand"
          />

          {isLoading ? <p className="text-sm text-slate-500">Cargando campeones...</p> : null}
          {loadError ? <p className="text-sm text-rose-400">{loadError}</p> : null}

          {!isLoading && !loadError ? (
            <div className="max-h-64 overflow-y-auto">
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                {filteredChampions.map((champion) => (
                  (() => {
                    const isHighlightedFavorite = favoriteChampionIds.includes(champion.id);

                    return (
                  <button
                    key={champion.id}
                    type="button"
                    draggable
                    onClick={() => handlePickChampion(champion)}
                    onDragStart={() => {
                      setDraggedChampion(champion);
                      setDraggedFrom(null);
                    }}
                    onDragEnd={() => {
                      setDraggedChampion(null);
                      setDraggedFrom(null);
                      setDragOverSlot(null);
                    }}
                    className={`rounded-lg border p-2 text-center transition hover:border-brand hover:bg-brand/5 ${
                      isHighlightedFavorite
                        ? "border-amber-300/75 bg-[linear-gradient(180deg,rgba(255,248,220,0.98),rgba(252,211,77,0.62))] shadow-[0_0_12px_rgba(251,191,36,0.16)]"
                        : "border-slate-700 bg-slate-800"
                    }`}
                  >
                    <img
                      src={champion.icon}
                      alt={champion.name}
                      className={`mx-auto h-10 w-10 rounded-full border object-cover ${
                        isHighlightedFavorite
                          ? "border-2 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.18)]"
                          : "border-slate-600"
                      }`}
                    />
                    <p
                      className={`mt-1 truncate text-[10px] font-semibold ${
                        isHighlightedFavorite ? "text-slate-950" : "text-slate-300"
                      }`}
                    >
                      {champion.name}
                    </p>
                  </button>
                    );
                  })()
                ))}
              </div>
            </div>
          ) : null}

          {!isLoading && !loadError && filteredChampions.length === 0 ? (
            <p className="text-sm text-slate-500">No hay campeones que coincidan con la busqueda.</p>
          ) : null}

          <p className="mt-3 text-xs text-slate-500">
            Arrastra un campeon a cualquier hueco. Tambien puedes hacer click en hueco + click en campeon.
          </p>
        </div>
      </section>

      <aside className="sticky top-20 w-[21.5rem] shrink-0 rounded-2xl border border-slate-700/60 bg-panel p-5 shadow-sm xl:w-[25rem]">
        <p className="font-mono text-xs uppercase tracking-wider text-brand-deep">Recomendaciones</p>
        <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-100">Siguiente pick</h3>

        {alliesComplete ? (
          <p className="mt-2 text-xs text-slate-500">
            Tu equipo de aliados ya está completo — no queda casilla donde colocar una recomendación.
          </p>
        ) : recommendationsMode && recommendationsMode !== "scored" ? (
          <p className="mt-2 text-xs text-slate-500">
            Elige al menos un campeon rival para recomendaciones basadas en counters — por ahora se muestran{" "}
            {recommendationsMode === "cold-start-favorites" ? "tus favoritos" : "los campeones mas jugados"}
            {activeSlotRole ? ` de ${activeSlotRole}` : ""}.
          </p>
        ) : (
          <p className="mt-2 text-xs text-slate-500">
            {activeSlotRole
              ? `Filtrado para la casilla de ${activeSlotRole}.`
              : "Segun lo que ya se eligio en el draft. Selecciona una casilla de aliados para filtrar por rol."}
          </p>
        )}

        <div className="mt-4">
          {alliesComplete ? null : recommendationsLoading ? (
            <p className="text-sm text-slate-500">Calculando...</p>
          ) : recommendations.length === 0 ? (
            <p className="text-sm text-slate-500">Elige campeones en el draft para ver sugerencias aca.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {recommendations.map((rec) => {
                const champion = champions.find((c) => c.id === rec.championId);
                if (!champion) return null;
                return (
                  <button
                    key={rec.championId}
                    type="button"
                    onClick={() => handlePickRecommendation(rec.championId)}
                    title={rec.reasons.join("\n")}
                    className={`rounded-lg border p-2 text-center transition hover:border-brand hover:bg-brand/5 ${
                      rec.isFavorite
                        ? "border-amber-300/75 bg-[linear-gradient(180deg,rgba(255,248,220,0.98),rgba(252,211,77,0.62))] shadow-[0_0_12px_rgba(251,191,36,0.16)]"
                        : "border-slate-700 bg-slate-800"
                    }`}
                  >
                    <img
                      src={champion.icon}
                      alt={champion.name}
                      className={`mx-auto h-10 w-10 rounded-full border object-cover ${
                        rec.isFavorite ? "border-2 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.18)]" : "border-slate-600"
                      }`}
                    />
                    <p className={`mt-1 truncate text-[10px] font-semibold ${rec.isFavorite ? "text-slate-950" : "text-slate-300"}`}>
                      {champion.name}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
