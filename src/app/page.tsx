"use client";

import { startTransition, useEffect, useState } from "react";
import AuthWidget from "./components/AuthWidget";
import ChampionsSection from "./components/ChampionsSection";
import CompositionsSection from "./components/CompositionsSection";
import GuidesSection from "./components/GuidesSection";
import ItemsSection from "./components/ItemsSection";
import MatchesSection from "./components/MatchesSection";
import RouletteSection from "./components/RouletteSection";
import RunesSection from "./components/RunesSection";

type Category = "Campeones" | "Items" | "Runas" | "Draft" | "Guias" | "Partidas" | "Ruleta";

const favoriteChampionsStorageKey = "aimplay.favoriteChampions";

const categoryContent: Record<Category, { title: string; desc: string }> = {
  Campeones: {
    title: "Seccion de Campeones",
    desc: "Aqui armaremos listado, counters, sinergias y matchups por campeon.",
  },
  Items: {
    title: "Seccion de Items",
    desc: "Aqui mostraremos todos los objetos y sus recomendaciones de uso.",
  },
  Runas: {
    title: "Seccion de Runas",
    desc: "Aqui irian arboles de runas, explicaciones y combinaciones utiles.",
  },
  Draft: {
    title: "Seccion de Draft",
    desc: "Aqui construiremos el comparador 5v5 con analisis por lado.",
  },
  Guias: {
    title: "Seccion de Guias",
    desc: "Aqui reuniremos tips, videos, OTPs y canales especializados por campeon.",
  },
  Partidas: {
    title: "Seccion de Partidas",
    desc: "Aqui se muestran los resultados de las cuentas de LoL vinculadas por los usuarios.",
  },
  Ruleta: {
    title: "Ruleta de Campeones",
    desc: "Gira la ruleta para elegir un campeon al azar.",
  },
};

function isCategory(value: string): value is Category {
  return (
    value === "Campeones" ||
    value === "Items" ||
    value === "Runas" ||
    value === "Draft" ||
    value === "Guias" ||
    value === "Partidas" ||
    value === "Ruleta"
  );
}

export default function Home() {
  const [activeCategory, setActiveCategory] = useState<string>("Campeones");
  const [favoriteChampionIds, setFavoriteChampionIds] = useState<string[]>([]);
  const [guidesChampionId, setGuidesChampionId] = useState<string | null>(null);

  const navigateToGuides = (championId: string) => {
    setGuidesChampionId(championId);
    setActiveCategory("Guias");
  };
  const categories: Category[] = [
    "Campeones",
    "Items",
    "Runas",
    "Draft",
    "Guias",
    "Partidas",
    "Ruleta",
  ];
  const safeActiveCategory =
    activeCategory === "Composiciones"
      ? "Draft"
      : isCategory(activeCategory)
        ? activeCategory
        : "Campeones";
  const fallbackContent = categoryContent[safeActiveCategory];

  useEffect(() => {
    const savedFavorites = window.localStorage.getItem(favoriteChampionsStorageKey);
    if (!savedFavorites) {
      return;
    }

    try {
      const parsedFavorites = JSON.parse(savedFavorites) as unknown;
      if (Array.isArray(parsedFavorites)) {
        const nextFavorites = parsedFavorites.filter((entry): entry is string => typeof entry === "string");
        startTransition(() => {
          setFavoriteChampionIds(nextFavorites);
        });
      }
    } catch {
      window.localStorage.removeItem(favoriteChampionsStorageKey);
    }
  }, []);

  useEffect(() => {
    window.localStorage.setItem(favoriteChampionsStorageKey, JSON.stringify(favoriteChampionIds));
  }, [favoriteChampionIds]);

  const toggleFavoriteChampion = (championId: string) => {
    setFavoriteChampionIds((prev) =>
      prev.includes(championId) ? prev.filter((id) => id !== championId) : [...prev, championId]
    );
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="relative z-40 border-b border-slate-700/60 bg-panel/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand text-xs font-extrabold text-white">
              AP
            </span>
            <div>
              <h1 className="text-2xl font-extrabold leading-none tracking-tight">Aim.Play</h1>
              <p className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">
                Web Companion
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <AuthWidget />
            <button className="rounded-lg border border-slate-600 bg-transparent px-3 py-1.5 font-semibold text-slate-300 transition hover:bg-slate-800">
              Pro
            </button>
          </div>
        </div>
      </header>

      <nav className="sticky top-0 z-30 border-b border-slate-700/70 bg-slate-900/70 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-6xl items-center px-6">
          {categories.map((category, idx) => {
            const active = safeActiveCategory === category;
            return (
              <div key={category} className="flex items-center">
                <button
                  onClick={() => setActiveCategory(category)}
                  className={`relative px-4 py-4 text-sm font-semibold tracking-wide transition ${
                    active
                      ? "text-brand-deep drop-shadow-[0_0_8px_rgba(45,212,196,0.5)]"
                      : "text-slate-400 hover:text-slate-100"
                  }`}
                >
                  {category}
                  <span
                    className={`absolute left-1/2 top-full h-[3px] w-[78%] -translate-x-1/2 rounded-full bg-brand transition ${
                      active ? "opacity-100" : "opacity-0"
                    }`}
                  />
                </button>
                {idx < categories.length - 1 && (
                  <span className="h-7 w-px bg-slate-600/60" aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>
      </nav>

      <main className="mx-auto w-full max-w-6xl px-6 py-10">
        {safeActiveCategory === "Campeones" ? (
          <ChampionsSection
            favoriteChampionIds={favoriteChampionIds}
            onToggleFavoriteChampion={toggleFavoriteChampion}
            onNavigateToGuides={navigateToGuides}
          />
        ) : safeActiveCategory === "Items" ? (
          <ItemsSection />
        ) : safeActiveCategory === "Runas" ? (
          <RunesSection />
        ) : safeActiveCategory === "Draft" ? (
          <CompositionsSection favoriteChampionIds={favoriteChampionIds} />
        ) : safeActiveCategory === "Guias" ? (
          <GuidesSection initialChampionId={guidesChampionId} />
        ) : safeActiveCategory === "Partidas" ? (
          <MatchesSection />
        ) : safeActiveCategory === "Ruleta" ? (
          <RouletteSection />
        ) : (
          <section className="rounded-2xl border border-slate-700 bg-panel p-8 shadow-sm">
            <p className="mb-1 font-mono text-xs uppercase tracking-wider text-brand-deep">
              Seccion activa
            </p>
            <h2 className="text-3xl font-extrabold tracking-tight">
              {fallbackContent.title}
            </h2>
            <p className="mt-3 max-w-2xl text-ink-soft">
              {fallbackContent.desc}
            </p>
            <p className="mt-8 text-sm text-slate-500">
              Dime como quieres esta seccion y la armamos visualmente tal cual a tu idea.
            </p>
          </section>
        )}
      </main>

      <footer className="mt-auto border-t border-slate-700/70 bg-slate-900/80">
        <div className="mx-auto w-full max-w-6xl px-6 py-4 text-xs text-slate-500">
          Aim.Play no esta afiliado ni respaldado por Riot Games.
        </div>
      </footer>
    </div>
  );
}
