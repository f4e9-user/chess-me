import { describe, expect, it } from 'vitest';
import {
  analyzeCandidateMoveTraining,
  analyzeGuessMove,
  buildCandidateMultiPvComparison,
  buildDailyTrainingPlan,
  buildMistakeCardFromGuess,
  buildOpeningImprovementPlan,
  buildReviewReport,
  buildReviewReportHistoryStats,
  createReviewReportHistoryItem,
  filterReviewReportHistory,
  toggleReviewReportHistoryFavorite,
  buildNaturalLanguageCoachReport,
  buildNaturalLanguagePositionExplanation,
  buildPracticeThemeRecommendations,
  buildStrengthProfile,
  buildBulkPgnLibraryInsights,
  filterBulkPgnLibraryGames,
  parseBulkPgnLibrary,
  shouldClearBulkPgnLibraryAfterTextUpdate,
  toggleBulkPgnGameImportant,
  buildEndgameTrainingPlan,
  buildMiddlegamePlanTraining,
  buildGlobalAnalysisCacheKey,
  buildGlobalAnalysisCancellationPlan,
  buildGlobalAnalysisPartialReport,
  buildGlobalAnalysisReport,
  buildGlobalAnalysisPerspectiveLabel,
  buildKeyMomentSummary,
  classifyKeyAnalysisMoment,
  formatMultiPvDisplayLines,
  parseStockfishInfo,
  rankMultiPvLines,
  classifyMoveFromEvaluationDrop,
  completeEngineAnalysisFromRequest,
  detectSwingPoint,
  getAnalysisDepthPresetConfig,
  filterGlobalAnalysisMoments,
  getPgnReplyAfterCorrectGuess,
  getSpacedReviewIntervalDays,
  identifyOpening,
  normalizeSan,
  parseCandidateMoveEntries,
  scoreToWhiteCentipawns,
  updateMistakeCardReview,
  upsertMistakeCard,
} from './App';

describe('guess next move training helpers', () => {
  it('advances from the player guess to the opponent pgn reply in one training turn', () => {
    const reply = getPgnReplyAfterCorrectGuess({
      guessedSan: 'e4',
      moves: [
        { san: 'e4' },
        { san: 'c5' },
        { san: 'Nf3' },
      ],
      currentIndex: 0,
      maxIndex: 3,
    });

    expect(reply).toEqual({
      isCorrectGuess: true,
      playerTargetIndex: 1,
      replyMoveSan: 'c5',
      nextIndex: 2,
      message: '猜对实战手 e4，电脑按棋谱回应 c5。',
    });
  });

  it('does not auto-reply when the guessed move differs from the pgn move', () => {
    const reply = getPgnReplyAfterCorrectGuess({
      guessedSan: 'd4',
      moves: [{ san: 'e4' }, { san: 'c5' }],
      currentIndex: 0,
      maxIndex: 2,
    });

    expect(reply).toMatchObject({ isCorrectGuess: false, nextIndex: 0 });
    expect(reply.replyMoveSan).toBeUndefined();
  });

  it('marks the guess correct when it matches the hidden game move and compares Stockfish best move', () => {
    const result = analyzeGuessMove({
      guessedSan: 'Nf3',
      actualSan: 'Nf3',
      stockfishBestSan: 'Nc3',
    });

    expect(result.isCorrect).toBe(true);
    expect(result.matchesStockfish).toBe(false);
    expect(result.summary).toContain('猜对实战手');
    expect(result.summary).toContain('Stockfish 首选：Nc3');
  });

  it('normalizes check/mate/annotation suffixes before comparing moves', () => {
    expect(normalizeSan('Qh5+?!')).toBe('Qh5');
    expect(
      analyzeGuessMove({ guessedSan: 'Qh5+', actualSan: 'Qh5', stockfishBestSan: 'Qh5#' }),
    ).toMatchObject({ isCorrect: true, matchesStockfish: true });
  });
});

describe('candidate move training helpers', () => {
  it('parses 2-3 candidate moves with reasons from multiline input', () => {
    const entries = parseCandidateMoveEntries('Nf3 - 发展并控制中心\nBc4：瞄准 f7\n d4  争夺中心');

    expect(entries).toEqual([
      { moveSan: 'Nf3', reason: '发展并控制中心' },
      { moveSan: 'Bc4', reason: '瞄准 f7' },
      { moveSan: 'd4', reason: '争夺中心' },
    ]);
  });

  it('evaluates candidate coverage, selected move, and answer-in-candidates misses', () => {
    const result = analyzeCandidateMoveTraining({
      rawCandidates: 'Nf3 - 发展\nBc4 - 攻击 f7\nd4 - 抢中心',
      selectedSan: 'Bc4',
      actualSan: 'Nf3',
      stockfishBestSan: 'Nf3',
    });

    expect(result).toMatchObject({
      candidateCount: 3,
      hasActualInCandidates: true,
      hasBestInCandidates: true,
      selectedIsActual: false,
      selectedIsBest: false,
      answerInCandidatesButNotSelected: true,
      sortingScore: 67,
    });
    expect(result.summary).toContain('答案在候选里，但最终没选中');
  });

  it('compares user candidates with MultiPV ranks, score gaps, and feedback labels', () => {
    const result = buildCandidateMultiPvComparison({
      rawCandidates: 'Nf3 - 开发并守住中心\nBc4 - 盯住 f7\nd4 - 直接抢中心',
      selectedSan: 'Bc4',
      actualSan: 'Nf3',
      stockfishBestSan: 'Nf3',
      multiPvLines: [
        {
          rank: 1,
          score: { type: 'cp', value: 45 },
          pv: ['Nf3', 'Nc6', 'Bb5'],
          uci: ['g1f3', 'b8c6', 'f1b5'],
          firstMoveSan: 'Nf3',
          displayScore: '+0.45',
        },
        {
          rank: 2,
          score: { type: 'cp', value: 12 },
          pv: ['Bc4', 'Nf6'],
          uci: ['f1c4', 'g8f6'],
          firstMoveSan: 'Bc4',
          displayScore: '+0.12',
        },
        {
          rank: 3,
          score: { type: 'cp', value: -90 },
          pv: ['d4', 'exd4'],
          uci: ['d2d4', 'e5d4'],
          firstMoveSan: 'd4',
          displayScore: '-0.90',
        },
      ],
    });

    expect(result.multiPvAvailable).toBe(true);
    expect(result.rows.map((row) => row.feedbackLabel)).toEqual(['最佳着法', '可接受着法', '风险着法']);
    expect(result.rows[1]).toMatchObject({
      moveSan: 'Bc4',
      matchedRank: 2,
      isSelected: true,
      scoreGapCp: 33,
      keyVariation: 'Bc4 Nf6',
    });
    expect(result.summary).toContain('命中 MultiPV 第 2 候选');
    expect(result.summary).toContain('与最佳线相差 33cp');
  });

  it('marks candidates that miss all MultiPV lines and degrades when MultiPV is unavailable', () => {
    const missed = buildCandidateMultiPvComparison({
      rawCandidates: 'h4 - 制造王翼空间\nNf3 - 正常开发',
      selectedSan: 'h4',
      actualSan: 'Nf3',
      stockfishBestSan: 'Nf3',
      multiPvLines: [
        {
          rank: 1,
          score: { type: 'cp', value: 30 },
          pv: ['Nf3', 'Nc6'],
          uci: ['g1f3', 'b8c6'],
          firstMoveSan: 'Nf3',
          displayScore: '+0.30',
        },
      ],
    });

    expect(missed.rows[0]).toMatchObject({
      moveSan: 'h4',
      matchedRank: null,
      feedbackLabel: '漏算着法',
      keyVariation: '未命中 MultiPV 候选线',
    });
    expect(missed.summary).toContain('没有命中当前 MultiPV 候选线');

    const degraded = buildCandidateMultiPvComparison({
      rawCandidates: 'Nf3 - 开发\nBc4 - 活子',
      selectedSan: 'Nf3',
      actualSan: 'Nf3',
      stockfishBestSan: 'Nf3',
      multiPvLines: [],
    });

    expect(degraded.multiPvAvailable).toBe(false);
    expect(degraded.summary).toContain('暂无 MultiPV 数据');
    expect(degraded.rows[0]).toMatchObject({ feedbackLabel: '最佳着法', matchedRank: null });
  });
});

