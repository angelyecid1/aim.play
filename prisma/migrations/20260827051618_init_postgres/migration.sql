-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "firebaseUid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RiotAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "puuid" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "tagLine" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastViewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RiotAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Match" (
    "id" TEXT NOT NULL,
    "gameCreation" TIMESTAMP(3) NOT NULL,
    "gameDuration" INTEGER NOT NULL,
    "queueId" INTEGER NOT NULL,
    "patch" TEXT NOT NULL,
    "rawData" TEXT NOT NULL,
    "timelineData" TEXT,
    "championDuelsProcessed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Match_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChampionDuel" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "gameCreation" TIMESTAMP(3) NOT NULL,
    "timeBucket" INTEGER NOT NULL,
    "platform" TEXT NOT NULL,
    "position" TEXT NOT NULL,
    "killerChampion" TEXT NOT NULL,
    "victimChampion" TEXT NOT NULL,
    "killerMastery" INTEGER NOT NULL,
    "victimMastery" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChampionDuel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeaderboardEntry" (
    "id" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "puuid" TEXT NOT NULL,
    "gameName" TEXT NOT NULL,
    "tagLine" TEXT NOT NULL,
    "leaguePoints" INTEGER NOT NULL,
    "wins" INTEGER NOT NULL,
    "losses" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeaderboardEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MatchParticipant" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "riotAccountId" TEXT NOT NULL,
    "championName" TEXT NOT NULL,
    "win" BOOLEAN NOT NULL,
    "kills" INTEGER NOT NULL,
    "deaths" INTEGER NOT NULL,
    "assists" INTEGER NOT NULL,
    "goldEarned" INTEGER NOT NULL,
    "totalDamageDealtToChampions" INTEGER NOT NULL,
    "items" TEXT NOT NULL,
    "roleBoundItem" INTEGER,
    "teamPosition" TEXT,
    "customStats" TEXT,

    CONSTRAINT "MatchParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_firebaseUid_key" ON "User"("firebaseUid");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RiotAccount_puuid_key" ON "RiotAccount"("puuid");

-- CreateIndex
CREATE INDEX "RiotAccount_userId_idx" ON "RiotAccount"("userId");

-- CreateIndex
CREATE INDEX "ChampionDuel_killerChampion_victimChampion_platform_positio_idx" ON "ChampionDuel"("killerChampion", "victimChampion", "platform", "position", "gameCreation");

-- CreateIndex
CREATE INDEX "LeaderboardEntry_platform_tier_idx" ON "LeaderboardEntry"("platform", "tier");

-- CreateIndex
CREATE UNIQUE INDEX "LeaderboardEntry_platform_tier_rank_key" ON "LeaderboardEntry"("platform", "tier", "rank");

-- CreateIndex
CREATE INDEX "MatchParticipant_riotAccountId_idx" ON "MatchParticipant"("riotAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchParticipant_matchId_riotAccountId_key" ON "MatchParticipant"("matchId", "riotAccountId");

-- AddForeignKey
ALTER TABLE "RiotAccount" ADD CONSTRAINT "RiotAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChampionDuel" ADD CONSTRAINT "ChampionDuel_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "Match"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchParticipant" ADD CONSTRAINT "MatchParticipant_riotAccountId_fkey" FOREIGN KEY ("riotAccountId") REFERENCES "RiotAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
