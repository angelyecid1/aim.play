interface TimelineEvent {
  type: string;
  timestamp: number;
  killerId?: number;
  victimId?: number;
  assistingParticipantIds?: number[];
}

interface ParticipantFrame {
  totalGold: number;
  damageStats: { totalDamageDoneToChampions: number };
}

interface TimelineFrame {
  timestamp: number;
  participantFrames: Record<string, ParticipantFrame>;
  events: TimelineEvent[];
}

interface RiotTimeline {
  info: { frames: TimelineFrame[] };
}

export interface TimeBucketStats {
  startMs: number;
  endMs: number;
  kills: number;
  deaths: number;
  assists: number;
  goldGained: number;
  damageToChampionsGained: number;
}

const BUCKET_MS = 5 * 60 * 1000;

function valueAt(
  frames: TimelineFrame[],
  participantId: number,
  t: number,
  select: (pf: ParticipantFrame) => number
) {
  let value = 0;
  for (const frame of frames) {
    if (frame.timestamp > t) break;
    const pf = frame.participantFrames[String(participantId)];
    if (pf) value = select(pf);
  }
  return value;
}

/**
 * Estadisticas (KDA, oro ganado, dano a campeones ganado) por bloques fijos
 * de 5 minutos. Los items NO varian por bloque: Riot no expone el inventario
 * en cada minuto (solo eventos de compra/venta sueltos, sin snapshot), asi
 * que el build se muestra siempre igual, con el resumen final real que da
 * Riot al terminar la partida (ver MatchesSection / roleBoundItem).
 */
export function computeTimeBucketStats(
  timeline: RiotTimeline,
  participantId: number
): TimeBucketStats[] {
  const frames = timeline.info.frames;
  const gameEnd = frames[frames.length - 1]?.timestamp ?? 0;

  const killEvents = frames.flatMap((f) => f.events).filter((e) => e.type === "CHAMPION_KILL");

  const goldAt = (t: number) => valueAt(frames, participantId, t, (pf) => pf.totalGold);
  const damageAt = (t: number) =>
    valueAt(frames, participantId, t, (pf) => pf.damageStats.totalDamageDoneToChampions);

  const buckets: TimeBucketStats[] = [];

  for (let start = 0; start < gameEnd; start += BUCKET_MS) {
    const end = Math.min(start + BUCKET_MS, gameEnd);
    const killEventsInBucket = killEvents.filter((e) => e.timestamp > start && e.timestamp <= end);

    buckets.push({
      startMs: start,
      endMs: end,
      kills: killEventsInBucket.filter((e) => e.killerId === participantId).length,
      deaths: killEventsInBucket.filter((e) => e.victimId === participantId).length,
      assists: killEventsInBucket.filter((e) =>
        e.assistingParticipantIds?.includes(participantId)
      ).length,
      goldGained: Math.max(0, goldAt(end) - goldAt(start)),
      damageToChampionsGained: Math.max(0, damageAt(end) - damageAt(start)),
    });
  }

  return buckets;
}

export function findParticipantId(
  matchData: { info: { participants: Array<{ puuid: string; participantId: number }> } },
  puuid: string
) {
  return matchData.info.participants.find((p) => p.puuid === puuid)?.participantId;
}