describe('opening improvement helpers', () => {
  it('records the exact ply where the game leaves the opening book', () => {
    const match = identifyOpening(['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'h6']);

    expect(match).toMatchObject({
      eco: 'C60',
      name: 'Ruy Lopez',
      status: 'deviation',
      matchedPly: 5,
      deviationMove: 'h6',
      nextBookMove: 'a6',
    });
  });

  it('builds an opening improvement plan with deviation review cards and common opening stats', () => {
    const plan = buildOpeningImprovementPlan([
      ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'h6'],
      ['e4', 'c5', 'Nf3', 'd6'],
      ['d4', 'd5', 'c4'],
    ]);

    expect(plan.commonOpenings[0]).toMatchObject({ name: 'Ruy Lopez', games: 1 });
    expect(plan.commonOpenings.map((item) => item.name)).toContain('Sicilian Defense: Modern Variations');
    expect(plan.deviationCards[0]).toMatchObject({
      openingName: 'Ruy Lopez',
      deviationPly: 6,
      playedMove: 'h6',
      bookMove: 'a6',
      tags: ['开局'],
    });
    expect(plan.summary).toContain('开局分歧 1 个');
  });
});

describe('bulk PGN import helpers', () => {
  it('preserves the imported library when initial batch import loads the first game', () => {
    expect(shouldClearBulkPgnLibraryAfterTextUpdate({ preserveBulkPgnLibrary: true })).toBe(false);
  });

  it('clears transient bulk library state for ordinary single-game text updates', () => {
    expect(shouldClearBulkPgnLibraryAfterTextUpdate()).toBe(true);
  });

  it('splits multiple PGN games, extracts headers, validates moves, and reports invalid entries', () => {
    const library = parseBulkPgnLibrary([
      {
        filename: 'batch-a.pgn',
        content: `[Event "Training A"]\n[White "Me"]\n[Black "Opponent"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0\n\n[Event "Training B"]\n[White "Me"]\n[Black "Opponent"]\n[Result "0-1"]\n\n1. d4 d5 2. c4 e6 0-1`,
      },
      {
        filename: 'broken.pgn',
        content: `[Event "Broken"]\n[White "Me"]\n[Black "Opponent"]\n[Result "*"]\n\n1. e4 illegal *`,
      },
    ]);

    expect(library.games).toHaveLength(2);
    expect(library.games[0]).toMatchObject({ event: 'Training A', white: 'Me', black: 'Opponent', result: '1-0', moveCount: 4, filename: 'batch-a.pgn' });
    expect(library.games[1]).toMatchObject({ event: 'Training B', result: '0-1', moveCount: 4 });
    expect(library.errors).toEqual([
      expect.objectContaining({ filename: 'broken.pgn', event: 'Broken' }),
    ]);
    expect(library.summary).toContain('导入 2 盘');
    expect(library.summary).toContain('失败 1 盘');
  });

  it('summarizes imported games by opening, result, and training priority', () => {
    const library = parseBulkPgnLibrary([
      {
        filename: 'white-wins.pgn',
        content: `[Event "Italian Win"]\n[White "Me"]\n[Black "A"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0`,
      },
      {
        filename: 'black-wins.pgn',
        content: `[Event "Sicilian Loss"]\n[White "B"]\n[Black "Me"]\n[Result "0-1"]\n\n1. e4 c5 2. Nf3 d6 0-1`,
      },
      {
        filename: 'draw.pgn',
        content: `[Event "Queen Pawn Draw"]\n[White "Me"]\n[Black "C"]\n[Result "1/2-1/2"]\n\n1. d4 d5 2. c4 e6 1/2-1/2`,
      },
    ]);

    const insights = buildBulkPgnLibraryInsights(library.games);

    expect(insights.totalGames).toBe(3);
    expect(insights.results).toEqual({ whiteWins: 1, blackWins: 1, draws: 1, ongoing: 0 });
    expect(insights.openings[0]).toMatchObject({ name: 'Italian Game: Giuoco Piano', games: 1 });
    expect(insights.trainingPriorities[0]).toContain('Italian Game: Giuoco Piano');
    expect(insights.summary).toContain('共 3 盘');
  });

  it('filters and sorts the imported library by source, time, opponent, result, color, opening, and important flag', () => {
    const library = parseBulkPgnLibrary([
      {
        filename: 'lichess-export.pgn',
        source: 'lichess',
        content: `[Event "Rated Blitz game"]\n[Site "https://lichess.org/abc123"]\n[Date "2026.05.10"]\n[White "Me"]\n[Black "Rival"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1-0`,
      },
      {
        filename: 'chesscom-export.pgn',
        source: 'chess.com',
        content: `[Event "Live Chess"]\n[Site "https://www.chess.com/game/live/42"]\n[Date "2026.04.01"]\n[White "Opponent"]\n[Black "Me"]\n[Result "0-1"]\n\n1. e4 c5 2. Nf3 d6 0-1`,
      },
      {
        filename: 'manual.pgn',
        content: `[Event "Club Draw"]\n[Date "2026.05.12"]\n[White "Me"]\n[Black "Clubmate"]\n[Result "1/2-1/2"]\n\n1. d4 d5 2. c4 e6 1/2-1/2`,
      },
    ]);
    const marked = toggleBulkPgnGameImportant(library.games, library.games[1].id);

    const filtered = filterBulkPgnLibraryGames(marked, {
      source: 'chess.com',
      dateFrom: '2026-04-01',
      dateTo: '2026-04-30',
      opponent: 'oppo',
      result: 'win',
      color: 'black',
      opening: 'sicilian',
      importantOnly: true,
      sortBy: 'date',
      sortDirection: 'desc',
      playerName: 'Me',
    });

    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({
      source: 'chess.com',
      site: 'https://www.chess.com/game/live/42',
      playedAt: '2026-04-01',
      opponent: 'Opponent',
      playerColor: 'black',
      playerResult: 'win',
      isImportant: true,
    });
    expect(filtered[0].openingName).toContain('Sicilian');
  });

  it('deduplicates repeated imports and preserves important marks from history reports', () => {
    const source = `[Event "Saved Report"]\n[Site "https://lichess.org/saved"]\n[Date "2026.03.01"]\n[White "Me"]\n[Black "Archive"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0`;
    const report = createReviewReportHistoryItem({
      id: 'hist-1',
      savedAt: '2026-05-01T00:00:00.000Z',
      pgn: source,
      report: {
        summary: '历史重要报告',
        biggestMistake: null,
        sections: { opening: 'Italian Game', middlegame: '', endgame: '', biggestMistake: '' },
        trainingAdvice: '复盘历史重点局。',
        markdown: '# 历史重要报告',
      },
      analyses: [],
      meta: { event: 'Saved Report', white: 'Me', black: 'Archive', result: '1-0' },
    });
    const favoriteReport = toggleReviewReportHistoryFavorite([report], 'hist-1')[0];
    const library = parseBulkPgnLibrary([
      { filename: 'first.pgn', source: 'lichess', content: `${source}\n\n${source}` },
    ], [favoriteReport]);

    expect(library.games).toHaveLength(1);
    expect(library.duplicates).toHaveLength(1);
    expect(library.games[0]).toMatchObject({ isImportant: true, historyReportId: 'hist-1' });
    expect(library.summary).toContain('去重 1 盘');
  });
});

describe('strength profile helpers', () => {
  it('summarizes phase losses, mistake types, weak areas, and training priorities', () => {
    const profile = buildStrengthProfile({
      analyses: [
        { moveIndex: 2, label: '2. Nf3', san: 'Nf3', quality: '疑问手', centipawnLoss: 70, beforeScore: 20, afterScore: -50, isSwingPoint: false, bestMoveSan: 'd4', multiPvLines: [] },
        { moveIndex: 14, label: '8. Bxh7+', san: 'Bxh7+', quality: '败着', centipawnLoss: 360, beforeScore: 70, afterScore: -290, isSwingPoint: true, bestMoveSan: 'Re1', multiPvLines: [] },
        { moveIndex: 22, label: '12... Qh4', san: 'Qh4', quality: '失误', centipawnLoss: 180, beforeScore: -40, afterScore: 140, isSwingPoint: true, bestMoveSan: 'Qc7', multiPvLines: [] },
        { moveIndex: 48, label: '25. Kf2', san: 'Kf2', quality: '失误', centipawnLoss: 140, beforeScore: 0, afterScore: -160, isSwingPoint: true, bestMoveSan: 'Ke2', multiPvLines: [] },
      ],
      mistakeCards: [
        { tags: ['战术', '防守'], attempts: 3, solvedCount: 1 },
        { tags: ['中局计划'], attempts: 2, solvedCount: 0 },
      ],
      candidateStats: {
        sessions: 4,
        validSessions: 3,
        answerCovered: 1,
        bestCovered: 1,
        answerInCandidatesButNotSelected: 2,
        sortingScoreTotal: 160,
      },
    });

    expect(profile.phaseBreakdown[0]).toMatchObject({ phase: '中局', totalLoss: 540 });
    expect(profile.mistakeTypes[0].type).toBe('防守失败');
    expect(profile.weakAreas[0]).toContain('中局');
    expect(profile.trainingPriorities[0]).toContain('中局');
    expect(profile.radarAxes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ axis: '开局稳定性' }),
        expect.objectContaining({ axis: '中局计划' }),
        expect.objectContaining({ axis: '残局技术' }),
      ]),
    );
    expect(profile.summary).toContain('首要短板');
  });
});

