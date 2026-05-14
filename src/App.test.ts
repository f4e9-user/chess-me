import { describe, expect, it } from 'vitest';
import {
  analyzeGuessMove,
  classifyMoveFromEvaluationDrop,
  detectSwingPoint,
  normalizeSan,
  scoreToWhiteCentipawns,
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
