import { computeTimeBucketStats, findParticipantId } from "@/lib/customStats";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const participants = await prisma.matchParticipant.findMany({
    include: { match: true, riotAccount: true },
  });

  let updated = 0;

  for (const participant of participants) {
    if (!participant.match.timelineData || !participant.match.rawData) continue;

    const matchData = JSON.parse(participant.match.rawData);
    const timelineData = JSON.parse(participant.match.timelineData);
    const participantId = findParticipantId(matchData, participant.riotAccount.puuid);
    if (participantId === undefined) continue;

    const timeBuckets = computeTimeBucketStats(timelineData, participantId);

    const rawParticipant = matchData.info.participants.find(
      (p: { puuid: string }) => p.puuid === participant.riotAccount.puuid
    );

    await prisma.matchParticipant.update({
      where: { id: participant.id },
      data: {
        customStats: JSON.stringify({ timeBuckets }),
        roleBoundItem: rawParticipant?.roleBoundItem || null,
        teamPosition: rawParticipant?.teamPosition || null,
      },
    });

    updated++;
  }

  return Response.json({ checked: participants.length, updated });
}