describe('review report helpers', () => {
  it('builds a full game review report with phase summary, biggest mistake, training advice, and markdown export', () => {
    const report = buildReviewReport({
      opening: { eco: 'C60', name: 'Ruy Lopez', status: 'deviation', matchedPly: 5, deviationMove: 'h6', nextBookMove: 'a6' },
      analyses: [
        { moveIndex: 3, label: '2... Nc6', san: 'Nc6', quality: '好棋', centipawnLoss: 20, beforeScore: 10, afterScore: 5, isSwingPoint: false, bestMoveSan: 'Nc6', multiPvLines: [] },
        { moveIndex: 16, label: '9. Nxe5', san: 'Nxe5', quality: '败着', centipawnLoss: 420, beforeScore: 80, afterScore: -360, isSwingPoint: true, bestMoveSan: 'Re1', multiPvLines: [] },
        { moveIndex: 46, label: '24... Ke1', san: 'Ke1', quality: '失误', centipawnLoss: 180, beforeScore: 0, afterScore: 220, isSwingPoint: true, bestMoveSan: 'Kd1', multiPvLines: [] },
      ],
      middlegamePlan: {
        focusCards: [{
          id: 'mid-16', moveIndex: 16, label: '9. Nxe5', san: 'Nxe5', topic: '候选着法与风险控制', priority: 100,
          recommendedPlan: '优先比较 Re1。', reason: '中局败着导致局势逆转。', tags: ['中局', '败着'],
        }],
        themeStats: [{ theme: '候选着法与风险控制', count: 1, totalLoss: 420 }],
        summary: '发现 1 个关键中局计划点。',
      },
      endgamePlan: {
        phase: 'endgame', type: '车残局',
        cards: [{ id: 'end-46', moveIndex: 46, label: '24... Ke1', san: 'Ke1', endgameType: '车残局', missedChance: '错过守和机会', recommendedMove: 'Kd1', prompt: '复盘残局守和。', tags: ['残局', '车残局'] }],
        themes: ['王的积极性'], summary: '识别到车残局。',
      },
    });

    expect(report.summary).toContain('最大失误：9. Nxe5');
    expect(report.sections.opening).toContain('Ruy Lopez');
    expect(report.sections.middlegame).toContain('候选着法与风险控制');
    expect(report.sections.endgame).toContain('车残局');
    expect(report.biggestMistake).toMatchObject({ label: '9. Nxe5', centipawnLoss: 420 });
    expect(report.trainingAdvice).toContain('优先训练候选着法与风险控制');
    expect(report.markdown).toContain('## 下一次训练建议');
  });
});

