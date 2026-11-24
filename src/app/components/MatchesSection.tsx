"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import PlayerSearch, { FoundRiotAccount } from "./PlayerSearch";
import TopPlayers from "./TopPlayers";

const PLACEHOLDER_PLATFORM = "unknown";
const MAX_LINKED_ACCOUNTS = 3;
// 20 por defecto, "Ver mas" trae de a 10 hasta un tope de 30 — nunca se
// cargan las 30 de una. El tope es el mismo para todos por ahora, no hay
// todavia una version Pro que lo diferencie.
const DEFAULT_MATCH_LIMIT = 20;
const MAX_MATCH_LIMIT = 30;
const MATCH_LIMIT_STEP = 10;

interface MatchEntry {
  matchId: string;
  gameCreation: string;
  gameDuration: number;
  queueId: number;
  patch: string;
  playerName: string;
  championName: string;
  win: boolean;
  kills: number;
  deaths: number;
  assists: number;
  goldEarned: number;
  totalDamageDealtToChampions: number;
  items: number[];
  roleBoundItem: number | null;
  teamPosition: string | null;
  timeBuckets:
    | Array<{
        startMs: number;
        endMs: number;
        kills: number;
        deaths: number;
        assists: number;
        goldGained: number;
        damageToChampionsGained: number;
      }>
    | null;
}

const queueLabels: Record<number, string> = {
  400: "Normal (Blind)",
  420: "Ranked Solo/Duo",
  430: "Normal (Draft)",
  440: "Ranked Flex",
  450: "ARAM",
};

