"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type CreatorType = "otp" | "creator" | "coach";
type Platform = "youtube" | "twitch" | "tiktok";

interface Spell {
  id: string;
  name: string;
  description: string;
  image: { full: string };
}

interface Passive {
  name: string;
  description: string;
  image: { full: string };
}

interface ChampionDetail {
  passive: Passive;
  spells: Spell[];
}

interface Creator {
  id: string;
  name: string;
  handle: string;
  platform: Platform;
  channelUrl: string;
  type: CreatorType;
  /** IDs de campeon (DDragon) en los que se especializa. Vacio = creador general. */
  championIds: string[];
  description: string;
}

interface ChampionLite {
  id: string;
  name: string;
  icon: string;
}

interface DataDragonChampion {
  id: string;
  name: string;
  image: { full: string };
}

// ---------------------------------------------------------------------------
// Datos curados de creadores
// Agrega aqui a cada creador validado. championIds usa el ID de DDragon (ej: "Yasuo").
// ---------------------------------------------------------------------------
const CREATORS: Creator[] = [
  {
    id: "c1",
    name: "Creador Ejemplo",
    handle: "@creador",
    platform: "youtube",
    channelUrl: "#",
    type: "creator",
    championIds: [],
    description: "Contenido general de League of Legends, guias y clips destacados.",
  },
  {
    id: "c2",
    name: "OTP Ejemplo",
    handle: "@otpejemplo",
    platform: "twitch",
    channelUrl: "#",
    type: "otp",
    championIds: ["Yasuo"],
    description: "Especialista en Yasuo con mas de 2000 partidas en el campeon.",
  },
  {
    id: "c3",
    name: "Coach Ejemplo",
    handle: "@coachejemplo",
    platform: "youtube",
    channelUrl: "#",
    type: "coach",
    championIds: [],
    description: "Analisis de partidas, coaching y mejora de fundamentos para subir de elo.",
  },
];

// ---------------------------------------------------------------------------
// Helpers visuales
// ---------------------------------------------------------------------------

const TYPE_LABELS: Record<CreatorType, string> = {
  otp: "OTP",
  creator: "Creador",
  coach: "Coach",
};

const TYPE_COLORS: Record<CreatorType, string> = {
  otp: "bg-brand/10 text-brand-deep border-brand/25",
  creator: "bg-slate-700 text-slate-300 border-slate-600",
  coach: "bg-amber-900/30 text-amber-300 border-amber-700/50",
};

const PLATFORM_LABELS: Record<Platform, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  tiktok: "TikTok",
};

const PLATFORM_COLORS: Record<Platform, string> = {
  youtube: "bg-rose-900/30 text-rose-400 border-rose-700/50",
  twitch: "bg-violet-900/30 text-violet-400 border-violet-700/50",
  tiktok: "bg-slate-700 text-slate-300 border-slate-600",
};

const AVATAR_COLORS = [
  "bg-brand/20 text-brand-deep",
  "bg-amber-900/40 text-amber-300",
  "bg-violet-900/40 text-violet-300",
  "bg-rose-900/40 text-rose-300",
  "bg-emerald-900/40 text-emerald-300",
];

function avatarColor(id: string) {
  const index = id.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return AVATAR_COLORS[index % AVATAR_COLORS.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function getPlatformIcon(platform: Platform) {
  if (platform === "youtube")
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M21.8 8.001a2.75 2.75 0 0 0-1.93-1.946C18.1 5.5 12 5.5 12 5.5s-6.1 0-7.87.555A2.75 2.75 0 0 0 2.2 8.001 28.6 28.6 0 0 0 1.5 12a28.6 28.6 0 0 0 .7 3.999 2.75 2.75 0 0 0 1.93 1.946C5.9 18.5 12 18.5 12 18.5s6.1 0 7.87-.555a2.75 2.75 0 0 0 1.93-1.946A28.6 28.6 0 0 0 22.5 12a28.6 28.6 0 0 0-.7-3.999zM10 15.5v-7l6 3.5-6 3.5z" />
      </svg>
    );
  if (platform === "twitch")
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2 2v17h5v3h3l3-3h4l5-5V2H2zm19 10.586L17.586 16H13l-3 3v-3H4V4h17v8.586zM15 7h2v5h-2zm-4 0h2v5h-2z" />
      </svg>
    );
  if (platform === "tiktok")
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12.5 2h3v13a3.5 3.5 0 1 1-3.5-3.5h.5V9.5h-1A6.5 6.5 0 1 0 18 16V7.5a5.5 5.5 0 0 1-5.5-5.5z" />
      </svg>
    );
  return null;
}