describe('review report history helpers', () => {
  const baseReport = buildReviewReport({
    opening: { eco: 'C60', name: 'Ruy Lopez', status: 'deviation', matchedPly: 5, deviationMove: 'h6', nextBookMove: 'a6' },
    analyses: [
      { moveIndex: 16, label: '9. Nxe5', san: 'Nxe5', quality: '败着', centipawnLoss: 420, beforeScore: 80, afterScore: -360, isSwingPoint: true, bestMoveSan: 'Re1', multiPvLines: [] },
      { moveIndex: 46, label: '24... Ke1', san: 'Ke1', quality: '失误', centipawnLoss: 180, beforeScore: 0, afterScore: 220, isSwingPoint: true, bestMoveSan: 'Kd1', multiPvLines: [] },
    ],
    middlegamePlan: {
      focusCards: [{
        id: 'mid-16', moveIndex: 16, label: '9. Nxe5', san: 'Nxe5', topic: '候选着法与风险控制', priority: 100,
        recommendedPlan: '优先比较 Re1。', reason: '中局败着导致局势逆转。', tags: ['中局', '败着'],
      }],
      themeStats: [{ theme: '候选着法与风险控制', count: 1, totalLoss: 420 }],
      summary: '发现 1 个关键中局计划点。',
    },
    endgamePlan: {
      phase: 'endgame', type: '车残局',
      cards: [{ id: 'end-46', moveIndex: 46, label: '24... Ke1', san: 'Ke1', endgameType: '车残局', missedChance: '错过守和机会', recommendedMove: 'Kd1', prompt: '复盘残局守和。', tags: ['残局', '车残局'] }],
      themes: ['王的积极性'], summary: '识别到车残局。',
    },
  });

  it('creates versioned durable history entries with PGN, metadata, summary, key moments, and training advice', () => {
    const item = createReviewReportHistoryItem({
      id: 'report-1',
      savedAt: '2026-05-17T09:00:00.000Z',
      pgn: '[Event "Italian Win"]\n[White "Me"]\n[Black "A"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
      report: baseReport,
      analyses: [
        { moveIndex: 16, label: '9. Nxe5', san: 'Nxe5', quality: '败着', centipawnLoss: 420, beforeScore: 80, afterScore: -360, isSwingPoint: true, bestMoveSan: 'Re1', multiPvLines: [] },
      ],
      meta: { event: 'Italian Win', white: 'Me', black: 'A', result: '1-0' },
    });

    expect(item).toMatchObject({
      version: 1,
      id: 'report-1',
      savedAt: '2026-05-17T09:00:00.000Z',
      pgn: expect.stringContaining('[Event "Italian Win"]'),
      meta: { event: 'Italian Win', white: 'Me', black: 'A', result: '1-0' },
      isFavorite: false,
      summary: expect.stringContaining('最大失误：9. Nxe5'),
      trainingAdvice: expect.stringContaining('候选着法与风险控制'),
    });
    expect(item.keyMoments[0]).toMatchObject({ label: '9. Nxe5', quality: '败着', centipawnLoss: 420 });
  });

  it('searches, filters favorites, reopens reports, and aggregates history stats for strength profile linkage', () => {
    const first = createReviewReportHistoryItem({
      id: 'report-1', savedAt: '2026-05-17T09:00:00.000Z', pgn: '[Event "Ruy Lopez"]\n[White "Me"]\n[Black "A"]\n[Result "1-0"]\n\n1. e4 e5 1-0',
      report: baseReport,
      analyses: [
        { moveIndex: 16, label: '9. Nxe5', san: 'Nxe5', quality: '败着', centipawnLoss: 420, beforeScore: 80, afterScore: -360, isSwingPoint: true, bestMoveSan: 'Re1', multiPvLines: [] },
      ],
      meta: { event: 'Ruy Lopez', white: 'Me', black: 'A', result: '1-0' },
    });
    const second = createReviewReportHistoryItem({
      id: 'report-2', savedAt: '2026-05-18T09:00:00.000Z', pgn: '[Event "Queen Pawn"]\n[White "B"]\n[Black "Me"]\n[Result "0-1"]\n\n1. d4 d5 0-1',
      report: { ...baseReport, summary: '本局复盘完成，Queen Pawn，最大失误：12... Qh4，推荐训练：防守失败。', trainingAdvice: '优先训练防守失败。' },
      analyses: [
        { moveIndex: 22, label: '12... Qh4', san: 'Qh4', quality: '失误', centipawnLoss: 180, beforeScore: -40, afterScore: 140, isSwingPoint: true, bestMoveSan: 'Qc7', multiPvLines: [] },
      ],
      meta: { event: 'Queen Pawn', white: 'B', black: 'Me', result: '0-1' },
    });
    const favoriteSecond = toggleReviewReportHistoryFavorite([first, second], 'report-2')[1];
    const history = [first, favoriteSecond];

    expect(favoriteSecond.isFavorite).toBe(true);
    expect(filterReviewReportHistory(history, { query: 'queen', favoriteOnly: true })).toEqual([favoriteSecond]);
    expect(filterReviewReportHistory(history, { query: 'me', result: '1-0' })).toEqual([first]);

    const stats = buildReviewReportHistoryStats(history);
    expect(stats).toMatchObject({ totalReports: 2, favoriteReports: 1, totalKeyMoments: 2 });
    expect(stats.mostCommonTrainingAdvice[0]).toContain('候选着法与风险控制');
    expect(stats.summary).toContain('历史已沉淀 2 份复盘报告');
  });
});
describe('endgame training helpers', () => {
  it('detects endgame phase, classifies type, and generates training cards from late mistakes', () => {
    const plan = buildEndgameTrainingPlan({
      positions: [
        { fen: '8/8/8/8/8/8/4K3/4k3 w - - 0 1', label: '1. Kd2' },
        { fen: '8/8/8/8/8/8/4K3/R3k3 b - - 0 1', label: '1... Ke1' },
        { fen: '8/8/8/8/8/8/4K3/R3k3 w - - 0 2', label: '2. Ra8' },
      ],
      analyses: [
        {
          moveIndex: 1,
          label: '1... Ke1',
          san: 'Ke1',
          quality: '失误',
          centipawnLoss: 180,
          beforeScore: 0,
          afterScore: 260,
          isSwingPoint: true,
          bestMoveSan: 'Kd1',
          multiPvLines: [],
        },
      ],
    });

    expect(plan.phase).toBe('endgame');
    expect(plan.type).toBe('车残局');
    expect(plan.cards[0]).toMatchObject({
      label: '1... Ke1',
      missedChance: '错过守和机会',
      recommendedMove: 'Kd1',
      tags: ['残局', '车残局'],
    });
    expect(plan.themes).toContain('王的积极性');
    expect(plan.summary).toContain('识别到车残局');
  });
});
describe('middlegame plan training helpers', () => {
  it('builds a middlegame plan from swing points and recurring move-quality themes', () => {
    const plan = buildMiddlegamePlanTraining([
      {
        moveIndex: 10,
        label: '6. h3',
        san: 'h3',
        quality: '疑问手',
        centipawnLoss: 90,
        beforeScore: 35,
        afterScore: -55,
        isSwingPoint: false,
        bestMoveSan: 'Re1',
        multiPvLines: [],
      },
      {
        moveIndex: 15,
        label: '8... Nxe4',
        san: 'Nxe4',
        quality: '失误',
        centipawnLoss: 220,
        beforeScore: -20,
        afterScore: 210,
        isSwingPoint: true,
        bestMoveSan: 'c6',
        multiPvLines: [],
      },
      {
        moveIndex: 19,
        label: '10... g5',
        san: 'g5',
        quality: '败着',
        centipawnLoss: 360,
        beforeScore: 40,
        afterScore: 430,
        isSwingPoint: true,
        bestMoveSan: 'Re8',
        multiPvLines: [],
      },
    ]);

    expect(plan.focusCards).toHaveLength(2);
    expect(plan.focusCards[0]).toMatchObject({
      label: '10... g5',
      topic: '候选着法与风险控制',
      priority: 100,
      recommendedPlan: expect.stringContaining('Re8'),
      tags: ['中局', '败着'],
    });
    expect(plan.themeStats.map((theme) => theme.theme)).toContain('王翼兵形/王安全');
    expect(plan.summary).toContain('2 个关键中局计划点');
  });
});