function formatDuration(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

// Riot devuelve "FiddleSticks" (S mayuscula) en el nombre de campeon de las
// partidas, pero el archivo real en Data Dragon es "Fiddlesticks.png" (s
// minuscula) — es el unico campeon con esta inconsistencia entre las 171
// variantes que existen en los datos reales guardados.
const championImageIdOverrides: Record<string, string> = {
  FiddleSticks: "Fiddlesticks",
};

function championImageId(championName: string) {
  return championImageIdOverrides[championName] ?? championName;
}

function formatKdaRatio(kills: number, deaths: number, assists: number) {
  const ratio = deaths === 0 ? kills + assists : (kills + assists) / deaths;
  return ratio.toFixed(2);
}

// Recuerda cuantas partidas tenia cargadas (20 o 30) y que bloque de
// tiempo tenia seleccionado, por cuenta vista — asi cambiar de pestaña y
// volver no reinicia la vista a cero. Vive solo en esta pestaña del
// navegador (no en el servidor): es preferencia de pantalla, no un dato
// que otro dispositivo necesite ver igual.
interface StoredView {
  matchLimit: number;
  selectedBucket: number | null;
}

function viewStorageKey(riotAccountId: string) {
  return `aimplay:matches-view:${riotAccountId}`;
}

function getStoredView(riotAccountId: string): StoredView | null {
  try {
    const raw = sessionStorage.getItem(viewStorageKey(riotAccountId));
    return raw ? (JSON.parse(raw) as StoredView) : null;
  } catch {
    return null;
  }
}

function setStoredView(riotAccountId: string, view: StoredView) {
  try {
    sessionStorage.setItem(viewStorageKey(riotAccountId), JSON.stringify(view));
  } catch {
    // sessionStorage no disponible (modo privado, etc.) — no es critico, simplemente no se recuerda.
  }
}

// Recuerda a QUIEN se estaba viendo por busqueda (no la cuenta propia del
// usuario logueado, esa ya se retoma sola via /api/auth/me) — sin esto,
// cambiar a otra pestaña (Campeones, Items, Runas...) y volver obligaba a
// escribir la busqueda de nuevo, porque el componente se destruye y se
// vuelve a armar de cero cada vez que se cambia de pestaña.
const SEARCHED_PLAYER_KEY = "aimplay:matches-searched-player";

function getStoredSearchedPlayer(): FoundRiotAccount | null {
  try {
    const raw = sessionStorage.getItem(SEARCHED_PLAYER_KEY);
    return raw ? (JSON.parse(raw) as FoundRiotAccount) : null;
  } catch {
    return null;
  }
}

function setStoredSearchedPlayer(player: FoundRiotAccount | null) {
  try {
    if (player) sessionStorage.setItem(SEARCHED_PLAYER_KEY, JSON.stringify(player));
    else sessionStorage.removeItem(SEARCHED_PLAYER_KEY);
  } catch {
    // sessionStorage no disponible — no es critico, simplemente no se recuerda.
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Separa el build final real de Riot en: ward (tag "Trinket"), espacio de
 * mision por rol (`roleBoundItem`: botas en ADC/mid, ward roja en support,
 * huevo en jungla, teleport en top), y los 6 items normales.
 */
function sortItemsForDisplay(
  itemIds: number[],
  itemTags: Record<string, string[]>,
  roleBoundItem: number | null
) {
  const isTrinket = (id: number) => itemTags[id]?.includes("Trinket") ?? false;
  // Solo puedes tener un ward a la vez; si el dato reconstruido trae mas de
  // uno (casos raros de Riot con el evento de deshacer compra), nos quedamos
  // con el mas reciente para no mostrar un duplicado imposible.
  const trinket = itemIds.filter(isTrinket).slice(-1);
  const rest = itemIds.filter((id) => !isTrinket(id));
  const fixed = roleBoundItem !== null ? [...trinket, roleBoundItem] : trinket;
  return { fixed, rest };
}

export default function MatchesSection() {
  const [matches, setMatches] = useState<MatchEntry[]>([]);
  const [ddragonVersion, setDdragonVersion] = useState<string | null>(null);
  const [itemTags, setItemTags] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<number | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; emailVerified: boolean } | null>(
    null
  );
  // Cuentas propias del usuario logueado (hasta 3), vista por defecto la
  // primera; se puede cambiar entre ellas sin volver a buscar.
  const [myAccounts, setMyAccounts] = useState<
    Array<{ riotAccountId: string; gameName: string; tagLine: string }>
  >([]);
  const [activeMyAccountId, setActiveMyAccountId] = useState<string | null>(null);
  // Solo se llena cuando el usuario usa el buscador explicitamente.
  const [searchedPlayer, setSearchedPlayer] = useState<FoundRiotAccount | null>(null);
  const [linkStatus, setLinkStatus] = useState<{ loading: boolean; error: string | null }>({
    loading: false,
    error: null,
  });
  // Cuenta que se esta mostrando ahora mismo (para que "Ver mas" sepa a
  // quien volver a pedirle mas partidas) y cuantas se estan pidiendo.
  const [viewingAccountId, setViewingAccountId] = useState<string | undefined>(undefined);
  const [matchLimit, setMatchLimit] = useState(DEFAULT_MATCH_LIMIT);
  const [loadingMore, setLoadingMore] = useState(false);
  // Se prendio cuando se pidieron mas partidas (incluyendo traerlas de
  // Riot si hacia falta) y aun asi no habia suficientes — esta cuenta ya
  // no tiene mas historial disponible por ahora.
  const [noMoreMatches, setNoMoreMatches] = useState(false);
  // Partida cuyas estadisticas por tiempo se estan pidiendo bajo demanda
  // ahora mismo (ver analyzeMatch) — solo una a la vez tiene sentido, es
  // por click, no una carga automatica de toda la lista.
  const [analyzingMatchId, setAnalyzingMatchId] = useState<string | null>(null);

  const loadDdragonData = useCallback(async () => {
    const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
    const versions = (await versionsRes.json()) as string[];
    const latestVersion = versions[0];

    const itemsRes = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/es_MX/item.json`
    );
    const itemsJson = (await itemsRes.json()) as {
      data: Record<string, { tags?: string[] }>;
    };
    const tags = Object.fromEntries(
      Object.entries(itemsJson.data).map(([id, item]) => [id, item.tags ?? []])
    );

    setDdragonVersion(latestVersion);
    setItemTags(tags);
  }, []);

  const loadMatches = useCallback(async (riotAccountId?: string) => {
    // Si ya se habia visto esta cuenta en esta pestaña (antes de cambiar a
    // otra seccion y volver), se retoma cuantas partidas tenia cargadas y
    // que bloque de tiempo tenia seleccionado en vez de reiniciar a cero.
    const stored = riotAccountId ? getStoredView(riotAccountId) : null;
    const limit = stored?.matchLimit ?? DEFAULT_MATCH_LIMIT;

    try {
      setIsLoading(true);
      setLoadError(null);
      setViewingAccountId(riotAccountId);
      setMatchLimit(limit);
      setSelectedBucket(stored?.selectedBucket ?? null);
      setNoMoreMatches(false);

      const params = new URLSearchParams({ limit: String(limit) });
      if (riotAccountId) params.set("riotAccountId", riotAccountId);
      const matchesUrl = `/api/matches?${params.toString()}`;

      const matchesRes = await fetch(matchesUrl);
      if (!matchesRes.ok) {
        const data = await matchesRes.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudieron cargar las partidas.");
      }

      setMatches((await matchesRes.json()) as MatchEntry[]);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Error al cargar partidas.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Trae 10 mas (hasta el tope) sin recargar todo desde el principio como
  // si fuera una busqueda nueva — mismo listado, solo se extiende. Si lo ya
  // guardado no alcanza para completar el pedido (ej. una cuenta nueva que
  // solo trajo sus primeras 20 al buscarla), primero se le pide a Riot las
  // que falten antes de volver a consultar — el boton se queda en
  // "Cargando..." todo ese tiempo, no desaparece hasta que de verdad hay
  // algo nuevo que mostrar (o se confirma que no hay mas).
  const loadMoreMatches = useCallback(async () => {
    const nextLimit = Math.min(matchLimit + MATCH_LIMIT_STEP, MAX_MATCH_LIMIT);
    if (nextLimit === matchLimit || !viewingAccountId) return;

    setLoadingMore(true);
    setNoMoreMatches(false);
    try {
      if (matches.length < nextLimit) {
        await fetch("/api/matches/load-more", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            riotAccountId: viewingAccountId,
            additionalCount: nextLimit - matches.length,
          }),
        }).catch(() => {
          // Si falla traer mas de Riot, igual se intenta mostrar lo que ya
          // haya guardado (mejor eso que quedarse trabado).
        });
      }

      const params = new URLSearchParams({ limit: String(nextLimit), riotAccountId: viewingAccountId });
      const res = await fetch(`/api/matches?${params.toString()}`);
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error ?? "No se pudieron cargar mas partidas.");
      }

      const nextMatches = (await res.json()) as MatchEntry[];
      setMatches(nextMatches);
      setMatchLimit(nextLimit);
      setStoredView(viewingAccountId, { matchLimit: nextLimit, selectedBucket });
      if (nextMatches.length < nextLimit) setNoMoreMatches(true);
    } catch {
      // Se puede reintentar tocando el boton de nuevo.
    } finally {
      setLoadingMore(false);
    }
  }, [matchLimit, viewingAccountId, selectedBucket, matches.length]);

  // Estadisticas por tiempo bajo demanda de una partida puntual — ya no se
  // calculan solas para toda la lista, se piden una por una cuando el
  // usuario realmente quiere verlas (ver /api/matches/[matchId]/analyze).
  const analyzeMatch = useCallback(
    async (matchId: string) => {
      if (!viewingAccountId) return;
      setAnalyzingMatchId(matchId);
      try {
        const res = await fetch(`/api/matches/${matchId}/analyze`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ riotAccountId: viewingAccountId }),
        });
        if (!res.ok) return;
        const data = (await res.json()) as { timeBuckets: MatchEntry["timeBuckets"] };
        setMatches((prev) =>
          prev.map((m) => (m.matchId === matchId ? { ...m, timeBuckets: data.timeBuckets } : m))
        );
      } catch {
        // Se puede reintentar tocando el boton de nuevo.
      } finally {
        setAnalyzingMatchId(null);
      }
    },
    [viewingAccountId]
  );

  // Sin login ni busqueda no mostramos nada: si ya hay sesion con cuentas
  // vinculadas, mostramos la primera de una vez; si no, queda vacio hasta
  // que el usuario busque a alguien. Si ya se estaba viendo a alguien por
  // busqueda antes de cambiar a otra pestaña (Campeones, Items...), eso se
  // retoma primero — sin esto, cambiar de pestaña y volver obligaba a
  // escribir la busqueda de nuevo cada vez.
  useEffect(() => {
    void loadDdragonData();

    const storedSearchedPlayer = getStoredSearchedPlayer();
    if (storedSearchedPlayer) {
      setSearchedPlayer(storedSearchedPlayer);
      void loadMatches(storedSearchedPlayer.id);
    }

    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        if (data.user) {
          setCurrentUser({ id: data.user.id, emailVerified: data.user.emailVerified });
        }

        const accounts = (
          (data.riotAccounts ?? []) as Array<{ id: string; gameName: string; tagLine: string }>
        ).map((account) => ({
          riotAccountId: account.id,
          gameName: account.gameName,
          tagLine: account.tagLine,
        }));
        setMyAccounts(accounts);

        if (accounts[0]) {
          setActiveMyAccountId(accounts[0].riotAccountId);
          if (!storedSearchedPlayer) void loadMatches(accounts[0].riotAccountId);
        } else if (!storedSearchedPlayer) {
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!storedSearchedPlayer) setIsLoading(false);
      });
  }, [loadDdragonData, loadMatches]);

  // "Quitar busqueda" vuelve a tu cuenta activa (si estas logueado) o queda vacio.
  const clearSearch = useCallback(() => {
    setSearchedPlayer(null);
    setStoredSearchedPlayer(null);
    setLinkStatus({ loading: false, error: null });
    if (activeMyAccountId) {
      void loadMatches(activeMyAccountId);
    } else {
      setMatches([]);
    }
  }, [activeMyAccountId, loadMatches]);

  const switchMyAccount = useCallback(
    (riotAccountId: string) => {
      setSearchedPlayer(null);
      setStoredSearchedPlayer(null);
      setLinkStatus({ loading: false, error: null });
      setActiveMyAccountId(riotAccountId);
      void loadMatches(riotAccountId);
    },
    [loadMatches]
  );

  // Libera el cupo (de 3) sin borrar la cuenta ni sus partidas: solo deja
  // de aparecer como atajo en "Mis cuentas".
  const removeMyAccount = useCallback(
    async (riotAccountId: string) => {
      try {
        const res = await fetch("/api/riot/account", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ riotAccountId }),
        });
        if (!res.ok) return;

        setMyAccounts((prev) => prev.filter((account) => account.riotAccountId !== riotAccountId));
        if (activeMyAccountId === riotAccountId) {
          setActiveMyAccountId(null);
          setMatches([]);
        }
      } catch {
        // sin conexion: se puede reintentar
      }
    },
    [activeMyAccountId]
  );

  const handleLinkSearchedPlayer = useCallback(async () => {
    if (!searchedPlayer) return;
    setLinkStatus({ loading: true, error: null });

    try {
      const res = await fetch("/api/riot/account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gameName: searchedPlayer.gameName,
          tagLine: searchedPlayer.tagLine,
          platform: PLACEHOLDER_PLATFORM,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setLinkStatus({ loading: false, error: data.error ?? "No se pudo asociar" });
        return;
      }

      setMyAccounts((prev) => [
        ...prev,
        {
          riotAccountId: data.riotAccount.id,
          gameName: data.riotAccount.gameName,
          tagLine: data.riotAccount.tagLine,
        },
      ]);
      setSearchedPlayer((prev) => {
        if (!prev) return prev;
        const updated = { ...prev, userId: currentUser?.id ?? null };
        setStoredSearchedPlayer(updated);
        return updated;
      });
      setLinkStatus({ loading: false, error: null });
    } catch {
      setLinkStatus({ loading: false, error: "No se pudo conectar con el servidor" });
    }
  }, [searchedPlayer, currentUser]);

  // Un click en el ranking hace lo mismo que buscarlo a mano: reusa el
  // mismo endpoint publico de busqueda, solo que ya con el nombre/tag
  // conocidos en vez de que el usuario los escriba.
  const handleTopPlayerSelect = useCallback(
    async (entry: { gameName: string; tagLine: string; platform: string }) => {
      setLinkStatus({ loading: false, error: null });
      setIsLoading(true);
      setLoadError(null);

      try {
        const res = await fetch("/api/riot/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
        const data = await res.json();

        if (!res.ok) {
          setLoadError(data.error ?? data.status?.message ?? "No se pudo cargar ese jugador");
          setIsLoading(false);
          return;
        }

        setSearchedPlayer(data.riotAccount);
        setStoredSearchedPlayer(data.riotAccount);
        void loadMatches(data.riotAccount.id);
      } catch {
        setLoadError("No se pudo conectar con el servidor");
        setIsLoading(false);
      }
    },
    [loadMatches]
  );

  const maxBucketCount = useMemo(
    () => matches.reduce((max, match) => Math.max(max, match.timeBuckets?.length ?? 0), 0),
    [matches]
  );

  const selectBucket = useCallback(
    (bucket: number | null) => {
      setSelectedBucket(bucket);
      if (viewingAccountId) setStoredView(viewingAccountId, { matchLimit, selectedBucket: bucket });
    },
    [viewingAccountId, matchLimit]
  );

  return (
    <section className="rounded-2xl border border-cyan-900/40 bg-[linear-gradient(180deg,rgba(8,47,73,0.9),rgba(2,12,27,0.98))] p-5 shadow-[0_18px_45px_rgba(2,12,27,0.45)]">
      <PlayerSearch
        onFound={(riotAccount) => {
          setSearchedPlayer(riotAccount);
          setStoredSearchedPlayer(riotAccount);
          setLinkStatus({ loading: false, error: null });
          void loadMatches(riotAccount.id);
        }}
      />

      <TopPlayers onSelect={handleTopPlayerSelect} />

      {myAccounts.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-cyan-300/80">
            Mis cuentas:
          </span>
          {myAccounts.map((account) => (
            <span
              key={account.riotAccountId}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                !searchedPlayer && activeMyAccountId === account.riotAccountId
                  ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-100"
                  : "border-slate-700/60 text-slate-400"
              }`}
            >
              <button
                onClick={() => switchMyAccount(account.riotAccountId)}
                className="hover:text-cyan-200"
              >
                {account.gameName}#{account.tagLine}
              </button>
              <button
                onClick={() => removeMyAccount(account.riotAccountId)}
                title="Quitar de mis cuentas"
                className="text-slate-500 hover:text-rose-300"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}

      {searchedPlayer ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2 text-sm text-cyan-100">
          Viendo a{" "}
          <span className="font-semibold">
            {searchedPlayer.gameName}#{searchedPlayer.tagLine}
          </span>
          {currentUser?.emailVerified && searchedPlayer.userId === currentUser.id ? (
            <span className="text-xs text-emerald-300">Ya es tuya</span>
          ) : null}
          {currentUser?.emailVerified &&
          searchedPlayer.userId !== currentUser.id &&
          myAccounts.length < MAX_LINKED_ACCOUNTS ? (
            <button
              onClick={handleLinkSearchedPlayer}
              disabled={linkStatus.loading}
              className="rounded-lg border border-emerald-400/50 px-2 py-1 text-xs font-semibold text-emerald-200 transition hover:bg-emerald-400/10 disabled:opacity-60"
            >
              {linkStatus.loading ? "Asociando..." : "Asociar a mi perfil"}
            </button>
          ) : null}
          <button
            onClick={clearSearch}
            className="ml-auto rounded-lg border border-cyan-400/50 px-2 py-1 text-xs font-semibold hover:bg-cyan-400/10"
          >
            Quitar busqueda
          </button>
        </div>
      ) : null}

      {linkStatus.error ? <p className="mb-4 text-xs text-rose-300">{linkStatus.error}</p> : null}

      {maxBucketCount > 0 ? (
        <div className="sticky top-[52px] z-20 mb-4 -mx-5 border-b border-cyan-900/40 bg-[#0a1f33]/95 px-5 py-3 backdrop-blur">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-cyan-300/80">
            Ver bloque de tiempo:
          </span>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            <button
              onClick={() => selectBucket(null)}
              className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                selectedBucket === null
                  ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-100"
                  : "border-slate-700/60 text-slate-400 hover:border-cyan-600/50"
              }`}
            >
              Partida completa
            </button>
            {Array.from({ length: maxBucketCount }).map((_, index) => (
              <button
                key={index}
                onClick={() => selectBucket(index)}
                className={`shrink-0 rounded-lg border px-2 py-1 text-xs font-semibold transition ${
                  selectedBucket === index
                    ? "border-cyan-400/70 bg-cyan-400/10 text-cyan-100"
                    : "border-slate-700/60 text-slate-400 hover:border-cyan-600/50"
                }`}
              >
                {index * 5}-{index * 5 + 5} min
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {isLoading ? (
        <p className="text-sm text-slate-300">
          Cargando partidas... (si es la primera vez que se ve este jugador, puede tardar unos
          segundos; las próximas veces será casi instantáneo)
        </p>
      ) : null}
      {loadError ? <p className="text-sm text-rose-300">{loadError}</p> : null}

      {!isLoading && !loadError && matches.length === 0 ? (
        <p className="text-sm text-slate-400">
          Busca un jugador arriba, o inicia sesion para ver el historial de partidas.
        </p>
      ) : null}

      {!isLoading && !loadError && matches.length > 0 ? (
        <div className="space-y-2">
          {matches.map((match) => {
            const bucket =
              selectedBucket !== null ? match.timeBuckets?.[selectedBucket] ?? null : null;
            const outOfRange = selectedBucket !== null && !bucket;

            return (
              <div
                key={`${match.matchId}-${match.playerName}`}
                className={`flex flex-col gap-2 rounded-xl border p-3 ${
                  match.win
                    ? "border-cyan-500/30 bg-cyan-400/5"
                    : "border-rose-500/30 bg-rose-400/5"
                } ${outOfRange ? "opacity-40" : ""}`}
              >
              <div className="flex flex-wrap items-center gap-4">
                {ddragonVersion ? (
                  <img
                    src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/champion/${championImageId(match.championName)}.png`}
                    alt={match.championName}
                    className="h-12 w-12 rounded-lg border border-slate-700/60 object-cover"
                  />
                ) : null}

                <div className="w-36">
                  <p className="font-semibold text-slate-100">{match.playerName}</p>
                  <p className="text-xs text-slate-400">{match.championName}</p>
                </div>

                <div className="w-24">
                  <p
                    className={`text-sm font-bold ${
                      match.win ? "text-cyan-300" : "text-rose-300"
                    }`}
                  >
                    {match.win ? "Victoria" : "Derrota"}
                  </p>
                  <p className="text-xs text-slate-400">{formatDuration(match.gameDuration)}</p>
                </div>

                <div className="w-28">
                  <p className="text-sm font-semibold text-slate-100">
                    {outOfRange
                      ? "—"
                      : bucket
                        ? `${bucket.kills} / ${bucket.deaths} / ${bucket.assists}`
                        : `${match.kills} / ${match.deaths} / ${match.assists}`}
                  </p>
                  <p className="text-xs text-slate-400">
                    {outOfRange ? (
                      "KDA"
                    ) : (
                      <>
                        <span className="font-semibold text-slate-200">
                          {formatKdaRatio(
                            bucket ? bucket.kills : match.kills,
                            bucket ? bucket.deaths : match.deaths,
                            bucket ? bucket.assists : match.assists
                          )}
                        </span>{" "}
                        KDA
                      </>
                    )}
                  </p>
                </div>

                <div className="w-24">
                  <p className="text-sm font-semibold text-amber-200">
                    {outOfRange ? "—" : bucket ? bucket.goldGained : match.goldEarned}
                  </p>
                  <p className="text-xs text-slate-400">{bucket ? "Oro ganado" : "Oro"}</p>
                </div>

                <div className="w-28">
                  <p className="text-sm font-semibold text-slate-100">
                    {outOfRange
                      ? "—"
                      : bucket
                        ? bucket.damageToChampionsGained
                        : match.totalDamageDealtToChampions}
                  </p>
                  <p className="text-xs text-slate-400">Daño a campeones</p>
                </div>

                {ddragonVersion ? (
                  (() => {
                    // El build no cambia por bloque de tiempo: Riot no expone
                    // el inventario minuto a minuto, solo el resultado final.
                    const rawItems = match.items.filter((itemId) => itemId !== 0);
                    const { fixed, rest } = sortItemsForDisplay(
                      rawItems,
                      itemTags,
                      match.roleBoundItem
                    );
                    const itemImg = (itemId: number, key: string) => (
                      <img
                        key={key}
                        src={`https://ddragon.leagueoflegends.com/cdn/${ddragonVersion}/img/item/${itemId}.png`}
                        alt={`item-${itemId}`}
                        className="h-7 w-7 rounded border border-slate-700/60 object-cover"
                      />
                    );

                    return (
                      <div className="flex items-center gap-1.5">
                        {fixed.length > 0 ? (
                          <>
                            <div className="flex gap-1">
                              {fixed.map((itemId, index) =>
                                itemImg(itemId, `${match.matchId}-fixed-${index}`)
                              )}
                            </div>
                            <span className="h-6 w-px bg-slate-700/60" aria-hidden="true" />
                          </>
                        ) : null}
                        <div className="flex flex-wrap gap-1">
                          {rest.map((itemId, index) =>
                            itemImg(itemId, `${match.matchId}-item-${index}`)
                          )}
                        </div>
                      </div>
                    );
                  })()
                ) : null}
              </div>

              <p className="flex items-center gap-2 text-xs text-slate-500">
                <span>
                  {queueLabels[match.queueId] ?? `Cola ${match.queueId}`} ·{" "}
                  {formatDate(match.gameCreation)}
                </span>
                {match.timeBuckets === null ? (
                  <button
                    onClick={() => void analyzeMatch(match.matchId)}
                    disabled={analyzingMatchId === match.matchId}
                    className="rounded border border-cyan-400/40 px-2 py-0.5 text-[11px] font-semibold text-cyan-300/80 transition hover:bg-cyan-400/10 disabled:opacity-60"
                  >
                    {analyzingMatchId === match.matchId ? "Analizando..." : "Ver por tiempo"}
                  </button>
                ) : null}
              </p>
              </div>
            );
          })}
          {loadingMore || (matchLimit < MAX_MATCH_LIMIT && matches.length >= matchLimit) ? (
            <button
              onClick={() => void loadMoreMatches()}
              disabled={loadingMore}
              className="w-full rounded-lg border border-cyan-400/40 py-2 text-xs font-semibold text-cyan-300/80 transition hover:bg-cyan-400/10 disabled:opacity-60"
            >
              {loadingMore ? "Buscando más partidas..." : "Ver más"}
            </button>
          ) : noMoreMatches ? (
            <p className="w-full py-2 text-center text-xs text-slate-500">
              No hay más partidas guardadas de esta cuenta todavía.
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
