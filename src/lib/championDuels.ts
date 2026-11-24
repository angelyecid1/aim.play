const BUCKET_MS = 5 * 60 * 1000;

// Cuantos duelos de UNA MISMA pareja de campeones cuentan de UNA MISMA
// partida — ver el comentario largo en api/champion-duels/route.ts. Se
// exporta aca (no solo se usa ahi) porque ingest.ts tambien lo necesita:
// no tiene sentido revisar la maestria (llamada real a Riot) de un duelo
// que sabemos de antemano que nunca va a contar para nada, asi que se
// descarta ANTES de gastar esa llamada, no despues de guardarlo.
export const MAX_DUELS_PER_MATCH = 4;

// Tope de enfrentamientos recientes que cuentan por cada pareja de
// campeones (ver el comentario largo en api/champion-duels/route.ts). Se
// exporta aca tambien porque ChampionsSection.tsx lo necesita: para saber
// si una pareja ya junto la muestra completa (y por lo tanto debe listarse
// antes que una con menos duelos, sin importar el % de victorias).
export const RECENT_DUELS_PER_MATCHUP = 50;

interface DamageInstance {
  participantId: number;
}

interface TimelineEvent {
  type: string;
  timestamp: number;
  killerId?: number;
  victimId?: number;
  assistingParticipantIds?: number[];
  victimDamageDealt?: DamageInstance[];
  victimDamageReceived?: DamageInstance[];
}

interface TimelineFrame {
  events: TimelineEvent[];
}

interface RiotTimeline {
  info: { frames: TimelineFrame[] };
}

interface MatchParticipant {
  participantId: number;
  puuid: string;
  championId: number;
  championName: string;
  teamPosition: string;
}

interface RawMatchData {
  info: { participants: MatchParticipant[] };
}

export interface CleanDuel {
  timeBucket: number;
  position: string;
  killerParticipantId: number;
  victimParticipantId: number;
  killerChampion: string;
  victimChampion: string;
  killerPuuid: string;
  victimPuuid: string;
  killerChampionId: number;
  victimChampionId: number;
}

/**
 * Detecta kills 1v1 limpios: sin asistencias formales y sin que ningun
 * tercer campeon (o torre/subdito) aparezca metiendo daño en la pelea.
 * No depende de cuanto duro el enfrentamiento, solo de quien participo.
 */
export function findCleanDuels(matchData: RawMatchData, timeline: RiotTimeline): CleanDuel[] {
  const participantsById = new Map(
    matchData.info.participants.map((p) => [p.participantId, p])
  );

  const kills = timeline.info.frames
    .flatMap((f) => f.events)
    .filter((e) => e.type === "CHAMPION_KILL");

  const duels: CleanDuel[] = [];

  for (const kill of kills) {
    if (kill.killerId === undefined || kill.victimId === undefined) continue;
    if ((kill.assistingParticipantIds?.length ?? 0) > 0) continue;

    const involved = new Set<number>(
      [...(kill.victimDamageDealt ?? []), ...(kill.victimDamageReceived ?? [])]
        .map((d) => d.participantId)
        .filter((id) => id !== 0) // 0 = torre/subdito, no un campeon
    );
    involved.delete(kill.killerId);
    involved.delete(kill.victimId);
    if (involved.size > 0) continue;

    const killer = participantsById.get(kill.killerId);
    const victim = participantsById.get(kill.victimId);
    if (!killer || !victim) continue;

    // Solo cuenta si de verdad se enfrentaron en el mismo rol/linea (ej. top
    // vs top); descarta encuentros entre roles distintos como un jungla que
    // caza a un mid de paso.
    if (!killer.teamPosition || killer.teamPosition !== victim.teamPosition) continue;

    duels.push({
      timeBucket: Math.floor(kill.timestamp / BUCKET_MS),
      position: killer.teamPosition,
      killerParticipantId: kill.killerId,
      victimParticipantId: kill.victimId,
      killerChampion: killer.championName,
      victimChampion: victim.championName,
      killerPuuid: killer.puuid,
      victimPuuid: victim.puuid,
      killerChampionId: killer.championId,
      victimChampionId: victim.championId,
    });
  }

  return duels;
}