describe('natural language coach helpers', () => {
  const blunderAnalysis = {
    moveIndex: 18,
    label: '10... g5',
    san: 'g5',
    quality: '败着' as const,
    centipawnLoss: 420,
    beforeScore: -80,
    afterScore: 360,
    isSwingPoint: true,
    bestMoveSan: 'Re8',
    primaryPv: ['Re8', 'Qf3', 'Bb7'],
    multiPvLines: [
      { rank: 1, score: { type: 'cp' as const, value: -80 }, pv: ['Re8', 'Qf3', 'Bb7'], uci: ['f8e8'], firstMoveSan: 'Re8', displayScore: '-0.80' },
      { rank: 2, score: { type: 'cp' as const, value: 120 }, pv: ['h6', 'Nf3'], uci: ['h7h6'], firstMoveSan: 'h6', displayScore: '+1.20' },
    ],
  };

  it('generates deterministic explanations for blunders with why-bad, impact, and candidate guidance', () => {
    const explanation = buildNaturalLanguagePositionExplanation({
      analysis: blunderAnalysis,
      reviewReport: {
        summary: '本局复盘完成，最大失误：10... g5，推荐训练：王翼兵形/王安全。',
        trainingAdvice: '优先训练王翼兵形/王安全，并把 10... g5 前的候选着法写成 2-3 个备选方案。',
      },
      candidateComparison: buildCandidateMultiPvComparison({
        rawCandidates: 'g5 - 扩张王翼\nRe8 - 先改善车的位置\nh6 - 防止 Bg5',
        selectedSan: 'g5',
        actualSan: 'g5',
        stockfishBestSan: 'Re8',
        multiPvLines: blunderAnalysis.multiPvLines,
      }),
    });

    expect(explanation).toMatchObject({
      moveLabel: '10... g5',
      severity: 'blunder',
      title: '10... g5：败着，需要优先复盘',
      recommendedCandidateMoves: ['Re8', 'h6'],
      practiceThemes: expect.arrayContaining(['王翼兵形/王安全', '候选着法与风险控制']),
    });
    expect(explanation.whyBad).toContain('损失 420 cp');
    expect(explanation.strategicImpact).toContain('局势突变');
    expect(explanation.candidateGuidance).toContain('优先比较 Re8');
    expect(explanation.markdown).toContain('## 为什么这步差');
    expect(explanation.markdown).toContain('## 应关注的候选着法');
  });

  it('recommends practice themes from reports, candidate misses, and history without external APIs', () => {
    const themes = buildPracticeThemeRecommendations({
      reviewReport: {
        trainingAdvice: '优先训练王翼兵形/王安全，并把 10... g5 前的候选着法写成 2-3 个备选方案。',
      },
      candidateStats: {
        sessions: 5,
        validSessions: 5,
        answerCovered: 2,
        bestCovered: 1,
        answerInCandidatesButNotSelected: 2,
        sortingScoreTotal: 260,
      },
      history: [
        {
          trainingAdvice: '优先训练王翼兵形/王安全，并把 10... g5 前的候选着法写成 2-3 个备选方案。',
          keyMoments: [{ quality: '败着', label: '10... g5' }],
        },
        {
          trainingAdvice: '优先训练候选着法与风险控制，并把 8. Qh5 前的候选着法写成 2-3 个备选方案。',
          keyMoments: [{ quality: '失误', label: '8. Qh5' }],
        },
      ],
    });

    expect(themes[0]).toMatchObject({
      theme: '王翼兵形/王安全',
      source: 'current-report',
      priority: 'high',
    });
    expect(themes.map((item) => item.theme)).toEqual(expect.arrayContaining(['候选着覆盖', '最佳着意识', '候选着排序执行']));
    expect(themes.some((item) => item.evidence.includes('历史报告'))).toBe(true);
  });

  it('builds a copyable coach report section that can be saved with the review report history', () => {
    const coach = buildNaturalLanguageCoachReport({
      analyses: [blunderAnalysis],
      reviewReport: {
        summary: '本局复盘完成，最大失误：10... g5，推荐训练：王翼兵形/王安全。',
        trainingAdvice: '优先训练王翼兵形/王安全，并把 10... g5 前的候选着法写成 2-3 个备选方案。',
      },
      candidateStats: {
        sessions: 2,
        validSessions: 2,
        answerCovered: 1,
        bestCovered: 1,
        answerInCandidatesButNotSelected: 1,
        sortingScoreTotal: 120,
      },
      history: [],
    });

    expect(coach.summary).toContain('自然语言教练生成 1 个局面解释');
    expect(coach.positionExplanations[0].markdown).toContain('10... g5');
    expect(coach.markdown).toContain('# 自然语言教练解释');
    expect(coach.markdown).toContain('## 推荐练习主题');
  });
});

