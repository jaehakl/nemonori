import type { CompletedGameRecord, GameState, PlayerGameRecord, PlayerSeasonStats, StatsDatabase } from "../types";

function createEmptySeasonStats(): PlayerSeasonStats {
  return {
    games: 0,
    gamesStarted: 0,
    plateAppearances: 0,
    atBats: 0,
    hits: 0,
    doubles: 0,
    triples: 0,
    homeRuns: 0,
    runs: 0,
    runsBattedIn: 0,
    walks: 0,
    hitByPitch: 0,
    sacrificeHits: 0,
    sacrificeFlies: 0,
    strikeOuts: 0,
    stolenBases: 0,
    caughtStealing: 0,
    inningsPitched: 0,
    outsRecorded: 0,
    battersFaced: 0,
    hitsAllowed: 0,
    runsAllowed: 0,
    earnedRuns: 0,
    walksAllowed: 0,
    hitByPitchAllowed: 0,
    strikeOutsThrown: 0,
    homeRunsAllowed: 0,
    pitchCount: 0,
  };
}

function toInningsPitched(outsRecorded: number) {
  const wholeInnings = Math.floor(outsRecorded / 3);
  const partialOuts = outsRecorded % 3;
  return Number(`${wholeInnings}.${partialOuts}`);
}

export function queryPlayerGameRecords(stats: StatsDatabase, playerId: string): PlayerGameRecord[] {
  const gameIds = stats.gameIdsByPlayerId[playerId] ?? [];
  return gameIds
    .map((gameId) => stats.gamesById[gameId])
    .filter((game): game is CompletedGameRecord => Boolean(game))
    .flatMap((game) => game.playerRecords.filter((record) => record.playerId === playerId))
    .sort((left, right) => left.day - right.day);
}

export function aggregateSeasonStatsFromRecords(records: PlayerGameRecord[]): PlayerSeasonStats {
  const totals = createEmptySeasonStats();

  for (const record of records) {
    totals.games += 1;
    const started = Boolean(record.batting?.started || record.pitching?.started);
    totals.gamesStarted += started ? 1 : 0;

    if (record.batting) {
      totals.plateAppearances += record.batting.plateAppearances;
      totals.atBats += record.batting.atBats;
      totals.hits += record.batting.hits;
      totals.doubles += record.batting.doubles;
      totals.triples += record.batting.triples;
      totals.homeRuns += record.batting.homeRuns;
      totals.runs += record.batting.runs;
      totals.runsBattedIn += record.batting.runsBattedIn;
      totals.walks += record.batting.walks;
      totals.hitByPitch += record.batting.hitByPitch;
      totals.strikeOuts += record.batting.strikeOuts;
      totals.sacrificeHits += record.batting.sacrificeHits;
      totals.sacrificeFlies += record.batting.sacrificeFlies;
      totals.stolenBases += record.batting.stolenBases;
      totals.caughtStealing += record.batting.caughtStealing;
    }

    if (record.pitching) {
      totals.outsRecorded += record.pitching.outsRecorded;
      totals.battersFaced += record.pitching.battersFaced;
      totals.hitsAllowed += record.pitching.hitsAllowed;
      totals.runsAllowed += record.pitching.runsAllowed;
      totals.earnedRuns += record.pitching.earnedRuns;
      totals.walksAllowed += record.pitching.walks;
      totals.hitByPitchAllowed += record.pitching.hitByPitch;
      totals.strikeOutsThrown += record.pitching.strikeOuts;
      totals.homeRunsAllowed += record.pitching.homeRunsAllowed;
      totals.pitchCount += record.pitching.pitchesThrown;
    }
  }

  totals.inningsPitched = toInningsPitched(totals.outsRecorded);
  return totals;
}

export function aggregatePlayerSeasonStatsFromDb(state: GameState, playerId: string): PlayerSeasonStats {
  return aggregateSeasonStatsFromRecords(queryPlayerGameRecords(state.league.stats, playerId));
}

export function indexCompletedGame(stats: StatsDatabase, game: CompletedGameRecord): StatsDatabase {
  const nextGamesById = {
    ...stats.gamesById,
    [game.gameId]: game,
  };

  const nextGameIdsByDay = {
    ...stats.gameIdsByDay,
    [game.day]: [...(stats.gameIdsByDay[game.day] ?? []).filter((gameId) => gameId !== game.gameId), game.gameId],
  };

  const nextGameIdsByPlayerId = { ...stats.gameIdsByPlayerId };
  for (const record of game.playerRecords) {
    nextGameIdsByPlayerId[record.playerId] = [
      ...(nextGameIdsByPlayerId[record.playerId] ?? []).filter((gameId) => gameId !== game.gameId),
      game.gameId,
    ];
  }

  return {
    gamesById: nextGamesById,
    gameIdsByDay: nextGameIdsByDay,
    gameIdsByPlayerId: nextGameIdsByPlayerId,
  };
}
