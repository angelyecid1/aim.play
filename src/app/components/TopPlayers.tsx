"use client";

import { useEffect, useMemo, useState } from "react";

interface LeaderboardEntry {
  platform: string;
  tier: string;
  rank: number;
  gameName: string;
  tagLine: string;
  leaguePoints: number;
  wins: number;
  losses: number;
}

const platformLabels: Record<string, string> = { la1: "LAN", la2: "LAS" };
const tierLabels: Record<string, string> = {
  CHALLENGER: "Challenger",
  GRANDMASTER: "Grandmaster",
  MASTER: "Master",
};
const tierOrder = ["CHALLENGER", "GRANDMASTER", "MASTER"];

export default function TopPlayers({
  onSelect,
}: {
  onSelect: (entry: { gameName: string; tagLine: string; platform: string }) => void;
}) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/leaderboard")
      .then((res) => res.json())
      .then((data) => setEntries(data as LeaderboardEntry[]))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const groups = useMemo(() => {
    const byPlatform = new Map<string, Map<string, LeaderboardEntry[]>>();
    for (const entry of entries) {
      if (!byPlatform.has(entry.platform)) byPlatform.set(entry.platform, new Map());
      const byTier = byPlatform.get(entry.platform)!;
      if (!byTier.has(entry.tier)) byTier.set(entry.tier, []);
      byTier.get(entry.tier)!.push(entry);
    }
    return byPlatform;
  }, [entries]);

  if (loading) {
    return <p className="mb-4 text-sm text-slate-400">Cargando ranking...</p>;
  }

  if (groups.size === 0) {
    return null;
  }

  return (
    <div className="mb-4 rounded-xl border border-cyan-900/40 bg-slate-950/40 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
        Top jugadores
      </p>
      <div className="space-y-3">
        {[...groups.entries()].map(([platform, byTier]) => (
          <div key={platform}>
            <p className="mb-1.5 text-xs font-semibold text-slate-400">
              {platformLabels[platform] ?? platform.toUpperCase()}
            </p>
            <div className="space-y-2">
              {tierOrder
                .filter((tier) => byTier.has(tier))
                .map((tier) => (
                  <div key={tier}>
                    <p className="mb-1 text-[11px] uppercase tracking-wide text-slate-500">
                      {tierLabels[tier] ?? tier}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {byTier
                        .get(tier)!
                        .sort((a, b) => a.rank - b.rank)
                        .map((entry) => (
                          <button
                            key={`${entry.platform}-${entry.tier}-${entry.rank}`}
                            onClick={() =>
                              onSelect({
                                gameName: entry.gameName,
                                tagLine: entry.tagLine,
                                platform: entry.platform,
                              })
                            }
                            title={`${entry.leaguePoints} LP · ${entry.wins}V/${entry.losses}D`}
                            className="rounded-lg border border-slate-700/60 px-2 py-1 text-xs text-slate-300 transition hover:border-cyan-400/60 hover:text-cyan-200"
                          >
                            #{entry.rank} {entry.gameName}#{entry.tagLine}
                          </button>
                        ))}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