describe('analysis controls, cache, and key moment helpers', () => {
  it('maps one-click analysis depth presets to engine depth, timeout, multipv, and labels', () => {
    expect(getAnalysisDepthPresetConfig('fast')).toMatchObject({ depth: 6, timeoutMs: 8000, multiPv: 1, label: '快速' });
    expect(getAnalysisDepthPresetConfig('standard')).toMatchObject({ depth: 10, timeoutMs: 15000, multiPv: 2, label: '标准' });
    expect(getAnalysisDepthPresetConfig('deep')).toMatchObject({ depth: 14, timeoutMs: 24000, multiPv: 3, label: '深度' });
  });

  it('builds stable cache keys from PGN and engine settings', () => {
    expect(
      buildGlobalAnalysisCacheKey({
        pgnText: '1. e4 e5',
        preset: 'standard',
        depth: 10,
        multiPv: 2,
        engineMode: 'wasm',
      }),
    ).toBe('pgn=1. e4 e5|preset=standard|depth=10|multiPv=2|engine=wasm');
  });

  it('classifies key moments by severity, swing, evaluation volatility, and reusable training value without mutating the source rows', () => {
    const analyses = [
      {
        moveIndex: 0,
        label: '1. e4',
        san: 'e4',
        quality: '好棋' as const,
        centipawnLoss: 20,
        beforeScore: 15,
        afterScore: 5,
        isSwingPoint: false,
        bestMoveSan: 'e4',
        multiPvLines: [],
      },
      {
        moveIndex: 5,
        label: '3... Nf6',
        san: 'Nf6',
        quality: '好棋' as const,
        centipawnLoss: 55,
        beforeScore: -220,
        afterScore: 190,
        isSwingPoint: false,
        bestMoveSan: 'c5',
        multiPvLines: [],
      },
      {
        moveIndex: 9,
        label: '5. Qh5',
        san: 'Qh5',
        quality: '疑问手' as const,
        centipawnLoss: 85,
        beforeScore: 40,
        afterScore: -45,
        isSwingPoint: false,
        bestMoveSan: 'Nc3',
        multiPvLines: [],
      },
      {
        moveIndex: 18,
        label: '10... g5',
        san: 'g5',
        quality: '败着' as const,
        centipawnLoss: 420,
        beforeScore: -80,
        afterScore: 360,
        isSwingPoint: true,
        bestMoveSan: 'Re8',
        multiPvLines: [],
      },
    ];

    const firstClassification = classifyKeyAnalysisMoment(analyses[0]);
    const volatileClassification = classifyKeyAnalysisMoment(analyses[1]);
    const mistakeClassification = classifyKeyAnalysisMoment(analyses[2]);
    const blunderClassification = classifyKeyAnalysisMoment(analyses[3]);
    const keyMoments = filterGlobalAnalysisMoments(analyses, 'key');
    const summary = buildKeyMomentSummary(keyMoments);

    expect(firstClassification.isKeyMoment).toBe(false);
    expect(volatileClassification).toMatchObject({
      isKeyMoment: true,
      severity: 'evaluation-swing',
      trainingValue: 'high',
      reasons: expect.arrayContaining(['大幅评价波动']),
    });
    expect(mistakeClassification).toMatchObject({
      isKeyMoment: true,
      severity: 'inaccuracy',
      trainingValue: 'medium',
      reasons: expect.arrayContaining(['疑问手']),
    });
    expect(blunderClassification).toMatchObject({
      isKeyMoment: true,
      severity: 'blunder',
      trainingValue: 'high',
      reasons: expect.arrayContaining(['败着', '局势突变', '大幅评价波动']),
    });
    expect(keyMoments.map((item) => item.san)).toEqual(['Nf6', 'Qh5', 'g5']);
    expect(keyMoments[0]).toBe(analyses[1]);
    expect(analyses.map((item) => Object.keys(item))).not.toContain('keyMoment');
    expect(summary).toContain('关键时刻 3 个');
    expect(summary).toContain('败着 1 个');
    expect(summary).toContain('高训练价值 2 个');
  });

  it('labels analysis perspective, evaluated side, mover, and no-user-context fallback for global rows', () => {
    const whiteGood = buildGlobalAnalysisPerspectiveLabel({
      moveColor: 'w',
      perspective: 'white',
      classification: '好棋',
      centipawnLoss: 20,
    });
    const blackMistake = buildGlobalAnalysisPerspectiveLabel({
      moveColor: 'b',
      perspective: 'sideToMove',
      classification: '失误',
      centipawnLoss: 180,
    });
    const boardPerspective = buildGlobalAnalysisPerspectiveLabel({
      moveColor: 'b',
      perspective: 'board',
      boardFlipped: true,
      classification: '败着',
      centipawnLoss: 360,
    });

    expect(whiteGood).toMatchObject({
      perspectiveLabel: '白方视角',
      evaluatedSideLabel: '白方',
      moverLabel: '白方',
      summary: '白方视角 · 评价方：白方 · 走棋方：白方 · 好棋，损失 20 cp',
    });
    expect(blackMistake).toMatchObject({
      perspectiveLabel: '本步走棋方视角',
      evaluatedSideLabel: '本步走棋方（黑方）',
      moverLabel: '黑方',
      summary: '本步走棋方视角 · 评价方：本步走棋方（黑方） · 走棋方：黑方 · 失误，损失 180 cp',
    });
    expect(boardPerspective).toMatchObject({
      perspectiveLabel: '棋盘视角（黑方在下）',
      evaluatedSideLabel: '本步走棋方（黑方）',
      moverLabel: '黑方',
    });
    expect(boardPerspective.summary).not.toContain('我方');
    expect(boardPerspective.summary).not.toContain('用户');
  });

  it('builds report rows with multipv lines and filters key training moments', () => {
    const report = buildGlobalAnalysisReport({
      moves: [
        { san: 'e4', color: 'w' },
        { san: 'e5', color: 'b' },
        { san: 'Qh5', color: 'w' },
      ],
      positionScores: [20, 25, 240, -180],
      bestMoves: ['e4', 'Nf6', 'Nc3'],
      multiPvByMove: [
        [{ rank: 1, score: { type: 'cp', value: 20 }, pv: ['e4', 'e5'], uci: ['e2e4'], firstMoveSan: 'e4', displayScore: '+0.20' }],
        [
          { rank: 1, score: { type: 'cp', value: 25 }, pv: ['Nf6'], uci: ['g8f6'], firstMoveSan: 'Nf6', displayScore: '+0.25' },
          { rank: 2, score: { type: 'cp', value: 10 }, pv: ['e5'], uci: ['e7e5'], firstMoveSan: 'e5', displayScore: '+0.10' },
        ],
        [{ rank: 1, score: { type: 'cp', value: 240 }, pv: ['Nc3'], uci: ['b1c3'], firstMoveSan: 'Nc3', displayScore: '+2.40' }],
      ],
    });

    expect(report[1]).toMatchObject({ san: 'e5', quality: '失误', bestMoveSan: 'Nf6' });
    expect(report[1].multiPvLines).toHaveLength(2);
    expect(report[1].multiPvLines[1]).toMatchObject({ rank: 2, pv: ['e5'] });

    const keyMoments = filterGlobalAnalysisMoments(report, 'key');
    expect(keyMoments.map((item) => item.san)).toEqual(['e5', 'Qh5']);
  });

  it('preserves completed MultiPV lines when an engine request resolves after the active ref is cleared', () => {
    const completed = completeEngineAnalysisFromRequest({
      request: {
        latest: {
          depth: 10,
          score: { type: 'cp', value: 25 },
          pv: ['Nf6'],
        },
        multiPvLines: [
          { rank: 1, score: { type: 'cp', value: 25 }, pv: ['Nf6'], uci: ['g8f6'], firstMoveSan: 'Nf6', displayScore: '+0.25' },
          { rank: 2, score: { type: 'cp', value: 10 }, pv: ['e5'], uci: ['e7e5'], firstMoveSan: 'e5', displayScore: '+0.10' },
        ],
      },
      bestMove: 'g8f6',
      bestMoveSan: 'Nf6',
    });

    const report = buildGlobalAnalysisReport({
      moves: [{ san: 'e5', color: 'b' }],
      positionScores: [20, 100],
      bestMoves: [completed.bestMoveSan],
      multiPvByMove: [completed.multiPvLines],
    });

    expect(completed.multiPvLines).toHaveLength(2);
    expect(report[0].multiPvLines).toEqual(completed.multiPvLines);
    expect(report[0].multiPvLines[1]).toMatchObject({ rank: 2, pv: ['e5'] });
  });

  it('uses rank-1 MultiPV score and PV as the completed primary analysis when lower-ranked info arrived last', () => {
    const completed = completeEngineAnalysisFromRequest({
      request: {
        latest: {
          depth: 12,
          score: { type: 'cp', value: 10 },
          pv: ['d4', 'd5'],
        },
        multiPvLines: [
          { rank: 2, score: { type: 'cp', value: 10 }, pv: ['d4', 'd5'], uci: ['d2d4', 'd7d5'], firstMoveSan: 'd4', displayScore: '+0.10' },
          { rank: 1, score: { type: 'cp', value: 35 }, pv: ['e4', 'e5'], uci: ['e2e4', 'e7e5'], firstMoveSan: 'e4', displayScore: '+0.35' },
        ],
      },
      bestMove: 'e2e4',
      bestMoveSan: 'e4',
    });

    expect(completed.score).toEqual({ type: 'cp', value: 35 });
    expect(completed.pv).toEqual(['e4', 'e5']);
  });

  it('builds a cancellable partial report only for moves whose before and after positions are complete', () => {
    const partial = buildGlobalAnalysisPartialReport({
      moves: [
        { san: 'e4', color: 'w' },
        { san: 'e5', color: 'b' },
        { san: 'Nf3', color: 'w' },
      ],
      positionScores: [20, 10, null],
      bestMoves: ['e4', 'Nf6'],
      primaryPvs: [['e4', 'e5'], ['Nf6']],
      multiPvByMove: [
        [{ rank: 1, score: { type: 'cp', value: 20 }, pv: ['e4'], uci: ['e2e4'], firstMoveSan: 'e4', displayScore: '+0.20' }],
        [{ rank: 1, score: { type: 'cp', value: 10 }, pv: ['Nf6'], uci: ['g8f6'], firstMoveSan: 'Nf6', displayScore: '+0.10' }],
      ],
    });

    expect(partial).toHaveLength(1);
    expect(partial[0]).toMatchObject({ san: 'e4', bestMoveSan: 'e4', beforeScore: 20, afterScore: 10 });
  });


  it('parses Stockfish MultiPV info into ranked SAN/UCI candidate lines with normalized score ordering', () => {
    const fen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const parsedFirst = parseStockfishInfo('info depth 12 multipv 2 score cp 18 pv d2d4 d7d5 c2c4', fen);
    const parsedSecond = parseStockfishInfo('info depth 12 multipv 1 score cp 32 pv e2e4 e7e5 g1f3', fen);

    expect(parsedFirst?.multiPvLine).toMatchObject({
      rank: 2,
      score: { type: 'cp', value: 18 },
      pv: ['d4', 'd5', 'c4'],
      uci: ['d2d4', 'd7d5', 'c2c4'],
      firstMoveSan: 'd4',
      displayScore: '+0.18',
    });
    expect(rankMultiPvLines([parsedFirst!.multiPvLine!, parsedSecond!.multiPvLine!]).map((line) => line.firstMoveSan)).toEqual(['e4', 'd4']);
  });

  it('formats MultiPV display lines and degrades to the existing best line when MultiPV data is absent', () => {
    expect(
      formatMultiPvDisplayLines({
        multiPvLines: [
          { rank: 2, score: { type: 'cp', value: 18 }, pv: ['d4', 'd5'], uci: ['d2d4', 'd7d5'], firstMoveSan: 'd4', displayScore: '+0.18' },
          { rank: 1, score: { type: 'cp', value: 32 }, pv: ['e4', 'e5'], uci: ['e2e4', 'e7e5'], firstMoveSan: 'e4', displayScore: '+0.32' },
        ],
        fallbackBestMoveSan: 'e4',
        fallbackPv: ['e4', 'e5'],
      }),
    ).toEqual(['#1 e4 · +0.32 · e4 e5 · UCI e2e4 e7e5', '#2 d4 · +0.18 · d4 d5 · UCI d2d4 d7d5']);

    expect(
      formatMultiPvDisplayLines({
        multiPvLines: [],
        fallbackBestMoveSan: 'Nf3',
        fallbackPv: ['Nf3', 'd5'],
      }),
    ).toEqual(['首选 Nf3 · 主线 Nf3 d5']);
  });

  it('keeps cancellation disabled before analysis starts so idle buttons cannot reset state by mistake', () => {
    const existingAnalysis = [
      {
        moveIndex: 0,
        label: '1. e4',
        san: 'e4',
        quality: '好棋' as const,
        centipawnLoss: 12,
        beforeScore: 20,
        afterScore: 8,
        isSwingPoint: false,
        bestMoveSan: 'e4',
        multiPvLines: [],
      },
    ];

    expect(
      buildGlobalAnalysisCancellationPlan({
        isAnalyzing: false,
        hasWorker: true,
        hasPendingRequest: false,
        existingAnalysis,
      }),
    ).toMatchObject({
      canCancel: false,
      shouldStopWorker: false,
      shouldRejectPendingRequest: false,
      nextAnalysis: existingAnalysis,
      nextProgress: '尚未开始整盘分析。',
      nextEngineStatus: 'ready',
      nextButtonLabel: '取消',
    });
  });

  it('cancels a running analysis by stopping worker/request and resetting progress, error, engine, and button state', () => {
    const existingAnalysis = [
      {
        moveIndex: 1,
        label: '1... e5',
        san: 'e5',
        quality: '疑问手' as const,
        centipawnLoss: 80,
        beforeScore: 20,
        afterScore: 100,
        isSwingPoint: false,
        bestMoveSan: 'c5',
        multiPvLines: [],
      },
    ];

    const plan = buildGlobalAnalysisCancellationPlan({
      isAnalyzing: true,
      hasWorker: true,
      hasPendingRequest: true,
      existingAnalysis,
      currentError: 'Stockfish 分析超时。',
    });

    expect(plan).toMatchObject({
      canCancel: true,
      shouldStopWorker: true,
      shouldRejectPendingRequest: true,
      shouldMarkCanceled: true,
      shouldKeepExistingAnalysis: true,
      nextIsAnalyzing: false,
      nextProgress: '已取消：Worker 已停止；已完成分析结果不会被本次取消污染。',
      nextError: '',
      nextEngineStatus: 'ready',
      nextButtonLabel: '分析整盘',
    });
    expect(plan.nextAnalysis).toBe(existingAnalysis);
  });

  it('allows a fresh analysis run after cancellation reset', () => {
    const afterCancel = buildGlobalAnalysisCancellationPlan({
      isAnalyzing: true,
      hasWorker: false,
      hasPendingRequest: true,
      existingAnalysis: [],
    });

    expect(afterCancel.nextIsAnalyzing).toBe(false);
    expect(afterCancel.nextCancelToken).toBe(false);
    expect(afterCancel.nextEngineStatus).toBe('idle');
    expect(afterCancel.nextButtonLabel).toBe('分析整盘');
  });
});

