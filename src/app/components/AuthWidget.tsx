"use client";

import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import { useEffect, useState } from "react";
import { firebaseAuth } from "@/lib/firebaseClient";

interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  emailVerified: boolean;
}

// La region real se detecta sola del dato de la propia partida al sincronizar
// (ver syncRiotAccount), asi que aqui no hace falta pedirsela al usuario.
const PLACEHOLDER_PLATFORM = "unknown";
const PENDING_RIOT_LINK_KEY = "aimplay_pending_riot_link";

const firebaseErrorMessages: Record<string, string> = {
  "auth/email-already-in-use": "Ya existe una cuenta con ese email",
  "auth/invalid-credential": "Email o contraseña incorrectos",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres",
  "auth/invalid-email": "Email invalido",
};

function firebaseErrorMessage(err: unknown) {
  const code = (err as { code?: string })?.code;
  return (code && firebaseErrorMessages[code]) || "Algo salió mal";
}

export default function AuthWidget() {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [checked, setChecked] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [gameName, setGameName] = useState("");
  const [tagLine, setTagLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then(async (data) => {
        if (!active) return;
        setUser(data.user);
        setChecked(true);

        // Si al registrarse dejo el ID pendiente (porque aun no verificaba
        // el correo), en cuanto ya este verificado y no tenga cuentas
        // vinculadas, se reclama sola sin que el usuario haga nada mas.
        const pendingRaw = window.localStorage.getItem(PENDING_RIOT_LINK_KEY);
        if (pendingRaw && data.user?.emailVerified && data.riotAccounts?.length === 0) {
          const pending = JSON.parse(pendingRaw) as { gameName: string; tagLine: string };
          try {
            const res = await fetch("/api/riot/account", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ ...pending, platform: PLACEHOLDER_PLATFORM }),
            });
            if (res.ok) {
              window.localStorage.removeItem(PENDING_RIOT_LINK_KEY);
              window.location.reload();
            }
          } catch {
            // Se reintenta en la proxima visita.
          }
        }
      })
      .catch(() => {
        if (active) setChecked(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const credential =
        mode === "register"
          ? await createUserWithEmailAndPassword(firebaseAuth, email, password)
          : await signInWithEmailAndPassword(firebaseAuth, email, password);

      if (mode === "register") {
        await updateProfile(credential.user, { displayName });
        await sendEmailVerification(credential.user);
      }

      // forceRefresh=true: tras updateProfile necesitamos un token nuevo para
      // que el nombre viaje en el claim "name" (el token en cache es de antes).
      const idToken = await credential.user.getIdToken(mode === "register");
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken }),
      });

      if (!res.ok) {
        setError("Algo salió mal creando la sesion");
        return;
      }

      if (mode === "register") {
        // Buscar el ID ya guarda las partidas (publico, no necesita
        // verificacion); el vinculo con este usuario se intenta ahora y,
        // si el correo aun no esta verificado, se reintenta solo en cuanto
        // lo verifique (ver el efecto que revisa PENDING_RIOT_LINK_KEY).
        const searchRes = await fetch("/api/riot/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ gameName, tagLine, platform: PLACEHOLDER_PLATFORM }),
        }).catch(() => null);

        if (searchRes?.ok) {
          window.localStorage.setItem(PENDING_RIOT_LINK_KEY, JSON.stringify({ gameName, tagLine }));
          fetch("/api/riot/account", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ gameName, tagLine, platform: PLACEHOLDER_PLATFORM }),
          }).catch(() => {});
          setNotice(
            "Te enviamos un correo para verificar tu cuenta. En cuanto lo verifiques, tu historial va a aparecer solo."
          );
        } else {
          setNotice(
            "No encontramos ese Riot ID, pero tu cuenta ya se creo. Verifica tu correo y busca tu ID en la pestaña Partidas para vincularlo."
          );
        }
        setShowForm(false);
      } else {
        window.location.reload();
      }
    } catch (err) {
      setError(firebaseErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLogout = async () => {
    await signOut(firebaseAuth);
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  };

  const handleResendVerification = async () => {
    if (firebaseAuth.currentUser) {
      await sendEmailVerification(firebaseAuth.currentUser);
      setNotice("Te reenviamos el correo de verificacion.");
    }
  };

  if (!checked) {
    return null;
  }

  if (user) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {!user.emailVerified ? (
          <button
            onClick={handleResendVerification}
            className="rounded-lg border border-amber-500/50 bg-amber-400/10 px-2 py-1 text-xs font-semibold text-amber-200 hover:bg-amber-400/20"
          >
            Correo sin verificar — reenviar
          </button>
        ) : null}
        <span className="text-slate-300">
          Hola, <span className="font-semibold text-cyan-200">{user.displayName}</span>
        </span>
        <button
          onClick={handleLogout}
          className="rounded-lg border border-slate-600 bg-transparent px-3 py-1.5 font-semibold text-slate-300 transition hover:bg-slate-800"
        >
          Cerrar sesion
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setShowForm((prev) => !prev)}
        className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-brand/80"
      >
        Iniciar sesion
      </button>

      {notice && !showForm ? (
        <p className="absolute right-0 top-full mt-2 w-72 text-right text-xs text-cyan-200">
          {notice}
        </p>
      ) : null}

      {showForm ? (
        <div className="absolute right-0 top-full z-40 mt-2 w-72 rounded-xl border border-cyan-900/40 bg-slate-950/98 p-4 shadow-[0_18px_45px_rgba(2,12,27,0.6)]">
          <div className="mb-3 flex gap-2 text-xs font-semibold uppercase tracking-wide">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={mode === "login" ? "text-cyan-300" : "text-slate-500"}
            >
              Entrar
            </button>
            <span className="text-slate-600">/</span>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={mode === "register" ? "text-cyan-300" : "text-slate-500"}
            >
              Crear cuenta
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-2">
            {mode === "register" ? (
              <>
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="Nombre para mostrar"
                  required
                  className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/70"
                />
                <div className="flex items-center gap-2">
                  <input
                    value={gameName}
                    onChange={(event) => setGameName(event.target.value)}
                    placeholder="Tu Riot ID (nombre)"
                    required
                    className="w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/70"
                  />
                  <span className="text-slate-500">#</span>
                  <input
                    value={tagLine}
                    onChange={(event) => setTagLine(event.target.value)}
                    placeholder="TAG"
                    required
                    className="w-16 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/70"
                  />
                </div>
              </>
            ) : null}
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="Email"
              required
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/70"
            />
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Contraseña"
              required
              minLength={6}
              className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-cyan-400/70"
            />

            {error ? <p className="text-xs text-rose-300">{error}</p> : null}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-brand px-3 py-2 text-sm font-semibold text-slate-900 transition hover:bg-brand/80 disabled:opacity-60"
            >
              {mode === "login" ? "Entrar" : "Crear cuenta"}
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
