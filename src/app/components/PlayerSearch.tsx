"use client";

import { useState } from "react";

// La region real se detecta sola del dato de la propia partida al sincronizar
// (ver syncRiotAccount), asi que aqui no hace falta que el usuario la elija.
const PLACEHOLDER_PLATFORM = "unknown";

export interface FoundRiotAccount {
  id: string;
  gameName: string;
  tagLine: string;
  userId: string | null;
}

export default function PlayerSearch({
  onFound,
}: {
  onFound: (riotAccount: FoundRiotAccount) => void;
}) {
  const [riotId, setRiotId] = useState("");
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSearch = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    // El "#" separa nombre y tag en un Riot ID; no esta permitido dentro
    // del nombre, asi que separar por el primero que aparezca es seguro.
    const hashIndex = riotId.indexOf("#");
    if (hashIndex === -1) {
      setError('Escribe el ID completo con "#", ej: Nombre#TAG');
      return;
    }
    const gameName = riotId.slice(0, hashIndex).trim();
    const tagLine = riotId.slice(hashIndex + 1).trim();
    if (!gameName || !tagLine) {
      setError('Escribe el ID completo con "#", ej: Nombre#TAG');
      return;
    }

    setSearching(true);

    try {
      const res = await fetch("/api/riot/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gameName, tagLine, platform: PLACEHOLDER_PLATFORM }),
      });
      const data = await res.json();

      if (!res.ok) {
        // "error" es nuestro; "status.message" es el error crudo de Riot
        // (ej. key vencida, rate limit) — no lo tapamos con un generico.
        setError(data.error ?? data.status?.message ?? "No se encontro esa cuenta");
        return;
      }

      // Buscar es solo consultar: no asocia nada solo. Vincular a un
      // perfil es una accion explicita aparte (boton "Asociar a mi perfil").
      onFound(data.riotAccount);
    } catch {
      setError("No se pudo conectar con el servidor");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-cyan-900/40 bg-slate-950/40 p-4">
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300/80">
        Buscar cualquier jugador
      </p>
      <form onSubmit={handleSearch} className="flex flex-wrap items-center gap-2">
        <input
          value={riotId}
          onChange={(event) => setRiotId(event.target.value)}
          placeholder="Nombre#TAG"
          required
          className="w-48 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/70"
        />
        <button
          type="submit"
          disabled={searching}
          className="rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-brand/80 disabled:opacity-60"
        >
          {searching ? "Buscando..." : "Buscar"}
        </button>
      </form>
      {searching ? (
        <p className="mt-2 text-xs text-cyan-300/80">
          Si es la primera vez que se busca este ID, puede tardar unos segundos en traer su
          historial — las próximas veces será casi instantáneo.
        </p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
    </div>
  );
}