// ---------------------------------------------------------------------------
// Vista de guia de campeon especifico (layout 4 paneles)
// ---------------------------------------------------------------------------

const ABILITY_KEYS = ["P", "Q", "W", "E", "R"] as const;

function ChampionGuideView({
  championId,
  champion,
  ddVersion,
  creators,
  championMap,
  onClear,
  onShowVideos,
  creatorFilter,
  setCreatorFilter,
}: {
  championId: string | null;
  champion: ChampionLite | null;
  ddVersion: string;
  creators: Creator[];
  championMap: Map<string, ChampionLite>;
  onClear: () => void;
  onShowVideos: (creator: Creator) => void;
  creatorFilter: "all" | CreatorType;
  setCreatorFilter: (f: "all" | CreatorType) => void;
}) {
  const [detail, setDetail] = useState<ChampionDetail | null>(null);
  const [selectedAbilityKey, setSelectedAbilityKey] = useState<string>("Q");
  const videoColumnRef = useRef<HTMLDivElement>(null);
  const outerGridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!championId || !champion) return;
    let active = true;
    const load = async () => {
      try {
        const res = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/data/es_MX/champion/${championId}.json`
        );
        if (!res.ok) return;
        const json = (await res.json()) as { data: Record<string, ChampionDetail> };
        const d = json.data[championId];
        if (active && d) setDetail(d);
      } catch { /* silencioso */ }
    };
    void load();
    return () => { active = false; };
  }, [championId, ddVersion]);

  const abilities = detail
    ? [
        { key: "P", label: "Pasiva", name: detail.passive.name, desc: detail.passive.description, icon: `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/passive/${detail.passive.image.full}` },
        { key: "Q", label: "Q", name: detail.spells[0]?.name ?? "", desc: detail.spells[0]?.description ?? "", icon: `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/spell/${detail.spells[0]?.image.full}` },
        { key: "W", label: "W", name: detail.spells[1]?.name ?? "", desc: detail.spells[1]?.description ?? "", icon: `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/spell/${detail.spells[1]?.image.full}` },
        { key: "E", label: "E", name: detail.spells[2]?.name ?? "", desc: detail.spells[2]?.description ?? "", icon: `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/spell/${detail.spells[2]?.image.full}` },
        { key: "R", label: "R", name: detail.spells[3]?.name ?? "", desc: detail.spells[3]?.description ?? "", icon: `https://ddragon.leagueoflegends.com/cdn/${ddVersion}/img/spell/${detail.spells[3]?.image.full}` },
      ]
    : [];

  const activeAbility = abilities.find((a) => a.key === selectedAbilityKey) ?? null;
  const splashUrl = champion ? `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg` : "";
  const otpCreators = creators.filter((c) => c.championIds.includes(championId ?? ""));
  const generalCreators = creators.filter((c) => !c.championIds.includes(championId ?? ""));

  const baseCreators = otpCreators.length > 0
    ? [...otpCreators, ...generalCreators]
    : creators;
  const filteredCreators = creatorFilter === "all"
    ? baseCreators
    : baseCreators.filter((c) => c.type === creatorFilter);

  const FILTER_PILLS: { key: "all" | CreatorType; label: string }[] = [
    { key: "all", label: "Todos" },
    { key: "otp", label: "OTP" },
    { key: "coach", label: "Coach" },
    { key: "creator", label: "Creador" },
  ];

  return (
    <div className="flex flex-col gap-5">
      {/* Layout: Creadores izquierda | Videos + Runas + Habilidades derecha */}
      <div ref={outerGridRef} className="grid grid-cols-[2fr_3fr] gap-5 items-start">
        {/* Columna izquierda: Creadores */}
        <div className="sticky top-16 col-span-1 flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-panel p-5 shadow-sm">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-brand-deep">Creadores y coaches</p>
            <h3 className="font-bold text-slate-100">Contenido recomendado</h3>
          </div>
          {/* Filtros */}
          <div className="flex flex-wrap gap-1.5">
            {FILTER_PILLS.map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => setCreatorFilter(pill.key)}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold transition ${
                  creatorFilter === pill.key
                    ? "border-brand bg-brand/10 text-brand-deep"
                    : "border-slate-600 bg-slate-800 text-slate-500 hover:border-slate-500 hover:text-slate-300"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
          {filteredCreators.length === 0 ? (
            <div className="flex items-center justify-center rounded-xl border border-dashed border-slate-700 py-8 text-center">
              <p className="text-sm text-slate-500">Sin creadores en esta categoria.</p>
            </div>
          ) : (
            <div className="flex max-h-[380px] flex-col gap-2 overflow-y-auto pr-0.5">
              {filteredCreators
                .filter((c) => creatorFilter === "all" || c.type === creatorFilter)
                .map((c) => (
                  <CreatorCard key={c.id} creator={c} onShowVideos={() => onShowVideos(c)} />
                ))}
            </div>
          )}
        </div>

        {/* Columna derecha: siempre visible */}
        <div ref={videoColumnRef} className="col-span-1 flex flex-col gap-5">
          {/* Seccion 1: Videos del campeon o estado vacio */}
          <div className="flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-panel p-5 shadow-sm">
            {champion ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[10px] uppercase tracking-wider text-brand-deep">Clips y partidas</p>
                    <h3 className="font-bold text-slate-100">Videos de {champion.name}</h3>
                  </div>
                </div>
                <div style={{ position: "relative", paddingBottom: "56.25%" }} className="rounded-xl overflow-hidden">
                  <div
                    className="absolute inset-0 bg-slate-900 overflow-hidden rounded-xl"
                    style={{ backgroundImage: `url(${splashUrl})`, backgroundSize: "cover", backgroundPosition: "center top" }}
                  >
                    <div className="absolute inset-0 bg-black/55" />
                    <div className="relative flex h-full flex-col items-center justify-center gap-2 text-center">
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/60 bg-white/10 backdrop-blur-sm">
                        <svg className="h-6 w-6 translate-x-0.5 text-white" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      </div>
                      <p className="text-xs font-semibold text-white/80">Agrega aqui los mejores clips</p>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
                <svg className="h-10 w-10 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
                </svg>
                <p className="font-bold text-slate-400">Selecciona un campeon para comenzar</p>
              </div>
            )}
          </div>

          {/* Secciones 2 y 3: solo cuando hay campeon seleccionado */}
          {champion && (
            <>
              {/* Panel 2: Runas y Build */}
              <div className="flex flex-col gap-5 rounded-2xl border border-slate-700/60 bg-panel p-5 shadow-sm">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-brand-deep">Runas recomendadas</p>
                  <h3 className="mb-3 font-bold text-slate-100">Configuracion de runas</h3>
                  <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-800/50 p-4 text-center">
                    <p className="text-xs font-semibold text-slate-400">Proximamente</p>
                    <p className="text-[11px] text-slate-500">Aqui iran las runas recomendadas para {champion.name}.</p>
                  </div>
                </div>
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-wider text-brand-deep">Build recomendada</p>
                  <h3 className="mb-3 font-bold text-slate-100">Items principales</h3>
                  <div className="flex flex-col gap-2 rounded-xl border border-dashed border-slate-700 bg-slate-800/50 p-4 text-center">
                    <p className="text-xs font-semibold text-slate-400">Proximamente</p>
                    <p className="text-[11px] text-slate-500">Aqui iran los items mas efectivos para {champion.name}.</p>
                  </div>
                </div>
              </div>

              {/* Panel 3: Habilidades */}
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-panel p-5 shadow-sm">
                <p className="font-mono text-[10px] uppercase tracking-wider text-brand-deep">Habilidades</p>
                <h3 className="font-bold text-slate-100">Kit de {champion.name}</h3>

                {/* Splash como fondo + habilidad activa */}
                <div
                  className="relative flex aspect-video items-end overflow-hidden rounded-xl bg-slate-900"
                  style={{ backgroundImage: `url(${splashUrl})`, backgroundSize: "cover", backgroundPosition: "center top" }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                  {activeAbility && (
                    <div className="relative flex w-full items-end gap-3 p-4">
                      <img src={activeAbility.icon} alt={activeAbility.name} className="h-12 w-12 shrink-0 rounded-lg border-2 border-white/40 object-cover shadow-lg" />
                      <div className="min-w-0">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-white/60">{activeAbility.label}</p>
                        <p className="font-bold leading-tight text-white">{activeAbility.name}</p>
                      </div>
                    </div>
                  )}
                  {!detail && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <p className="text-xs text-white/60">Cargando habilidades...</p>
                    </div>
                  )}
                </div>

                {/* Botones P Q W E R */}
                <div className="flex gap-2">
                  {abilities.map((ab) => (
                    <button
                      key={ab.key}
                      type="button"
                      onClick={() => setSelectedAbilityKey(ab.key)}
                      title={ab.name}
                      className={`flex flex-1 flex-col items-center gap-1 rounded-xl border p-2 transition ${
                        selectedAbilityKey === ab.key
                          ? "border-brand bg-brand/5 ring-2 ring-brand/30"
                          : "border-slate-700 hover:border-slate-500 hover:bg-slate-800"
                      }`}
                    >
                      <img src={ab.icon} alt={ab.name} className="h-9 w-9 rounded-lg object-cover" />
                      <span className="font-mono text-[10px] font-bold text-slate-400">{ab.key}</span>
                    </button>
                  ))}
                </div>

                {/* Descripcion de habilidad */}
                <div className="h-28 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800/50 p-3">
                  {activeAbility ? (
                    <p
                      className="text-xs leading-relaxed text-slate-300"
                      dangerouslySetInnerHTML={{ __html: activeAbility.desc }}
                    />
                  ) : (
                    <p className="text-xs text-slate-500">Selecciona una habilidad.</p>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CreatorCard
// ---------------------------------------------------------------------------

function CreatorCard({
  creator,
  onShowVideos,
}: {
  creator: Creator;
  onShowVideos: () => void;
}) {
  return (
    <article
      onClick={onShowVideos}
      className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-700 bg-slate-800/60 p-3 shadow-sm transition hover:border-brand/40 hover:bg-slate-700/60 hover:shadow-md"
    >
      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${avatarColor(creator.id)}`}>
        {initials(creator.name)}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate font-bold text-slate-100 text-sm">{creator.name}</span>
        <span className="flex items-center gap-1">
          {/* Plataformas en fila horizontal — agregar mas entradas a medida que el creador tenga mas redes */}
          <a
            href={creator.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-800 p-1 text-slate-400 transition hover:border-brand hover:bg-brand/10 hover:text-brand-deep"
            title={PLATFORM_LABELS[creator.platform]}
          >
            {getPlatformIcon(creator.platform)}
          </a>
        </span>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------

export default function GuidesSection({ initialChampionId = null }: { initialChampionId?: string | null }) {
  const [champions, setChampions] = useState<ChampionLite[]>([]);
  const [isLoadingChampions, setIsLoadingChampions] = useState(true);
  const [ddVersion, setDdVersion] = useState("");
  const [selectedChampionId, setSelectedChampionId] = useState<string | null>(initialChampionId);
  const [search, setSearch] = useState("");
  const [selectedCreator, setSelectedCreator] = useState<Creator | null>(null);
  const [creatorFilter, setCreatorFilter] = useState<"all" | CreatorType>("all");

  useEffect(() => { setSelectedChampionId(initialChampionId); }, [initialChampionId]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const versRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        if (!versRes.ok) return;
        const versions = (await versRes.json()) as string[];
        const ver = versions[0];
        const champsRes = await fetch(`https://ddragon.leagueoflegends.com/cdn/${ver}/data/es_MX/champion.json`);
        if (!champsRes.ok) return;
        const json = (await champsRes.json()) as { data: Record<string, DataDragonChampion> };
        const mapped = Object.values(json.data)
          .map((c) => ({ id: c.id, name: c.name, icon: `https://ddragon.leagueoflegends.com/cdn/${ver}/img/champion/${c.image.full}` }))
          .sort((a, b) => a.name.localeCompare(b.name));
        if (active) { setChampions(mapped); setDdVersion(ver); }
      } finally {
        if (active) setIsLoadingChampions(false);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const championMap = useMemo(() => new Map(champions.map((c) => [c.id, c])), [champions]);

  const filteredChampions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return champions;
    return champions.filter((champ) => champ.name.toLowerCase().includes(q));
  }, [champions, search]);

  const selectedChampion = selectedChampionId ? (championMap.get(selectedChampionId) ?? null) : null;

  // Filtrado de creadores por nombre y tipo
  const filteredCreators = useMemo(() => {
    const q = search.trim().toLowerCase();
    let base = CREATORS;
    if (creatorFilter !== "all") {
      base = base.filter((c) => c.type === creatorFilter);
    }
    if (!q) return base;
    return base.filter((c) => c.name.toLowerCase().includes(q));
  }, [search, creatorFilter]);

  return (
    <div className="relative grid grid-cols-[200px_1fr] gap-5 items-start">
      {/* Overlay creador — tapa columna campeones + columna creadores */}
      {selectedCreator && (
        <div
          className="absolute inset-y-0 left-0 z-10 flex flex-col overflow-hidden rounded-2xl border border-brand/30 bg-panel shadow-2xl"
          style={{ width: "calc(200px + 1.25rem + (100% - 200px - 1.25rem) * 2 / 5)" }}
        >
          <div className="flex items-center justify-between border-b border-slate-700 p-4">
            <div className="flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${avatarColor(selectedCreator.id)}`}>
                {initials(selectedCreator.name)}
              </div>
              <div>
                <p className="font-bold text-slate-100">{selectedCreator.name}</p>
                <div className="mt-1 flex items-center gap-1">
                  <a
                    href={selectedCreator.channelUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-full border border-slate-700 bg-slate-800 p-1 text-slate-400 transition hover:border-brand hover:bg-brand/10 hover:text-brand-deep"
                    title={PLATFORM_LABELS[selectedCreator.platform]}
                  >
                    {getPlatformIcon(selectedCreator.platform)}
                  </a>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedCreator(null)}
              className="rounded-full border border-slate-700 bg-slate-800 p-2 text-slate-400 transition hover:border-brand hover:bg-brand/10 hover:text-brand-deep"
              title="Cerrar"
            >
              <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-700 bg-slate-800/50 py-12 text-center">
              <svg className="h-8 w-8 text-slate-600" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9a2.25 2.25 0 00-2.25-2.25h-9A2.25 2.25 0 002.25 7.5v9a2.25 2.25 0 002.25 2.25z" />
              </svg>
              <p className="text-sm font-semibold text-slate-400">Sin videos publicados</p>
              <p className="text-xs text-slate-500">Aun no hay videos de {selectedCreator.name} en esta pagina.</p>
            </div>
          </div>
        </div>
      )}

      {/* Columna izquierda: selector de campeon */}
      <div className="sticky top-16 flex flex-col gap-3 rounded-2xl border border-slate-700/60 bg-panel p-4 shadow-sm">
        <p className="font-mono text-[10px] uppercase tracking-wider text-brand-deep">Selecciona campeon</p>
        <input
          type="search"
          placeholder="Buscar campeon..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 outline-none placeholder:text-slate-500 focus:border-brand focus:ring-1 focus:ring-brand/30"
        />
        {isLoadingChampions ? (
          <div className="flex items-center justify-center py-10">
            <p className="text-xs text-slate-500">Cargando campeones...</p>
          </div>
        ) : (
          <div className="max-h-[420px] overflow-y-auto pr-0.5">
            <div className="flex flex-wrap">
              {/* Campeones filtrados */}
              {filteredChampions.length === 0 && search.trim() && (
                <div className="w-full py-8 text-center text-xs text-slate-500">No se encontraron campeones.</div>
              )}
              {filteredChampions.map((champ) => (
                <button
                  key={champ.id}
                  type="button"
                  onClick={() => { setSelectedChampionId(champ.id); setSelectedCreator(null); }}
                  title={champ.name}
                  className={`w-1/3 aspect-square flex items-center justify-center overflow-hidden rounded-full border-2 transition ${
                    selectedChampionId === champ.id
                      ? "border-brand ring-1 ring-brand/30"
                      : "border-transparent hover:border-brand/40"
                  }`}
                >
                  <img src={champ.icon} alt={champ.name} className="h-full w-full rounded-full object-cover bg-slate-800" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Columna derecha: guia o estado vacio */}
      <div className="flex-1">
        <ChampionGuideView
          championId={selectedChampionId}
          champion={selectedChampion}
          ddVersion={ddVersion}
          creators={filteredCreators}
          championMap={championMap}
          onClear={() => setSelectedChampionId(null)}
          onShowVideos={(creator) => setSelectedCreator(creator)}
          creatorFilter={creatorFilter}
          setCreatorFilter={setCreatorFilter}
        />
      </div>
    </div>
  );
}
