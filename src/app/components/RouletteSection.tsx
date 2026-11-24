"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getChampionRoles } from "@/lib/championRoles";

interface Champion {
  id: string;
  name: string;
  icon: string;
  splash: string;
  roles: string[];
}

interface DataDragonChampion {
  id: string;
  name: string;
  tags: string[];
  image: {
    full: string;
  };
}

// Mismos roles ("Top", "Jungla", "Mid", "ADC", "Soporte") que ya se corrigieron
// a mano en ChampionsSection, via getChampionRoles — asi el filtro de rol de
// la ruleta coincide con lo que el sitio ya muestra en la pestaña Campeones,
// en vez de usar su propia heuristica de etiquetas por separado.
const roleFilters: string[] = ["Todos", "Top", "Jungla", "Mid", "ADC", "Soporte"];

const ITEM_WIDTH = 104;
const VISIBLE_WINDOW = 700;
const CENTER_OFFSET = VISIBLE_WINDOW / 2 - ITEM_WIDTH / 2;
// Cuantas vueltas completas al mazo (barajado) recorre la tira antes de parar,
// mas un colchon de items despues del ganador para que nunca se sienta un "final".
const LAPS_BEFORE_LANDING = 3;
const BUFFER_AFTER_WINNER = 12;
const SPIN_DURATION_MS = 4200;

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Arma la tira concatenando barajadas completas del mazo (para que dentro de
 * cada vuelta no se repita ningun campeon), evitando que el ultimo de una
 * barajada coincida con el primero de la siguiente.
 */
function buildDeckStrip<T>(pool: T[], laps: number): T[] {
  const strip: T[] = [];
  for (let lap = 0; lap < laps; lap++) {
    let next = shuffled(pool);
    if (strip.length > 0 && pool.length > 1) {
      while (next[0] === strip[strip.length - 1]) {
        next = shuffled(pool);
      }
    }
    strip.push(...next);
  }
  return strip;
}

export default function RouletteSection() {
  const [champions, setChampions] = useState<Champion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [roleFilter, setRoleFilter] = useState<(typeof roleFilters)[number]>("Todos");

  const [strip, setStrip] = useState<Champion[]>([]);
  const [translateX, setTranslateX] = useState(0);
  const [transitionOn, setTransitionOn] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [winner, setWinner] = useState<Champion | null>(null);
  const spinTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;

    const loadChampions = async () => {
      try {
        setIsLoading(true);
        setLoadError(null);

        const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        const versions = (await versionsRes.json()) as string[];
        const latestVersion = versions[0];

        const championsRes = await fetch(
          `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/es_MX/champion.json`
        );
        const championsJson = (await championsRes.json()) as {
          data: Record<string, DataDragonChampion>;
        };

        const mapped = Object.values(championsJson.data)
          .map((champion) => ({
            id: champion.id,
            name: champion.name,
            icon: `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${champion.image.full}`,
            splash: `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${champion.id}_0.jpg`,
            roles: getChampionRoles(champion.id, champion.tags),
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        if (active) {
          setChampions(mapped);
          setStrip(shuffled(mapped).slice(0, 12));
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
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (spinTimeoutRef.current) clearTimeout(spinTimeoutRef.current);
    };
  }, []);

  const pool = useMemo(() => {
    if (roleFilter === "Todos") return champions;
    const filtered = champions.filter((c) => c.roles.includes(roleFilter));
    return filtered.length > 0 ? filtered : champions;
  }, [champions, roleFilter]);

  const handleSpin = () => {
    if (spinning || pool.length === 0) return;

    const target = pickRandom(pool);
    const laps = buildDeckStrip(pool, LAPS_BEFORE_LANDING);
    const buffer = shuffled(pool).slice(0, Math.min(BUFFER_AFTER_WINNER, pool.length - 1));
    const winnerIndex = laps.length;
    const newStrip = [...laps, target, ...buffer];

    setWinner(null);
    setSpinning(true);
    setTransitionOn(false);
    setStrip(newStrip);
    setTranslateX(0);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setTransitionOn(true);
        setTranslateX(CENTER_OFFSET - winnerIndex * ITEM_WIDTH);
      });
    });

    spinTimeoutRef.current = setTimeout(() => {
      setSpinning(false);
      setWinner(target);
    }, SPIN_DURATION_MS);
  };

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-cyan-900/40 bg-[linear-gradient(180deg,rgba(8,47,73,0.9),rgba(2,12,27,0.98))] p-5 shadow-[0_18px_45px_rgba(2,12,27,0.45)]">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
          Aleatorio
        </p>
        <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-white">Ruleta de Campeones</h2>
        <p className="mt-1 text-sm text-slate-400">
          Gira y deja que el azar elija tu campeon.
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          {roleFilters.map((role) => (
            <button
              key={role}
              type="button"
              onClick={() => setRoleFilter(role)}
              disabled={spinning}
              className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
                roleFilter === role
                  ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-100"
                  : "border-slate-700/60 text-slate-400 hover:border-cyan-600/50"
              }`}
            >
              {role}
            </button>
          ))}
        </div>

        {isLoading ? <p className="mt-6 text-sm text-slate-300">Cargando campeones...</p> : null}
        {loadError ? <p className="mt-6 text-sm text-rose-300">{loadError}</p> : null}

        {!isLoading && !loadError ? (
          <>
            <div
              className="relative mt-6 overflow-hidden rounded-xl border border-cyan-900/40 bg-slate-950/60"
              style={{ width: VISIBLE_WINDOW, maxWidth: "100%", margin: "0 auto" }}
            >
              <div
                className="pointer-events-none absolute inset-y-0 z-10 w-[2px] bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,0.9)]"
                style={{ left: "50%" }}
              />
              <div
                className="flex items-center py-3"
                style={{
                  transform: `translateX(${translateX}px)`,
                  transition: transitionOn
                    ? `transform ${SPIN_DURATION_MS}ms cubic-bezier(0.12, 0.72, 0.15, 1)`
                    : "none",
                }}
              >
                {strip.map((champion, index) => (
                  <div
                    key={`${champion.id}-${index}`}
                    className="flex shrink-0 flex-col items-center gap-1"
                    style={{ width: ITEM_WIDTH }}
                  >
                    <img
                      src={champion.icon}
                      alt={champion.name}
                      className="h-16 w-16 rounded-lg border border-slate-700/60 object-cover"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-5 flex justify-center">
              <button
                type="button"
                onClick={handleSpin}
                disabled={spinning || pool.length === 0}
                className="rounded-xl bg-brand px-8 py-3 text-sm font-extrabold uppercase tracking-wide text-slate-900 transition hover:bg-brand/80 disabled:opacity-60"
              >
                {spinning ? "Girando..." : "Girar"}
              </button>
            </div>
          </>
        ) : null}
      </section>

      {winner ? (
        <section className="overflow-hidden rounded-2xl border border-amber-400/40 bg-[linear-gradient(180deg,rgba(8,47,73,0.9),rgba(2,12,27,0.98))] shadow-[0_18px_45px_rgba(2,12,27,0.45)]">
          <div className="relative h-56 w-full">
            <img
              src={winner.splash}
              alt={winner.name}
              className="h-full w-full object-cover object-top"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/20 to-transparent" />
          </div>
          <div className="p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300/90">
              Salió
            </p>
            <h3 className="mt-1 text-3xl font-extrabold tracking-tight text-white">{winner.name}</h3>
          </div>
        </section>
      ) : null}
    </div>
  );
}
