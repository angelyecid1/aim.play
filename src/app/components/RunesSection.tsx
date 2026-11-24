"use client";

import { useEffect, useMemo, useState } from "react";

interface Rune {
  id: number;
  key: string;
  icon: string;
  name: string;
  shortDesc: string;
}

interface RuneSlot {
  runes: Rune[];
}

interface RuneStyle {
  id: number;
  key: string;
  icon: string;
  name: string;
  slots: RuneSlot[];
}

interface RuneShardOption {
  id: string;
  label: string;
  icon: string;
}

const shardRows: RuneShardOption[][] = [
  [
    {
      id: "adaptive-force-offense",
      label: "Fuerza adaptable",
      icon: "perk-images/StatMods/StatModsAdaptiveForceIcon.png",
    },
    {
      id: "attack-speed-offense",
      label: "Velocidad de ataque",
      icon: "perk-images/StatMods/StatModsAttackSpeedIcon.png",
    },
    {
      id: "ability-haste-offense",
      label: "Aceleracion de habilidad",
      icon: "perk-images/StatMods/StatModsCDRScalingIcon.png",
    },
  ],
  [
    {
      id: "adaptive-force-flex",
      label: "Fuerza adaptable",
      icon: "perk-images/StatMods/StatModsAdaptiveForceIcon.png",
    },
    {
      id: "move-speed-flex",
      label: "Velocidad de movimiento",
      icon: "perk-images/StatMods/StatModsMovementSpeedIcon.png",
    },
    {
      id: "health-scaling-flex",
      label: "Vida escalable",
      icon: "perk-images/StatMods/StatModsHealthPlusIcon.png",
    },
  ],
  [
    {
      id: "health-defense",
      label: "Vida",
      icon: "perk-images/StatMods/StatModsHealthScalingIcon.png",
    },
    {
      id: "tenacity-defense",
      label: "Tenacidad",
      icon: "perk-images/StatMods/StatModsTenacityIcon.png",
    },
    {
      id: "health-scaling-defense",
      label: "Vida escalable",
      icon: "perk-images/StatMods/StatModsHealthPlusIcon.png",
    },
  ],
];

function normalizeHtml(text: string) {
  return text
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}

function iconUrl(icon: string) {
  return `https://ddragon.leagueoflegends.com/cdn/img/${icon}`;
}

