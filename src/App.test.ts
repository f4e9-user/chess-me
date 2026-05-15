import { describe, expect, it } from 'vitest';
import {
  analyzeCandidateMoveTraining,
  analyzeGuessMove,
  buildDailyTrainingPlan,
  buildMistakeCardFromGuess,
  buildOpeningImprovementPlan,
  buildMiddlegamePlanTraining,
  classifyMoveFromEvaluationDrop,
  detectSwingPoint,
  getSpacedReviewIntervalDays,
  identifyOpening,
  normalizeSan,
  parseCandidateMoveEntries,
  scoreToWhiteCentipawns,
  updateMistakeCardReview,
  upsertMistakeCard,
} from './App';

describe('guess next move training helpers', () => {
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

  it('requires at least two candidate moves before scoring', () => {
    const result = analyzeCandidateMoveTraining({
      rawCandidates: 'Nf3 - 发展',
      selectedSan: 'Nf3',
      actualSan: 'Nf3',
      stockfishBestSan: 'Nf3',
    });

    expect(result.isValid).toBe(false);
    expect(result.validationMessage).toContain('至少写出 2 个候选着法');
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

describe('global game analysis helpers', () => {
  it('labels moves by centipawn loss from the mover perspective', () => {
    expect(classifyMoveFromEvaluationDrop(35)).toBe('好棋');
    expect(classifyMoveFromEvaluationDrop(80)).toBe('疑问手');
    expect(classifyMoveFromEvaluationDrop(180)).toBe('失误');
    expect(classifyMoveFromEvaluationDrop(420)).toBe('败着');
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