describe('global game analysis helpers', () => {
  it('labels moves by centipawn loss from the mover perspective', () => {
    expect(classifyMoveFromEvaluationDrop(35)).toBe('好棋');
    expect(classifyMoveFromEvaluationDrop(80)).toBe('疑问手');
    expect(classifyMoveFromEvaluationDrop(180)).toBe('失误');
    expect(classifyMoveFromEvaluationDrop(420)).toBe('败着');
  });

  it('preserves the full engine primary PV for fallback display when MultiPV is empty', () => {
    const report = buildGlobalAnalysisReport({
      moves: [{ san: 'e4', color: 'w' }],
      positionScores: [20, 12],
      bestMoves: ['Nf3'],
      primaryPvs: [['Nf3', 'Nc6', 'Bb5']],
      multiPvByMove: [[]],
    });

    expect(report[0].primaryPv).toEqual(['Nf3', 'Nc6', 'Bb5']);
    expect(
      formatMultiPvDisplayLines({
        multiPvLines: report[0].multiPvLines,
        fallbackBestMoveSan: report[0].bestMoveSan,
        fallbackPv: report[0].primaryPv ?? [],
      }),
    ).toEqual(['首选 Nf3 · 主线 Nf3 Nc6 Bb5']);
  });

  it('detects evaluation swing points at major drops or side changes', () => {
    expect(detectSwingPoint(40, -120, 160)).toBe(true);
    expect(detectSwingPoint(220, 80, 140)).toBe(false);
  });

  it('converts mate scores into bounded centipawns from white perspective', () => {
    expect(scoreToWhiteCentipawns({ type: 'mate', value: 2 })).toBe(10000);
    expect(scoreToWhiteCentipawns({ type: 'mate', value: -3 })).toBe(-10000);
    expect(scoreToWhiteCentipawns({ type: 'cp', value: -75 })).toBe(-75);
  });
});