export default function RunesSection() {
  const [styles, setStyles] = useState<RuneStyle[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [primaryStyleId, setPrimaryStyleId] = useState<number | null>(null);
  const [secondaryStyleId, setSecondaryStyleId] = useState<number | null>(null);
  const [selectedPrimaryRunes, setSelectedPrimaryRunes] = useState<Record<number, number>>({});
  const [selectedSecondaryRunes, setSelectedSecondaryRunes] = useState<Record<number, number>>({});
  const [selectedShards, setSelectedShards] = useState<Record<number, string>>({});

  useEffect(() => {
    let active = true;

    const loadRunes = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        if (!versionsRes.ok) {
          throw new Error("No se pudo obtener la version de Data Dragon.");
        }

        const versions = (await versionsRes.json()) as string[];
        const latestVersion = versions[0];

        const runesRes = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/es_MX/runesReforged.json`
        );
        if (!runesRes.ok) {
          throw new Error("No se pudo obtener la lista de runas.");
        }

        const runesJson = (await runesRes.json()) as RuneStyle[];

        if (!active) {
          return;
        }

        setStyles(runesJson);
        const initialPrimary = runesJson[0] ?? null;
        const initialSecondary = runesJson.find((style) => style.id !== initialPrimary?.id) ?? null;
        setPrimaryStyleId(initialPrimary?.id ?? null);
        setSecondaryStyleId(initialSecondary?.id ?? null);

        if (initialPrimary) {
          const primaryDefaults = Object.fromEntries(
            initialPrimary.slots.map((slot, index) => [index, slot.runes[0]?.id]).filter((entry) => entry[1])
          ) as Record<number, number>;
          setSelectedPrimaryRunes(primaryDefaults);
        }

        if (initialSecondary) {
          const secondaryDefaults = Object.fromEntries(
            initialSecondary.slots
              .slice(1)
              .map((slot, index) => [index + 1, slot.runes[0]?.id])
              .filter((entry) => entry[1])
          ) as Record<number, number>;
          setSelectedSecondaryRunes(secondaryDefaults);
        }

        const shardDefaults = Object.fromEntries(
          shardRows.map((row, index) => [index, row[0].id])
        ) as Record<number, string>;
        setSelectedShards(shardDefaults);
      } catch (error) {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Error al cargar runas.");
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    };

    void loadRunes();

    return () => {
      active = false;
    };
  }, []);

  const primaryStyle = useMemo(
    () => styles.find((style) => style.id === primaryStyleId) ?? null,
    [primaryStyleId, styles]
  );

  const secondaryStyle = useMemo(
    () => styles.find((style) => style.id === secondaryStyleId) ?? null,
    [secondaryStyleId, styles]
  );

  const secondaryOptions = useMemo(
    () => styles.filter((style) => style.id !== primaryStyleId),
    [primaryStyleId, styles]
  );

  const handlePrimaryStyleSelect = (styleId: number) => {
    const nextPrimary = styles.find((style) => style.id === styleId);
    if (!nextPrimary) {
      return;
    }

    setPrimaryStyleId(styleId);
    setSelectedPrimaryRunes(
      Object.fromEntries(
        nextPrimary.slots.map((slot, index) => [index, slot.runes[0]?.id]).filter((entry) => entry[1])
      ) as Record<number, number>
    );

    if (secondaryStyleId === styleId) {
      const nextSecondary = styles.find((style) => style.id !== styleId) ?? null;
      setSecondaryStyleId(nextSecondary?.id ?? null);
      if (nextSecondary) {
        setSelectedSecondaryRunes(
          Object.fromEntries(
            nextSecondary.slots
              .slice(1)
              .map((slot, index) => [index + 1, slot.runes[0]?.id])
              .filter((entry) => entry[1])
          ) as Record<number, number>
        );
      }
    }
  };

  const handleSecondaryStyleSelect = (styleId: number) => {
    const nextSecondary = styles.find((style) => style.id === styleId);
    if (!nextSecondary) {
      return;
    }

    setSecondaryStyleId(styleId);
    setSelectedSecondaryRunes(
      Object.fromEntries(
        nextSecondary.slots
          .slice(1)
          .map((slot, index) => [index + 1, slot.runes[0]?.id])
          .filter((entry) => entry[1])
      ) as Record<number, number>
    );
  };

  return (
    <section className="rounded-2xl border border-amber-900/30 bg-[radial-gradient(circle_at_top,_rgba(244,114,182,0.12),_rgba(17,24,39,0.98)_52%)] p-6 shadow-[0_20px_45px_rgba(9,9,11,0.45)]">
      <div className="border-b border-amber-900/30 pb-4">
        <h2 className="text-2xl font-extrabold tracking-tight text-slate-100">Editor de Runas</h2>
      </div>

      {isLoading ? <p className="mt-6 text-sm text-slate-300">Cargando runas...</p> : null}
      {loadError ? <p className="mt-6 text-sm text-rose-300">{loadError}</p> : null}

      {!isLoading && !loadError && primaryStyle && secondaryStyle ? (
        <div className="mt-6 space-y-8">
          <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_300px] xl:items-stretch">
            <div className="rounded-2xl border border-amber-900/25 bg-slate-950/35 p-5 xl:flex xl:min-h-[44rem] xl:flex-col">
              <div className="mb-5 border-b border-amber-900/20 pb-4">
                <div className="mb-4 flex flex-wrap gap-2.5">
                  {styles.map((style) => {
                    const active = primaryStyle.id === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        title={style.name}
                        onClick={() => handlePrimaryStyleSelect(style.id)}
                        className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
                          active
                            ? "border-amber-300 bg-amber-300/10 shadow-[0_0_18px_rgba(251,191,36,0.28)]"
                            : "border-slate-700 bg-slate-950/50 hover:border-amber-600/60"
                        }`}
                      >
                        <img src={iconUrl(style.icon)} alt={style.name} className="h-6 w-6 object-contain" />
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-amber-300/60 bg-amber-300/10">
                    <img src={iconUrl(primaryStyle.icon)} alt={primaryStyle.name} className="h-7 w-7 object-contain" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/80">Runas Clave</p>
                    <h3 className="text-xl font-extrabold tracking-tight text-slate-100">{primaryStyle.name}</h3>
                  </div>
                </div>
              </div>

              <div className="space-y-3 xl:flex xl:flex-1 xl:flex-col xl:space-y-7">
                {primaryStyle.slots.map((slot, slotIndex) => (
                  <div
                    key={`primary-slot-${slotIndex}`}
                    className={`grid items-start ${
                      slotIndex === 0 && slot.runes.length === 4 ? "grid-cols-4 gap-1.5" : "grid-cols-3 gap-2"
                    }`}
                  >
                    {slot.runes.map((rune) => {
                      const active = selectedPrimaryRunes[slotIndex] === rune.id;
                      return (
                        <button
                          key={rune.id}
                          type="button"
                          title={`${rune.name}: ${normalizeHtml(rune.shortDesc)}`}
                          onClick={() =>
                            setSelectedPrimaryRunes((prev) => ({
                              ...prev,
                              [slotIndex]: rune.id,
                            }))
                          }
                          className="flex flex-col items-center text-center transition"
                        >
                          <div
                            className={`h-11 w-11 overflow-hidden rounded-full border-2 transition ${
                            active
                              ? "border-amber-300 bg-amber-300/10 shadow-[0_0_18px_rgba(251,191,36,0.2)]"
                              : "border-slate-700 bg-slate-950/40 hover:border-amber-700/60"
                          }`}
                          >
                            <img src={iconUrl(rune.icon)} alt={rune.name} className="h-full w-full object-cover" />
                          </div>
                          <p className="mt-1 min-h-[1.75rem] text-[10px] font-semibold leading-tight text-slate-100">{rune.name}</p>
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-violet-900/25 bg-slate-950/35 p-5 xl:flex xl:min-h-[44rem] xl:flex-col">
              <div className="mb-4 border-b border-violet-900/20 pb-4">
                <div className="mb-4 flex flex-wrap gap-2.5">
                  {secondaryOptions.map((style) => {
                    const active = secondaryStyle.id === style.id;
                    return (
                      <button
                        key={style.id}
                        type="button"
                        title={style.name}
                        onClick={() => handleSecondaryStyleSelect(style.id)}
                        className={`flex h-11 w-11 items-center justify-center rounded-full border transition ${
                          active
                            ? "border-violet-300 bg-violet-300/10 shadow-[0_0_16px_rgba(167,139,250,0.24)]"
                            : "border-slate-700 bg-slate-950/50 hover:border-violet-700/60"
                        }`}
                      >
                        <img src={iconUrl(style.icon)} alt={style.name} className="h-6 w-6 object-contain" />
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full border border-violet-300/60 bg-violet-300/10">
                    <img src={iconUrl(secondaryStyle.icon)} alt={secondaryStyle.name} className="h-7 w-7 object-contain" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-300/80">Runas Secundarias</p>
                    <h3 className="text-xl font-extrabold tracking-tight text-slate-100">{secondaryStyle.name}</h3>
                  </div>
                </div>
              </div>

              <div className="space-y-3 xl:flex-1">
                <div className="space-y-2.5">
                  {secondaryStyle.slots.slice(1).map((slot, slotIndex) => {
                    const realSlotIndex = slotIndex + 1;
                    return (
                      <div key={`secondary-slot-${realSlotIndex}`} className="grid grid-cols-3 items-start gap-2">
                        {slot.runes.map((rune) => {
                          const active = selectedSecondaryRunes[realSlotIndex] === rune.id;
                          return (
                            <button
                              key={rune.id}
                              type="button"
                              title={`${rune.name}: ${normalizeHtml(rune.shortDesc)}`}
                              onClick={() =>
                                setSelectedSecondaryRunes((prev) => ({
                                  ...prev,
                                  [realSlotIndex]: rune.id,
                                }))
                              }
                              className="flex flex-col items-center text-center transition"
                            >
                              <div
                                className={`h-11 w-11 overflow-hidden rounded-full border-2 transition ${
                                active
                                  ? "border-violet-300 bg-violet-300/10 shadow-[0_0_16px_rgba(167,139,250,0.22)]"
                                  : "border-slate-700 bg-slate-950/40 hover:border-violet-700/60"
                              }`}
                              >
                                <img src={iconUrl(rune.icon)} alt={rune.name} className="h-full w-full object-cover" />
                              </div>
                              <p className="mt-1 min-h-[1.75rem] text-[10px] font-semibold leading-tight text-slate-100">{rune.name}</p>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>

                <div className="border-t border-cyan-900/20 pt-4">
                  <h3 className="text-lg font-extrabold tracking-tight text-slate-100">Fragmentos</h3>

                  <div className="mt-3 space-y-2">
                    {shardRows.map((row, rowIndex) => (
                      <div key={`shard-row-${rowIndex}`} className="grid grid-cols-3 items-start gap-2">
                        {row.map((shard) => {
                          const active = selectedShards[rowIndex] === shard.id;
                          return (
                            <button
                              key={shard.id}
                              type="button"
                              title={shard.label}
                              onClick={() =>
                                setSelectedShards((prev) => ({
                                  ...prev,
                                  [rowIndex]: shard.id,
                                }))
                              }
                              className="flex flex-col items-center text-center transition"
                            >
                              <div
                                className={`flex h-11 w-11 items-center justify-center rounded-full border-2 transition ${
                                  active
                                    ? "border-cyan-300 bg-cyan-300/10 shadow-[0_0_14px_rgba(34,211,238,0.18)]"
                                    : "border-slate-700 bg-slate-950/40 hover:border-cyan-700/60"
                                }`}
                              >
                                <img src={iconUrl(shard.icon)} alt={shard.label} className="h-6 w-6 object-contain" />
                              </div>
                              <span className="mt-0.5 min-h-[0.4rem] text-[10px] leading-none text-transparent">.</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <aside className="rounded-2xl border border-cyan-900/25 bg-[linear-gradient(180deg,rgba(8,47,73,0.72),rgba(2,12,27,0.98))] p-5 shadow-[0_18px_35px_rgba(9,9,11,0.35)] xl:min-h-[44rem]">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">IA Coach</p>
              <h3 className="mt-1 text-xl font-extrabold tracking-tight text-slate-100">Consejos de Runas</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                Aqui la IA podra explicar para que sirve la combinacion elegida, cuando usarla y que estilo de juego potencia.
              </p>

              <div className="mt-5 space-y-3">
                <div className="rounded-xl border border-slate-700/70 bg-slate-950/35 p-3 text-sm text-slate-300">
                  Estado: <span className="font-semibold text-slate-100">En desarrollo</span>
                </div>
                <div className="rounded-xl border border-slate-700/70 bg-slate-950/35 p-3 text-sm leading-relaxed text-slate-400">
                  Cuando esta seccion este lista, mostrara recomendaciones sobre agresion, escalado, sustain y matchups segun tus runas.
                </div>
                <button
                  type="button"
                  disabled
                  className="w-full cursor-not-allowed rounded-lg bg-slate-900/80 px-4 py-2 text-sm font-semibold text-white"
                >
                  Analisis IA (proximamente)
                </button>
              </div>
            </aside>
          </div>
        </div>
      ) : null}
    </section>
  );
}