describe('mistake book helpers', () => {
  it('builds a mistake card from a wrong guess result', () => {
    const card = buildMistakeCardFromGuess({
      baseFen: 'start-fen',
      positionLabel: '3. Bb5',
      result: analyzeGuessMove({ guessedSan: 'Bc4', actualSan: 'Bb5', stockfishBestSan: 'Bb5' }),
      pgnText: '1. e4 e5 2. Nf3 Nc6 3. Bb5',
    });

    expect(card).toMatchObject({
      fen: 'start-fen',
      positionLabel: '3. Bb5',
      guessedSan: 'Bc4',
      actualSan: 'Bb5',
      stockfishBestSan: 'Bb5',
      attempts: 1,
      solvedCount: 0,
      reviewStage: 0,
      dueAt: expect.any(String),
      tags: ['猜下一手'],
    });
    expect(card?.id).toContain('start-fen');
  });

  it('does not create a mistake card for a correct guess', () => {
    const card = buildMistakeCardFromGuess({
      baseFen: 'start-fen',
      positionLabel: '1. e4',
      result: analyzeGuessMove({ guessedSan: 'e4', actualSan: 'e4', stockfishBestSan: 'e4' }),
      pgnText: '1. e4',
    });

    expect(card).toBeNull();
  });

  it('upserts mistake cards by id and increments attempts on repeated mistakes', () => {
    const card = buildMistakeCardFromGuess({
      baseFen: 'same-fen',
      positionLabel: '4... Nf6',
      result: analyzeGuessMove({ guessedSan: 'd6', actualSan: 'Nf6', stockfishBestSan: 'Nf6' }),
      pgnText: 'sample pgn',
    });

    expect(card).not.toBeNull();
    const inserted = upsertMistakeCard([], card!);
    const updated = upsertMistakeCard(inserted, { ...card!, guessedSan: 'Be7' });

    expect(updated).toHaveLength(1);
    expect(updated[0]).toMatchObject({ attempts: 2, guessedSan: 'Be7', reviewStage: 0 });
  });

  it('advances spaced review stages after successful reviews and schedules the next due date', () => {
    const card = buildMistakeCardFromGuess({
      baseFen: 'review-fen',
      positionLabel: '6. O-O',
      result: analyzeGuessMove({ guessedSan: 'h3', actualSan: 'O-O', stockfishBestSan: 'O-O' }),
      pgnText: 'sample pgn',
    });

    const reviewed = updateMistakeCardReview(card!, true, new Date('2026-05-15T00:00:00.000Z'));

    expect(getSpacedReviewIntervalDays(reviewed.reviewStage)).toBe(3);
    expect(reviewed).toMatchObject({ solvedCount: 1, attempts: 2, reviewStage: 1 });
    expect(reviewed.dueAt).toBe('2026-05-18T00:00:00.000Z');
  });

  it('resets review stage after failed reviews and keeps the card due immediately', () => {
    const card = {
      ...buildMistakeCardFromGuess({
        baseFen: 'failed-fen',
        positionLabel: '9... Re8',
        result: analyzeGuessMove({ guessedSan: 'h6', actualSan: 'Re8', stockfishBestSan: 'Re8' }),
        pgnText: 'sample pgn',
      })!,
      reviewStage: 2,
    };

    const reviewed = updateMistakeCardReview(card, false, new Date('2026-05-15T00:00:00.000Z'));

    expect(reviewed).toMatchObject({ solvedCount: 0, attempts: 2, reviewStage: 0 });
    expect(reviewed.dueAt).toBe('2026-05-15T00:00:00.000Z');
  });

  it('builds a daily training plan from due cards first, then weak-tag review cards', () => {
    const dueCard = {
      ...buildMistakeCardFromGuess({
        baseFen: 'due-fen',
        positionLabel: '2. Nf3',
        result: analyzeGuessMove({ guessedSan: 'Bc4', actualSan: 'Nf3', stockfishBestSan: 'Nf3' }),
        pgnText: 'pgn',
      })!,
      tags: ['战术'],
      dueAt: '2026-05-14T00:00:00.000Z',
    };
    const futureWeakCard = {
      ...buildMistakeCardFromGuess({
        baseFen: 'weak-fen',
        positionLabel: '8. Re1',
        result: analyzeGuessMove({ guessedSan: 'a3', actualSan: 'Re1', stockfishBestSan: 'Re1' }),
        pgnText: 'pgn',
      })!,
      tags: ['战术'],
      dueAt: '2026-06-01T00:00:00.000Z',
    };

    const plan = buildDailyTrainingPlan([futureWeakCard, dueCard], new Date('2026-05-15T00:00:00.000Z'), 10);

    expect(plan.map((card) => card.id)).toEqual([dueCard.id, futureWeakCard.id]);
  });
});
