import { Fragment, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from 'react';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';

const layoutRegionClassNames = {
  appShell: 'app-shell',
  mainWorkspace: 'main-workspace',
  boardColumn: 'board-column',
  panelColumn: 'panel-column',
  resultsArea: 'results-area',
} as const;

const layoutRegionProps = {
  appShell: { className: layoutRegionClassNames.appShell, 'aria-label': 'Chess Me 应用外壳' },
  mainWorkspace: { className: layoutRegionClassNames.mainWorkspace, 'aria-label': '国际象棋复盘主工作区' },
  boardColumn: { className: layoutRegionClassNames.boardColumn, 'aria-label': '棋盘区' },
  panelColumn: { className: layoutRegionClassNames.panelColumn, 'aria-label': '功能区' },
  resultsArea: { className: layoutRegionClassNames.resultsArea, 'aria-label': '结果区' },
} as const;

function getLayoutRegionClassNames() {
  return layoutRegionClassNames;
}

function getLayoutRegionProps() {
  return layoutRegionProps;
}

type LayoutPanelRegion = 'boardColumn' | 'panelColumn' | 'resultsArea';

type LayoutPanelGroup = {
  id: string;
  className: string;
  title: string;
  ariaLabel: string;
  region: LayoutPanelRegion;
  order: number;
  modules: readonly string[];
};

const layoutPanelGroups = [
  { id: 'board-focus', className: 'workspace-panel board-focus-panel', title: '棋盘与局面显示', ariaLabel: '棋盘与局面显示', region: 'boardColumn', order: 1, modules: ['board', 'capturedPieces', 'replayControls', 'variationTools', 'notes', 'fen'] },
  { id: 'history-import', className: 'workspace-panel history-import-panel', title: '历史与导入入口', ariaLabel: '历史与导入入口', region: 'panelColumn', order: 2, modules: ['importExport', 'bulkPgnLibrary'] },
  { id: 'current-game-input', className: 'workspace-panel current-game-input-panel', title: '当前对局输入', ariaLabel: '当前对局输入', region: 'panelColumn', order: 3, modules: ['pgnFenSwitch', 'gameText', 'moveList'] },
  { id: 'current-analysis', className: 'workspace-panel current-analysis-panel', title: '当前分析结果', ariaLabel: '当前分析结果', region: 'resultsArea', order: 4, modules: ['evaluationSide', 'stockfish', 'opening', 'globalAnalysis'] },
  { id: 'coach', className: 'workspace-panel coach-panel', title: '自然语言教练', ariaLabel: '自然语言教练', region: 'resultsArea', order: 5, modules: ['naturalLanguageCoach'] },
  { id: 'review-report', className: 'workspace-panel review-report-panel', title: '复盘报告', ariaLabel: '复盘报告', region: 'resultsArea', order: 6, modules: ['reviewReport'] },
  { id: 'training-plan', className: 'workspace-panel training-plan-panel', title: '训练建议', ariaLabel: '训练建议', region: 'resultsArea', order: 7, modules: ['guessTraining', 'mistakeBook', 'middlegamePlan', 'endgameTraining'] },
  { id: 'strength-profile', className: 'workspace-panel strength-profile-panel', title: '棋力画像', ariaLabel: '棋力画像', region: 'resultsArea', order: 8, modules: ['strengthProfile'] },
  { id: 'review-history', className: 'workspace-panel review-history-panel', title: '历史复盘', ariaLabel: '历史复盘', region: 'resultsArea', order: 9, modules: ['reviewReportHistory'] },
] as const satisfies readonly LayoutPanelGroup[];

function getLayoutPanelGroups() {
  return layoutPanelGroups;
}

function getLayoutPanelGroup(id: (typeof layoutPanelGroups)[number]['id']) {
  return layoutPanelGroups.find((group) => group.id === id)!;
}

function getLayoutPanelProps(id: (typeof layoutPanelGroups)[number]['id']) {
  const group = getLayoutPanelGroup(id);
  return { className: group.className, 'aria-label': group.ariaLabel, style: { order: group.order } };
}

function WorkspacePanel({ groupId, children }: { groupId: (typeof layoutPanelGroups)[number]['id']; children: ReactNode }) {
  const group = getLayoutPanelGroup(groupId);
  return (
    <section {...getLayoutPanelProps(groupId)}>
      <div className="workspace-panel-heading"><span>{group.title}</span></div>
      <div className="workspace-panel-body">{children}</div>
    </section>
  );
}

const responsiveAccessibleControls = ['orientation', 'replay', 'importExport', 'moveList', 'analysis', 'training'] as const;

const responsiveLayoutConfig = {
  desktop: {
    minWidth: 981,
    workspaceColumns: 'board-and-panel',
    resultsPlacement: 'full-width',
  },
  tablet: {
    maxWidth: 980,
    workspaceColumns: 'single-column',
    panelCollapse: 'stacked',
    accessibleControls: responsiveAccessibleControls,
  },
  phone: {
    maxWidth: 560,
    workspaceColumns: 'single-column',
    panelCollapse: 'compact-cards',
    accessibleControls: responsiveAccessibleControls,
  },
} as const;

const responsiveCollapseSections = [
  { id: layoutRegionClassNames.boardColumn, label: layoutRegionProps.boardColumn['aria-label'], defaultExpanded: true },
  { id: layoutRegionClassNames.panelColumn, label: layoutRegionProps.panelColumn['aria-label'], defaultExpanded: true },
  { id: layoutRegionClassNames.resultsArea, label: layoutRegionProps.resultsArea['aria-label'], defaultExpanded: true },
] as const;

function getResponsiveLayoutConfig() {
  return responsiveLayoutConfig;
}

function getResponsiveCollapseSections() {
  return responsiveCollapseSections;
}

type ReplayMode = 'pgn' | 'fen';

type ReplayPosition = {
  fen: string;
  label: string;
  move?: Move;
  comment?: string;
};

type VariationPosition = {
  fen: string;
  label: string;
  move: Move;
};

type SavedVariation = {
  id: string;
  baseIndex: number;
  baseFen: string;
  moves: string[];
  labels: string[];
};

type ParseResult = {
  positions: ReplayPosition[];
  moves: Move[];
  error?: string;
  source: ReplayMode;
  headers: Record<string, string>;
};

type BulkPgnSource = 'lichess' | 'chess.com' | 'manual' | 'unknown';
type BulkPgnPlayerColor = 'white' | 'black' | 'unknown';
type BulkPgnPlayerResult = 'win' | 'loss' | 'draw' | 'ongoing' | 'unknown';
type BulkPgnSortBy = 'date' | 'opponent' | 'result' | 'opening' | 'source' | 'important';

type BulkPgnFileInput = {
  filename: string;
  content: string;
  source?: BulkPgnSource;
};

type BulkPgnGameSummary = {
  id: string;
  filename: string;
  event: string;
  site: string;
  playedAt: string;
  source: BulkPgnSource;
  white: string;
  black: string;
  opponent: string;
  playerColor: BulkPgnPlayerColor;
  playerResult: BulkPgnPlayerResult;
  result: string;
  openingEco: string;
  openingName: string;
  moveCount: number;
  content: string;
  fingerprint: string;
  isImportant: boolean;
  historyReportId?: string;
};

type BulkPgnImportError = {
  filename: string;
  event: string;
  message: string;
};

type BulkPgnDuplicate = {
  filename: string;
  event: string;
  duplicateOf: string;
};

type BulkPgnLibrary = {
  games: BulkPgnGameSummary[];
  errors: BulkPgnImportError[];
  duplicates: BulkPgnDuplicate[];
  summary: string;
};

type TextUpdateOptions = {
  preserveBulkPgnLibrary?: boolean;
};

type BulkPgnLibraryFilters = {
  source?: BulkPgnSource | 'all';
  dateFrom?: string;
  dateTo?: string;
  opponent?: string;
  result?: BulkPgnPlayerResult | 'all';
  color?: BulkPgnPlayerColor | 'all';
  opening?: string;
  importantOnly?: boolean;
  sortBy?: BulkPgnSortBy;
  sortDirection?: 'asc' | 'desc';
  playerName?: string;
};

type BulkPgnLibraryInsights = {
  totalGames: number;
  results: {
    whiteWins: number;
    blackWins: number;
    draws: number;
    ongoing: number;
  };
  openings: OpeningStat[];
  trainingPriorities: string[];
  summary: string;
};

type PgnComment = {
  fen: string;
  comment: string;
};

type PendingPromotion = {
  from: Square;
  to: Square;
};

type MoveInput = {
  from: Square;
  to: Square;
  promotion?: Exclude<PieceSymbol, 'p' | 'k'>;
};

type CapturedPieces = Record<Color, PieceSymbol[]>;

type ToastMessage = {
  type: 'success' | 'error';
  text: string;
};

type EngineStatus = 'idle' | 'loading' | 'ready' | 'analyzing' | 'error';

type StockfishAnalysis = {
  depth: number;
  score: {
    type: 'cp' | 'mate';
    value: number;
  } | null;
  bestMove: string;
  bestMoveSan: string;
  pv: string[];
  multiPvLines?: MultiPvLine[];
};

type EvaluationPerspective = 'white' | 'sideToMove' | 'board';
type EngineMode = 'wasm' | 'asm';
type MoveQualityLabel = '好棋' | '疑问手' | '失误' | '败着';
type KeyMomentSeverity = 'inaccuracy' | 'mistake' | 'blunder' | 'evaluation-swing';
type KeyMomentTrainingValue = 'medium' | 'high';

type KeyAnalysisMomentClassification = {
  isKeyMoment: boolean;
  severity: KeyMomentSeverity | null;
  trainingValue: KeyMomentTrainingValue | null;
  reasons: string[];
};

type GlobalAnalysisPerspectiveLabel = {
  perspectiveLabel: string;
  evaluatedSideLabel: string;
  moverLabel: string;
  summary: string;
};

type GuessMoveResult = {
  guessedSan: string;
  actualSan: string;
  stockfishBestSan: string;
  isCorrect: boolean;
  matchesStockfish: boolean;
  summary: string;
};

type GuessStats = {
  correct: number;
  wrong: number;
};

type CandidateMoveEntry = {
  moveSan: string;
  reason: string;
};

type CandidateMultiPvFeedbackLabel = '最佳着法' | '可接受着法' | '风险着法' | '漏算着法';

type CandidateMultiPvComparisonRow = CandidateMoveEntry & {
  isSelected: boolean;
  matchedRank: number | null;
  scoreGapCp: number | null;
  feedbackLabel: CandidateMultiPvFeedbackLabel;
  keyVariation: string;
  explanation: string;
  perspectiveLabel: string;
  evaluatedSideLabel: string;
  moverLabel: string;
  summary: string;
};

type CandidateMultiPvComparison = {
  multiPvAvailable: boolean;
  rows: CandidateMultiPvComparisonRow[];
  selectedRow: CandidateMultiPvComparisonRow | null;
  summary: string;
};

type CandidateMoveTrainingResult = {
  entries: CandidateMoveEntry[];
  candidateCount: number;
  isValid: boolean;
  validationMessage: string;
  selectedSan: string;
  actualSan: string;
  stockfishBestSan: string;
  hasActualInCandidates: boolean;
  hasBestInCandidates: boolean;
  selectedIsActual: boolean;
  selectedIsBest: boolean;
  answerInCandidatesButNotSelected: boolean;
  sortingScore: number;
  multiPvComparison: CandidateMultiPvComparison;
  summary: string;
};

type CandidateTrainingStats = {
  sessions: number;
  validSessions: number;
  answerCovered: number;
  bestCovered: number;
  answerInCandidatesButNotSelected: number;
  sortingScoreTotal: number;
};

type CandidateTrainingSession = {
  id: string;
  positionLabel: string;
  result: CandidateMoveTrainingResult;
  createdAt: string;
};

type MistakeCard = {
  id: string;
  fen: string;
  positionLabel: string;
  guessedSan: string;
  actualSan: string;
  stockfishBestSan: string;
  pgnText: string;
  attempts: number;
  solvedCount: number;
  reviewStage: number;
  dueAt: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

type AnalysisDepthPreset = 'fast' | 'standard' | 'deep';
type EvaluationSide = 'white' | 'black' | 'both';
type GlobalAnalysisMomentFilter = 'all' | 'key' | 'white' | 'black' | 'key-white' | 'key-black';

type AnalysisDepthPresetConfig = {
  depth: number;
  timeoutMs: number;
  multiPv: number;
  label: string;
  description: string;
};

type MultiPvLine = {
  rank: number;
  score: StockfishAnalysis['score'];
  pv: string[];
  uci: string[];
  firstMoveSan: string;
  displayScore: string;
};

type GlobalMoveAnalysis = {
  moveIndex: number;
  label: string;
  san: string;
  moveColor?: Color;
  quality: MoveQualityLabel;
  centipawnLoss: number;
  beforeScore: number | null;
  afterScore: number | null;
  isSwingPoint: boolean;
  bestMoveSan: string;
  primaryPv?: string[];
  multiPvLines: MultiPvLine[];
};

type StockfishInfoAnalysis = Partial<StockfishAnalysis> & {
  multiPvLine?: MultiPvLine;
};

type EngineAnalysisRequest = {
  fen: string;
  resolve: (analysis: StockfishAnalysis & { multiPvLines: MultiPvLine[] }) => void;
  reject: (error: Error) => void;
  latest: Partial<StockfishAnalysis>;
  multiPvLines: MultiPvLine[];
  timeoutId: number;
};

type CompletedEngineAnalysisInput = {
  request: Pick<EngineAnalysisRequest, 'latest' | 'multiPvLines'> | null | undefined;
  bestMove: string;
  bestMoveSan: string;
};

type OpeningEntry = {
  eco: string;
  name: string;
  moves: string[];
};

type OpeningMatch = {
  eco: string;
  name: string;
  status: 'start' | 'book' | 'recognized' | 'deviation' | 'unknown';
  matchedPly: number;
  nextBookMove?: string;
  deviationMove?: string;
};

type OpeningImprovementCard = {
  id: string;
  openingName: string;
  eco: string;
  deviationPly: number;
  playedMove: string;
  bookMove: string;
  reviewPrompt: string;
  tags: string[];
};

type OpeningStat = {
  eco: string;
  name: string;
  games: number;
  deviations: number;
  deviationRate: number;
};

type OpeningImprovementPlan = {
  commonOpenings: OpeningStat[];
  deviationCards: OpeningImprovementCard[];
  summary: string;
};

type MiddlegamePlanCard = {
  id: string;
  moveIndex: number;
  label: string;
  san: string;
  topic: string;
  priority: number;
  recommendedPlan: string;
  reason: string;
  tags: string[];
};

type MiddlegameThemeStat = {
  theme: string;
  count: number;
  totalLoss: number;
};

type MiddlegamePlanTraining = {
  focusCards: MiddlegamePlanCard[];
  themeStats: MiddlegameThemeStat[];
  summary: string;
};

type EndgameType = '车残局' | '后残局' | '轻子残局' | '兵残局' | '混合残局' | '非残局';

type EndgameTrainingCard = {
  id: string;
  moveIndex: number;
  label: string;
  san: string;
  moverLabel: string;
  evaluatedSideLabel: string;
  endgameType: EndgameType;
  missedChance: string;
  recommendedMove: string;
  prompt: string;
  tags: string[];
};

type EndgameTrainingPlan = {
  phase: 'endgame' | 'not-endgame';
  type: EndgameType;
  cards: EndgameTrainingCard[];
  themes: string[];
  summary: string;
};

type ReviewReport = {
  summary: string;
  biggestMistake: GlobalMoveAnalysis | null;
  sections: {
    opening: string;
    middlegame: string;
    endgame: string;
    biggestMistake: string;
  };
  trainingAdvice: string;
  markdown: string;
};

type NaturalLanguagePracticeTheme = {
  theme: string;
  priority: 'high' | 'medium' | 'low';
  source: 'current-report' | 'candidate-training' | 'history';
  evidence: string;
  nextAction: string;
};

type NaturalLanguagePositionExplanation = {
  moveLabel: string;
  severity: KeyMomentSeverity | 'normal';
  title: string;
  whyBad: string;
  strategicImpact: string;
  candidateGuidance: string;
  recommendedCandidateMoves: string[];
  practiceThemes: string[];
  markdown: string;
};

type NaturalLanguageCoachReport = {
  summary: string;
  filterLabel: string;
  positionExplanations: NaturalLanguagePositionExplanation[];
  practiceThemes: NaturalLanguagePracticeTheme[];
  markdown: string;
};

type ReviewReportHistoryMeta = {
  event: string;
  white: string;
  black: string;
  result: string;
};

type ReviewReportHistoryKeyMoment = Pick<GlobalMoveAnalysis, 'moveIndex' | 'label' | 'san' | 'quality' | 'centipawnLoss' | 'bestMoveSan'> &
  Pick<GlobalAnalysisPerspectiveLabel, 'perspectiveLabel' | 'evaluatedSideLabel' | 'moverLabel'>;

type ReviewReportHistoryItem = {
  version: 1;
  id: string;
  savedAt: string;
  pgn: string;
  meta: ReviewReportHistoryMeta;
  summary: string;
  analysisSummary: string;
  keyMoments: ReviewReportHistoryKeyMoment[];
  strengthProfileAnalyses?: GlobalMoveAnalysis[];
  trainingAdvice: string;
  markdown: string;
  isFavorite: boolean;
};

type ReviewReportHistoryFilters = {
  query?: string;
  result?: string;
  favoriteOnly?: boolean;
};

type ReviewReportHistoryStats = {
  totalReports: number;
  favoriteReports: number;
  totalKeyMoments: number;
  mostCommonTrainingAdvice: string[];
  summary: string;
};

type StrengthPhaseBreakdown = {
  phase: '开局' | '中局' | '残局';
  mistakes: number;
  totalLoss: number;
};

type StrengthMistakeType = {
  type: string;
  count: number;
  totalLoss: number;
};

type StrengthRadarAxis = {
  axis: string;
  score: number;
  note: string;
};

type StrengthProfileRange = 'current' | 'recent-1' | 'recent-5' | 'recent-20' | 'all';

type StrengthProfileColorStats = {
  totalMoves: number;
  keyMoments: number;
  totalLoss: number;
  mistakeCount: number;
};

type StrengthProfileGameSnapshot = {
  id: string;
  title: string;
  importedAt: string;
  analyses: GlobalMoveAnalysis[];
  perColor: Record<'white' | 'black', StrengthProfileColorStats>;
};

type StrengthProfileSampleInfo = {
  gameCount: number;
  rangeLabel: string;
};

type StrengthProfile = {
  summary: string;
  phaseBreakdown: StrengthPhaseBreakdown[];
  mistakeTypes: StrengthMistakeType[];
  weakAreas: string[];
  trainingPriorities: string[];
  radarAxes: StrengthRadarAxis[];
  sampleInfo?: StrengthProfileSampleInfo;
};

const initialPgn = `[Event "Training Review"]
[Site "Chess Me"]
[Date "2026.05.14"]
[Round "-"]
[White "You"]
[Black "Opponent"]
[Result "*"]

1. e4 {抢占中心。} e5 2. Nf3 Nc6 3. Bb5 {西班牙开局。} a6 *`;

const initialFen = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
const notesStorageKey = 'chess-me:position-notes:v1';
const reviewReportHistoryStorageKey = 'chess-me:review-report-history:v1';
const stockfishWorkerUrl = '/stockfish/stockfish-18-lite-single.js';
const stockfishWasmUrl = '/stockfish/stockfish-18-lite-single.wasm';
const stockfishAsmWorkerUrl = '/stockfish/stockfish-18-asm.js';
const analysisDepthPresets: Record<AnalysisDepthPreset, AnalysisDepthPresetConfig> = {
  fast: {
    depth: 6,
    timeoutMs: 8000,
    multiPv: 1,
    label: '快速',
    description: '快速巡检，适合先找明显战术问题。',
  },
  standard: {
    depth: 10,
    timeoutMs: 15000,
    multiPv: 2,
    label: '标准',
    description: '平衡速度与准确度，并展示两个候选主线。',
  },
  deep: {
    depth: 14,
    timeoutMs: 24000,
    multiPv: 3,
    label: '深度',
    description: '更长思考时间，适合赛后精细复盘。',
  },
};

const swingPointThreshold = 150;
const guessStatsStorageKey = 'chess-me:guess-stats:v1';
const mistakeBookStorageKey = 'chess-me:mistake-book:v1';
const candidateTrainingStatsStorageKey = 'chess-me:candidate-training-stats:v1';
const candidateTrainingSessionsStorageKey = 'chess-me:candidate-training-sessions:v1';
const sessionSnapshotStorageKey = 'chess-me:session-snapshot:v1';

type SessionSnapshot = {
  mode: ReplayMode;
  text: string;
  positionIndex: number;
  globalAnalysis: GlobalMoveAnalysis[];
  evaluationSide: EvaluationSide;
  evaluationPerspective: EvaluationPerspective;
  reviewReportEvaluationSide: EvaluationSide;
  middlegamePlanEvaluationSide: EvaluationSide;
  endgameTrainingEvaluationSide: EvaluationSide;
  isBoardFlipped: boolean;
  analysisDepthPreset: AnalysisDepthPreset;
  globalAnalysisFilter: GlobalAnalysisMomentFilter;
  savedVariations: SavedVariation[];
  variationPositions: VariationPosition[];
  variationIndex: number;
  notesByPosition: Record<string, string>;
  rightPanelTab: RightPanelTab;
  bulkPgnLibrary: BulkPgnLibrary | null;
  bulkPgnFilters: BulkPgnLibraryFilters;
  savedAt: string;
};

const openingBook: OpeningEntry[] = [
  { eco: 'A00', name: '初始局面', moves: [] },
  { eco: 'A10', name: 'English Opening', moves: ['c4'] },
  { eco: 'A40', name: "Queen's Pawn Game", moves: ['d4'] },
  { eco: 'A45', name: 'Trompowsky Attack', moves: ['d4', 'Nf6', 'Bg5'] },
  { eco: 'A46', name: 'London System', moves: ['d4', 'Nf6', 'Bf4'] },
  { eco: 'A50', name: "Queen's Pawn: Indian Game", moves: ['d4', 'Nf6'] },
  { eco: 'A57', name: 'Benko Gambit', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5'] },
  { eco: 'A80', name: 'Dutch Defense', moves: ['d4', 'f5'] },
  { eco: 'B00', name: "King's Pawn Game", moves: ['e4'] },
  { eco: 'B01', name: 'Scandinavian Defense', moves: ['e4', 'd5'] },
  { eco: 'B06', name: 'Modern Defense', moves: ['e4', 'g6'] },
  { eco: 'B07', name: 'Pirc Defense', moves: ['e4', 'd6', 'd4', 'Nf6', 'Nc3', 'g6'] },
  { eco: 'B10', name: 'Caro-Kann Defense', moves: ['e4', 'c6'] },
  { eco: 'B12', name: 'Caro-Kann: Advance Variation', moves: ['e4', 'c6', 'd4', 'd5', 'e5'] },
  { eco: 'B20', name: 'Sicilian Defense', moves: ['e4', 'c5'] },
  { eco: 'B30', name: 'Sicilian Defense: Open', moves: ['e4', 'c5', 'Nf3'] },
  { eco: 'B33', name: 'Sicilian Defense: Sveshnikov', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'e5'] },
  { eco: 'B50', name: 'Sicilian Defense: Modern Variations', moves: ['e4', 'c5', 'Nf3', 'd6'] },
  { eco: 'B90', name: 'Sicilian Defense: Najdorf', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'] },
  { eco: 'C00', name: 'French Defense', moves: ['e4', 'e6'] },
  { eco: 'C02', name: 'French Defense: Advance Variation', moves: ['e4', 'e6', 'd4', 'd5', 'e5'] },
  { eco: 'C20', name: 'Open Game', moves: ['e4', 'e5'] },
  { eco: 'C25', name: 'Vienna Game', moves: ['e4', 'e5', 'Nc3'] },
  { eco: 'C30', name: "King's Gambit", moves: ['e4', 'e5', 'f4'] },
  { eco: 'C41', name: "Philidor Defense", moves: ['e4', 'e5', 'Nf3', 'd6'] },
  { eco: 'C42', name: "Petrov's Defense", moves: ['e4', 'e5', 'Nf3', 'Nf6'] },
  { eco: 'C44', name: 'Scotch Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'] },
  { eco: 'C46', name: 'Four Knights Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'] },
  { eco: 'C50', name: 'Italian Game', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { eco: 'C54', name: 'Italian Game: Giuoco Piano', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'] },
  { eco: 'C55', name: 'Two Knights Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'] },
  { eco: 'C60', name: 'Ruy Lopez', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { eco: 'C65', name: 'Ruy Lopez: Berlin Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'] },
  { eco: 'C70', name: 'Ruy Lopez: Morphy Defense', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6'] },
  { eco: 'C78', name: 'Ruy Lopez: Archangel', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'b5', 'Bb3', 'Bb7'] },
  { eco: 'C80', name: 'Ruy Lopez: Open', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Nxe4'] },
  { eco: 'C88', name: 'Ruy Lopez: Closed', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'] },
  { eco: 'D00', name: "Queen's Pawn Game", moves: ['d4', 'd5'] },
  { eco: 'D02', name: 'London System', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'Bf4'] },
  { eco: 'D06', name: "Queen's Gambit", moves: ['d4', 'd5', 'c4'] },
  { eco: 'D10', name: 'Slav Defense', moves: ['d4', 'd5', 'c4', 'c6'] },
  { eco: 'D20', name: "Queen's Gambit Accepted", moves: ['d4', 'd5', 'c4', 'dxc4'] },
  { eco: 'D30', name: "Queen's Gambit Declined", moves: ['d4', 'd5', 'c4', 'e6'] },
  { eco: 'D37', name: "Queen's Gambit Declined: Orthodox", moves: ['d4', 'd5', 'c4', 'e6', 'Nf3', 'Nf6', 'Nc3', 'Be7'] },
  { eco: 'E00', name: 'Catalan Opening', moves: ['d4', 'Nf6', 'c4', 'e6', 'g3'] },
  { eco: 'E20', name: 'Nimzo-Indian Defense', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'] },
  { eco: 'E60', name: "King's Indian Defense", moves: ['d4', 'Nf6', 'c4', 'g6'] },
  { eco: 'E97', name: "King's Indian Defense: Classical", moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7', 'e4', 'd6', 'Nf3', 'O-O', 'Be2', 'e5'] },
];

const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const promotionPieces: Array<Exclude<PieceSymbol, 'p' | 'k'>> = ['q', 'r', 'b', 'n'];
const pieceMap: Record<string, string> = {
  P: '♙',
  N: '♘',
  B: '♗',
  R: '♖',
  Q: '♕',
  K: '♔',
  p: '♟',
  n: '♞',
  b: '♝',
  r: '♜',
  q: '♛',
  k: '♚',
};

const pieceNames: Record<PieceSymbol, string> = {
  p: '兵',
  n: '马',
  b: '象',
  r: '车',
  q: '后',
  k: '王',
};

function splitPgnGames(content: string) {
  const trimmed = content.trim();

  if (!trimmed) {
    return [];
  }

  return trimmed
    .split(/\n\s*\n(?=\s*\[Event\s+")/g)
    .map((game) => game.trim())
    .filter(Boolean);
}

function getPgnHeader(content: string, key: string) {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`\\[${escapedKey}\\s+"([^"]*)"\\]`));
  return match?.[1]?.trim() || '未知';
}

function normalizePgnFingerprint(content: string) {
  return content.replace(/\s+/g, ' ').replace(/\s*(1-0|0-1|1\/2-1\/2|\*)\s*$/, ' $1').trim().toLowerCase();
}

function normalizePgnDate(rawDate: string) {
  if (!rawDate || rawDate === '未知') return '';
  const parts = rawDate.split(/[.-]/).map((part) => part.replace(/\?/g, '').padStart(2, '0'));
  if (parts.length < 3 || parts.some((part) => !part.trim())) return rawDate.replace(/\./g, '-');
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

function inferBulkPgnSource(filename: string, site: string, explicitSource?: BulkPgnSource): BulkPgnSource {
  if (explicitSource && explicitSource !== 'unknown') return explicitSource;
  const haystack = `${filename} ${site}`.toLowerCase();
  if (haystack.includes('lichess.org') || haystack.includes('lichess')) return 'lichess';
  if (haystack.includes('chess.com') || haystack.includes('chesscom')) return 'chess.com';
  return 'manual';
}

function deriveBulkPgnPlayerMeta(game: Pick<BulkPgnGameSummary, 'white' | 'black' | 'result'>, playerName = 'Me') {
  const normalizedPlayer = playerName.trim().toLowerCase();
  const isWhite = game.white.trim().toLowerCase() === normalizedPlayer;
  const isBlack = game.black.trim().toLowerCase() === normalizedPlayer;
  const playerColor: BulkPgnPlayerColor = isWhite ? 'white' : isBlack ? 'black' : 'unknown';
  const opponent = isWhite ? game.black : isBlack ? game.white : `${game.white} / ${game.black}`;
  let playerResult: BulkPgnPlayerResult = 'unknown';
  if (game.result === '1/2-1/2') playerResult = 'draw';
  else if (game.result === '*') playerResult = 'ongoing';
  else if ((game.result === '1-0' && isWhite) || (game.result === '0-1' && isBlack)) playerResult = 'win';
  else if ((game.result === '1-0' && isBlack) || (game.result === '0-1' && isWhite)) playerResult = 'loss';
  return { opponent, playerColor, playerResult };
}

function parseBulkPgnLibrary(files: BulkPgnFileInput[], history: ReviewReportHistoryItem[] = []): BulkPgnLibrary {
  const games: BulkPgnGameSummary[] = [];
  const errors: BulkPgnImportError[] = [];
  const duplicates: BulkPgnDuplicate[] = [];
  const seen = new Map<string, string>();
  const historyByFingerprint = new Map(history.map((item) => [normalizePgnFingerprint(item.pgn), item]));

  files.forEach((file) => {
    const chunks = splitPgnGames(file.content);
    if (chunks.length === 0) {
      errors.push({ filename: file.filename, event: '未知', message: '文件为空或不包含 PGN。' });
      return;
    }

    chunks.forEach((chunk, index) => {
      const event = getPgnHeader(chunk, 'Event');
      const parsed = parsePgn(chunk);
      if (parsed.error || parsed.moves.length === 0) {
        errors.push({ filename: file.filename, event, message: parsed.error || '棋谱没有可导入的着法。' });
        return;
      }

      const fingerprint = normalizePgnFingerprint(chunk);
      const duplicateOf = seen.get(fingerprint);
      if (duplicateOf) {
        duplicates.push({ filename: file.filename, event, duplicateOf });
        return;
      }

      const site = getPgnHeader(chunk, 'Site');
      const result = getPgnHeader(chunk, 'Result');
      const white = getPgnHeader(chunk, 'White');
      const black = getPgnHeader(chunk, 'Black');
      const opening = identifyOpening(parsed.moves.map((move) => move.san));
      const playerMeta = deriveBulkPgnPlayerMeta({ white, black, result });
      const historyItem = historyByFingerprint.get(fingerprint);
      const id = `${file.filename}-${index + 1}-${event}`;
      seen.set(fingerprint, id);
      games.push({
        id,
        filename: file.filename,
        event,
        site,
        playedAt: normalizePgnDate(getPgnHeader(chunk, 'Date')),
        source: inferBulkPgnSource(file.filename, site, file.source),
        white,
        black,
        opponent: playerMeta.opponent,
        playerColor: playerMeta.playerColor,
        playerResult: playerMeta.playerResult,
        result,
        openingEco: opening.eco,
        openingName: opening.name,
        moveCount: parsed.moves.length,
        content: chunk,
        fingerprint,
        isImportant: Boolean(historyItem?.isFavorite),
        historyReportId: historyItem?.id,
      });
    });
  });

  return {
    games,
    errors,
    duplicates,
    summary: `导入 ${games.length} 盘${duplicates.length > 0 ? `，去重 ${duplicates.length} 盘` : ''}${errors.length > 0 ? `，失败 ${errors.length} 盘` : ''}`,
  };
}

function shouldClearBulkPgnLibraryAfterTextUpdate(options: TextUpdateOptions = {}): boolean {
  return options.preserveBulkPgnLibrary !== true;
}

function toggleBulkPgnGameImportant(games: BulkPgnGameSummary[], id: string): BulkPgnGameSummary[] {
  return games.map((game) => (game.id === id ? { ...game, isImportant: !game.isImportant } : game));
}

function filterBulkPgnLibraryGames(games: BulkPgnGameSummary[], filters: BulkPgnLibraryFilters = {}): BulkPgnGameSummary[] {
  const queryOpponent = filters.opponent?.trim().toLowerCase();
  const queryOpening = filters.opening?.trim().toLowerCase();
  const result = games.filter((game) => {
    const playerMeta = deriveBulkPgnPlayerMeta(game, filters.playerName ?? 'Me');
    if (filters.source && filters.source !== 'all' && game.source !== filters.source) return false;
    if (filters.dateFrom && game.playedAt && game.playedAt < filters.dateFrom) return false;
    if (filters.dateTo && game.playedAt && game.playedAt > filters.dateTo) return false;
    if (queryOpponent && !playerMeta.opponent.toLowerCase().includes(queryOpponent)) return false;
    if (filters.result && filters.result !== 'all' && playerMeta.playerResult !== filters.result) return false;
    if (filters.color && filters.color !== 'all' && playerMeta.playerColor !== filters.color) return false;
    if (queryOpening && !`${game.openingEco} ${game.openingName}`.toLowerCase().includes(queryOpening)) return false;
    if (filters.importantOnly && !game.isImportant) return false;
    return true;
  });
  const direction = filters.sortDirection === 'asc' ? 1 : -1;
  const sortBy = filters.sortBy ?? 'date';
  return result.sort((a, b) => {
    const aMeta = deriveBulkPgnPlayerMeta(a, filters.playerName ?? 'Me');
    const bMeta = deriveBulkPgnPlayerMeta(b, filters.playerName ?? 'Me');
    const values: Record<BulkPgnSortBy, [string | number, string | number]> = {
      date: [a.playedAt, b.playedAt],
      opponent: [aMeta.opponent, bMeta.opponent],
      result: [aMeta.playerResult, bMeta.playerResult],
      opening: [a.openingName, b.openingName],
      source: [a.source, b.source],
      important: [Number(a.isImportant), Number(b.isImportant)],
    };
    const [left, right] = values[sortBy];
    return String(left).localeCompare(String(right), 'zh-CN', { numeric: true }) * direction;
  });
}

function buildBulkPgnLibraryInsights(games: BulkPgnGameSummary[]): BulkPgnLibraryInsights {
  const results = { whiteWins: 0, blackWins: 0, draws: 0, ongoing: 0 };
  const openingMap = new Map<string, OpeningStat>();

  games.forEach((game) => {
    if (game.result === '1-0') {
      results.whiteWins += 1;
    } else if (game.result === '0-1') {
      results.blackWins += 1;
    } else if (game.result === '1/2-1/2') {
      results.draws += 1;
    } else {
      results.ongoing += 1;
    }

    const parsed = parsePgn(game.content);
    const opening = identifyOpening(parsed.moves.map((move) => move.san));
    const key = `${opening.eco}-${opening.name}`;
    const current = openingMap.get(key) ?? {
      eco: opening.eco,
      name: opening.name,
      games: 0,
      deviations: 0,
      deviationRate: 0,
    };

    current.games += 1;
    if (opening.status === 'deviation') {
      current.deviations += 1;
    }
    openingMap.set(key, current);
  });

  const openings = Array.from(openingMap.values())
    .map((opening) => ({
      ...opening,
      deviationRate: opening.games === 0 ? 0 : Math.round((opening.deviations / opening.games) * 100),
    }))
    .sort((a, b) => b.games - a.games || b.deviations - a.deviations);
  const trainingPriorities = openings.slice(0, 3).map((opening) =>
    `${opening.name}：${opening.games} 盘${opening.deviations > 0 ? `，${opening.deviations} 次偏离棋谱` : ''}`,
  );

  return {
    totalGames: games.length,
    results,
    openings,
    trainingPriorities,
    summary: `共 ${games.length} 盘，白胜 ${results.whiteWins}、黑胜 ${results.blackWins}、和棋 ${results.draws}`,
  };
}

function parsePgn(input: string): ParseResult {
  const trimmed = input.trim();

  if (!trimmed) {
    return {
      source: 'pgn',
      positions: [],
      moves: [],
      headers: {},
      error: '请粘贴 PGN 棋谱。',
    };
  }

  try {
    const loaded = new Chess();
    loaded.loadPgn(trimmed);

    const moves = loaded.history({ verbose: true });
    const headers = loaded.getHeaders();
    const commentsByFen = new Map(
      (loaded.getComments() as PgnComment[]).map(({ fen, comment }) => [fen, comment]),
    );
    const positions: ReplayPosition[] = [];

    if (moves.length === 0) {
      positions.push({
        fen: loaded.fen(),
        label: '当前局面',
        comment: commentsByFen.get(loaded.fen()),
      });
    } else {
      positions.push({
        fen: moves[0].before,
        label: '开局',
        comment: commentsByFen.get(moves[0].before),
      });

      moves.forEach((move, index) => {
        positions.push({
          fen: move.after,
          label: formatMoveLabel(move, index),
          move,
          comment: commentsByFen.get(move.after),
        });
      });
    }

    return { source: 'pgn', positions, moves, headers };
  } catch (error) {
    return {
      source: 'pgn',
      positions: [],
      moves: [],
      headers: {},
      error: error instanceof Error ? error.message : 'PGN 解析失败。',
    };
  }
}

function parseFen(input: string): ParseResult {
  const lines = input
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return {
      source: 'fen',
      positions: [],
      moves: [],
      headers: {},
      error: '请粘贴 FEN。多行 FEN 会作为局面序列复盘。',
    };
  }

  const positions: ReplayPosition[] = [];

  for (const [index, fen] of lines.entries()) {
    try {
      const game = new Chess(fen);
      positions.push({
        fen: game.fen(),
        label: lines.length === 1 ? 'FEN 局面' : `局面 ${index + 1}`,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'FEN 无效。';
      return {
        source: 'fen',
        positions: [],
        moves: [],
        headers: {},
        error: `第 ${index + 1} 行 FEN 解析失败：${detail}`,
      };
    }
  }

  return { source: 'fen', positions, moves: [], headers: {} };
}

function formatMoveLabel(move: Move, index: number) {
  const moveNumber = Math.floor(index / 2) + 1;
  const prefix = move.color === 'w' ? `${moveNumber}.` : `${moveNumber}...`;
  return `${prefix} ${move.san}`;
}

function getAnalysisDepthPresetConfig(preset: AnalysisDepthPreset) {
  return analysisDepthPresets[preset];
}

function buildGlobalAnalysisCacheKey({
  pgnText,
  preset,
  depth,
  multiPv,
  engineMode,
}: {
  pgnText: string;
  preset: AnalysisDepthPreset;
  depth: number;
  multiPv: number;
  engineMode: EngineMode;
}) {
  return `pgn=${pgnText.trim()}|preset=${preset}|depth=${depth}|multiPv=${multiPv}|engine=${engineMode}`;
}

type GlobalAnalysisCancellationPlan = {
  canCancel: boolean;
  shouldStopWorker: boolean;
  shouldRejectPendingRequest: boolean;
  shouldMarkCanceled: boolean;
  shouldKeepExistingAnalysis: boolean;
  nextAnalysis: GlobalMoveAnalysis[];
  nextIsAnalyzing: boolean;
  nextCancelToken: boolean;
  nextProgress: string;
  nextError: string;
  nextEngineStatus: EngineStatus;
  nextButtonLabel: string;
};

function buildGlobalAnalysisCancellationPlan({
  isAnalyzing,
  hasWorker,
  hasPendingRequest,
  existingAnalysis,
  currentError = '',
}: {
  isAnalyzing: boolean;
  hasWorker: boolean;
  hasPendingRequest: boolean;
  existingAnalysis: GlobalMoveAnalysis[];
  currentError?: string;
}): GlobalAnalysisCancellationPlan {
  if (!isAnalyzing) {
    return {
      canCancel: false,
      shouldStopWorker: false,
      shouldRejectPendingRequest: false,
      shouldMarkCanceled: false,
      shouldKeepExistingAnalysis: true,
      nextAnalysis: existingAnalysis,
      nextIsAnalyzing: false,
      nextCancelToken: false,
      nextProgress: currentError || '尚未开始整盘分析。',
      nextError: currentError,
      nextEngineStatus: hasWorker ? 'ready' : 'idle',
      nextButtonLabel: '取消',
    };
  }

  return {
    canCancel: true,
    shouldStopWorker: true,
    shouldRejectPendingRequest: hasPendingRequest,
    shouldMarkCanceled: true,
    shouldKeepExistingAnalysis: true,
    nextAnalysis: existingAnalysis,
    nextIsAnalyzing: false,
    nextCancelToken: false,
    nextProgress: `已取消：${hasWorker ? 'Worker 已停止；' : ''}已完成分析结果不会被本次取消污染。`,
    nextError: '',
    nextEngineStatus: hasWorker ? 'ready' : 'idle',
    nextButtonLabel: '分析整盘',
  };
}

function buildGlobalAnalysisReport({
  moves,
  positionScores,
  bestMoves,
  primaryPvs,
  multiPvByMove,
}: {
  moves: Array<Pick<Move, 'san' | 'color'>>;
  positionScores: Array<number | null>;
  bestMoves: string[];
  primaryPvs?: string[][];
  multiPvByMove?: MultiPvLine[][];
}): GlobalMoveAnalysis[] {
  return moves.map((move, index) => {
    const beforeScore = positionScores[index] ?? null;
    const afterScore = positionScores[index + 1] ?? null;
    const centipawnLoss = Math.round(getMoverCentipawnLossForColor(move.color, beforeScore, afterScore));
    return {
      moveIndex: index,
      label: formatMoveLabel(move as Move, index),
      san: move.san,
      moveColor: move.color,
      quality: classifyMoveFromEvaluationDrop(centipawnLoss),
      centipawnLoss,
      beforeScore,
      afterScore,
      isSwingPoint: detectSwingPoint(beforeScore, afterScore, centipawnLoss),
      bestMoveSan: bestMoves[index] ?? '',
      primaryPv: primaryPvs?.[index] ?? [],
      multiPvLines: multiPvByMove?.[index] ?? [],
    };
  });
}

function buildGlobalAnalysisPartialReport(input: {
  moves: Array<Pick<Move, 'san' | 'color'>>;
  positionScores: Array<number | null>;
  bestMoves: string[];
  primaryPvs?: string[][];
  multiPvByMove?: MultiPvLine[][];
}) {
  const incompleteIndex = input.moves.findIndex(
    (_, index) => input.positionScores[index] === undefined || input.positionScores[index + 1] == null,
  );
  const moves = incompleteIndex === -1 ? input.moves : input.moves.slice(0, incompleteIndex);

  return buildGlobalAnalysisReport({
    ...input,
    moves,
  });
}

function getColorLabel(color: Color) {
  return color === 'w' ? '白方' : '黑方';
}

function evaluationSideToColor(side: EvaluationSide): Color | undefined {
  if (side === 'white') {
    return 'w';
  }

  if (side === 'black') {
    return 'b';
  }

  return undefined;
}

function getEvaluationSideLabel(side: EvaluationSide) {
  const color = evaluationSideToColor(side);
  return color ? getColorLabel(color) : '双方';
}

function filterAnalysesByEvaluationSide<T extends Pick<GlobalMoveAnalysis, 'moveColor' | 'label'>>(
  analyses: T[],
  side: EvaluationSide,
) {
  const color = evaluationSideToColor(side);
  if (!color) {
    return analyses;
  }

  return analyses.filter((item) => inferMoveColorFromAnalysis(item) === color);
}

function filterKeyAnalysesByEvaluationSide<T extends GlobalMoveAnalysis>(analyses: T[], side: EvaluationSide) {
  return filterAnalysesByEvaluationSide(analyses, side).filter((item) => classifyKeyAnalysisMoment(item).isKeyMoment);
}

function buildGlobalAnalysisPerspectiveLabel({
  moveColor,
  perspective,
  boardFlipped = false,
  classification,
  centipawnLoss,
}: {
  moveColor: Color;
  perspective: EvaluationPerspective;
  boardFlipped?: boolean;
  classification: MoveQualityLabel;
  centipawnLoss: number;
}): GlobalAnalysisPerspectiveLabel {
  const moverLabel = getColorLabel(moveColor);
  const boardSideLabel = boardFlipped ? '黑方' : '白方';
  const perspectiveLabel = perspective === 'white'
    ? '白方视角'
    : perspective === 'sideToMove'
      ? '本步走棋方视角'
      : `棋盘视角（${boardSideLabel}在下）`;
  const evaluatedSideLabel = perspective === 'white'
    ? '白方'
    : perspective === 'board'
      ? `棋盘下方（${boardSideLabel}）`
      : moverLabel;

  return {
    perspectiveLabel,
    evaluatedSideLabel,
    moverLabel,
    summary: `${perspectiveLabel} · 评价方：${evaluatedSideLabel} · 走棋方：${moverLabel} · ${classification}，损失 ${centipawnLoss} cp`,
  };
}

function inferMoveColorFromAnalysis(analysis: Pick<GlobalMoveAnalysis, 'moveColor' | 'label'>): Color {
  if (analysis.moveColor) {
    return analysis.moveColor;
  }

  return analysis.label.includes('...') ? 'b' : 'w';
}

function describeGlobalAnalysisPerspective(
  analysis: Pick<GlobalMoveAnalysis, 'moveColor' | 'label' | 'quality' | 'centipawnLoss'>,
  perspective: EvaluationPerspective = 'sideToMove',
  boardFlipped = false,
) {
  return buildGlobalAnalysisPerspectiveLabel({
    moveColor: inferMoveColorFromAnalysis(analysis),
    perspective,
    boardFlipped,
    classification: analysis.quality,
    centipawnLoss: analysis.centipawnLoss,
  });
}

function getEvaluationSwingMagnitude(analysis: Pick<GlobalMoveAnalysis, 'beforeScore' | 'afterScore'>) {
  if (analysis.beforeScore === null || analysis.afterScore === null) {
    return 0;
  }

  return Math.abs(analysis.afterScore - analysis.beforeScore);
}

function classifyKeyAnalysisMoment(analysis: GlobalMoveAnalysis): KeyAnalysisMomentClassification {
  const evaluationSwing = getEvaluationSwingMagnitude(analysis);
  const reasons = [
    analysis.quality === '疑问手' ? '疑问手' : '',
    analysis.quality === '失误' ? '失误' : '',
    analysis.quality === '败着' ? '败着' : '',
    analysis.isSwingPoint ? '局势突变' : '',
    evaluationSwing >= 300 ? '大幅评价波动' : '',
    analysis.centipawnLoss >= 120 ? '高训练价值' : '',
  ].filter(Boolean);

  let severity: KeyMomentSeverity | null = null;
  if (analysis.quality === '败着') {
    severity = 'blunder';
  } else if (analysis.quality === '失误') {
    severity = 'mistake';
  } else if (analysis.quality === '疑问手') {
    severity = 'inaccuracy';
  } else if (analysis.isSwingPoint || evaluationSwing >= 300) {
    severity = 'evaluation-swing';
  }

  const isKeyMoment = Boolean(severity || analysis.isSwingPoint || evaluationSwing >= 300);
  const trainingValue: KeyMomentTrainingValue | null = isKeyMoment
    ? analysis.centipawnLoss >= 120 || analysis.isSwingPoint || evaluationSwing >= 300 || analysis.quality === '败着'
      ? 'high'
      : 'medium'
    : null;

  return {
    isKeyMoment,
    severity,
    trainingValue,
    reasons,
  };
}

function buildKeyMomentSummary(analyses: GlobalMoveAnalysis[]) {
  const classifications = analyses.map(classifyKeyAnalysisMoment).filter((item) => item.isKeyMoment);
  if (!classifications.length) {
    return '暂无关键时刻；可查看全部分析行继续复盘。';
  }

  const countBySeverity = (severity: KeyMomentSeverity) => classifications.filter((item) => item.severity === severity).length;
  const highValueCount = classifications.filter((item) => item.trainingValue === 'high').length;
  return [
    `关键时刻 ${classifications.length} 个`,
    `败着 ${countBySeverity('blunder')} 个`,
    `失误 ${countBySeverity('mistake')} 个`,
    `疑问手 ${countBySeverity('inaccuracy')} 个`,
    `高训练价值 ${highValueCount} 个`,
  ].join(' · ');
}

function filterGlobalAnalysisMoments(analyses: GlobalMoveAnalysis[], filter: GlobalAnalysisMomentFilter) {
  const colorFilter = evaluationSideToColor(
    filter.includes('white') ? 'white' : filter.includes('black') ? 'black' : 'both',
  );
  const keyOnly = filter === 'key' || filter.startsWith('key-');

  return analyses.filter((item) => {
    const matchesColor = !colorFilter || inferMoveColorFromAnalysis(item) === colorFilter;
    const matchesMoment = !keyOnly || classifyKeyAnalysisMoment(item).isKeyMoment;
    return matchesColor && matchesMoment;
  });
}

function getGlobalAnalysisMomentFilterLabel(filter: GlobalAnalysisMomentFilter) {
  const labels: Record<GlobalAnalysisMomentFilter, string> = {
    all: '全部',
    key: '关键时刻',
    white: '白棋行动',
    black: '黑棋行动',
    'key-white': '白棋关键',
    'key-black': '黑棋关键',
  };
  return labels[filter];
}

type GlobalAnalysisPlayerSummary = {
  color: Color;
  colorLabel: string;
  totalMoves: number;
  keyMoments: number;
  totalLoss: number;
  summary: string;
};

function buildGlobalAnalysisPlayerSummary(analyses: GlobalMoveAnalysis[], color: Color): GlobalAnalysisPlayerSummary {
  const colorAnalyses = analyses.filter((item) => inferMoveColorFromAnalysis(item) === color);
  const keyMoments = colorAnalyses.filter((item) => classifyKeyAnalysisMoment(item).isKeyMoment);
  const totalLoss = colorAnalyses.reduce((sum, item) => sum + item.centipawnLoss, 0);
  const colorLabel = getColorLabel(color);

  return {
    color,
    colorLabel,
    totalMoves: colorAnalyses.length,
    keyMoments: keyMoments.length,
    totalLoss,
    summary: `${colorLabel}行动 ${colorAnalyses.length} 手 · 关键时刻 ${keyMoments.length} 个 · 累计损失 ${totalLoss} cp`,
  };
}

function formatVariationMoveLabel(move: Move) {
  const [, , , , , fullMove] = move.before.split(' ');
  const prefix = move.color === 'w' ? `${fullMove}.` : `${fullMove}...`;
  return `${prefix} ${move.san}`;
}

function getBoard(fen: string) {
  const boardFen = fen.split(' ')[0];
  return boardFen.split('/').map((rank) => {
    const squares: string[] = [];

    for (const char of rank) {
      const emptySquares = Number(char);
      if (Number.isInteger(emptySquares)) {
        squares.push(...Array.from({ length: emptySquares }, () => ''));
      } else {
        squares.push(char);
      }
    }

    return squares;
  });
}

function describeFen(fen: string) {
  const game = new Chess(fen);
  const turn = game.turn() === 'w' ? '白方' : '黑方';

  if (game.isCheckmate()) {
    return `${turn}被将死`;
  }

  if (game.isDraw()) {
    return '和棋局面';
  }

  if (game.isCheck()) {
    return `${turn}被将军`;
  }

  return `${turn}走棋`;
}

function getCapturedPieces(fen: string): CapturedPieces {
  const game = new Chess(fen);
  const remaining = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  } satisfies Record<Color, Record<Exclude<PieceSymbol, 'k'>, number>>;

  for (const row of game.board()) {
    for (const piece of row) {
      if (piece && piece.type !== 'k') {
        remaining[piece.color][piece.type] += 1;
      }
    }
  }

  return {
    w: expandCapturedPieces({ p: 8, n: 2, b: 2, r: 2, q: 1 }, remaining.w),
    b: expandCapturedPieces({ p: 8, n: 2, b: 2, r: 2, q: 1 }, remaining.b),
  };
}

function expandCapturedPieces(
  starting: Record<Exclude<PieceSymbol, 'k'>, number>,
  remaining: Record<Exclude<PieceSymbol, 'k'>, number>,
) {
  const order: Array<Exclude<PieceSymbol, 'k'>> = ['q', 'r', 'b', 'n', 'p'];
  return order.flatMap((piece) =>
    Array.from({ length: Math.max(starting[piece] - remaining[piece], 0) }, () => piece),
  );
}

function getMoveHighlights(move?: Pick<Move, 'from' | 'to'> | null) {
  return move ? [move.from, move.to] : [];
}

function isPromotionMove(fen: string, from: Square, to: Square) {
  const game = new Chess(fen);
  const piece = game.get(from);

  if (!piece || piece.type !== 'p') {
    return false;
  }

  return game
    .moves({ square: from, verbose: true })
    .some((move) => move.to === to && Boolean(move.promotion));
}

function completeEngineAnalysisFromRequest({ request, bestMove, bestMoveSan }: CompletedEngineAnalysisInput): StockfishAnalysis & { multiPvLines: MultiPvLine[] } {
  const multiPvLines = rankMultiPvLines(request?.multiPvLines ?? []);

  return {
    depth: request?.latest.depth ?? 0,
    score: multiPvLines[0]?.score ?? request?.latest.score ?? null,
    pv: multiPvLines[0]?.pv ?? request?.latest.pv ?? [],
    bestMove,
    bestMoveSan,
    multiPvLines,
  };
}

function parseStockfishInfo(line: string, fen: string): StockfishInfoAnalysis | null {
  if (!line.startsWith('info ') || !line.includes(' score ') || !line.includes(' pv ')) {
    return null;
  }

  const depthMatch = line.match(/\bdepth (\d+)/);
  const cpMatch = line.match(/\bscore cp (-?\d+)/);
  const mateMatch = line.match(/\bscore mate (-?\d+)/);
  const pvMatch = line.match(/\bpv (.+)$/);
  const turn = fen.split(' ')[1];

  let score: StockfishAnalysis['score'] = null;
  if (cpMatch) {
    const rawScore = Number(cpMatch[1]);
    score = {
      type: 'cp',
      value: turn === 'w' ? rawScore : -rawScore,
    };
  } else if (mateMatch) {
    const rawMate = Number(mateMatch[1]);
    score = {
      type: 'mate',
      value: turn === 'w' ? rawMate : -rawMate,
    };
  }

  const multipvMatch = line.match(/\bmultipv (\d+)/);
  const rank = multipvMatch ? Number(multipvMatch[1]) : 1;
  const uci = pvMatch ? pvMatch[1].trim().split(/\s+/).slice(0, 8) : [];
  const pv = formatPrincipalVariation(fen, uci);
  const multiPvLine: MultiPvLine = {
    rank,
    score,
    pv,
    uci,
    firstMoveSan: pv[0] ?? '',
    displayScore: formatMultiPvScore(score),
  };

  return {
    depth: depthMatch ? Number(depthMatch[1]) : 0,
    score,
    pv: multiPvLine.pv,
    multiPvLine,
  };
}

function formatPrincipalVariation(fen: string, uciMoves: string[]) {
  const game = new Chess(fen);
  const sanMoves: string[] = [];

  for (const uci of uciMoves) {
    const move = game.move(uciToMoveInput(uci));
    if (!move) {
      break;
    }
    sanMoves.push(move.san);
  }

  return sanMoves;
}


function formatMultiPvScore(score: StockfishAnalysis['score']) {
  if (!score) {
    return '等待评分';
  }

  if (score.type === 'mate') {
    return `${score.value >= 0 ? '+' : '-'}M${Math.abs(score.value)}`;
  }

  const pawns = score.value / 100;
  return `${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

function rankMultiPvLines(lines: MultiPvLine[]) {
  return [...lines].sort((a, b) => a.rank - b.rank);
}

function formatMultiPvDisplayLines({
  multiPvLines,
  fallbackBestMoveSan,
  fallbackPv,
}: {
  multiPvLines: MultiPvLine[];
  fallbackBestMoveSan: string;
  fallbackPv: string[];
}) {
  const rankedLines = rankMultiPvLines(multiPvLines);
  if (rankedLines.length === 0) {
    const fallbackParts = [`首选 ${fallbackBestMoveSan || '-'}`];
    if (fallbackPv.length > 0) {
      fallbackParts.push(`主线 ${fallbackPv.join(' ')}`);
    }
    return [fallbackParts.join(' · ')];
  }

  return rankedLines.map((line) => [
    `#${line.rank} ${line.firstMoveSan || line.pv[0] || '-'}`,
    line.displayScore,
    line.pv.join(' ') || '-',
    line.uci.length ? `UCI ${line.uci.join(' ')}` : '',
  ].filter(Boolean).join(' · '));
}

function uciToMoveInput(uci: string): MoveInput {
  return {
    from: uci.slice(0, 2) as Square,
    to: uci.slice(2, 4) as Square,
    promotion: uci[4] as MoveInput['promotion'],
  };
}

function formatBestMove(fen: string, uciMove: string) {
  if (!uciMove || uciMove === '(none)') {
    return '';
  }

  const game = new Chess(fen);
  const move = game.move(uciToMoveInput(uciMove));
  return move?.san ?? uciMove;
}

function getPerspectiveLabel(perspective: EvaluationPerspective, fen: string, isBoardFlipped: boolean) {
  if (perspective === 'white') {
    return '白方视角';
  }

  if (perspective === 'sideToMove') {
    return `${fen.split(' ')[1] === 'w' ? '白方' : '黑方'}走棋视角`;
  }

  return `${isBoardFlipped ? '黑方' : '白方'}棋盘视角`;
}

function getPerspectiveMultiplier(
  perspective: EvaluationPerspective,
  fen: string,
  isBoardFlipped: boolean,
) {
  if (perspective === 'white') {
    return 1;
  }

  if (perspective === 'sideToMove') {
    return fen.split(' ')[1] === 'w' ? 1 : -1;
  }

  return isBoardFlipped ? -1 : 1;
}

function formatScore(
  score: StockfishAnalysis['score'],
  perspective: EvaluationPerspective,
  fen: string,
  isBoardFlipped: boolean,
) {
  if (!score) {
    return '等待评分';
  }

  const multiplier = getPerspectiveMultiplier(perspective, fen, isBoardFlipped);
  const perspectiveLabel = getPerspectiveLabel(perspective, fen, isBoardFlipped);

  if (score.type === 'mate') {
    const value = score.value * multiplier;
    return `${perspectiveLabel} ${value >= 0 ? '+' : '-'}M${Math.abs(value)}`;
  }

  const pawns = (score.value * multiplier) / 100;
  return `${perspectiveLabel} ${pawns >= 0 ? '+' : ''}${pawns.toFixed(2)}`;
}

function formatEngineScore(score: StockfishAnalysis['score']): string {
  if (!score) {
    return '等待评分';
  }

  if (score.type === 'mate') {
    return `${score.value > 0 ? '白方' : '黑方'}M${Math.abs(score.value)}`;
  }

  const pawns = score.value / 100;
  if (pawns > 0) {
    return `+${pawns.toFixed(2)}`;
  }
  return pawns.toFixed(2);
}

function identifyOpening(playedMoves: string[]): OpeningMatch {
  if (playedMoves.length === 0) {
    return {
      eco: 'A00',
      name: '初始局面',
      status: 'start',
      matchedPly: 0,
      nextBookMove: openingBook.find((entry) => entry.name === "King's Pawn Game")?.moves[0],
    };
  }

  const prefixCandidates = openingBook
    .filter((entry) => playedMoves.every((move, index) => entry.moves[index] === move))
    .sort((a, b) => {
      const exactA = a.moves.length === playedMoves.length ? 0 : 1;
      const exactB = b.moves.length === playedMoves.length ? 0 : 1;
      if (exactA !== exactB) {
        return exactA - exactB;
      }
      return a.moves.length - b.moves.length;
    });

  if (prefixCandidates[0]) {
    const entry = prefixCandidates[0];
    return {
      eco: entry.eco,
      name: entry.name,
      status: playedMoves.length < entry.moves.length ? 'book' : 'recognized',
      matchedPly: playedMoves.length,
      nextBookMove: entry.moves[playedMoves.length],
    };
  }

  const recognizedCandidates = openingBook
    .filter((entry) => entry.moves.length > 0 && entry.moves.every((move, index) => playedMoves[index] === move))
    .sort((a, b) => b.moves.length - a.moves.length);

  if (recognizedCandidates[0]) {
    const entry = recognizedCandidates[0];
    if (playedMoves.length > entry.moves.length) {
      const continuation = openingBook
        .filter(
          (candidate) =>
            candidate.moves.length > entry.moves.length &&
            entry.moves.every((move, index) => candidate.moves[index] === move),
        )
        .sort((a, b) => a.moves.length - b.moves.length || b.eco.localeCompare(a.eco))[0];

      if (continuation?.moves[entry.moves.length]) {
        return {
          eco: entry.eco,
          name: entry.name,
          status: 'deviation',
          matchedPly: entry.moves.length,
          deviationMove: playedMoves[entry.moves.length],
          nextBookMove: continuation.moves[entry.moves.length],
        };
      }
    }

    return {
      eco: entry.eco,
      name: entry.name,
      status: 'recognized',
      matchedPly: entry.moves.length,
    };
  }

  const closest = openingBook
    .map((entry) => ({
      entry,
      matchedPly: countCommonPrefix(entry.moves, playedMoves),
    }))
    .filter(({ matchedPly }) => matchedPly > 0)
    .sort((a, b) => b.matchedPly - a.matchedPly || b.entry.moves.length - a.entry.moves.length)[0];

  if (closest) {
    return {
      eco: closest.entry.eco,
      name: closest.entry.name,
      status: 'deviation',
      matchedPly: closest.matchedPly,
      deviationMove: playedMoves[closest.matchedPly],
      nextBookMove: closest.entry.moves[closest.matchedPly],
    };
  }

  return {
    eco: '-',
    name: '未知开局',
    status: 'unknown',
    matchedPly: 0,
  };
}

function countCommonPrefix(expected: string[], actual: string[]) {
  let count = 0;
  while (count < expected.length && count < actual.length && expected[count] === actual[count]) {
    count += 1;
  }
  return count;
}

function buildOpeningImprovementPlan(games: string[][]): OpeningImprovementPlan {
  const statMap = new Map<string, OpeningStat>();
  const deviationCards: OpeningImprovementCard[] = [];

  games.forEach((moves, gameIndex) => {
    const opening = identifyOpening(moves);
    if (opening.status === 'unknown' || opening.status === 'start') {
      return;
    }

    const key = `${opening.eco}:${opening.name}`;
    const existing = statMap.get(key) ?? {
      eco: opening.eco,
      name: opening.name,
      games: 0,
      deviations: 0,
      deviationRate: 0,
    };
    existing.games += 1;

    if (opening.status === 'deviation' && opening.deviationMove && opening.nextBookMove) {
      existing.deviations += 1;
      const deviationPly = opening.matchedPly + 1;
      deviationCards.push({
        id: `${key}:game-${gameIndex}:ply-${deviationPly}`,
        openingName: opening.name,
        eco: opening.eco,
        deviationPly,
        playedMove: opening.deviationMove,
        bookMove: opening.nextBookMove,
        reviewPrompt: `${opening.name} 第 ${deviationPly} ply 脱谱：实战 ${opening.deviationMove}，建议复习库线 ${opening.nextBookMove}。`,
        tags: ['开局'],
      });
    }

    statMap.set(key, existing);
  });

  const commonOpenings = Array.from(statMap.values())
    .map((stat) => ({
      ...stat,
      deviationRate: stat.games === 0 ? 0 : Math.round((stat.deviations / stat.games) * 100),
    }))
    .sort((a, b) => b.deviations - a.deviations || b.games - a.games || a.name.localeCompare(b.name));

  const summary = `常下开局 ${commonOpenings.length} 个 · 开局分歧 ${deviationCards.length} 个`;

  return {
    commonOpenings,
    deviationCards,
    summary,
  };
}

function classifyMiddlegameTheme(analysis: GlobalMoveAnalysis) {
  const san = analysis.san;
  if (/^[a-h][34-6]?$/i.test(san) || /^[a-h]x/i.test(san)) {
    return san.match(/^[fghe]/i) ? '王翼兵形/王安全' : '中心与兵形';
  }
  if (/x/.test(san)) {
    return '换子与战术计算';
  }
  if (/^[NBRQK]/.test(san)) {
    return '子力协调/最差子改善';
  }
  return '候选着法与风险控制';
}

function buildMiddlegamePlanTraining(analyses: GlobalMoveAnalysis[], evaluationSide: EvaluationSide = 'both'): MiddlegamePlanTraining {
  const evaluatedSideLabel = getEvaluationSideLabel(evaluationSide);
  const middlegameAnalyses = filterAnalysesByEvaluationSide(
    analyses.filter((item) => item.moveIndex >= 8 && item.moveIndex <= 40),
    evaluationSide,
  );
  const riskyMoves = middlegameAnalyses
    .filter((item) => item.isSwingPoint || item.quality === '失误' || item.quality === '败着')
    .sort((a, b) => b.centipawnLoss - a.centipawnLoss || a.moveIndex - b.moveIndex);

  const focusCards = riskyMoves.slice(0, 4).map((item) => {
    const theme = classifyMiddlegameTheme(item);
    const priority = item.quality === '败着' ? 100 : item.quality === '失误' ? 80 : 60;
    const perspective = describeGlobalAnalysisPerspective(item);
    return {
      id: `middlegame-${item.moveIndex}-${normalizeSan(item.san)}`,
      moveIndex: item.moveIndex,
      label: item.label,
      san: item.san,
      topic: item.centipawnLoss >= 300 ? '候选着法与风险控制' : theme,
      priority,
      recommendedPlan: `复盘 ${item.label} 前的候选计划；${perspective.summary}；优先比较实战 ${item.san} 与引擎首选 ${item.bestMoveSan || '暂未分析'} 的战略目标。`,
      reason: `${perspective.evaluatedSideLabel}该手损失 ${item.centipawnLoss} cp${item.isSwingPoint ? '，并触发局势突变' : ''}。`,
      tags: ['中局', item.quality],
    } satisfies MiddlegamePlanCard;
  });

  const themeMap = new Map<string, MiddlegameThemeStat>();
  middlegameAnalyses
    .filter((item) => item.quality !== '好棋')
    .forEach((item) => {
      const theme = classifyMiddlegameTheme(item);
      const current = themeMap.get(theme) ?? { theme, count: 0, totalLoss: 0 };
      current.count += 1;
      current.totalLoss += item.centipawnLoss;
      themeMap.set(theme, current);
    });

  const themeStats = [...themeMap.values()].sort((a, b) => b.totalLoss - a.totalLoss || b.count - a.count);
  const summary = focusCards.length
    ? `被评价方：${evaluatedSideLabel}。发现 ${focusCards.length} 个关键中局计划点，优先训练：${focusCards[0].topic}。`
    : `被评价方：${evaluatedSideLabel}。暂未发现明显中局计划训练点；建议先运行整盘分析。`;

  return { focusCards, themeStats, summary };
}

function countMajorAndMinorPieces(fen: string) {
  const counts = { q: 0, r: 0, b: 0, n: 0, p: 0 } satisfies Record<Exclude<PieceSymbol, 'k'>, number>;
  const game = new Chess(fen);

  for (const row of game.board()) {
    for (const piece of row) {
      if (piece && piece.type !== 'k') {
        counts[piece.type] += 1;
      }
    }
  }

  return counts;
}

function classifyEndgameType(fen: string): EndgameType {
  const counts = countMajorAndMinorPieces(fen);
  const nonKingPieces = counts.q + counts.r + counts.b + counts.n + counts.p;
  const heavyAndMinorPieces = counts.q + counts.r + counts.b + counts.n;

  if (nonKingPieces > 12 || counts.q > 1) {
    return '非残局';
  }

  if (counts.q > 0) {
    return '后残局';
  }

  if (counts.r > 0) {
    return '车残局';
  }

  if (counts.b + counts.n > 0) {
    return '轻子残局';
  }

  if (counts.p > 0 || heavyAndMinorPieces === 0) {
    return '兵残局';
  }

  return '混合残局';
}

function classifyEndgameMissedChance(analysis: GlobalMoveAnalysis) {
  if (analysis.beforeScore !== null && Math.abs(analysis.beforeScore) <= 80 && analysis.afterScore !== null && Math.abs(analysis.afterScore) >= 150) {
    return '错过守和机会';
  }

  if (analysis.beforeScore !== null && analysis.afterScore !== null && Math.abs(analysis.beforeScore) >= 180 && Math.abs(analysis.afterScore) < 120) {
    return '错过胜势转换';
  }

  return analysis.isSwingPoint ? '残局关键转折' : '残局技术失误';
}

function buildEndgameTrainingPlan({
  positions,
  analyses,
  evaluationSide = 'both',
}: {
  positions: Array<Pick<ReplayPosition, 'fen' | 'label'>>;
  analyses: GlobalMoveAnalysis[];
  evaluationSide?: EvaluationSide;
}): EndgameTrainingPlan {
  const evaluatedSideLabel = getEvaluationSideLabel(evaluationSide);
  const endgameStartIndex = positions.findIndex((position) => classifyEndgameType(position.fen) !== '非残局');

  if (endgameStartIndex < 0) {
    return {
      phase: 'not-endgame',
      type: '非残局',
      cards: [],
      themes: [],
      summary: `被评价方：${evaluatedSideLabel}。尚未进入残局；运行整盘分析后可继续观察后半盘。`,
    };
  }

  const type = positions
    .slice(endgameStartIndex)
    .map((position) => classifyEndgameType(position.fen))
    .find((candidate) => candidate !== '非残局' && candidate !== '兵残局') ?? classifyEndgameType(positions[endgameStartIndex].fen);
  const endgameAnalyses = filterAnalysesByEvaluationSide(
    analyses.filter((analysis) => analysis.moveIndex >= Math.max(0, endgameStartIndex - 1)),
    evaluationSide,
  );
  const cards = endgameAnalyses
    .filter((analysis) => analysis.centipawnLoss >= 80 || analysis.isSwingPoint)
    .sort((a, b) => b.centipawnLoss - a.centipawnLoss || a.moveIndex - b.moveIndex)
    .slice(0, 5)
    .map((analysis) => {
      const perspective = describeGlobalAnalysisPerspective(analysis);
      return {
        id: `endgame-${analysis.moveIndex}-${normalizeSan(analysis.san)}`,
        moveIndex: analysis.moveIndex,
        label: analysis.label,
        san: analysis.san,
        moverLabel: perspective.moverLabel,
        evaluatedSideLabel: perspective.evaluatedSideLabel,
        endgameType: type,
        missedChance: classifyEndgameMissedChance(analysis),
        recommendedMove: analysis.bestMoveSan,
        prompt: `复盘 ${analysis.label}：${perspective.summary}；实战 ${analysis.san}，优先找 ${analysis.bestMoveSan || '更妥的残局计划'}。`,
        tags: ['残局', type],
      };
    });

  const themes = [
    cards.some((card) => /^K|K/.test(card.san) || /^K|K/.test(card.recommendedMove)) ? '王的积极性' : '',
    type === '兵残局' ? '通路兵与方形法则' : '',
    type === '车残局' ? '车活跃与王位' : '',
    cards.some((card) => card.missedChance.includes('守和')) ? '守和机会' : '',
  ].filter(Boolean);

  return {
    phase: 'endgame',
    type,
    cards,
    themes: [...new Set(themes)],
    summary: cards.length
      ? `被评价方：${evaluatedSideLabel}。识别到${type}，生成 ${cards.length} 张残局训练卡，优先检查：${cards[0].missedChance}。`
      : `被评价方：${evaluatedSideLabel}。识别到${type}，暂未发现明显残局错题；建议重点复盘王和兵的转换。`,
  };
}

function getGamePhase(moveIndex: number): StrengthPhaseBreakdown['phase'] {
  if (moveIndex < 8) {
    return '开局';
  }
  if (moveIndex <= 40) {
    return '中局';
  }
  return '残局';
}

function classifyStrengthMistakeType(analysis: GlobalMoveAnalysis): string {
  const san = analysis.san;
  if (
    analysis.centipawnLoss >= 300 ||
    (analysis.afterScore !== null && analysis.beforeScore !== null && Math.abs(analysis.afterScore - analysis.beforeScore) >= 180)
  ) {
    return '防守失败';
  }
  if (/x|[+#]/.test(san) || analysis.centipawnLoss >= 250) {
    return '漏战术';
  }
  if (/^[a-h]|^[NBRQK]/.test(san)) {
    return '计划错误';
  }
  return '时间压力';
}

function clampStrengthScore(score: number) {
  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildStrengthProfileGameSnapshot({
  id,
  title,
  importedAt,
  analyses,
}: {
  id: string;
  title: string;
  importedAt: string;
  analyses: GlobalMoveAnalysis[];
}): StrengthProfileGameSnapshot {
  const normalizedAnalyses = analyses.map((analysis) => ({
    ...analysis,
    moveColor: analysis.moveColor ?? (analysis.moveIndex % 2 === 1 ? 'w' : 'b'),
  }));
  const createEmptyStats = (): StrengthProfileColorStats => ({ totalMoves: 0, keyMoments: 0, totalLoss: 0, mistakeCount: 0 });
  const perColor = { white: createEmptyStats(), black: createEmptyStats() };

  normalizedAnalyses.forEach((analysis) => {
    const colorKey = analysis.moveColor === 'b' ? 'black' : 'white';
    perColor[colorKey].totalMoves += 1;
    perColor[colorKey].totalLoss += analysis.centipawnLoss;
    if (analysis.isSwingPoint) {
      perColor[colorKey].keyMoments += 1;
    }
    if (analysis.centipawnLoss > 0) {
      perColor[colorKey].mistakeCount += 1;
    }
  });

  return { id, title, importedAt, analyses: normalizedAnalyses, perColor };
}

function getStrengthProfileRangeLabel(range: StrengthProfileRange) {
  if (range === 'current') {
    return '当前对局';
  }
  if (range === 'all') {
    return '全部已保存对局';
  }
  return `最近 ${Number(range.replace('recent-', ''))} 局`;
}

function getStrengthProfileRangeLimit(range: StrengthProfileRange) {
  if (range === 'current' || range === 'all') {
    return undefined;
  }
  return Number(range.replace('recent-', ''));
}

function selectStrengthProfileSnapshots(
  snapshots: StrengthProfileGameSnapshot[],
  range: StrengthProfileRange,
): StrengthProfileGameSnapshot[] {
  if (range === 'current') {
    return snapshots.slice(0, 1);
  }
  const sortedSnapshots = [...snapshots].sort((a, b) => b.importedAt.localeCompare(a.importedAt));
  const limit = getStrengthProfileRangeLimit(range);
  return typeof limit === 'number' ? sortedSnapshots.slice(0, limit) : sortedSnapshots;
}

function buildStrengthProfileSnapshotsFromHistory(history: ReviewReportHistoryItem[]): StrengthProfileGameSnapshot[] {
  return history
    .filter((item) => (item.strengthProfileAnalyses?.length ?? 0) > 0)
    .map((item) => buildStrengthProfileGameSnapshot({
      id: item.id,
      title: item.meta.event || `${item.meta.white} vs ${item.meta.black}`,
      importedAt: item.savedAt,
      analyses: item.strengthProfileAnalyses ?? [],
    }));
}

function buildStrengthProfile({
  analyses,
  snapshots,
  mistakeCards,
  candidateStats,
  evaluationSide,
  evaluatedColor,
  rangeLabel,
}: {
  analyses?: GlobalMoveAnalysis[];
  snapshots?: StrengthProfileGameSnapshot[];
  mistakeCards: Array<Pick<MistakeCard, 'tags' | 'attempts' | 'solvedCount'>>;
  candidateStats: CandidateTrainingStats;
  evaluationSide?: EvaluationSide;
  evaluatedColor?: Color;
  rangeLabel?: string;
}): StrengthProfile {
  const snapshotAnalyses = snapshots?.flatMap((snapshot) => snapshot.analyses);
  const sourceAnalyses = snapshotAnalyses ?? analyses ?? [];
  const resolvedEvaluationSide: EvaluationSide = evaluationSide ?? (evaluatedColor === 'w' ? 'white' : evaluatedColor === 'b' ? 'black' : 'both');
  const perspectiveAnalyses = filterAnalysesByEvaluationSide(sourceAnalyses, resolvedEvaluationSide);
  const evaluatedSideLabel = getEvaluationSideLabel(resolvedEvaluationSide);
  const relevantAnalyses = perspectiveAnalyses.filter((analysis) => analysis.quality !== '好棋' || analysis.isSwingPoint || analysis.centipawnLoss > 0);
  const phaseMap = new Map<StrengthPhaseBreakdown['phase'], StrengthPhaseBreakdown>([
    ['开局', { phase: '开局', mistakes: 0, totalLoss: 0 }],
    ['中局', { phase: '中局', mistakes: 0, totalLoss: 0 }],
    ['残局', { phase: '残局', mistakes: 0, totalLoss: 0 }],
  ]);
  const mistakeTypeMap = new Map<string, StrengthMistakeType>();

  relevantAnalyses.forEach((analysis) => {
    const phase = getGamePhase(analysis.moveIndex);
    const phaseStat = phaseMap.get(phase)!;
    phaseStat.mistakes += analysis.centipawnLoss > 0 ? 1 : 0;
    phaseStat.totalLoss += analysis.centipawnLoss;

    const type = classifyStrengthMistakeType(analysis);
    const typeStat = mistakeTypeMap.get(type) ?? { type, count: 0, totalLoss: 0 };
    typeStat.count += 1;
    typeStat.totalLoss += analysis.centipawnLoss;
    mistakeTypeMap.set(type, typeStat);
  });

  const phaseBreakdown = [...phaseMap.values()].sort((a, b) => b.totalLoss - a.totalLoss || b.mistakes - a.mistakes);
  const mistakeTypes = [...mistakeTypeMap.values()].sort((a, b) => b.totalLoss - a.totalLoss || b.count - a.count);
  const tagStats = buildTrainingStatsByTag(
    mistakeCards.map((card, index) => ({
      ...card,
      id: `profile-${index}`,
      fen: '',
      positionLabel: '',
      guessedSan: '',
      actualSan: '',
      stockfishBestSan: '',
      pgnText: '',
      reviewStage: 0,
      dueAt: new Date(0).toISOString(),
      createdAt: new Date(0).toISOString(),
      updatedAt: new Date(0).toISOString(),
    })),
  );
  const weakestTag = tagStats.sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts)[0];
  const topPhase = phaseBreakdown[0];
  const topMistakeType = mistakeTypes[0];
  const candidateCoverage = candidateStats.validSessions ? candidateStats.answerCovered / candidateStats.validSessions : 1;
  const bestCoverage = candidateStats.validSessions ? candidateStats.bestCovered / candidateStats.validSessions : 1;
  const sortingAccuracy = candidateStats.validSessions ? candidateStats.sortingScoreTotal / (candidateStats.validSessions * 100) : 1;
  const openingLoss = phaseMap.get('开局')?.totalLoss ?? 0;
  const middlegameLoss = phaseMap.get('中局')?.totalLoss ?? 0;
  const endgameLoss = phaseMap.get('残局')?.totalLoss ?? 0;

  const radarAxes: StrengthRadarAxis[] = [
    { axis: '开局稳定性', score: clampStrengthScore(100 - openingLoss / 4), note: `开局累计失分 ${openingLoss} cp` },
    { axis: '中局计划', score: clampStrengthScore(100 - middlegameLoss / 6), note: `中局累计失分 ${middlegameLoss} cp` },
    { axis: '残局技术', score: clampStrengthScore(100 - endgameLoss / 5), note: `残局累计失分 ${endgameLoss} cp` },
    { axis: '候选着覆盖', score: clampStrengthScore(candidateCoverage * 100), note: `实战答案覆盖 ${candidateStats.answerCovered}/${candidateStats.validSessions || 0}` },
    { axis: '最佳着意识', score: clampStrengthScore(bestCoverage * 100), note: `引擎首选覆盖 ${candidateStats.bestCovered}/${candidateStats.validSessions || 0}` },
    { axis: '排序执行力', score: clampStrengthScore(sortingAccuracy * 100), note: `平均排序 ${Math.round(sortingAccuracy * 100)} 分` },
  ];

  const weakAreas = [
    topPhase && topPhase.totalLoss > 0 ? `${topPhase.phase}失分最高：${topPhase.totalLoss} cp / ${topPhase.mistakes} 次` : '',
    topMistakeType ? `${topMistakeType.type}最突出：${topMistakeType.count} 次，损失 ${topMistakeType.totalLoss} cp` : '',
    weakestTag ? `${weakestTag.tag}错题正确率偏低：${weakestTag.accuracy}%` : '',
    candidateStats.answerInCandidatesButNotSelected > 0 ? `候选着能想到但未选择：${candidateStats.answerInCandidatesButNotSelected} 次` : '',
  ].filter(Boolean);

  const trainingPriorities = [
    topPhase ? `优先做${topPhase.phase}专项：每盘挑 2 个高损失局面写候选计划。` : '',
    topMistakeType ? `针对${topMistakeType.type}建立错题标签，复盘前先写防错清单。` : '',
    weakestTag ? `复习错题标签「${weakestTag.tag}」，目标把正确率提升到 70% 以上。` : '',
    candidateStats.validSessions ? '继续做 2-3 个候选着训练，要求先覆盖实战答案再排序。' : '',
  ].filter(Boolean);

  const sampleInfo = snapshots
    ? {
        gameCount: snapshots.length,
        rangeLabel: rangeLabel ?? `${snapshots.length} 局累计`,
      }
    : undefined;
  const samplePrefix = sampleInfo ? `｜${sampleInfo.rangeLabel} · ${sampleInfo.gameCount} 局累计` : '';

  return {
    summary: weakAreas.length
      ? `${evaluatedSideLabel}棋力画像${samplePrefix}｜首要短板：${weakAreas[0]}。下一步：${trainingPriorities[0] ?? '保持每盘复盘。'}`
      : `${evaluatedSideLabel}棋力画像${samplePrefix}｜暂无足够数据建立稳定棋力画像；建议先完成整盘分析和错题训练。`,
    phaseBreakdown,
    mistakeTypes,
    weakAreas,
    trainingPriorities,
    radarAxes,
    sampleInfo,
  };
}

function addPracticeTheme(
  themes: NaturalLanguagePracticeTheme[],
  theme: string,
  priority: NaturalLanguagePracticeTheme['priority'],
  source: NaturalLanguagePracticeTheme['source'],
  evidence: string,
  nextAction: string,
) {
  const existing = themes.find((item) => item.theme === theme);
  if (existing) {
    const priorityRank = { high: 3, medium: 2, low: 1 };
    if (priorityRank[priority] > priorityRank[existing.priority]) {
      existing.priority = priority;
      existing.source = source;
      existing.nextAction = nextAction;
    }
    if (!existing.evidence.includes(evidence)) {
      existing.evidence = `${existing.evidence}；${evidence}`;
    }
    return;
  }

  themes.push({ theme, priority, source, evidence, nextAction });
}

function extractPracticeThemesFromText(text?: string) {
  if (!text) {
    return [];
  }

  const knownThemes = ['王翼兵形/王安全', '候选着法与风险控制', '中心与兵形', '换子与战术计算', '子力协调/最差子改善', '基础残局转换'];
  return knownThemes.filter((theme) => text.includes(theme));
}

function buildPracticeThemeRecommendations({
  reviewReport,
  candidateStats,
  history = [],
}: {
  reviewReport?: Pick<ReviewReport, 'trainingAdvice'> | { trainingAdvice?: string } | null;
  candidateStats?: CandidateTrainingStats | null;
  history?: Array<Pick<ReviewReportHistoryItem, 'trainingAdvice' | 'keyMoments'> | { trainingAdvice?: string; keyMoments?: Array<Partial<ReviewReportHistoryKeyMoment>> }>;
}): NaturalLanguagePracticeTheme[] {
  const themes: NaturalLanguagePracticeTheme[] = [];

  extractPracticeThemesFromText(reviewReport?.trainingAdvice).forEach((theme) => {
    addPracticeTheme(
      themes,
      theme,
      'high',
      'current-report',
      `当前复盘建议包含「${theme}」`,
      `下一盘先做 10 分钟「${theme}」专项，再回看本局最大失误。`,
    );
  });

  if (candidateStats && candidateStats.validSessions > 0) {
    const coverageRate = candidateStats.answerCovered / candidateStats.validSessions;
    const bestCoverageRate = candidateStats.bestCovered / candidateStats.validSessions;
    const averageSortingScore = Math.round(candidateStats.sortingScoreTotal / candidateStats.validSessions);

    if (coverageRate < 0.6) {
      addPracticeTheme(
        themes,
        '候选着覆盖',
        'high',
        'candidate-training',
        `答案覆盖率 ${candidateStats.answerCovered}/${candidateStats.validSessions}`,
        '每个关键局面先写满 3 个候选着，再计算对方最强回应。',
      );
    }
    if (bestCoverageRate < 0.6) {
      addPracticeTheme(
        themes,
        '最佳着意识',
        'high',
        'candidate-training',
        `最佳着覆盖率 ${candidateStats.bestCovered}/${candidateStats.validSessions}`,
        '复盘时把引擎首选加入候选清单，并解释它解决的最大威胁。',
      );
    }
    if (candidateStats.answerInCandidatesButNotSelected > 0 || averageSortingScore < 70) {
      addPracticeTheme(
        themes,
        '候选着排序执行',
        'medium',
        'candidate-training',
        `候选里有答案但未选择 ${candidateStats.answerInCandidatesButNotSelected} 次，平均排序 ${averageSortingScore}`,
        '候选着写完后按安全性、主动性、战术漏洞三项排序。',
      );
    }
  }

  const historyThemeCounts = new Map<string, number>();
  history.forEach((item) => {
    extractPracticeThemesFromText(item.trainingAdvice).forEach((theme) => {
      historyThemeCounts.set(theme, (historyThemeCounts.get(theme) ?? 0) + 1);
    });
    const severeMoments = item.keyMoments?.filter((moment) => moment.quality === '败着' || moment.quality === '失误') ?? [];
    if (severeMoments.length > 0) {
      historyThemeCounts.set('复盘关键时刻', (historyThemeCounts.get('复盘关键时刻') ?? 0) + severeMoments.length);
    }
  });

  [...historyThemeCounts.entries()]
    .filter(([, count]) => count > 0)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 3)
    .forEach(([theme, count]) => {
      addPracticeTheme(
        themes,
        theme,
        count >= 2 ? 'high' : 'medium',
        'history',
        `历史报告出现 ${count} 次`,
        `从历史报告中挑 3 个「${theme}」局面做间隔复盘。`,
      );
    });

  if (themes.length === 0) {
    addPracticeTheme(
      themes,
      '候选着法与风险控制',
      'low',
      'current-report',
      '暂无稳定弱项，使用默认复盘主题',
      '每个关键局面固定写 2-3 个候选着并标注风险。',
    );
  }

  const priorityRank = { high: 3, medium: 2, low: 1 };
  const sourceRank = { 'current-report': 3, history: 2, 'candidate-training': 1 };
  return themes.sort((a, b) =>
    priorityRank[b.priority] - priorityRank[a.priority]
    || sourceRank[b.source] - sourceRank[a.source]
    || a.theme.localeCompare(b.theme),
  );
}

function getExplanationSeverity(analysis: GlobalMoveAnalysis): NaturalLanguagePositionExplanation['severity'] {
  return classifyKeyAnalysisMoment(analysis).severity ?? 'normal';
}

function getExplanationTitle(analysis: GlobalMoveAnalysis) {
  const suffix = analysis.quality === '好棋' ? '可作为正例复盘' : '需要优先复盘';
  return `${analysis.label}：${analysis.quality}，${suffix}`;
}

function buildNaturalLanguagePositionExplanation({
  analysis,
  reviewReport,
  candidateComparison,
}: {
  analysis: GlobalMoveAnalysis;
  reviewReport?: Pick<ReviewReport, 'trainingAdvice' | 'summary'> | { trainingAdvice?: string; summary?: string } | null;
  candidateComparison?: CandidateMultiPvComparison | null;
}): NaturalLanguagePositionExplanation {
  const classification = classifyKeyAnalysisMoment(analysis);
  const perspective = describeGlobalAnalysisPerspective(analysis);
  const recommendedCandidateMoves = rankMultiPvLines(analysis.multiPvLines)
    .map((line) => line.firstMoveSan || line.pv[0] || '')
    .filter(Boolean)
    .slice(0, 3);
  const theme = classifyMiddlegameTheme(analysis);
  const practiceThemes = [...new Set([theme, analysis.centipawnLoss >= 300 ? '候选着法与风险控制' : '', ...extractPracticeThemesFromText(reviewReport?.trainingAdvice)].filter(Boolean))];
  const bestMove = recommendedCandidateMoves[0] || analysis.bestMoveSan || '-';
  const whyBad = analysis.quality === '好棋'
    ? `${perspective.summary}；仍可作为稳定选择复盘。`
    : `${perspective.summary}；引擎首选是 ${analysis.bestMoveSan || bestMove}。`;
  const strategicImpact = [
    analysis.isSwingPoint ? '它触发局势突变，说明走子前需要先检查对方强制回应。' : '它没有触发大幅局势突变，但仍暴露了计划选择问题。',
    classification.reasons.length ? `复盘标签：${classification.reasons.join('、')}。` : '',
    reviewReport?.summary ? `报告背景：${reviewReport.summary}` : '',
  ].filter(Boolean).join(' ');
  const candidateGuidance = candidateComparison?.selectedRow
    ? `实战选择 ${candidateComparison.selectedRow.moveSan}（${candidateComparison.selectedRow.summary}）的反馈是「${
        candidateComparison.selectedRow.feedbackLabel === '漏算着法' && analysis.quality === '败着'
          ? '风险着法'
          : candidateComparison.selectedRow.feedbackLabel
      }」；下次优先比较 ${bestMove}，并用 MultiPV 主线验证候选着风险。`
    : `下次先列出 ${recommendedCandidateMoves.join('、') || analysis.bestMoveSan || '引擎首选'} 等候选着，再比较每步的直接威胁和王安全。`;
  const markdown = [
    `# ${getExplanationTitle(analysis)}`,
    '',
    `## 为什么这步差\n${whyBad}`,
    '',
    `## 战略影响\n${strategicImpact}`,
    '',
    `## 应关注的候选着法\n${candidateGuidance}`,
    '',
    `## 练习主题\n${practiceThemes.join('、') || '候选着法与风险控制'}`,
  ].join('\n');

  return {
    moveLabel: analysis.label,
    severity: getExplanationSeverity(analysis),
    title: getExplanationTitle(analysis),
    whyBad,
    strategicImpact,
    candidateGuidance,
    recommendedCandidateMoves,
    practiceThemes,
    markdown,
  };
}

function buildNaturalLanguageCoachReport({
  analyses,
  reviewReport,
  candidateStats,
  history = [],
  momentFilter = 'key',
}: {
  analyses: GlobalMoveAnalysis[];
  reviewReport?: Pick<ReviewReport, 'summary' | 'trainingAdvice'> | { summary?: string; trainingAdvice?: string } | null;
  candidateStats?: CandidateTrainingStats | null;
  history?: Array<Pick<ReviewReportHistoryItem, 'trainingAdvice' | 'keyMoments'> | { trainingAdvice?: string; keyMoments?: Array<Partial<ReviewReportHistoryKeyMoment>> }>;
  momentFilter?: GlobalAnalysisMomentFilter;
}): NaturalLanguageCoachReport {
  const filterLabel = getGlobalAnalysisMomentFilterLabel(momentFilter);
  const focusAnalyses = filterGlobalAnalysisMoments(analyses, momentFilter)
    .sort((a, b) => b.centipawnLoss - a.centipawnLoss || a.moveIndex - b.moveIndex)
    .slice(0, 3);
  const positionExplanations = focusAnalyses.map((analysis) => buildNaturalLanguagePositionExplanation({ analysis, reviewReport }));
  const practiceThemes = buildPracticeThemeRecommendations({ reviewReport, candidateStats, history });
  const summary = positionExplanations.length
    ? `自然语言教练按「${filterLabel}」生成 ${positionExplanations.length} 个局面解释，首要练习主题：${practiceThemes[0]?.theme ?? '候选着法与风险控制'}。`
    : `自然语言教练按「${filterLabel}」暂未发现关键失误，建议保持${practiceThemes[0]?.theme ?? '候选着法与风险控制'}训练。`;
  const markdown = [
    '# 自然语言教练解释',
    '',
    `筛选：${filterLabel}`,
    '',
    `## 总览\n${summary}`,
    '',
    '## 关键局面解释',
    positionExplanations.length ? positionExplanations.map((item) => item.markdown).join('\n\n') : '暂无关键局面解释。',
    '',
    '## 推荐练习主题',
    ...practiceThemes.map((theme, index) => `${index + 1}. ${theme.theme}（${theme.priority}）- ${theme.evidence}。${theme.nextAction}`),
  ].join('\n');

  return {
    summary,
    filterLabel,
    positionExplanations,
    practiceThemes,
    markdown,
  };
}

function buildReviewReport({
  opening,
  analyses,
  middlegamePlan,
  endgamePlan,
  evaluatedColor,
  evaluationSide,
}: {
  opening: OpeningMatch;
  analyses: GlobalMoveAnalysis[];
  middlegamePlan: MiddlegamePlanTraining;
  endgamePlan: EndgameTrainingPlan;
  evaluatedColor?: Color;
  evaluationSide?: EvaluationSide;
}): ReviewReport {
  const reportEvaluationSide: EvaluationSide = evaluationSide ?? (evaluatedColor === 'w' ? 'white' : evaluatedColor === 'b' ? 'black' : 'both');
  const reportAnalyses = filterAnalysesByEvaluationSide(analyses, reportEvaluationSide);
  const evaluatedSideLabel = getEvaluationSideLabel(reportEvaluationSide);
  const riskyMoves = filterGlobalAnalysisMoments(reportAnalyses, 'key')
    .sort((a, b) => b.centipawnLoss - a.centipawnLoss || a.moveIndex - b.moveIndex);
  const biggestMistake = riskyMoves[0] ?? null;
  const openingSection =
    opening.status === 'deviation'
      ? `${opening.eco} ${opening.name}：第 ${opening.matchedPly + 1} ply 脱离开局库，实战 ${opening.deviationMove ?? '-'}，建议复习 ${opening.nextBookMove ?? '主线计划'}。`
      : `${opening.eco} ${opening.name}：${opening.status === 'unknown' ? '暂未识别到明确开局' : '开局阶段基本可追踪'}。`;
  const middlegameSection = middlegamePlan.focusCards.length
    ? `${middlegamePlan.summary} 关键主题：${middlegamePlan.themeStats.map((theme) => theme.theme).slice(0, 3).join('、') || middlegamePlan.focusCards[0].topic}。`
    : '中局阶段暂未生成关键训练卡；建议先运行整盘分析。';
  const endgameSection =
    endgamePlan.phase === 'endgame'
      ? `${endgamePlan.summary} 主题：${endgamePlan.themes.join('、') || '基础残局转换'}。`
      : '本局尚未识别到明确残局阶段。';
  const biggestMistakePerspective = biggestMistake
    ? describeGlobalAnalysisPerspective(biggestMistake, reportEvaluationSide === 'both' ? 'sideToMove' : 'white')
    : null;
  const biggestMistakeSection = biggestMistake
    ? `被评价方：${evaluatedSideLabel}。最大失误：${biggestMistake.label} ${biggestMistake.san}，${biggestMistakePerspective?.summary}；建议比较引擎首选 ${biggestMistake.bestMoveSan || '-'}。`
    : `被评价方：${evaluatedSideLabel}。最大失误：暂未发现明显失误。`;
  const topTheme = middlegamePlan.themeStats[0]?.theme ?? endgamePlan.themes[0] ?? '候选着法复盘';
  const trainingAdvice = biggestMistake
    ? `优先训练${topTheme}，并把 ${biggestMistake.label}（${biggestMistakePerspective?.moverLabel}走棋，${biggestMistakePerspective?.perspectiveLabel}）前的候选着法写成 2-3 个备选方案。`
    : `优先训练${topTheme}，保持每盘棋复盘开局、中局和残局三个阶段。`;
  const summary = biggestMistake
    ? `本局复盘完成，被评价方：${evaluatedSideLabel}，${opening.name}，最大失误：${biggestMistake.label}，${biggestMistakePerspective?.summary}，推荐训练：${topTheme}。`
    : `本局复盘完成，被评价方：${evaluatedSideLabel}，${opening.name}，暂未发现重大失误，推荐训练：${topTheme}。`;
  const markdown = [
    '# Chess Me 复盘报告',
    '',
    `## 总结\n${summary}`,
    '',
    `## 开局阶段表现\n${openingSection}`,
    '',
    `## 中局关键转折\n${middlegameSection}`,
    '',
    `## 残局准确性\n${endgameSection}`,
    '',
    `## 最大失误\n${biggestMistakeSection}`,
    '',
    `## 下一次训练建议\n${trainingAdvice}`,
  ].join('\n');

  return {
    summary,
    biggestMistake,
    sections: {
      opening: openingSection,
      middlegame: middlegameSection,
      endgame: endgameSection,
      biggestMistake: biggestMistakeSection,
    },
    trainingAdvice,
    markdown,
  };
}

function createReviewReportHistoryItem({
  id,
  savedAt,
  pgn,
  report,
  analyses,
  meta,
}: {
  id: string;
  savedAt: string;
  pgn: string;
  report: ReviewReport;
  analyses: GlobalMoveAnalysis[];
  meta: ReviewReportHistoryMeta;
}): ReviewReportHistoryItem {
  const keyMoments = filterGlobalAnalysisMoments(analyses, 'key')
    .sort((a, b) => b.centipawnLoss - a.centipawnLoss || a.moveIndex - b.moveIndex)
    .slice(0, 5)
    .map((analysis) => {
      const perspective = describeGlobalAnalysisPerspective(analysis, 'white');
      return {
        moveIndex: analysis.moveIndex,
        label: analysis.label,
        san: analysis.san,
        quality: analysis.quality,
        centipawnLoss: analysis.centipawnLoss,
        bestMoveSan: analysis.bestMoveSan,
        perspectiveLabel: perspective.perspectiveLabel,
        evaluatedSideLabel: perspective.evaluatedSideLabel,
        moverLabel: perspective.moverLabel,
      };
    });

  return {
    version: 1,
    id,
    savedAt,
    pgn,
    meta,
    summary: report.summary,
    analysisSummary: report.markdown,
    keyMoments,
    strengthProfileAnalyses: analyses,
    trainingAdvice: report.trainingAdvice,
    markdown: report.markdown,
    isFavorite: false,
  };
}

function filterReviewReportHistory(
  history: ReviewReportHistoryItem[],
  filters: ReviewReportHistoryFilters,
): ReviewReportHistoryItem[] {
  const query = filters.query?.trim().toLowerCase() ?? '';

  return history.filter((item) => {
    if (filters.favoriteOnly && !item.isFavorite) {
      return false;
    }

    if (filters.result && item.meta.result !== filters.result) {
      return false;
    }

    if (!query) {
      return true;
    }

    const searchable = [
      item.meta.event,
      item.meta.white,
      item.meta.black,
      item.meta.result,
      item.summary,
      item.trainingAdvice,
      item.keyMoments.map((moment) => `${moment.label} ${moment.san} ${moment.quality}`).join(' '),
    ].join(' ').toLowerCase();

    return searchable.includes(query);
  });
}

function toggleReviewReportHistoryFavorite(history: ReviewReportHistoryItem[], id: string): ReviewReportHistoryItem[] {
  return history.map((item) => (item.id === id ? { ...item, isFavorite: !item.isFavorite } : item));
}

function buildReviewReportHistoryStats(history: ReviewReportHistoryItem[]): ReviewReportHistoryStats {
  const adviceCounts = new Map<string, number>();
  history.forEach((item) => {
    const advice = item.trainingAdvice.replace(/^优先训练/, '').split('，')[0].trim();
    if (advice) {
      adviceCounts.set(advice, (adviceCounts.get(advice) ?? 0) + 1);
    }
  });
  const mostCommonTrainingAdvice = [...adviceCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([advice, count]) => `${advice}：${count} 份报告`);
  const totalKeyMoments = history.reduce((total, item) => total + item.keyMoments.length, 0);

  return {
    totalReports: history.length,
    favoriteReports: history.filter((item) => item.isFavorite).length,
    totalKeyMoments,
    mostCommonTrainingAdvice,
    summary: history.length
      ? `历史已沉淀 ${history.length} 份复盘报告，累计 ${totalKeyMoments} 个关键时刻。`
      : '暂无历史复盘报告；保存当前报告后可形成长期棋力画像。',
  };
}

function normalizeReviewReportHistoryAnalyses(analyses: unknown): GlobalMoveAnalysis[] {
  if (!Array.isArray(analyses)) {
    return [];
  }

  return analyses.map((analysis) => {
    const partial = analysis as Partial<GlobalMoveAnalysis>;
    return {
      moveIndex: Number(partial.moveIndex) || 0,
      label: String(partial.label || ''),
      san: String(partial.san || ''),
      moveColor: partial.moveColor === 'w' || partial.moveColor === 'b' ? partial.moveColor : undefined,
      quality: partial.quality === '疑问手' || partial.quality === '失误' || partial.quality === '败着' ? partial.quality : '好棋',
      centipawnLoss: Number(partial.centipawnLoss) || 0,
      beforeScore: typeof partial.beforeScore === 'number' ? partial.beforeScore : null,
      afterScore: typeof partial.afterScore === 'number' ? partial.afterScore : null,
      isSwingPoint: Boolean(partial.isSwingPoint),
      bestMoveSan: String(partial.bestMoveSan || ''),
      primaryPv: Array.isArray(partial.primaryPv) ? partial.primaryPv.map(String) : undefined,
      multiPvLines: Array.isArray(partial.multiPvLines) ? partial.multiPvLines : [],
    };
  });
}

function normalizeReviewReportHistoryItem(item: Partial<ReviewReportHistoryItem>): ReviewReportHistoryItem | null {
  if (!item.id || !item.pgn || !item.meta || !item.summary) {
    return null;
  }

  return {
    version: 1,
    id: String(item.id),
    savedAt: item.savedAt || new Date(0).toISOString(),
    pgn: String(item.pgn),
    meta: {
      event: item.meta.event || '未知',
      white: item.meta.white || '未知',
      black: item.meta.black || '未知',
      result: item.meta.result || '*',
    },
    summary: String(item.summary),
    analysisSummary: item.analysisSummary || item.markdown || '',
    keyMoments: Array.isArray(item.keyMoments) ? item.keyMoments : [],
    strengthProfileAnalyses: normalizeReviewReportHistoryAnalyses(item.strengthProfileAnalyses),
    trainingAdvice: item.trainingAdvice || '',
    markdown: item.markdown || item.analysisSummary || '',
    isFavorite: Boolean(item.isFavorite),
  };
}

function normalizeSan(san: string) {
  return san.replace(/[+#?!]+/g, '');
}

type PgnReplyAfterGuess = {
  isCorrectGuess: boolean;
  playerTargetIndex: number;
  nextIndex: number;
  replyMoveSan?: string;
  message: string;
};

function getPgnReplyAfterCorrectGuess({
  guessedSan,
  moves,
  currentIndex,
  maxIndex,
}: {
  guessedSan: string;
  moves: Array<Pick<Move, 'san'>>;
  currentIndex: number;
  maxIndex: number;
}): PgnReplyAfterGuess {
  const actualMove = moves[currentIndex];
  const playerTargetIndex = Math.min(currentIndex + 1, maxIndex);

  if (!actualMove || normalizeSan(guessedSan) !== normalizeSan(actualMove.san)) {
    return {
      isCorrectGuess: false,
      playerTargetIndex,
      nextIndex: currentIndex,
      message: actualMove
        ? `未猜中实战手 ${actualMove.san}，保持当前题目复盘。`
        : '当前没有可应答的棋谱下一手。',
    };
  }

  const replyMove = moves[playerTargetIndex];
  if (!replyMove) {
    return {
      isCorrectGuess: true,
      playerTargetIndex,
      nextIndex: playerTargetIndex,
      message: `猜对实战手 ${actualMove.san}，棋谱已到末尾。`,
    };
  }

  const nextIndex = Math.min(playerTargetIndex + 1, maxIndex);
  return {
    isCorrectGuess: true,
    playerTargetIndex,
    replyMoveSan: replyMove.san,
    nextIndex,
    message: `猜对实战手 ${actualMove.san}，电脑按棋谱回应 ${replyMove.san}。`,
  };
}

function analyzeGuessMove({
  guessedSan,
  actualSan,
  stockfishBestSan,
}: {
  guessedSan: string;
  actualSan: string;
  stockfishBestSan: string;
}): GuessMoveResult {
  const isCorrect = normalizeSan(guessedSan) === normalizeSan(actualSan);
  const matchesStockfish = Boolean(stockfishBestSan) && normalizeSan(guessedSan) === normalizeSan(stockfishBestSan);
  const summary = [
    isCorrect ? '猜对实战手' : '未猜中实战手',
    `你的选择：${guessedSan}`,
    `实战手：${actualSan}`,
    `Stockfish 首选：${stockfishBestSan || '暂未分析'}`,
    matchesStockfish ? '同时命中引擎首选。' : '可对照实战选择与引擎计划复盘。',
  ].join(' · ');

  return {
    guessedSan,
    actualSan,
    stockfishBestSan,
    isCorrect,
    matchesStockfish,
    summary,
  };
}

function parseCandidateMoveEntries(rawCandidates: string): CandidateMoveEntry[] {
  return rawCandidates
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3)
    .map((line) => {
      const [moveSan = '', ...reasonParts] = line.split(/\s*(?:-|：|:)\s*|\s{2,}/);
      return {
        moveSan: moveSan.trim(),
        reason: reasonParts.join(' ').trim(),
      };
    })
    .filter((entry) => entry.moveSan.length > 0);
}

function getScoreGapCentipawns(bestScore: StockfishAnalysis['score'], candidateScore: StockfishAnalysis['score']) {
  const bestCp = scoreToWhiteCentipawns(bestScore);
  const candidateCp = scoreToWhiteCentipawns(candidateScore);
  if (bestCp === null || candidateCp === null) {
    return null;
  }

  return Math.abs(bestCp - candidateCp);
}

function classifyCandidateMultiPvFeedback({
  matchedLine,
  scoreGapCp,
  hasMultiPv,
  isBestSan,
}: {
  matchedLine: MultiPvLine | undefined;
  scoreGapCp: number | null;
  hasMultiPv: boolean;
  isBestSan: boolean;
}): CandidateMultiPvFeedbackLabel {
  if (!hasMultiPv) {
    return isBestSan ? '最佳着法' : '可接受着法';
  }

  if (!matchedLine) {
    return '漏算着法';
  }

  if (matchedLine.rank === 1) {
    return '最佳着法';
  }

  if (scoreGapCp !== null && scoreGapCp <= 80) {
    return '可接受着法';
  }

  return '风险着法';
}

function buildCandidateFeedbackExplanation(label: CandidateMultiPvFeedbackLabel, matchedLine: MultiPvLine | undefined, scoreGapCp: number | null) {
  if (label === '漏算着法') {
    return '这步没有进入当前 MultiPV 候选线，说明训练时可能漏算了引擎认为更关键的分支。';
  }

  if (!matchedLine) {
    return label === '最佳着法'
      ? '暂无 MultiPV 排名，但这步与当前引擎首选一致。'
      : '暂无 MultiPV 排名，先用实战答案和首选着法做降级判断。';
  }

  const gapText = scoreGapCp === null ? '评价差暂不可比' : `与最佳线相差 ${scoreGapCp}cp`;
  if (label === '最佳着法') {
    return `命中 MultiPV 第 1 候选，${gapText}，应优先纳入候选排序。`;
  }

  if (label === '可接受着法') {
    return `命中 MultiPV 第 ${matchedLine.rank} 候选，${gapText}，属于可继续计算的备选方案。`;
  }

  return `命中 MultiPV 第 ${matchedLine.rank} 候选，但${gapText}，需要解释风险和战术反驳。`;
}

function buildCandidateMultiPvComparison({
  rawCandidates,
  selectedSan,
  actualSan,
  stockfishBestSan,
  multiPvLines,
  moveColor,
  perspective = 'sideToMove',
  boardFlipped = false,
}: {
  rawCandidates: string;
  selectedSan: string;
  actualSan: string;
  stockfishBestSan: string;
  multiPvLines: MultiPvLine[];
  moveColor?: Color;
  perspective?: EvaluationPerspective;
  boardFlipped?: boolean;
}): CandidateMultiPvComparison {
  const entries = parseCandidateMoveEntries(rawCandidates);
  const rankedLines = rankMultiPvLines(multiPvLines);
  const bestLine = rankedLines[0];
  const hasMultiPv = rankedLines.length > 0;
  const normalizedSelected = normalizeSan(selectedSan);
  const normalizedBest = normalizeSan(stockfishBestSan || bestLine?.firstMoveSan || '');
  const normalizedActual = normalizeSan(actualSan);
  const perspectiveInfo = buildGlobalAnalysisPerspectiveLabel({
    moveColor: moveColor ?? 'w',
    perspective,
    boardFlipped,
    classification: '好棋',
    centipawnLoss: 0,
  });

  const rows = entries.map((entry) => {
    const normalizedMove = normalizeSan(entry.moveSan);
    const matchedLine = rankedLines.find((line) => normalizeSan(line.firstMoveSan || line.pv[0] || '') === normalizedMove);
    const scoreGapCp = matchedLine ? getScoreGapCentipawns(bestLine?.score ?? null, matchedLine.score) : null;
    const feedbackLabel = classifyCandidateMultiPvFeedback({
      matchedLine,
      scoreGapCp,
      hasMultiPv,
      isBestSan: Boolean(normalizedBest) && normalizedMove === normalizedBest,
    });

    return {
      ...entry,
      isSelected: normalizedMove === normalizedSelected,
      matchedRank: matchedLine?.rank ?? null,
      scoreGapCp,
      feedbackLabel,
      keyVariation: matchedLine?.pv.length ? matchedLine.pv.join(' ') : '未命中 MultiPV 候选线',
      explanation: `${buildCandidateFeedbackExplanation(feedbackLabel, matchedLine, scoreGapCp)} ${perspectiveInfo.summary}`.trim(),
      perspectiveLabel: perspectiveInfo.perspectiveLabel,
      evaluatedSideLabel: perspectiveInfo.evaluatedSideLabel,
      moverLabel: perspectiveInfo.moverLabel,
      summary: `${perspectiveInfo.perspectiveLabel} · 评价方：${perspectiveInfo.evaluatedSideLabel} · 走棋方：${perspectiveInfo.moverLabel}`,
    } satisfies CandidateMultiPvComparisonRow;
  });

  const selectedRow = rows.find((row) => row.isSelected) ?? null;
  const actualInMultiPv = rankedLines.find((line) => normalizeSan(line.firstMoveSan || line.pv[0] || '') === normalizedActual);
  const summary = hasMultiPv
    ? selectedRow?.matchedRank
      ? `最终选择 ${selectedRow.moveSan} 命中 MultiPV 第 ${selectedRow.matchedRank} 候选${
          selectedRow.scoreGapCp === null ? '' : `，与最佳线相差 ${selectedRow.scoreGapCp}cp`
        }；${perspectiveInfo.summary}。${actualInMultiPv ? `实战答案在第 ${actualInMultiPv.rank} 候选线。` : '实战答案没有命中当前 MultiPV 候选线。'}`
      : `最终选择 ${selectedSan || '未选择'} 没有命中当前 MultiPV 候选线，需要回看最佳线 ${bestLine?.pv.join(' ') || '暂无'}；${perspectiveInfo.summary}。`
    : `暂无 MultiPV 数据：已降级为候选着、实战答案和 Stockfish 首选的基础对比；${perspectiveInfo.summary}。`;

  return {
    multiPvAvailable: hasMultiPv,
    rows,
    selectedRow,
    summary,
  };
}

function analyzeCandidateMoveTraining({
  rawCandidates,
  selectedSan,
  actualSan,
  stockfishBestSan,
  multiPvLines = [],
  moveColor,
  perspective = 'sideToMove',
  boardFlipped = false,
}: {
  rawCandidates: string;
  selectedSan: string;
  actualSan: string;
  stockfishBestSan: string;
  multiPvLines?: MultiPvLine[];
  moveColor?: Color;
  perspective?: EvaluationPerspective;
  boardFlipped?: boolean;
}): CandidateMoveTrainingResult {
  const entries = parseCandidateMoveEntries(rawCandidates);
  const candidateCount = entries.length;
  const normalizedCandidates = entries.map((entry) => normalizeSan(entry.moveSan));
  const normalizedSelected = normalizeSan(selectedSan);
  const normalizedActual = normalizeSan(actualSan);
  const normalizedBest = normalizeSan(stockfishBestSan);
  const isValid = candidateCount >= 2;
  const hasActualInCandidates = normalizedCandidates.includes(normalizedActual);
  const hasBestInCandidates = Boolean(stockfishBestSan) && normalizedCandidates.includes(normalizedBest);
  const selectedIsActual = normalizedSelected === normalizedActual;
  const selectedIsBest = Boolean(stockfishBestSan) && normalizedSelected === normalizedBest;
  const answerInCandidatesButNotSelected = hasActualInCandidates && !selectedIsActual;
  const sortingScore = Math.round(
    ((hasActualInCandidates ? 1 : 0) + (hasBestInCandidates ? 1 : 0) + (selectedIsActual || selectedIsBest ? 1 : 0)) *
      (100 / 3),
  );
  const validationMessage = isValid ? '' : '至少写出 2 个候选着法，并为每个候选写一句理由。';
  const multiPvComparison = buildCandidateMultiPvComparison({
    rawCandidates,
    selectedSan,
    actualSan,
    stockfishBestSan,
    multiPvLines,
    moveColor,
    perspective,
    boardFlipped,
  });
  const summary = isValid
    ? [
        `候选 ${candidateCount} 个`,
        hasActualInCandidates ? '实战答案进入候选' : '实战答案未进入候选',
        stockfishBestSan ? (hasBestInCandidates ? '引擎首选进入候选' : '引擎首选未进入候选') : '暂未分析引擎首选',
        answerInCandidatesButNotSelected ? '答案在候选里，但最终没选中' : '最终选择与候选排序一致性可复盘',
        multiPvComparison.summary,
        `排序得分 ${sortingScore}`,
      ].join(' · ')
    : validationMessage;

  return {
    entries,
    candidateCount,
    isValid,
    validationMessage,
    selectedSan,
    actualSan,
    stockfishBestSan,
    hasActualInCandidates,
    hasBestInCandidates,
    selectedIsActual,
    selectedIsBest,
    answerInCandidatesButNotSelected,
    sortingScore,
    multiPvComparison,
    summary,
  };
}

function buildMistakeCardFromGuess({
  baseFen,
  positionLabel,
  result,
  pgnText,
}: {
  baseFen: string;
  positionLabel: string;
  result: GuessMoveResult;
  pgnText: string;
}): MistakeCard | null {
  if (result.isCorrect) {
    return null;
  }

  const now = new Date().toISOString();
  return {
    id: `${baseFen}:${normalizeSan(result.actualSan)}`,
    fen: baseFen,
    positionLabel,
    guessedSan: result.guessedSan,
    actualSan: result.actualSan,
    stockfishBestSan: result.stockfishBestSan,
    pgnText,
    attempts: 1,
    solvedCount: 0,
    reviewStage: 0,
    dueAt: now,
    tags: ['猜下一手'],
    createdAt: now,
    updatedAt: now,
  };
}

function upsertMistakeCard(cards: MistakeCard[], card: MistakeCard): MistakeCard[] {
  const index = cards.findIndex((item) => item.id === card.id);
  if (index < 0) {
    return [card, ...cards];
  }

  return cards.map((item, itemIndex) =>
    itemIndex === index
      ? {
          ...item,
          ...card,
          attempts: item.attempts + 1,
          solvedCount: item.solvedCount,
          reviewStage: 0,
          dueAt: card.dueAt,
          createdAt: item.createdAt,
          updatedAt: card.updatedAt,
        }
      : item,
  );
}

function getSpacedReviewIntervalDays(reviewStage: number) {
  const intervals = [1, 3, 7, 14];
  return intervals[Math.min(Math.max(reviewStage, 0), intervals.length - 1)];
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function normalizeMistakeCard(card: MistakeCard): MistakeCard {
  const now = card.updatedAt || card.createdAt || new Date().toISOString();
  return {
    ...card,
    reviewStage: card.reviewStage ?? 0,
    dueAt: card.dueAt ?? now,
  };
}

function updateMistakeCardReview(card: MistakeCard, solved: boolean, reviewedAt = new Date()): MistakeCard {
  const normalized = normalizeMistakeCard(card);
  const nextStage = solved ? Math.min(normalized.reviewStage + 1, 3) : 0;
  const dueAt = solved ? addDays(reviewedAt, getSpacedReviewIntervalDays(nextStage)).toISOString() : reviewedAt.toISOString();

  return {
    ...normalized,
    attempts: normalized.attempts + 1,
    solvedCount: solved ? normalized.solvedCount + 1 : normalized.solvedCount,
    reviewStage: nextStage,
    dueAt,
    updatedAt: reviewedAt.toISOString(),
  };
}

function buildDailyTrainingPlan(cards: MistakeCard[], now = new Date(), limit = 10) {
  const normalizedCards = cards.map(normalizeMistakeCard);
  const dueCards = normalizedCards
    .filter((card) => new Date(card.dueAt).getTime() <= now.getTime())
    .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
  const dueIds = new Set(dueCards.map((card) => card.id));
  const weakTagCards = normalizedCards
    .filter((card) => !dueIds.has(card.id))
    .sort((a, b) => {
      const tagPriority = Number(b.tags.length > 0) - Number(a.tags.length > 0);
      if (tagPriority !== 0) {
        return tagPriority;
      }
      return a.solvedCount - b.solvedCount || b.attempts - a.attempts;
    });

  return [...dueCards, ...weakTagCards].slice(0, limit);
}

function buildTrainingStatsByTag(cards: MistakeCard[]) {
  const stats = new Map<string, { tag: string; attempts: number; solvedCount: number; accuracy: number }>();

  cards.map(normalizeMistakeCard).forEach((card) => {
    card.tags.forEach((tag) => {
      const current = stats.get(tag) ?? { tag, attempts: 0, solvedCount: 0, accuracy: 0 };
      current.attempts += card.attempts;
      current.solvedCount += card.solvedCount;
      current.accuracy = current.attempts ? Math.round((current.solvedCount / current.attempts) * 100) : 0;
      stats.set(tag, current);
    });
  });

  return [...stats.values()].sort((a, b) => a.accuracy - b.accuracy || b.attempts - a.attempts);
}

function scoreToWhiteCentipawns(score: StockfishAnalysis['score']) {
  if (!score) {
    return null;
  }

  if (score.type === 'mate') {
    return score.value > 0 ? 10000 : -10000;
  }

  return score.value;
}

function classifyMoveFromEvaluationDrop(centipawnLoss: number): MoveQualityLabel {
  if (centipawnLoss >= 300) {
    return '败着';
  }

  if (centipawnLoss >= 150) {
    return '失误';
  }

  if (centipawnLoss >= 60) {
    return '疑问手';
  }

  return '好棋';
}

function detectSwingPoint(beforeScore: number | null, afterScore: number | null, centipawnLoss: number) {
  if (beforeScore === null || afterScore === null) {
    return false;
  }

  const crossedBalance = Math.sign(beforeScore) !== Math.sign(afterScore) && Math.abs(beforeScore - afterScore) >= 120;
  return centipawnLoss >= swingPointThreshold || crossedBalance;
}

function getMoverCentipawnLossForColor(color: Color, beforeScore: number | null, afterScore: number | null) {
  if (beforeScore === null || afterScore === null) {
    return 0;
  }

  const deltaForWhite = afterScore - beforeScore;
  const moverDelta = color === 'w' ? deltaForWhite : -deltaForWhite;
  return Math.max(0, -moverDelta);
}

function getMoverCentipawnLoss(move: Move, beforeScore: number | null, afterScore: number | null) {
  return getMoverCentipawnLossForColor(move.color, beforeScore, afterScore);
}

function loadStoredGuessStats(): GuessStats {
  try {
    const rawStats = window.localStorage.getItem(guessStatsStorageKey);
    if (!rawStats) {
      return { correct: 0, wrong: 0 };
    }

    const parsed = JSON.parse(rawStats) as Partial<GuessStats>;
    return {
      correct: Number(parsed.correct) || 0,
      wrong: Number(parsed.wrong) || 0,
    };
  } catch {
    return { correct: 0, wrong: 0 };
  }
}

function saveStoredGuessStats(stats: GuessStats) {
  window.localStorage.setItem(guessStatsStorageKey, JSON.stringify(stats));
}

function loadStoredMistakeCards(): MistakeCard[] {
  try {
    const rawCards = window.localStorage.getItem(mistakeBookStorageKey);
    if (!rawCards) {
      return [];
    }

    const parsed = JSON.parse(rawCards) as MistakeCard[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredMistakeCards(cards: MistakeCard[]) {
  window.localStorage.setItem(mistakeBookStorageKey, JSON.stringify(cards));
}

function loadStoredReviewReportHistory(): ReviewReportHistoryItem[] {
  try {
    const rawHistory = window.localStorage.getItem(reviewReportHistoryStorageKey);
    if (!rawHistory) {
      return [];
    }

    const parsed = JSON.parse(rawHistory) as Array<Partial<ReviewReportHistoryItem>>;
    return Array.isArray(parsed) ? parsed.map(normalizeReviewReportHistoryItem).filter((item): item is ReviewReportHistoryItem => Boolean(item)) : [];
  } catch {
    return [];
  }
}

function saveStoredReviewReportHistory(history: ReviewReportHistoryItem[]) {
  window.localStorage.setItem(reviewReportHistoryStorageKey, JSON.stringify(history));
}

function getInitialCandidateTrainingStats(): CandidateTrainingStats {
  return {
    sessions: 0,
    validSessions: 0,
    answerCovered: 0,
    bestCovered: 0,
    answerInCandidatesButNotSelected: 0,
    sortingScoreTotal: 0,
  };
}

function loadStoredCandidateTrainingStats(): CandidateTrainingStats {
  try {
    const rawStats = window.localStorage.getItem(candidateTrainingStatsStorageKey);
    if (!rawStats) {
      return getInitialCandidateTrainingStats();
    }

    const parsed = JSON.parse(rawStats) as Partial<CandidateTrainingStats>;
    return {
      sessions: Number(parsed.sessions) || 0,
      validSessions: Number(parsed.validSessions) || 0,
      answerCovered: Number(parsed.answerCovered) || 0,
      bestCovered: Number(parsed.bestCovered) || 0,
      answerInCandidatesButNotSelected: Number(parsed.answerInCandidatesButNotSelected) || 0,
      sortingScoreTotal: Number(parsed.sortingScoreTotal) || 0,
    };
  } catch {
    return getInitialCandidateTrainingStats();
  }
}

function saveStoredCandidateTrainingStats(stats: CandidateTrainingStats) {
  window.localStorage.setItem(candidateTrainingStatsStorageKey, JSON.stringify(stats));
}

function loadStoredCandidateTrainingSessions(): CandidateTrainingSession[] {
  try {
    const rawSessions = window.localStorage.getItem(candidateTrainingSessionsStorageKey);
    if (!rawSessions) {
      return [];
    }

    const parsed = JSON.parse(rawSessions) as CandidateTrainingSession[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveStoredCandidateTrainingSessions(sessions: CandidateTrainingSession[]) {
  window.localStorage.setItem(candidateTrainingSessionsStorageKey, JSON.stringify(sessions));
}

function updateCandidateTrainingStats(
  stats: CandidateTrainingStats,
  result: CandidateMoveTrainingResult,
): CandidateTrainingStats {
  return {
    sessions: stats.sessions + 1,
    validSessions: stats.validSessions + (result.isValid ? 1 : 0),
    answerCovered: stats.answerCovered + (result.hasActualInCandidates ? 1 : 0),
    bestCovered: stats.bestCovered + (result.hasBestInCandidates ? 1 : 0),
    answerInCandidatesButNotSelected:
      stats.answerInCandidatesButNotSelected + (result.answerInCandidatesButNotSelected ? 1 : 0),
    sortingScoreTotal: stats.sortingScoreTotal + (result.isValid ? result.sortingScore : 0),
  };
}

function getTrainingExplanation({
  analysis,
  nextMove,
  isVariationMode,
}: {
  analysis: StockfishAnalysis | null;
  nextMove?: Move;
  isVariationMode: boolean;
}) {
  if (!analysis || (!analysis.bestMoveSan && analysis.depth === 0)) {
    return '开启 Stockfish 后，这里会解释当前局面的首选计划。';
  }

  const scoreText = analysis.score
    ? `当前评估：${formatEngineScore(analysis.score)}。`
    : '';
  const bestMoveText = analysis.bestMoveSan
    ? `引擎首选是 ${analysis.bestMoveSan}。`
    : '暂未得到明确最佳手。';
  const pvText = analysis.pv.length ? `主线：${analysis.pv.join(' ')}。` : '';

  if (isVariationMode) {
    return [scoreText, bestMoveText, '当前是在试走变化图中，可用它检查这个分支是否站得住。', pvText]
      .filter(Boolean)
      .join(' ');
  }

  if (!nextMove) {
    return [scoreText, bestMoveText, '当前已经是棋谱末尾。', pvText].filter(Boolean).join(' ');
  }

  const nextMoveMatches =
    analysis.bestMoveSan && normalizeSan(nextMove.san) === normalizeSan(analysis.bestMoveSan);

  if (nextMoveMatches) {
    return [scoreText, `棋谱下一手 ${nextMove.san} 与 Stockfish 首选一致。`, pvText]
      .filter(Boolean)
      .join(' ');
  }

  return [
    scoreText,
    `棋谱下一手是 ${nextMove.san}，Stockfish 首选是 ${analysis.bestMoveSan || analysis.bestMove || '未知'}。`,
    '这通常是值得重点复盘的分歧点。',
    pvText,
  ]
    .filter(Boolean)
    .join(' ');
}

function getPositionNoteKey(mode: ReplayMode, text: string, index: number, fen: string) {
  let hash = 0;

  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }

  return `${mode}:${hash}:${index}:${fen}`;
}

function loadStoredNotes() {
  try {
    const rawNotes = window.localStorage.getItem(notesStorageKey);
    if (!rawNotes) {
      return {};
    }

    const parsed = JSON.parse(rawNotes);
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function saveStoredNotes(notes: Record<string, string>) {
  window.localStorage.setItem(notesStorageKey, JSON.stringify(notes));
}

function hasSessionSnapshot(): boolean {
  try {
    const raw = window.localStorage.getItem(sessionSnapshotStorageKey);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && parsed.text && parsed.savedAt;
  } catch {
    return false;
  }
}

function loadSessionSnapshot(): SessionSnapshot | null {
  try {
    const raw = window.localStorage.getItem(sessionSnapshotStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SessionSnapshot>;
    if (!parsed || typeof parsed !== 'object' || !parsed.text || !parsed.mode) {
      return null;
    }
    return {
      mode: parsed.mode === 'fen' ? 'fen' : 'pgn',
      text: String(parsed.text),
      positionIndex: Number(parsed.positionIndex) || 0,
      globalAnalysis: Array.isArray(parsed.globalAnalysis) ? parsed.globalAnalysis : [],
      evaluationSide: (parsed.evaluationSide as EvaluationSide) || 'white',
      evaluationPerspective: (parsed.evaluationPerspective as EvaluationPerspective) || 'white',
      reviewReportEvaluationSide: (parsed.reviewReportEvaluationSide as EvaluationSide) || 'white',
      middlegamePlanEvaluationSide: (parsed.middlegamePlanEvaluationSide as EvaluationSide) || 'white',
      endgameTrainingEvaluationSide: (parsed.endgameTrainingEvaluationSide as EvaluationSide) || 'white',
      isBoardFlipped: Boolean(parsed.isBoardFlipped),
      analysisDepthPreset: (parsed.analysisDepthPreset as AnalysisDepthPreset) || 'standard',
      globalAnalysisFilter: (parsed.globalAnalysisFilter as GlobalAnalysisMomentFilter) || 'all',
      savedVariations: Array.isArray(parsed.savedVariations) ? parsed.savedVariations : [],
      variationPositions: Array.isArray(parsed.variationPositions) ? parsed.variationPositions : [],
      variationIndex: Number(parsed.variationIndex) || -1,
      notesByPosition: parsed.notesByPosition && typeof parsed.notesByPosition === 'object' ? parsed.notesByPosition : {},
      rightPanelTab: (parsed.rightPanelTab as RightPanelTab) || 'library',
      bulkPgnLibrary: parsed.bulkPgnLibrary ?? null,
      bulkPgnFilters: parsed.bulkPgnFilters ?? {
        source: 'all',
        result: 'all',
        color: 'all',
        sortBy: 'date',
        sortDirection: 'desc',
      },
      savedAt: String(parsed.savedAt || new Date().toISOString()),
    };
  } catch {
    return null;
  }
}

function saveSessionSnapshot(snapshot: SessionSnapshot) {
  try {
    window.localStorage.setItem(sessionSnapshotStorageKey, JSON.stringify(snapshot));
  } catch {}
}

function clearSessionSnapshot() {
  try {
    window.localStorage.removeItem(sessionSnapshotStorageKey);
  } catch {}
}

async function copyText(textToCopy: string) {
  if (navigator.clipboard) {
    await navigator.clipboard.writeText(textToCopy);
    return;
  }

  const textArea = document.createElement('textarea');
  textArea.value = textToCopy;
  textArea.setAttribute('readonly', '');
  textArea.style.position = 'fixed';
  textArea.style.opacity = '0';
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand('copy');
  document.body.removeChild(textArea);
}

function downloadText(filename: string, content: string, type = 'application/x-chess-pgn;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function mergeComments(originalComment: string | undefined, note: string) {
  const trimmedNote = note.trim();

  if (!trimmedNote) {
    return originalComment;
  }

  return [originalComment, `我的笔记: ${trimmedNote}`].filter(Boolean).join(' | ');
}

function exportPgnWithNotes(
  text: string,
  positions: ReplayPosition[],
  notesByPosition: Record<string, string>,
  savedVariations: SavedVariation[],
) {
  const loaded = new Chess();
  loaded.loadPgn(text);
  const headers = loaded.getHeaders();
  const moves = loaded.history({ verbose: true });
  const exported = new Chess(positions[0]?.fen);

  for (const [key, value] of Object.entries(headers)) {
    if (value) {
      exported.header(key, value);
    }
  }

  if (positions[0]) {
    const openingComment = mergeComments(
      positions[0].comment,
      notesByPosition[getPositionNoteKey('pgn', text, 0, positions[0].fen)] ?? '',
    );

    if (openingComment) {
      exported.setComment(openingComment);
    }
  }

  moves.forEach((move, index) => {
    exported.move(move.lan);
    const position = positions[index + 1];
    const note = position
      ? notesByPosition[getPositionNoteKey('pgn', text, index + 1, position.fen)] ?? ''
      : '';
    const comment = mergeComments(position?.comment, note);

    if (comment) {
      exported.setComment(comment);
    }
  });

  return insertSavedVariationsIntoPgn(exported.pgn(), positions, savedVariations);
}

function insertSavedVariationsIntoPgn(
  pgn: string,
  positions: ReplayPosition[],
  savedVariations: SavedVariation[],
) {
  const sortedVariations = savedVariations
    .filter((variation) => variation.moves.length > 0)
    .sort((a, b) => b.baseIndex - a.baseIndex);

  return sortedVariations.reduce((currentPgn, variation) => {
    const marker = getPgnInsertionMarker(positions, variation.baseIndex);
    const variationText = buildVariationPgn(variation.baseFen, variation.moves);

    if (!marker || !variationText) {
      return currentPgn;
    }

    const markerIndex =
      variation.baseIndex <= 0 ? currentPgn.indexOf(marker) : findNthMoveToken(currentPgn, marker, variation.baseIndex);
    if (markerIndex < 0) {
      return currentPgn;
    }

    const insertAt = markerIndex + marker.length;
    return `${currentPgn.slice(0, insertAt)} (${variationText})${currentPgn.slice(insertAt)}`;
  }, pgn);
}

function getPgnInsertionMarker(positions: ReplayPosition[], baseIndex: number) {
  if (baseIndex <= 0) {
    return '\n\n';
  }

  return positions[baseIndex]?.move?.san;
}

function findNthMoveToken(pgn: string, san: string, occurrence: number) {
  const escapedSan = san.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const matcher = new RegExp(`(^|\\s)${escapedSan}(?=\\s|\\{|\\(|\\*|1-0|0-1|1\\/2-1\\/2)`, 'g');
  let match: RegExpExecArray | null;
  let seen = 0;

  while ((match = matcher.exec(pgn))) {
    seen += 1;
    if (seen === occurrence) {
      return match.index + match[1].length;
    }
  }

  return -1;
}

function buildVariationPgn(baseFen: string, lanMoves: string[]) {
  const game = new Chess(baseFen);
  const tokens: string[] = [];

  lanMoves.forEach((lan) => {
    const moveNumber = game.fen().split(' ')[5];
    const color = game.turn();
    const move = game.move(lan);

    if (!move) {
      return;
    }

    const prefix =
      color === 'w'
        ? `${moveNumber}.`
        : tokens.length === 0
          ? `${moveNumber}...`
          : '';
    tokens.push([prefix, move.san].filter(Boolean).join(' '));
  });

  return tokens.join(' ');
}

type RightPanelTab = 'library' | 'current-analysis' | 'coach' | 'review-report' | 'training-plan' | 'strength-profile';

const rightPanelTabs: { id: RightPanelTab; label: string }[] = [
  { id: 'library', label: '棋谱' },
  { id: 'current-analysis', label: '分析' },
  { id: 'coach', label: '教练' },
  { id: 'review-report', label: '报告' },
  { id: 'training-plan', label: '训练' },
  { id: 'strength-profile', label: '画像' },
];

function App() {
  const [mode, setMode] = useState<ReplayMode>('pgn');
  const [text, setText] = useState(initialPgn);
  const [positionIndex, setPositionIndex] = useState(0);
  const [isBoardFlipped, setIsBoardFlipped] = useState(false);
  const [evaluationPerspective, setEvaluationPerspective] = useState<EvaluationPerspective>('white');
  const [evaluationSide, setEvaluationSide] = useState<EvaluationSide>('white');
  const [strengthProfileRange, setStrengthProfileRange] = useState<StrengthProfileRange>('current');
  const [rightPanelTab, setRightPanelTab] = useState<RightPanelTab>('library');
  const [reviewReportEvaluationSide, setReviewReportEvaluationSide] = useState<EvaluationSide>(evaluationSide);
  const [middlegamePlanEvaluationSide, setMiddlegamePlanEvaluationSide] = useState<EvaluationSide>(evaluationSide);
  const [endgameTrainingEvaluationSide, setEndgameTrainingEvaluationSide] = useState<EvaluationSide>(evaluationSide);
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [variationPositions, setVariationPositions] = useState<VariationPosition[]>([]);
  const [variationIndex, setVariationIndex] = useState(-1);
  const [notesByPosition, setNotesByPosition] = useState<Record<string, string>>(() =>
    typeof window === 'undefined' ? {} : loadStoredNotes(),
  );
  const [pendingPromotion, setPendingPromotion] = useState<PendingPromotion | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [engineStatus, setEngineStatus] = useState<EngineStatus>('idle');
  const [analysis, setAnalysis] = useState<StockfishAnalysis | null>(null);
  const [isAnalysisEnabled, setIsAnalysisEnabled] = useState(false);
  const [engineMode, setEngineMode] = useState<EngineMode>('wasm');
  const [engineLog, setEngineLog] = useState<string[]>([]);
  const [savedVariations, setSavedVariations] = useState<SavedVariation[]>([]);
  const [bulkPgnLibrary, setBulkPgnLibrary] = useState<BulkPgnLibrary | null>(null);
  const [bulkPgnFilters, setBulkPgnFilters] = useState<BulkPgnLibraryFilters>({
    source: 'all',
    result: 'all',
    color: 'all',
    sortBy: 'date',
    sortDirection: 'desc',
  });
  const [isGuessMode, setIsGuessMode] = useState(false);
  const [guessResult, setGuessResult] = useState<GuessMoveResult | null>(null);
  const [pgnReplyMessage, setPgnReplyMessage] = useState('');
  const [guessStats, setGuessStats] = useState<GuessStats>(() =>
    typeof window === 'undefined' ? { correct: 0, wrong: 0 } : loadStoredGuessStats(),
  );
  const [mistakeCards, setMistakeCards] = useState<MistakeCard[]>(() =>
    typeof window === 'undefined' ? [] : loadStoredMistakeCards(),
  );
  const [reviewReportHistory, setReviewReportHistory] = useState<ReviewReportHistoryItem[]>(() =>
    typeof window === 'undefined' ? [] : loadStoredReviewReportHistory(),
  );
  const [historySearch, setHistorySearch] = useState('');
  const [historyResultFilter, setHistoryResultFilter] = useState('all');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [candidateInput, setCandidateInput] = useState('');
  const [candidateResult, setCandidateResult] = useState<CandidateMoveTrainingResult | null>(null);
  const [candidateStats, setCandidateStats] = useState<CandidateTrainingStats>(() =>
    typeof window === 'undefined' ? getInitialCandidateTrainingStats() : loadStoredCandidateTrainingStats(),
  );
  const [candidateSessions, setCandidateSessions] = useState<CandidateTrainingSession[]>(() =>
    typeof window === 'undefined' ? [] : loadStoredCandidateTrainingSessions(),
  );
  const [globalAnalysis, setGlobalAnalysis] = useState<GlobalMoveAnalysis[]>([]);
  const [isGlobalAnalyzing, setIsGlobalAnalyzing] = useState(false);
  const [globalAnalysisProgress, setGlobalAnalysisProgress] = useState('');
  const [analysisDepthPreset, setAnalysisDepthPreset] = useState<AnalysisDepthPreset>('standard');
  const [globalAnalysisFilter, setGlobalAnalysisFilter] = useState<GlobalAnalysisMomentFilter>('all');
  const [globalAnalysisCacheStatus, setGlobalAnalysisCacheStatus] = useState('尚未分析');
  const [globalAnalysisError, setGlobalAnalysisError] = useState('');
  const globalAnalysisCancelRef = useRef(false);
  const globalAnalysisCacheRef = useRef(new Map<string, GlobalMoveAnalysis[]>());
  const engineRef = useRef<Worker | null>(null);
  const engineReadyRef = useRef(false);
  const engineReadyTimerRef = useRef<number | null>(null);
  const engineModeRef = useRef<EngineMode>('wasm');
  const analysisFenRef = useRef('');
  const engineRequestRef = useRef<EngineAnalysisRequest | null>(null);

  const result = useMemo(
    () => (mode === 'pgn' ? parsePgn(text) : parseFen(text)),
    [mode, text],
  );

  const maxIndex = Math.max(result.positions.length - 1, 0);
  const safeIndex = Math.min(positionIndex, maxIndex);
  const current = result.positions[safeIndex];
  const originalFen = current?.fen ?? new Chess().fen();
  const currentNoteKey = current ? getPositionNoteKey(mode, text, safeIndex, current.fen) : '';
  const currentNote = currentNoteKey ? notesByPosition[currentNoteKey] ?? '' : '';
  const activeVariation = variationIndex >= 0 ? variationPositions[variationIndex] : null;
  const activeFen = activeVariation?.fen ?? originalFen;
  const board = getBoard(activeFen);
  const status = current ? describeFen(activeFen) : '等待输入';
  const isVariationMode = variationPositions.length > 0;
  const legalTargets = selectedSquare ? getLegalTargets(activeFen, selectedSquare) : [];
  const lastMoveSquares = getMoveHighlights(activeVariation?.move ?? current?.move);
  const capturedPieces = getCapturedPieces(activeFen);
  const playedMoves = useMemo(() => {
    const originalMoves = result.moves.slice(0, safeIndex).map((move) => move.san);
    const activeVariationMoves =
      variationIndex >= 0 ? variationPositions.slice(0, variationIndex + 1).map((position) => position.move.san) : [];
    return [...originalMoves, ...activeVariationMoves];
  }, [result.moves, safeIndex, variationIndex, variationPositions]);
  const trainingPlan = useMemo(() => buildDailyTrainingPlan(mistakeCards, new Date(), 10), [mistakeCards]);
  const dueTrainingCount = useMemo(
    () => mistakeCards.filter((card) => new Date(normalizeMistakeCard(card).dueAt).getTime() <= Date.now()).length,
    [mistakeCards],
  );
  const trainingStatsByTag = useMemo(() => buildTrainingStatsByTag(mistakeCards), [mistakeCards]);
  const openingMatch = useMemo(() => identifyOpening(playedMoves), [playedMoves]);
  const openingImprovementPlan = useMemo(
    () => buildOpeningImprovementPlan(mode === 'pgn' ? [result.moves.map((move) => move.san)] : []),
    [mode, result.moves],
  );
  const middlegamePlanTraining = useMemo(
    () => buildMiddlegamePlanTraining(globalAnalysis, middlegamePlanEvaluationSide),
    [globalAnalysis, middlegamePlanEvaluationSide],
  );
  const endgameTrainingPlan = useMemo(
    () => buildEndgameTrainingPlan({ positions: result.positions, analyses: globalAnalysis, evaluationSide: endgameTrainingEvaluationSide }),
    [endgameTrainingEvaluationSide, globalAnalysis, result.positions],
  );
  const reviewReport = useMemo(
    () =>
      buildReviewReport({
        opening: openingMatch,
        analyses: globalAnalysis,
        middlegamePlan: middlegamePlanTraining,
        endgamePlan: endgameTrainingPlan,
        evaluationSide: reviewReportEvaluationSide,
      }),
    [endgameTrainingPlan, globalAnalysis, middlegamePlanTraining, openingMatch, reviewReportEvaluationSide],
  );
  const naturalLanguageCoach = useMemo(
    () => buildNaturalLanguageCoachReport({
      analyses: globalAnalysis,
      reviewReport,
      candidateStats,
      history: reviewReportHistory,
      momentFilter: globalAnalysisFilter,
    }),
    [candidateStats, globalAnalysis, globalAnalysisFilter, reviewReport, reviewReportHistory],
  );
  const filteredBulkPgnGames = useMemo(
    () => (bulkPgnLibrary ? filterBulkPgnLibraryGames(bulkPgnLibrary.games, bulkPgnFilters) : []),
    [bulkPgnFilters, bulkPgnLibrary],
  );
  const bulkPgnLibraryInsights = useMemo(
    () => (bulkPgnLibrary ? buildBulkPgnLibraryInsights(filteredBulkPgnGames) : null),
    [bulkPgnLibrary, filteredBulkPgnGames],
  );
  const strengthProfileSnapshots = useMemo(() => {
    const currentSnapshot = buildStrengthProfileGameSnapshot({
      id: 'current-game',
      title: result.headers.Event ?? '当前对局',
      importedAt: new Date(0).toISOString(),
      analyses: globalAnalysis,
    });
    return [currentSnapshot, ...buildStrengthProfileSnapshotsFromHistory(reviewReportHistory)];
  }, [globalAnalysis, result.headers.Event, reviewReportHistory]);
  const selectedStrengthProfileSnapshots = useMemo(
    () => selectStrengthProfileSnapshots(strengthProfileSnapshots, strengthProfileRange),
    [strengthProfileRange, strengthProfileSnapshots],
  );
  const strengthProfile = useMemo(
    () => buildStrengthProfile({
      snapshots: selectedStrengthProfileSnapshots,
      mistakeCards,
      candidateStats,
      evaluationSide,
      rangeLabel: getStrengthProfileRangeLabel(strengthProfileRange),
    }),
    [candidateStats, evaluationSide, mistakeCards, selectedStrengthProfileSnapshots, strengthProfileRange],
  );
  const filteredReviewReportHistory = useMemo(
    () => filterReviewReportHistory(reviewReportHistory, {
      query: historySearch,
      result: historyResultFilter === 'all' ? undefined : historyResultFilter,
      favoriteOnly: showFavoritesOnly,
    }),
    [historyResultFilter, historySearch, reviewReportHistory, showFavoritesOnly],
  );
  const reviewReportHistoryStats = useMemo(
    () => buildReviewReportHistoryStats(reviewReportHistory),
    [reviewReportHistory],
  );
  const nextOriginalMove = activeVariation ? undefined : result.moves[safeIndex];
  const shouldHideNextMove = isGuessMode && !guessResult && Boolean(nextOriginalMove) && !activeVariation;

  useEffect(() => {
    const snapshot = loadSessionSnapshot();
    if (snapshot) {
      setMode(snapshot.mode);
      setText(snapshot.text);
      setPositionIndex(snapshot.positionIndex);
      setGlobalAnalysis(snapshot.globalAnalysis);
      setEvaluationSide(snapshot.evaluationSide);
      setEvaluationPerspective(snapshot.evaluationPerspective);
      setReviewReportEvaluationSide(snapshot.reviewReportEvaluationSide);
      setMiddlegamePlanEvaluationSide(snapshot.middlegamePlanEvaluationSide);
      setEndgameTrainingEvaluationSide(snapshot.endgameTrainingEvaluationSide);
      setIsBoardFlipped(snapshot.isBoardFlipped);
      setAnalysisDepthPreset(snapshot.analysisDepthPreset);
      setGlobalAnalysisFilter(snapshot.globalAnalysisFilter);
      setSavedVariations(snapshot.savedVariations);
      setVariationPositions(snapshot.variationPositions);
      setVariationIndex(snapshot.variationIndex);
      setNotesByPosition(snapshot.notesByPosition);
      setRightPanelTab(snapshot.rightPanelTab);
      setBulkPgnLibrary(snapshot.bulkPgnLibrary);
      setBulkPgnFilters(snapshot.bulkPgnFilters);
      setGlobalAnalysisCacheStatus(
        snapshot.globalAnalysis.length > 0 ? '已缓存（来自存档）' : '尚未分析',
      );
    }
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === 'TEXTAREA' ||
          target.tagName === 'INPUT' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isTyping || pendingPromotion) {
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goBackward();
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goForward();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pendingPromotion, positionIndex, variationIndex, variationPositions.length, maxIndex]);

  useEffect(() => {
    saveStoredNotes(notesByPosition);
  }, [notesByPosition]);

  useEffect(() => {
    saveStoredGuessStats(guessStats);
  }, [guessStats]);

  useEffect(() => {
    saveStoredMistakeCards(mistakeCards);
  }, [mistakeCards]);

  useEffect(() => {
    saveStoredReviewReportHistory(reviewReportHistory);
  }, [reviewReportHistory]);

  useEffect(() => {
    saveStoredCandidateTrainingStats(candidateStats);
  }, [candidateStats]);

  useEffect(() => {
    saveStoredCandidateTrainingSessions(candidateSessions);
  }, [candidateSessions]);

  useEffect(() => {
    return () => {
      if (engineReadyTimerRef.current) {
        window.clearTimeout(engineReadyTimerRef.current);
      }
      engineRef.current?.postMessage('quit');
      engineRef.current?.terminate();
      engineRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!toast) {
      return;
    }

    const timer = window.setTimeout(() => setToast(null), 2200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = (message: ToastMessage) => {
    setToast(message);
  };

  const addEngineLog = (message: string) => {
    const timestamp = new Date().toLocaleTimeString();
    setEngineLog((logs) => [`${timestamp} ${message}`, ...logs].slice(0, 8));
  };

  const createStockfishWorker = (mode: EngineMode) => {
    if (mode === 'asm') {
      return new Worker(new URL(stockfishAsmWorkerUrl, window.location.origin).href);
    }

    const workerUrl = new URL(stockfishWorkerUrl, window.location.origin);
    const wasmUrl = new URL(stockfishWasmUrl, window.location.origin);
    workerUrl.hash = encodeURIComponent(wasmUrl.href);
    return new Worker(workerUrl.href);
  };

  const clearEngineReadyTimer = () => {
    if (engineReadyTimerRef.current) {
      window.clearTimeout(engineReadyTimerRef.current);
      engineReadyTimerRef.current = null;
    }
  };

  const getEngine = (mode: EngineMode = engineModeRef.current) => {
    if (engineRef.current) {
      return engineRef.current;
    }

    setEngineStatus('loading');
    engineModeRef.current = mode;
    setEngineMode(mode);
    addEngineLog(`启动 ${mode === 'wasm' ? 'WASM' : 'ASM'} 引擎`);
    const worker = createStockfishWorker(mode);
    engineReadyRef.current = false;

    worker.onmessage = (event: MessageEvent<string>) => {
      const line = String(event.data);

      if (line === 'readyok') {
        engineReadyRef.current = true;
        clearEngineReadyTimer();
        addEngineLog(`${engineModeRef.current.toUpperCase()} ready`);
        setEngineStatus((status) => (status === 'loading' ? 'ready' : status));
      }

      const currentFen = analysisFenRef.current;
      const pendingRequest = engineRequestRef.current;
      const partialAnalysis = parseStockfishInfo(line, currentFen);
      if (partialAnalysis) {
        const multiPvLine = 'multiPvLine' in partialAnalysis ? partialAnalysis.multiPvLine : undefined;
        if (pendingRequest) {
          if (multiPvLine) {
            const nextLines = pendingRequest.multiPvLines.filter((line) => line.rank !== multiPvLine.rank);
            pendingRequest.multiPvLines = [...nextLines, multiPvLine].sort((a, b) => a.rank - b.rank);
          }
          pendingRequest.latest = {
            ...pendingRequest.latest,
            ...partialAnalysis,
          };
        }

        setAnalysis((currentAnalysis) => ({
          depth: partialAnalysis.depth ?? currentAnalysis?.depth ?? 0,
          score: partialAnalysis.score ?? currentAnalysis?.score ?? null,
          pv: partialAnalysis.pv ?? currentAnalysis?.pv ?? [],
          bestMove: currentAnalysis?.bestMove ?? '',
          bestMoveSan: currentAnalysis?.bestMoveSan ?? '',
        }));
      }

      if (line.startsWith('bestmove ')) {
        const requestForBestMove = pendingRequest;
        const bestMove = line.split(/\s+/)[1] ?? '';
        const bestMoveSan = formatBestMove(currentFen, bestMove);
        addEngineLog(`bestmove ${bestMove}`);
        const completedAnalysis = completeEngineAnalysisFromRequest({
          request: requestForBestMove,
          bestMove,
          bestMoveSan,
        });

        if (requestForBestMove) {
          window.clearTimeout(requestForBestMove.timeoutId);
          engineRequestRef.current = null;
          requestForBestMove.resolve(completedAnalysis);
        }

        setAnalysis(completedAnalysis);
        setEngineStatus('ready');
      }
    };

    worker.onerror = (event) => {
      const detail = event.message ? `：${event.message}` : '';
      worker.terminate();
      engineRef.current = null;
      clearEngineReadyTimer();

      if (engineModeRef.current === 'wasm') {
        addEngineLog(`WASM 错误${detail || ''}，切换 ASM`);
        showToast({ type: 'error', text: `WASM 引擎启动失败${detail}，正在切换兼容模式。` });
        getEngine('asm');
        window.setTimeout(() => {
          if (analysisFenRef.current) {
            startAnalysisForFen(analysisFenRef.current);
          }
        }, 200);
        return;
      }

      setEngineStatus('error');
      showToast({ type: 'error', text: `Stockfish 启动失败${detail}` });
    };

    worker.postMessage('uci');
    worker.postMessage('isready');
    worker.postMessage('setoption name MultiPV value 1');
    engineReadyTimerRef.current = window.setTimeout(() => {
      if (!engineReadyRef.current) {
        engineRef.current?.terminate();
        engineRef.current = null;
        clearEngineReadyTimer();

        if (engineModeRef.current === 'wasm') {
          addEngineLog('WASM 加载超时，切换 ASM');
          showToast({ type: 'error', text: 'WASM 引擎加载超时，正在切换兼容模式。' });
          getEngine('asm');
          window.setTimeout(() => {
            if (analysisFenRef.current) {
              startAnalysisForFen(analysisFenRef.current);
            }
          }, 200);
          return;
        }

        setEngineStatus('error');
        showToast({ type: 'error', text: 'Stockfish 加载超时，请刷新页面后重试。' });
      }
    }, 8000);
    engineRef.current = worker;
    return worker;
  };

  const startAnalysisForFen = (fen: string, depth = 14) => {
    try {
      const engine = getEngine();
      analysisFenRef.current = fen;
      setAnalysis({
        depth: 0,
        score: null,
        bestMove: '',
        bestMoveSan: '',
        pv: [],
      });
      setEngineStatus('analyzing');
      engine.postMessage('stop');
      engine.postMessage('ucinewgame');
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage(`go depth ${depth}`);
    } catch {
      setEngineStatus('error');
      showToast({ type: 'error', text: 'Stockfish 无法启动。' });
    }
  };

  const analyzeFenOnce = (fen: string, config = getAnalysisDepthPresetConfig(analysisDepthPreset)) =>
    new Promise<StockfishAnalysis & { multiPvLines: MultiPvLine[] }>((resolve, reject) => {
      const engine = getEngine();
      if (engineRequestRef.current) {
        window.clearTimeout(engineRequestRef.current.timeoutId);
        engineRequestRef.current.reject(new Error('新的分析请求已取代旧请求。'));
      }

      const timeoutId = window.setTimeout(() => {
        if (engineRequestRef.current?.fen === fen) {
          engineRequestRef.current = null;
          reject(new Error('Stockfish 分析超时。'));
        }
      }, config.timeoutMs);

      engineRequestRef.current = {
        fen,
        resolve: (analysis) => resolve(analysis),
        reject,
        latest: {},
        multiPvLines: [],
        timeoutId,
      };
      analysisFenRef.current = fen;
      setEngineStatus('analyzing');
      engine.postMessage('stop');
      engine.postMessage('ucinewgame');
      engine.postMessage(`setoption name MultiPV value ${config.multiPv}`);
      engine.postMessage(`position fen ${fen}`);
      engine.postMessage(`go depth ${config.depth}`);
    });

  useEffect(() => {
    engineRef.current?.postMessage('stop');
    setAnalysis(null);

    if (!isAnalysisEnabled) {
      setEngineStatus((status) => (status === 'analyzing' ? 'ready' : status));
      return;
    }

    const timer = window.setTimeout(() => startAnalysisForFen(activeFen), 120);
    return () => window.clearTimeout(timer);
  }, [activeFen, isAnalysisEnabled]);

  const analyzeCurrentPosition = () => {
    setIsAnalysisEnabled(true);
    startAnalysisForFen(activeFen);
  };

  const stopAnalysis = () => {
    setIsAnalysisEnabled(false);
    if (engineRequestRef.current) {
      window.clearTimeout(engineRequestRef.current.timeoutId);
      engineRequestRef.current.reject(new Error('分析已关闭。'));
      engineRequestRef.current = null;
    }
    engineRef.current?.postMessage('stop');
    setEngineStatus(engineRef.current ? 'ready' : 'idle');
  };

  const toggleGuessMode = () => {
    setIsGuessMode((enabled) => !enabled);
    setGuessResult(null);
    setPgnReplyMessage('');
    setVariationPositions([]);
    setVariationIndex(-1);
    setSelectedSquare(null);
    setPendingPromotion(null);
  };

  const handleGuessSubmitted = (move: Move) => {
    if (!isGuessMode || guessResult || !nextOriginalMove) {
      return;
    }

    const guessAnalysis = analyzeGuessMove({
      guessedSan: move.san,
      actualSan: nextOriginalMove.san,
      stockfishBestSan: analysis?.bestMoveSan ?? '',
    });
    const candidateTrainingResult = candidateInput.trim()
      ? analyzeCandidateMoveTraining({
          rawCandidates: candidateInput,
          selectedSan: move.san,
          actualSan: nextOriginalMove.san,
          stockfishBestSan: analysis?.bestMoveSan ?? '',
          multiPvLines: analysis?.multiPvLines ?? [],
          moveColor: nextOriginalMove.color,
          perspective: evaluationPerspective,
          boardFlipped: isBoardFlipped,
        })
      : null;
    setGuessResult(guessAnalysis);
    if (candidateTrainingResult) {
      setCandidateResult(candidateTrainingResult);
      setCandidateStats((stats) => updateCandidateTrainingStats(stats, candidateTrainingResult));
      setCandidateSessions((sessions) => [
        {
          id: `${Date.now()}:${originalFen}`,
          positionLabel: nextOriginalMove ? formatMoveLabel(nextOriginalMove, safeIndex) : current?.label ?? '当前局面',
          result: candidateTrainingResult,
          createdAt: new Date().toISOString(),
        },
        ...sessions,
      ].slice(0, 20));
    }
    setGuessStats((stats) => ({
      correct: stats.correct + (guessAnalysis.isCorrect ? 1 : 0),
      wrong: stats.wrong + (guessAnalysis.isCorrect ? 0 : 1),
    }));

    const mistakeCard = buildMistakeCardFromGuess({
      baseFen: originalFen,
      positionLabel: nextOriginalMove ? formatMoveLabel(nextOriginalMove, safeIndex) : current?.label ?? '当前局面',
      result: guessAnalysis,
      pgnText: mode === 'pgn' ? text : '',
    });
    if (mistakeCard) {
      setMistakeCards((cards) => upsertMistakeCard(cards, mistakeCard));
    }

    const pgnReply = getPgnReplyAfterCorrectGuess({
      guessedSan: move.san,
      moves: result.moves,
      currentIndex: safeIndex,
      maxIndex,
    });
    if (pgnReply.isCorrectGuess) {
      setPgnReplyMessage(pgnReply.message);
      setPositionIndex(pgnReply.nextIndex);
      setVariationPositions([]);
      setVariationIndex(-1);
    } else {
      setPgnReplyMessage('');
    }

    showToast({ type: guessAnalysis.isCorrect ? 'success' : 'error', text: pgnReply.isCorrectGuess ? pgnReply.message : guessAnalysis.summary });
  };

  const nextGuessPosition = () => {
    if (safeIndex >= maxIndex) {
      return;
    }

    updatePositionIndex((index) => Math.min(index + 1, maxIndex));
    setGuessResult(null);
    setPgnReplyMessage('');
    setCandidateResult(null);
    setCandidateInput('');
  };

  const resetGuessStats = () => {
    setGuessStats({ correct: 0, wrong: 0 });
  };

  const resetCandidateTraining = () => {
    setCandidateInput('');
    setCandidateResult(null);
    setCandidateStats(getInitialCandidateTrainingStats());
    setCandidateSessions([]);
  };

  const addCurrentPositionToMistakeBook = () => {
    const actualSan = nextOriginalMove?.san ?? '待复盘';
    const now = new Date().toISOString();
    const card: MistakeCard = {
      id: `${originalFen}:${normalizeSan(actualSan)}`,
      fen: originalFen,
      positionLabel: nextOriginalMove ? formatMoveLabel(nextOriginalMove, safeIndex) : current?.label ?? '当前局面',
      guessedSan: '手动加入',
      actualSan,
      stockfishBestSan: analysis?.bestMoveSan ?? '',
      pgnText: mode === 'pgn' ? text : '',
      attempts: 1,
      solvedCount: 0,
      reviewStage: 0,
      dueAt: now,
      tags: ['手动加入'],
      createdAt: now,
      updatedAt: now,
    };
    setMistakeCards((cards) => upsertMistakeCard(cards, card));
    showToast({ type: 'success', text: '已加入错题本。' });
  };

  const practiceMistakeCard = (card: MistakeCard) => {
    setMode('fen');
    setText(card.fen);
    setPositionIndex(0);
    setVariationPositions([]);
    setVariationIndex(-1);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setGuessResult(null);
    setPgnReplyMessage('');
    setIsGuessMode(false);
    setMistakeCards((cards) => cards.map((item) => (item.id === card.id ? updateMistakeCardReview(item, true) : item)));
    showToast({ type: 'success', text: '已载入错题局面，本次复习记为完成并安排下次间隔复习。' });
  };

  const markMistakeCardUnsolved = (card: MistakeCard) => {
    setMistakeCards((cards) => cards.map((item) => (item.id === card.id ? updateMistakeCardReview(item, false) : item)));
    showToast({ type: 'error', text: '已记录为仍需复习，错题会保留在今日训练计划。' });
  };

  const deleteMistakeCard = (id: string) => {
    setMistakeCards((cards) => cards.filter((card) => card.id !== id));
  };

  const runGlobalAnalysis = async (forceRefresh = false) => {
    if (mode !== 'pgn' || result.moves.length === 0 || result.error) {
      showToast({ type: 'error', text: '请先导入包含走法的 PGN 棋谱。' });
      return;
    }

    const config = getAnalysisDepthPresetConfig(analysisDepthPreset);
    const cacheKey = buildGlobalAnalysisCacheKey({
      pgnText: text,
      preset: analysisDepthPreset,
      depth: config.depth,
      multiPv: config.multiPv,
      engineMode: engineModeRef.current,
    });
    const cached = globalAnalysisCacheRef.current.get(cacheKey);
    if (cached && !forceRefresh) {
      setGlobalAnalysis(cached);
      setGlobalAnalysisError('');
      setGlobalAnalysisProgress(`缓存命中：${config.label}分析，深度 ${config.depth}，MultiPV ${config.multiPv}。`);
      setGlobalAnalysisCacheStatus('缓存命中');
      showToast({ type: 'success', text: '已载入缓存分析结果。' });
      return;
    }

    globalAnalysisCancelRef.current = false;
    setIsGlobalAnalyzing(true);
    setGlobalAnalysis([]);
    setGlobalAnalysisError('');
    setGlobalAnalysisProgress(`准备${config.label}分析：深度 ${config.depth}，MultiPV ${config.multiPv}…`);
    setGlobalAnalysisCacheStatus(forceRefresh ? '强制刷新中' : '缓存未命中');
    setIsAnalysisEnabled(false);

    try {
      const positionScores: Array<number | null> = [];
      const bestMoves: string[] = [];
      const primaryPvs: string[][] = [];
      const multiPvByMove: MultiPvLine[][] = [];

      for (let index = 0; index < result.moves.length; index += 1) {
        if (globalAnalysisCancelRef.current) {
          throw new Error('整盘分析已取消。');
        }

        const beforeFen = result.positions[index]?.fen;
        if (!beforeFen) {
          continue;
        }

        setGlobalAnalysisProgress(`${config.label}分析第 ${index + 1}/${result.moves.length} 手之前局面（深度 ${config.depth}）…`);
        const beforeAnalysis = await analyzeFenOnce(beforeFen, config);
        positionScores[index] = scoreToWhiteCentipawns(beforeAnalysis.score);
        bestMoves[index] = beforeAnalysis.bestMoveSan || beforeAnalysis.bestMove;
        primaryPvs[index] = beforeAnalysis.pv;
        multiPvByMove[index] = beforeAnalysis.multiPvLines;

        const afterFen = result.positions[index + 1]?.fen;
        if (afterFen) {
          setGlobalAnalysisProgress(`${config.label}分析第 ${index + 1}/${result.moves.length} 手之后局面（深度 ${config.depth}）…`);
          const afterAnalysis = await analyzeFenOnce(afterFen, config);
          positionScores[index + 1] = scoreToWhiteCentipawns(afterAnalysis.score);
        }

        const partialReport = buildGlobalAnalysisPartialReport({
          moves: result.moves,
          positionScores,
          bestMoves,
          primaryPvs,
          multiPvByMove,
        });
        if (partialReport.length > 0) {
          setGlobalAnalysis(partialReport);
        }
      }

      if (globalAnalysisCancelRef.current) {
        throw new Error('整盘分析已取消。');
      }

      const report = buildGlobalAnalysisReport({
        moves: result.moves,
        positionScores,
        bestMoves,
        primaryPvs,
        multiPvByMove,
      });

      globalAnalysisCacheRef.current.set(cacheKey, report);
      setGlobalAnalysis(report);
      setGlobalAnalysisError('');
      setGlobalAnalysisProgress(`完成：${config.label}分析 ${report.length} 手，深度 ${config.depth}，MultiPV ${config.multiPv}。`);
      setGlobalAnalysisCacheStatus('已写入缓存');
      setEngineStatus('ready');
      showToast({ type: 'success', text: '整盘棋分析完成。' });
    } catch (error) {
      if (globalAnalysisCancelRef.current || (error instanceof Error && error.message.includes('已取消'))) {
        setGlobalAnalysisError('');
        setGlobalAnalysisProgress('已取消：已完成分析结果不会被本次取消污染，Worker 已停止。');
        setGlobalAnalysisCacheStatus('已取消');
        setEngineStatus(engineRef.current ? 'ready' : 'idle');
        showToast({ type: 'error', text: '整盘分析已取消。' });
      } else {
        const errorMessage = error instanceof Error ? error.message : '整盘棋分析失败。';
        setGlobalAnalysisError(errorMessage);
        setGlobalAnalysisProgress(errorMessage);
        setEngineStatus('error');
        showToast({ type: 'error', text: '整盘棋分析失败，请稍后重试。' });
      }
    } finally {
      setIsGlobalAnalyzing(false);
      globalAnalysisCancelRef.current = false;
    }
  };

  const cancelGlobalAnalysis = () => {
    const cancellationPlan = buildGlobalAnalysisCancellationPlan({
      isAnalyzing: isGlobalAnalyzing,
      hasWorker: Boolean(engineRef.current),
      hasPendingRequest: Boolean(engineRequestRef.current),
      existingAnalysis: globalAnalysis,
      currentError: globalAnalysisError,
    });

    if (!cancellationPlan.canCancel) {
      setGlobalAnalysisProgress(cancellationPlan.nextProgress);
      setEngineStatus(cancellationPlan.nextEngineStatus);
      return;
    }

    globalAnalysisCancelRef.current = cancellationPlan.shouldMarkCanceled;
    if (cancellationPlan.shouldRejectPendingRequest && engineRequestRef.current) {
      window.clearTimeout(engineRequestRef.current.timeoutId);
      engineRequestRef.current.reject(new Error('整盘分析已取消。'));
      engineRequestRef.current = null;
    }
    if (cancellationPlan.shouldStopWorker) {
      engineRef.current?.postMessage('stop');
    }
    setGlobalAnalysis(cancellationPlan.nextAnalysis);
    setIsGlobalAnalyzing(cancellationPlan.nextIsAnalyzing);
    setGlobalAnalysisError(cancellationPlan.nextError);
    setGlobalAnalysisProgress(cancellationPlan.nextProgress);
    setGlobalAnalysisCacheStatus('已取消');
    setEngineStatus(cancellationPlan.nextEngineStatus);
  };

  const updatePositionIndex = (nextIndex: number | ((index: number) => number)) => {
    setPositionIndex(nextIndex);
    setVariationPositions([]);
    setVariationIndex(-1);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setGuessResult(null);
  };

  const updateMode = (nextMode: ReplayMode) => {
    setMode(nextMode);
    setText(nextMode === 'pgn' ? initialPgn : initialFen);
    setPositionIndex(0);
    setVariationPositions([]);
    setVariationIndex(-1);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setGuessResult(null);
    setGlobalAnalysis([]);
    setGlobalAnalysisError('');
    setGlobalAnalysisProgress('');
    setGlobalAnalysisCacheStatus('尚未分析');
    setBulkPgnLibrary(null);
  };

  const updateText = (value: string, options: TextUpdateOptions = {}) => {
    setText(value);
    setPositionIndex(0);
    setVariationPositions([]);
    setVariationIndex(-1);
    setSelectedSquare(null);
    setPendingPromotion(null);
    setGuessResult(null);
    setGlobalAnalysis([]);
    setGlobalAnalysisError('');
    setGlobalAnalysisProgress('');
    setGlobalAnalysisCacheStatus('尚未分析');
    if (shouldClearBulkPgnLibraryAfterTextUpdate(options)) {
      setBulkPgnLibrary(null);
    }
  };

  const updateCurrentNote = (value: string) => {
    if (!currentNoteKey) {
      return;
    }

    setNotesByPosition((notes) => ({
      ...notes,
      [currentNoteKey]: value,
    }));
  };

  const importPgnFile = async (files: FileList | File[] | null) => {
    if (!files || files.length === 0) {
      return;
    }

    try {
      const importedFiles = await Promise.all(
        Array.from(files).map(async (file) => ({ filename: file.name, content: await file.text() })),
      );
      const library = parseBulkPgnLibrary(importedFiles, reviewReportHistory);

      if (library.games.length === 0) {
        showToast({ type: 'error', text: `导入失败：${library.errors[0]?.message ?? '没有可用棋谱。'}` });
        return;
      }

      setBulkPgnLibrary(library);
      setMode('pgn');
      updateText(library.games[0].content, { preserveBulkPgnLibrary: true });
      showToast({ type: library.errors.length > 0 ? 'error' : 'success', text: library.summary });
    } catch {
      showToast({ type: 'error', text: '导入失败：无法读取文件。' });
    }
  };

  const loadBulkPgnGame = (game: BulkPgnGameSummary) => {
    const library = bulkPgnLibrary;
    setMode('pgn');
    updateText(game.content);
    setBulkPgnLibrary(library);
    showToast({ type: 'success', text: `已载入 ${game.event}` });
  };

  const updateBulkPgnFilter = <K extends keyof BulkPgnLibraryFilters>(key: K, value: BulkPgnLibraryFilters[K]) => {
    setBulkPgnFilters((filters) => ({ ...filters, [key]: value }));
  };

  const saveCurrentSession = () => {
    const snapshot: SessionSnapshot = {
      mode,
      text,
      positionIndex: safeIndex,
      globalAnalysis,
      evaluationSide,
      evaluationPerspective,
      reviewReportEvaluationSide,
      middlegamePlanEvaluationSide,
      endgameTrainingEvaluationSide,
      isBoardFlipped,
      analysisDepthPreset,
      globalAnalysisFilter,
      savedVariations,
      variationPositions,
      variationIndex,
      notesByPosition,
      rightPanelTab,
      bulkPgnLibrary,
      bulkPgnFilters,
      savedAt: new Date().toISOString(),
    };
    saveSessionSnapshot(snapshot);
    showToast({ type: 'success', text: '当前进度已保存到浏览器。' });
  };

  const loadCurrentSession = () => {
    const snapshot = loadSessionSnapshot();
    if (!snapshot) {
      showToast({ type: 'error', text: '没有可读取的存档。' });
      return;
    }
    setMode(snapshot.mode);
    setText(snapshot.text);
    setPositionIndex(snapshot.positionIndex);
    setGlobalAnalysis(snapshot.globalAnalysis);
    setEvaluationSide(snapshot.evaluationSide);
    setEvaluationPerspective(snapshot.evaluationPerspective);
    setReviewReportEvaluationSide(snapshot.reviewReportEvaluationSide);
    setMiddlegamePlanEvaluationSide(snapshot.middlegamePlanEvaluationSide);
    setEndgameTrainingEvaluationSide(snapshot.endgameTrainingEvaluationSide);
    setIsBoardFlipped(snapshot.isBoardFlipped);
    setAnalysisDepthPreset(snapshot.analysisDepthPreset);
    setGlobalAnalysisFilter(snapshot.globalAnalysisFilter);
    setSavedVariations(snapshot.savedVariations);
    setVariationPositions(snapshot.variationPositions);
    setVariationIndex(snapshot.variationIndex);
    setNotesByPosition(snapshot.notesByPosition);
    setRightPanelTab(snapshot.rightPanelTab);
    setBulkPgnLibrary(snapshot.bulkPgnLibrary);
    setBulkPgnFilters(snapshot.bulkPgnFilters);
    setGlobalAnalysisCacheStatus(
      snapshot.globalAnalysis.length > 0 ? '已缓存（来自存档）' : '尚未分析',
    );
    showToast({ type: 'success', text: `已恢复 ${new Date(snapshot.savedAt).toLocaleString()} 保存的进度。` });
  };

  const clearCurrentSession = () => {
    clearSessionSnapshot();
    showToast({ type: 'success', text: '已清除本地存档。' });
  };

  const toggleBulkPgnImportant = (game: BulkPgnGameSummary) => {
    setBulkPgnLibrary((library) => (library ? { ...library, games: toggleBulkPgnGameImportant(library.games, game.id) } : library));
    if (game.historyReportId) {
      setReviewReportHistory((history) => toggleReviewReportHistoryFavorite(history, game.historyReportId as string));
    }
    showToast({ type: 'success', text: game.isImportant ? '已取消重要标记。' : '已标记为重要棋局。' });
  };

  const exportCurrentPgn = () => {
    if (mode !== 'pgn' || result.error) {
      showToast({ type: 'error', text: '当前内容不是可导出的 PGN。' });
      return;
    }

    try {
      const exportedPgn = exportPgnWithNotes(text, result.positions, notesByPosition, savedVariations);
      downloadText('chess-me-review.pgn', exportedPgn);
      showToast({ type: 'success', text: '已导出 PGN。' });
    } catch {
      showToast({ type: 'error', text: '导出失败：PGN 无法重新生成。' });
    }
  };

  const exportReviewReport = () => {
    downloadText('chess-me-review-report.md', reviewReport.markdown, 'text/markdown;charset=utf-8');
    showToast({ type: 'success', text: '已导出复盘报告 Markdown。' });
  };

  const exportNaturalLanguageCoachReport = () => {
    downloadText('chess-me-natural-language-coach.md', naturalLanguageCoach.markdown, 'text/markdown;charset=utf-8');
    showToast({ type: 'success', text: '已导出自然语言教练 Markdown。' });
  };

  const saveReviewReportToHistory = () => {
    if (mode !== 'pgn' || result.error) {
      showToast({ type: 'error', text: '只有合法 PGN 复盘可保存到历史。' });
      return;
    }

    const item = createReviewReportHistoryItem({
      id: `${Date.now()}`,
      savedAt: new Date().toISOString(),
      pgn: text,
      report: reviewReport,
      analyses: globalAnalysis,
      meta: {
        event: getPgnHeader(text, 'Event'),
        white: getPgnHeader(text, 'White'),
        black: getPgnHeader(text, 'Black'),
        result: getPgnHeader(text, 'Result'),
      },
    });
    setReviewReportHistory((history) => [item, ...history.filter((existing) => existing.pgn !== text)]);
    showToast({ type: 'success', text: '已保存到历史复盘报告。' });
  };

  const reopenReviewReport = (item: ReviewReportHistoryItem) => {
    setMode('pgn');
    updateText(item.pgn);
    showToast({ type: 'success', text: `已重新打开 ${item.meta.event}` });
  };

  const deleteReviewReportHistoryItem = (id: string) => {
    setReviewReportHistory((history) => history.filter((item) => item.id !== id));
  };

  const toggleReviewReportHistoryItemFavorite = (id: string) => {
    setReviewReportHistory((history) => toggleReviewReportHistoryFavorite(history, id));
  };

  const copyReviewReport = async () => {
    try {
      await copyText(reviewReport.markdown);
      showToast({ type: 'success', text: '已复制复盘报告 Markdown。' });
    } catch {
      showToast({ type: 'error', text: '复制失败：浏览器拒绝了剪贴板操作。' });
    }
  };

  const copyNaturalLanguageCoachReport = async () => {
    try {
      await copyText(naturalLanguageCoach.markdown);
      showToast({ type: 'success', text: '已复制自然语言教练 Markdown。' });
    } catch {
      showToast({ type: 'error', text: '复制失败：浏览器拒绝了剪贴板操作。' });
    }
  };

  const copyCurrentFen = async () => {
    try {
      await copyText(activeFen);
      showToast({ type: 'success', text: '已复制当前 FEN。' });
    } catch {
      showToast({ type: 'error', text: '复制失败：浏览器拒绝了剪贴板操作。' });
    }
  };

  const restoreOriginalPosition = () => {
    setVariationPositions([]);
    setVariationIndex(-1);
    setSelectedSquare(null);
    setPendingPromotion(null);
  };

  const saveCurrentVariation = () => {
    if (!current || variationPositions.length === 0) {
      return;
    }

    const retainedPositions = variationPositions.slice(0, variationIndex + 1);

    if (retainedPositions.length === 0) {
      showToast({ type: 'error', text: '请先停在要保存的变化线末尾。' });
      return;
    }

    const savedVariation: SavedVariation = {
      id: `${Date.now()}`,
      baseIndex: safeIndex,
      baseFen: originalFen,
      moves: retainedPositions.map((position) => position.move.lan),
      labels: retainedPositions.map((position) => position.label),
    };

    setSavedVariations((variations) => [...variations, savedVariation]);
    showToast({ type: 'success', text: '已保存当前变化线，导出 PGN 时会写入分支。' });
  };

  const deleteSavedVariation = (id: string) => {
    setSavedVariations((variations) => variations.filter((variation) => variation.id !== id));
  };

  const undoVariationMove = () => {
    if (variationPositions.length === 0) {
      return;
    }

    setVariationPositions((positions) => {
      const nextPositions =
        variationIndex >= 0 ? positions.slice(0, variationIndex) : positions.slice(0, -1);
      setVariationIndex(nextPositions.length - 1);
      return nextPositions;
    });
    setSelectedSquare(null);
    setPendingPromotion(null);
  };

  const goBackward = () => {
    if (variationIndex >= 0) {
      setVariationIndex((index) => index - 1);
      setSelectedSquare(null);
      return;
    }

    updatePositionIndex((index) => Math.max(index - 1, 0));
  };

  const goForward = () => {
    if (variationPositions.length > 0 && variationIndex < variationPositions.length - 1) {
      setVariationIndex((index) => index + 1);
      setSelectedSquare(null);
      return;
    }

    updatePositionIndex((index) => Math.min(index + 1, maxIndex));
  };

  const commitMove = ({ from, to, promotion }: MoveInput) => {
    const game = new Chess(activeFen);
    const move = game.move({ from, to, promotion });

    if (!move) {
      return false;
    }

    setVariationPositions((positions) => {
      const retainedPositions = positions.slice(0, variationIndex + 1);
      const nextPositions = [
        ...retainedPositions,
        {
          fen: game.fen(),
          label: formatVariationMoveLabel(move),
          move,
        },
      ];
      setVariationIndex(nextPositions.length - 1);
      return nextPositions;
    });
    handleGuessSubmitted(move);
    setSelectedSquare(null);
    setPendingPromotion(null);
    return true;
  };

  const tryMove = (from: Square, to: Square) => {
    if (isPromotionMove(activeFen, from, to)) {
      setPendingPromotion({ from, to });
      setSelectedSquare(null);
      return true;
    }

    return commitMove({ from, to });
  };

  const handleDragStart = (square: Square, event: DragEvent<HTMLButtonElement>) => {
    event.dataTransfer.setData('text/plain', square);
    event.dataTransfer.effectAllowed = 'move';
    setSelectedSquare(square);
  };

  const handleDrop = (square: Square, event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    const from = event.dataTransfer.getData('text/plain') as Square;

    if (from) {
      tryMove(from, square);
    }
  };

  const handleSquareClick = (square: Square) => {
    if (!current) {
      return;
    }

    const game = new Chess(activeFen);
    const clickedPiece = game.get(square);

    if (!selectedSquare) {
      if (clickedPiece && clickedPiece.color === game.turn()) {
        setSelectedSquare(square);
      }
      return;
    }

    if (selectedSquare === square) {
      setSelectedSquare(null);
      return;
    }

    if (clickedPiece && clickedPiece.color === game.turn()) {
      setSelectedSquare(square);
      return;
    }

    if (tryMove(selectedSquare, square)) {
      return;
    }

    setSelectedSquare(null);
  };

  const regions = getLayoutRegionProps();

  return (
    <main {...regions.appShell}>
      <section {...regions.mainWorkspace}>
        <div {...regions.boardColumn}>
          <WorkspacePanel groupId="board-focus">
          <div className="top-bar">
            <div>
              <p className="eyebrow">Chess Me</p>
              <h1>复盘训练</h1>
            </div>
            <div className="top-actions">
              <button
                type="button"
                className="orientation-button"
                onClick={() => setIsBoardFlipped((flipped) => !flipped)}
                aria-pressed={isBoardFlipped}
              >
                {isBoardFlipped ? '黑方视角' : '白方视角'}
              </button>
              <div className="status-pill">{status}</div>
            </div>
          </div>

          <ChessBoard
            board={board}
            flipped={isBoardFlipped}
            selectedSquare={selectedSquare}
            legalTargets={legalTargets}
            lastMoveSquares={lastMoveSquares}
            onSquareClick={handleSquareClick}
            onDragStart={handleDragStart}
            onDrop={handleDrop}
          />

          <CapturedPiecesDisplay capturedPieces={capturedPieces} />

          <div className="replay-controls" aria-label="复盘控制">
            <button type="button" onClick={() => updatePositionIndex(0)} disabled={safeIndex === 0}>
              |&lt;
            </button>
            <button
              type="button"
              onClick={goBackward}
              disabled={safeIndex === 0 && variationIndex < 0}
            >
              &lt;
            </button>
            <div className="move-counter">
              {current?.label ?? '无局面'} · {safeIndex + 1}/{result.positions.length || 1}
            </div>
            <button
              type="button"
              onClick={goForward}
              disabled={safeIndex >= maxIndex && variationIndex >= variationPositions.length - 1}
            >
              &gt;
            </button>
            <button
              type="button"
              onClick={() => updatePositionIndex(maxIndex)}
              disabled={safeIndex >= maxIndex}
            >
              &gt;|
            </button>
          </div>

          <div className="variation-panel">
            <div>
              <span className="variation-label">{isVariationMode ? '变化图' : '原棋谱'}</span>
              <p>
                {isVariationMode
                  ? `已试走 ${variationPositions.length} 手，当前在${
                      activeVariation?.label ?? '原局面'
                    }。`
                  : '点击棋子后选择目标格，可临时试走。'}
              </p>
            </div>
            <button type="button" onClick={restoreOriginalPosition} disabled={!isVariationMode}>
              恢复原局面
            </button>
            <button type="button" onClick={undoVariationMove} disabled={!isVariationMode}>
              悔一步
            </button>
            <button type="button" onClick={saveCurrentVariation} disabled={!isVariationMode}>
              保存变化
            </button>
          </div>

          <SavedVariationsPanel
            variations={savedVariations}
            onDelete={deleteSavedVariation}
          />

          {current && (
            <TrainingNotes
              pgnComment={current.comment}
              note={currentNote}
              onNoteChange={updateCurrentNote}
            />
          )}

          <div className="fen-display">
            <span>FEN</span>
            <code>{activeFen}</code>
          </div>
          </WorkspacePanel>
        </div>

        <aside {...regions.panelColumn}>
          <nav className="panel-tabs-nav" aria-label="右侧面板标签">
            {rightPanelTabs.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`panel-tab-button ${rightPanelTab === tab.id ? 'active' : ''}`}
                onClick={() => setRightPanelTab(tab.id)}
                aria-pressed={rightPanelTab === tab.id}
              >
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="panel-tab-content">
            {rightPanelTab === 'library' && (
              <>
                <WorkspacePanel groupId="history-import">
                  <ImportExportTools
                    canExportPgn={mode === 'pgn' && !result.error}
                    hasSession={hasSessionSnapshot()}
                    onImportPgn={importPgnFile}
                    onExportPgn={exportCurrentPgn}
                    onCopyFen={copyCurrentFen}
                    onSaveSession={saveCurrentSession}
                    onLoadSession={loadCurrentSession}
                    onClearSession={clearCurrentSession}
                  />

                  {bulkPgnLibrary && (
                    <BulkPgnLibraryPanel
                      library={bulkPgnLibrary}
                      games={filteredBulkPgnGames}
                      insights={bulkPgnLibraryInsights}
                      filters={bulkPgnFilters}
                      activeContent={text}
                      onFilterChange={updateBulkPgnFilter}
                      onSelectGame={loadBulkPgnGame}
                      onToggleImportant={toggleBulkPgnImportant}
                    />
                  )}
                </WorkspacePanel>

                <WorkspacePanel groupId="current-game-input">
                  <div className="mode-switch" role="tablist" aria-label="棋谱格式">
                    <button
                      type="button"
                      className={mode === 'pgn' ? 'active' : ''}
                      onClick={() => updateMode('pgn')}
                      role="tab"
                      aria-selected={mode === 'pgn'}
                    >
                      PGN
                    </button>
                    <button
                      type="button"
                      className={mode === 'fen' ? 'active' : ''}
                      onClick={() => updateMode('fen')}
                      role="tab"
                      aria-selected={mode === 'fen'}
                    >
                      FEN
                    </button>
                  </div>

                  <label className="input-block">
                    <span>{mode === 'pgn' ? '粘贴 PGN 棋谱' : '粘贴 FEN 局面'}</span>
                    <textarea
                      value={text}
                      onChange={(event) => updateText(event.target.value)}
                      spellCheck={false}
                    />
                  </label>

                  {result.error ? (
                    <div className="error-box">{result.error}</div>
                  ) : (
                    <MoveList
                      source={result.source}
                      moves={result.moves}
                      positions={result.positions}
                      activeIndex={safeIndex}
                      variationPositions={variationPositions}
                      activeVariationIndex={variationIndex}
                      notesByPosition={notesByPosition}
                      noteContext={{ mode, text }}
                      hiddenMoveIndex={shouldHideNextMove ? safeIndex : null}
                      onSelect={updatePositionIndex}
                      onVariationSelect={(index) => {
                        setVariationIndex(index);
                        setSelectedSquare(null);
                      }}
                      analyses={globalAnalysis}
                    />
                  )}
                </WorkspacePanel>

                <WorkspacePanel groupId="review-history">
                  <ReviewReportHistoryPanel
                    history={filteredReviewReportHistory}
                    stats={reviewReportHistoryStats}
                    search={historySearch}
                    resultFilter={historyResultFilter}
                    favoriteOnly={showFavoritesOnly}
                    onSearchChange={setHistorySearch}
                    onResultFilterChange={setHistoryResultFilter}
                    onFavoriteOnlyChange={setShowFavoritesOnly}
                    onOpen={reopenReviewReport}
                    onToggleFavorite={toggleReviewReportHistoryItemFavorite}
                    onDelete={deleteReviewReportHistoryItem}
                  />
                </WorkspacePanel>
              </>
            )}

            {rightPanelTab === 'current-analysis' && (
              <WorkspacePanel groupId="current-analysis">
                <EvaluationSidePanel side={evaluationSide} onSideChange={setEvaluationSide} />
                <GlobalAnalysisPanel
                  analyses={globalAnalysis}
                  isAnalyzing={isGlobalAnalyzing}
                  progress={globalAnalysisProgress}
                  canAnalyze={mode === 'pgn' && result.moves.length > 0 && !result.error}
                  depthPreset={analysisDepthPreset}
                  presetConfig={getAnalysisDepthPresetConfig(analysisDepthPreset)}
                  momentFilter={globalAnalysisFilter}
                  cacheStatus={globalAnalysisCacheStatus}
                  onDepthPresetChange={(preset) => {
                    setAnalysisDepthPreset(preset);
                    setGlobalAnalysisCacheStatus('尚未分析');
                  }}
                  onMomentFilterChange={setGlobalAnalysisFilter}
                  onAnalyze={() => runGlobalAnalysis(false)}
                  onRefresh={() => runGlobalAnalysis(true)}
                  onCancel={cancelGlobalAnalysis}
                />
                <StockfishPanel
                  status={engineStatus}
                  analysis={analysis}
                  isEnabled={isAnalysisEnabled}
                  mode={engineMode}
                  logs={engineLog}
                  nextMove={nextOriginalMove}
                  isVariationMode={Boolean(activeVariation)}
                  onAnalyze={analyzeCurrentPosition}
                  onStop={stopAnalysis}
                />
                <OpeningPanel opening={openingMatch} playedPly={playedMoves.length} improvementPlan={openingImprovementPlan} />
              </WorkspacePanel>
            )}

            {rightPanelTab === 'coach' && (
              <WorkspacePanel groupId="coach">
                <NaturalLanguageCoachPanel
                  report={naturalLanguageCoach}
                  onCopy={copyNaturalLanguageCoachReport}
                  onExport={exportNaturalLanguageCoachReport}
                />
              </WorkspacePanel>
            )}

            {rightPanelTab === 'review-report' && (
              <WorkspacePanel groupId="review-report">
                <ReviewReportPanel
                  report={reviewReport}
                  evaluationSide={reviewReportEvaluationSide}
                  onEvaluationSideChange={setReviewReportEvaluationSide}
                  onCopy={copyReviewReport}
                  onExport={exportReviewReport}
                  onSave={saveReviewReportToHistory}
                />
              </WorkspacePanel>
            )}

            {rightPanelTab === 'training-plan' && (
              <WorkspacePanel groupId="training-plan">
                <GuessTrainingPanel
                  isEnabled={isGuessMode}
                  nextMove={nextOriginalMove}
                  shouldHideNextMove={shouldHideNextMove}
                  result={guessResult}
                  pgnReplyMessage={pgnReplyMessage}
                  stats={guessStats}
                  candidateInput={candidateInput}
                  candidateResult={candidateResult}
                  candidateStats={candidateStats}
                  candidateSessions={candidateSessions}
                  onCandidateInputChange={setCandidateInput}
                  onToggle={toggleGuessMode}
                  onAnalyze={analyzeCurrentPosition}
                  onNext={nextGuessPosition}
                  onResetStats={resetGuessStats}
                  onResetCandidateTraining={resetCandidateTraining}
                />
                <MistakeBookPanel
                  cards={mistakeCards}
                  trainingPlan={trainingPlan}
                  dueCount={dueTrainingCount}
                  statsByTag={trainingStatsByTag}
                  onAddCurrent={addCurrentPositionToMistakeBook}
                  onPractice={practiceMistakeCard}
                  onMarkUnsolved={markMistakeCardUnsolved}
                  onDelete={deleteMistakeCard}
                />
                <MiddlegamePlanPanel
                  plan={middlegamePlanTraining}
                  evaluationSide={middlegamePlanEvaluationSide}
                  onEvaluationSideChange={setMiddlegamePlanEvaluationSide}
                  onSelectMove={(index) => updatePositionIndex(index + 1)}
                />
                <EndgameTrainingPanel
                  plan={endgameTrainingPlan}
                  evaluationSide={endgameTrainingEvaluationSide}
                  onEvaluationSideChange={setEndgameTrainingEvaluationSide}
                  onSelectMove={(index) => updatePositionIndex(index + 1)}
                />
              </WorkspacePanel>
            )}

            {rightPanelTab === 'strength-profile' && (
              <WorkspacePanel groupId="strength-profile">
                <StrengthProfilePanel
                  profile={strengthProfile}
                  historyStats={reviewReportHistoryStats}
                  evaluationSide={evaluationSide}
                  onEvaluationSideChange={setEvaluationSide}
                  range={strengthProfileRange}
                  onRangeChange={setStrengthProfileRange}
                />
              </WorkspacePanel>
            )}

          </div>
        </aside>
      </section>

      {pendingPromotion && (
        <PromotionDialog
          turn={new Chess(activeFen).turn()}
          onSelect={(promotion) =>
            commitMove({
              from: pendingPromotion.from,
              to: pendingPromotion.to,
              promotion,
            })
          }
          onCancel={() => setPendingPromotion(null)}
        />
      )}

      {toast && <div className={`toast ${toast.type}`}>{toast.text}</div>}
    </main>
  );
}

function getLegalTargets(fen: string, square: Square) {
  const game = new Chess(fen);
  return game.moves({ square, verbose: true }).map((move) => move.to);
}

function ImportExportTools({
  canExportPgn,
  hasSession,
  onImportPgn,
  onExportPgn,
  onCopyFen,
  onSaveSession,
  onLoadSession,
  onClearSession,
}: {
  canExportPgn: boolean;
  hasSession: boolean;
  onImportPgn: (files: FileList | File[] | null) => void;
  onExportPgn: () => void;
  onCopyFen: () => void;
  onSaveSession: () => void;
  onLoadSession: () => void;
  onClearSession: () => void;
}) {
  return (
    <div className="file-tools" aria-label="导入导出">
      <label className="file-import">
        导入 PGN
        <input
          type="file"
          multiple
          accept=".pgn,application/x-chess-pgn,text/plain"
          onChange={(event) => {
            onImportPgn(event.target.files);
            event.target.value = '';
          }}
        />
      </label>
      <button type="button" onClick={onExportPgn} disabled={!canExportPgn}>
        导出 PGN
      </button>
      <button type="button" onClick={onCopyFen}>
        复制 FEN
      </button>
      <button type="button" onClick={onSaveSession}>
        保存进度
      </button>
      {hasSession && (
        <>
          <button type="button" onClick={onLoadSession}>
            读取进度
          </button>
          <button type="button" onClick={onClearSession}>
            清除存档
          </button>
        </>
      )}
    </div>
  );
}

function BulkPgnLibraryPanel({
  library,
  games,
  insights,
  filters,
  activeContent,
  onFilterChange,
  onSelectGame,
  onToggleImportant,
}: {
  library: BulkPgnLibrary;
  games: BulkPgnGameSummary[];
  insights: BulkPgnLibraryInsights | null;
  filters: BulkPgnLibraryFilters;
  activeContent: string;
  onFilterChange: <K extends keyof BulkPgnLibraryFilters>(key: K, value: BulkPgnLibraryFilters[K]) => void;
  onSelectGame: (game: BulkPgnGameSummary) => void;
  onToggleImportant: (game: BulkPgnGameSummary) => void;
}) {
  const handleTextFilter = (key: 'opponent' | 'opening') => (event: ChangeEvent<HTMLInputElement>) => {
    onFilterChange(key, event.target.value);
  };

  return (
    <section className="bulk-pgn-library" aria-label="批量 PGN 棋谱库">
      <div className="panel-header compact">
        <div>
          <h2>批量 PGN 棋谱库</h2>
          <p>{library.summary} · 当前显示 {games.length} / {library.games.length} 盘</p>
        </div>
      </div>
      {insights && (
        <div className="bulk-pgn-insights">
          <strong>{insights.summary}</strong>
          <span>白胜 {insights.results.whiteWins} · 黑胜 {insights.results.blackWins} · 和棋 {insights.results.draws}</span>
          {insights.trainingPriorities.length > 0 && (
            <ul>
              {insights.trainingPriorities.map((priority) => (
                <li key={priority}>{priority}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <div className="bulk-pgn-filters" aria-label="批量 PGN 筛选排序">
        <label>
          来源
          <select value={filters.source ?? 'all'} onChange={(event) => onFilterChange('source', event.target.value as BulkPgnLibraryFilters['source'])}>
            <option value="all">全部</option>
            <option value="lichess">Lichess</option>
            <option value="chess.com">Chess.com</option>
            <option value="manual">手动/其他</option>
          </select>
        </label>
        <label>
          结果
          <select value={filters.result ?? 'all'} onChange={(event) => onFilterChange('result', event.target.value as BulkPgnLibraryFilters['result'])}>
            <option value="all">全部</option>
            <option value="win">胜</option>
            <option value="loss">负</option>
            <option value="draw">和</option>
            <option value="ongoing">未结束</option>
          </select>
        </label>
        <label>
          执棋
          <select value={filters.color ?? 'all'} onChange={(event) => onFilterChange('color', event.target.value as BulkPgnLibraryFilters['color'])}>
            <option value="all">全部</option>
            <option value="white">白方</option>
            <option value="black">黑方</option>
          </select>
        </label>
        <label>
          对手
          <input value={filters.opponent ?? ''} onChange={handleTextFilter('opponent')} placeholder="输入对手名" />
        </label>
        <label>
          开局
          <input value={filters.opening ?? ''} onChange={handleTextFilter('opening')} placeholder="ECO 或开局名" />
        </label>
        <label>
          起始日期
          <input type="date" value={filters.dateFrom ?? ''} onChange={(event) => onFilterChange('dateFrom', event.target.value)} />
        </label>
        <label>
          结束日期
          <input type="date" value={filters.dateTo ?? ''} onChange={(event) => onFilterChange('dateTo', event.target.value)} />
        </label>
        <label>
          排序
          <select value={filters.sortBy ?? 'date'} onChange={(event) => onFilterChange('sortBy', event.target.value as BulkPgnSortBy)}>
            <option value="date">日期</option>
            <option value="opponent">对手</option>
            <option value="result">结果</option>
            <option value="opening">开局</option>
            <option value="source">来源</option>
            <option value="important">重要</option>
          </select>
        </label>
        <label>
          方向
          <select value={filters.sortDirection ?? 'desc'} onChange={(event) => onFilterChange('sortDirection', event.target.value as 'asc' | 'desc')}>
            <option value="desc">降序</option>
            <option value="asc">升序</option>
          </select>
        </label>
        <label className="bulk-pgn-checkbox">
          <input type="checkbox" checked={Boolean(filters.importantOnly)} onChange={(event) => onFilterChange('importantOnly', event.target.checked)} />
          只看重要
        </label>
      </div>
      <div className="bulk-pgn-list">
        {games.length === 0 ? (
          <p className="bulk-pgn-empty">没有符合条件的棋局。</p>
        ) : (
          games.map((game) => (
            <article key={game.id} className={`bulk-pgn-card ${game.content === activeContent ? 'active' : ''}`}>
              <button type="button" className="bulk-pgn-card-main" onClick={() => onSelectGame(game)}>
                <strong>{game.isImportant ? '★ ' : ''}{game.event}</strong>
                <span>{game.white} vs {game.black}</span>
                <small>{game.filename} · {game.moveCount} 手 · {game.result}</small>
                <small>{game.source} · {game.playedAt || '未知日期'} · {game.openingEco} {game.openingName}</small>
              </button>
              <button type="button" className="bulk-pgn-important-toggle" onClick={() => onToggleImportant(game)}>
                {game.isImportant ? '取消重要' : '标为重要'}
              </button>
            </article>
          ))
        )}
      </div>
      {library.errors.length > 0 && (
        <details className="bulk-pgn-errors">
          <summary>失败 {library.errors.length} 盘</summary>
          <ul>
            {library.errors.map((error, index) => (
              <li key={`${error.filename}-${error.event}-${index}`}>
                {error.filename} · {error.event}：{error.message}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function ChessBoard({
  board,
  flipped,
  selectedSquare,
  legalTargets,
  lastMoveSquares,
  onSquareClick,
  onDragStart,
  onDrop,
}: {
  board: string[][];
  flipped: boolean;
  selectedSquare: Square | null;
  legalTargets: Square[];
  lastMoveSquares: Square[];
  onSquareClick: (square: Square) => void;
  onDragStart: (square: Square, event: DragEvent<HTMLButtonElement>) => void;
  onDrop: (square: Square, event: DragEvent<HTMLButtonElement>) => void;
}) {
  const rankIndexes = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const fileIndexes = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="board-wrap">
      <div className="board" aria-label="棋盘">
        {rankIndexes.map((rankIndex, visibleRankIndex) =>
          fileIndexes.map((fileIndex, visibleFileIndex) => {
            const piece = board[rankIndex][fileIndex];
            const light = (rankIndex + fileIndex) % 2 === 0;
            const square = `${files[fileIndex]}${8 - rankIndex}` as Square;
            const showFileCoordinate = visibleRankIndex === rankIndexes.length - 1;
            const showRankCoordinate = visibleFileIndex === 0;
            const selected = selectedSquare === square;
            const legalTarget = legalTargets.includes(square);
            const lastMove = lastMoveSquares.includes(square);

            return (
              <button
                type="button"
                key={square}
                className={`square ${light ? 'light' : 'dark'} ${selected ? 'selected' : ''} ${
                  legalTarget ? 'legal-target' : ''
                } ${lastMove ? 'last-move' : ''}`}
                aria-label={piece ? `${square} ${piece}` : square}
                draggable={Boolean(piece)}
                onClick={() => onSquareClick(square)}
                onDragStart={(event) => onDragStart(square, event)}
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => onDrop(square, event)}
              >
                <span className="coordinate file">{showFileCoordinate ? files[fileIndex] : ''}</span>
                <span className="coordinate rank">{showRankCoordinate ? 8 - rankIndex : ''}</span>
                {piece && <span className="piece">{pieceMap[piece]}</span>}
              </button>
            );
          }),
        )}
      </div>
    </div>
  );
}

function CapturedPiecesDisplay({ capturedPieces }: { capturedPieces: CapturedPieces }) {
  return (
    <div className="captured-panel" aria-label="被吃子">
      <CapturedSide title="白方被吃" color="w" pieces={capturedPieces.w} />
      <CapturedSide title="黑方被吃" color="b" pieces={capturedPieces.b} />
    </div>
  );
}

function CapturedSide({
  title,
  color,
  pieces,
}: {
  title: string;
  color: Color;
  pieces: PieceSymbol[];
}) {
  return (
    <div className="captured-side">
      <span>{title}</span>
      <div>
        {pieces.length === 0 ? (
          <em>无</em>
        ) : (
          pieces.map((piece, index) => (
            <span key={`${piece}-${index}`} title={pieceNames[piece]}>
              {pieceMap[color === 'w' ? piece.toUpperCase() : piece]}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

function PromotionDialog({
  turn,
  onSelect,
  onCancel,
}: {
  turn: Color;
  onSelect: (piece: Exclude<PieceSymbol, 'p' | 'k'>) => void;
  onCancel: () => void;
}) {
  return (
    <div className="promotion-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="promotion-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="选择升变棋子"
        onClick={(event) => event.stopPropagation()}
      >
        <h2>选择升变</h2>
        <div className="promotion-options">
          {promotionPieces.map((piece) => (
            <button type="button" key={piece} onClick={() => onSelect(piece)}>
              <span>{pieceMap[turn === 'w' ? piece.toUpperCase() : piece]}</span>
              {pieceNames[piece]}
            </button>
          ))}
        </div>
        <button type="button" className="promotion-cancel" onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  );
}

function EvaluationSidePanel({
  side,
  onSideChange,
}: {
  side: EvaluationSide;
  onSideChange: (side: EvaluationSide) => void;
}) {
  const options: EvaluationSide[] = ['white', 'black', 'both'];

  return (
    <section className="evaluation-side-panel" aria-label="全局评价方">
      <div className="section-heading">
        <span>全局评价方</span>
        <small>所有分析、报告、训练模块统一使用的被评价方上下文</small>
      </div>
      <div className="segmented-control">
        {options.map((option) => (
          <button
            type="button"
            key={option}
            className={side === option ? 'active' : ''}
            onClick={() => onSideChange(option)}
          >
            {getEvaluationSideLabel(option)}
          </button>
        ))}
      </div>
    </section>
  );
}

function EvaluationBar({ score }: { score: StockfishAnalysis['score'] | null }) {
  const maxCp = 500;
  const getIndicatorLeft = (): number => {
    if (!score) return 50;
    if (score.type === 'mate') {
      return score.value > 0 ? 100 : 0;
    }
    const clamped = Math.max(-maxCp, Math.min(maxCp, score.value));
    return ((clamped + maxCp) / (maxCp * 2)) * 100;
  };

  const indicatorLeft = getIndicatorLeft();

  return (
    <div className="eval-bar">
      <div className="eval-bar-track">
        <div
          className="eval-bar-indicator"
          style={{ left: `${indicatorLeft}%` }}
        />
        {score?.type === 'mate' && (
          <div
            className={`eval-bar-mate ${score.value > 0 ? 'white' : 'black'}`}
          >
            {score.value > 0 ? '白方胜势' : '黑方胜势'} M{Math.abs(score.value)}
          </div>
        )}
      </div>
      <div className="eval-bar-labels">
        <span>黑方优势</span>
        <span>{formatEngineScore(score)}</span>
        <span>白方优势</span>
      </div>
    </div>
  );
}

function StockfishPanel({
  status,
  analysis,
  isEnabled,
  mode,
  logs,
  nextMove,
  isVariationMode,
  onAnalyze,
  onStop,
}: {
  status: EngineStatus;
  analysis: StockfishAnalysis | null;
  isEnabled: boolean;
  mode: EngineMode;
  logs: string[];
  nextMove?: Move;
  isVariationMode: boolean;
  onAnalyze: () => void;
  onStop: () => void;
}) {
  const isAnalyzing = status === 'analyzing';
  const statusText: Record<EngineStatus, string> = {
    idle: '未启动',
    loading: '加载中',
    ready: '就绪',
    analyzing: '分析中',
    error: '错误',
  };
  const explanation = getTrainingExplanation({
    analysis,
    nextMove,
    isVariationMode,
  });

  return (
    <section className="engine-panel" aria-label="Stockfish 分析">
      <div className="engine-header">
        <div>
          <span>Stockfish</span>
          <p>
            {isEnabled ? `持续分析 · ${statusText[status]}` : statusText[status]} ·{' '}
            {mode === 'wasm' ? 'WASM' : 'ASM 兼容模式'}
          </p>
        </div>
        <div className="engine-actions">
          <button type="button" onClick={onAnalyze} disabled={status === 'loading'}>
            {isEnabled ? '重新分析' : '开启分析'}
          </button>
          <button type="button" onClick={onStop} disabled={!isEnabled && !isAnalyzing}>
            关闭
          </button>
        </div>
      </div>

      <EvaluationBar score={analysis?.score ?? null} />

      <div className="engine-grid">
        <div>
          <span>评分</span>
          <strong>{formatEngineScore(analysis?.score ?? null)}</strong>
        </div>
        <div>
          <span>深度</span>
          <strong>{analysis?.depth ? `${analysis.depth}` : '-'}</strong>
        </div>
        <div>
          <span>最佳手</span>
          <strong>{analysis?.bestMoveSan || analysis?.bestMove || '-'}</strong>
        </div>
      </div>

      <div className="engine-pv">
        <span>主线</span>
        <p>{analysis?.pv.length ? analysis.pv.join(' ') : '暂无主线'}</p>
      </div>

      <div className="engine-explanation">
        <span>训练解释</span>
        <p>{explanation}</p>
      </div>

      <details className="engine-log">
        <summary>引擎诊断日志</summary>
        {logs.length > 0 ? (
          <ul>
            {logs.map((log, index) => (
              <li key={`${log}-${index}`}>{log}</li>
            ))}
          </ul>
        ) : (
          <p>暂无日志</p>
        )}
      </details>
    </section>
  );
}

function GuessTrainingPanel({
  isEnabled,
  nextMove,
  shouldHideNextMove,
  result,
  pgnReplyMessage,
  stats,
  candidateInput,
  candidateResult,
  candidateStats,
  candidateSessions,
  onCandidateInputChange,
  onToggle,
  onAnalyze,
  onNext,
  onResetStats,
  onResetCandidateTraining,
}: {
  isEnabled: boolean;
  nextMove?: Move;
  shouldHideNextMove: boolean;
  result: GuessMoveResult | null;
  pgnReplyMessage: string;
  stats: GuessStats;
  candidateInput: string;
  candidateResult: CandidateMoveTrainingResult | null;
  candidateStats: CandidateTrainingStats;
  candidateSessions: CandidateTrainingSession[];
  onCandidateInputChange: (value: string) => void;
  onToggle: () => void;
  onAnalyze: () => void;
  onNext: () => void;
  onResetStats: () => void;
  onResetCandidateTraining: () => void;
}) {
  const total = stats.correct + stats.wrong;
  const accuracy = total ? Math.round((stats.correct / total) * 100) : 0;
  const candidateCoverage = candidateStats.validSessions
    ? Math.round((candidateStats.answerCovered / candidateStats.validSessions) * 100)
    : 0;
  const candidateAverageScore = candidateStats.validSessions
    ? Math.round(candidateStats.sortingScoreTotal / candidateStats.validSessions)
    : 0;

  return (
    <section className="guess-panel" aria-label="猜下一手训练">
      <div className="guess-header">
        <div>
          <span>猜下一手训练</span>
          <p>
            {isEnabled
              ? shouldHideNextMove
                ? '已隐藏棋谱下一手：你走对后，电脑会立刻按棋谱自动回应一手，形成连续人机对战训练。'
                : '本局面暂无可隐藏的下一手。'
              : '开启后会隐藏棋谱下一手，你走一步，电脑按原棋谱走下一步。'}
          </p>
        </div>
        <button type="button" onClick={onToggle}>
          {isEnabled ? '退出训练' : '开始训练'}
        </button>
      </div>

      <div className="guess-stats">
        <div>
          <span>猜对</span>
          <strong>{stats.correct}</strong>
        </div>
        <div>
          <span>猜错</span>
          <strong>{stats.wrong}</strong>
        </div>
        <div>
          <span>正确率</span>
          <strong>{accuracy}%</strong>
        </div>
      </div>

      <div className="candidate-training-box">
        <div className="candidate-training-header">
          <div>
            <span>候选着法训练</span>
            <p>每行一个候选：例如 Nf3 - 发展并控制中心。提交最终走法后统计覆盖率和排序能力。</p>
          </div>
          <button type="button" onClick={onResetCandidateTraining} disabled={candidateStats.sessions === 0 && !candidateInput}>
            清空候选记录
          </button>
        </div>
        <textarea
          value={candidateInput}
          onChange={(event) => onCandidateInputChange(event.target.value)}
          disabled={!isEnabled || Boolean(result)}
          rows={4}
          placeholder="Nf3 - 发展王翼并控制中心&#10;Bc4 - 盯住 f7&#10;d4 - 抢中心空间"
        />
        <div className="candidate-stats">
          <div>
            <span>有效训练</span>
            <strong>{candidateStats.validSessions}</strong>
          </div>
          <div>
            <span>答案覆盖率</span>
            <strong>{candidateCoverage}%</strong>
          </div>
          <div>
            <span>平均排序分</span>
            <strong>{candidateAverageScore}</strong>
          </div>
          <div>
            <span>有答案未选</span>
            <strong>{candidateStats.answerInCandidatesButNotSelected}</strong>
          </div>
        </div>
      </div>

      {candidateResult && (
        <div className={`candidate-result ${candidateResult.isValid ? 'valid' : 'invalid'}`}>
          <strong>{candidateResult.isValid ? '候选复盘结果' : '候选输入不足'}</strong>
          <p>{candidateResult.summary}</p>
          {candidateResult.entries.length > 0 && (
            <ul>
              {candidateResult.entries.map((entry) => (
                <li key={`${entry.moveSan}-${entry.reason}`}>
                  {entry.moveSan}：{entry.reason || '未填写理由'}
                </li>
              ))}
            </ul>
          )}
          {candidateResult.isValid && (
            <div className="candidate-multipv-comparison">
              <div className="candidate-multipv-header">
                <span>MultiPV 对比</span>
                <strong>{candidateResult.multiPvComparison.multiPvAvailable ? '已复用分析缓存' : '降级显示'}</strong>
              </div>
              <p>{candidateResult.multiPvComparison.summary}</p>
              <div className="candidate-multipv-grid">
                {candidateResult.multiPvComparison.rows.map((row) => (
                  <div
                    className={`candidate-multipv-row ${row.isSelected ? 'selected' : ''}`}
                    key={`${row.moveSan}-${row.feedbackLabel}-${row.matchedRank ?? 'miss'}`}
                  >
                    <div>
                      <span>{row.moveSan}</span>
                      <strong>{row.feedbackLabel}</strong>
                    </div>
                    <p>{row.explanation}</p>
                    <small>
                      {row.matchedRank ? `排名 #${row.matchedRank}` : '未命中排名'} ·{' '}
                      {row.scoreGapCp === null ? '评价差待分析' : `评价差 ${row.scoreGapCp}cp`} · 关键变例：{row.keyVariation}
                    </small>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {result ? (
        <div className={`guess-result ${result.isCorrect ? 'correct' : 'wrong'}`}>
          <strong>{result.isCorrect ? '猜对了' : '未猜中'}</strong>
          <p>{result.summary}</p>
          {pgnReplyMessage && <p className="pgn-reply-message">{pgnReplyMessage}</p>}
        </div>
      ) : (
        <p className="guess-hint">
          {isEnabled && nextMove ? '下一手已遮挡；你走对后，电脑按棋谱自动回应下一手，并把棋盘推进到你的下一回合。' : '可随时开启训练模式。'}
        </p>
      )}

      {candidateSessions.length > 0 && (
        <div className="candidate-session-list">
          {candidateSessions.slice(0, 3).map((session) => (
            <span key={session.id}>
              {session.positionLabel}：{session.result.sortingScore} 分
            </span>
          ))}
        </div>
      )}

      <div className="guess-actions">
        <button type="button" onClick={onAnalyze} disabled={!isEnabled || !nextMove}>
          分析当前猜题
        </button>
        <button type="button" onClick={onNext} disabled={!result || !nextMove}>
          下一题
        </button>
        <button type="button" onClick={onResetStats} disabled={total === 0}>
          清零记录
        </button>
      </div>
    </section>
  );
}

function MistakeBookPanel({
  cards,
  trainingPlan,
  dueCount,
  statsByTag,
  onAddCurrent,
  onPractice,
  onMarkUnsolved,
  onDelete,
}: {
  cards: MistakeCard[];
  trainingPlan: MistakeCard[];
  dueCount: number;
  statsByTag: Array<{ tag: string; attempts: number; solvedCount: number; accuracy: number }>;
  onAddCurrent: () => void;
  onPractice: (card: MistakeCard) => void;
  onMarkUnsolved: (card: MistakeCard) => void;
  onDelete: (id: string) => void;
}) {
  const displayCards = trainingPlan.length > 0 ? trainingPlan : cards.map(normalizeMistakeCard);

  return (
    <section className="mistake-book-panel" aria-label="错题本">
      <div className="mistake-book-header">
        <div>
          <span>训练闭环 / 错题本</span>
          <p>猜错自动入库，按 1/3/7/14 天间隔复习，并优先生成每日 10 题训练计划。</p>
        </div>
        <button type="button" onClick={onAddCurrent}>
          加入当前局面
        </button>
      </div>

      <div className="training-loop-summary">
        <div>
          <span>今日待复习</span>
          <strong>{dueCount}</strong>
        </div>
        <div>
          <span>每日计划</span>
          <strong>{trainingPlan.length}</strong>
        </div>
        <div>
          <span>错题总数</span>
          <strong>{cards.length}</strong>
        </div>
      </div>

      {statsByTag.length > 0 && (
        <div className="tag-stats">
          {statsByTag.map((stat) => (
            <span key={stat.tag}>
              {stat.tag}：{stat.accuracy}%（{stat.solvedCount}/{stat.attempts}）
            </span>
          ))}
        </div>
      )}

      {displayCards.length === 0 ? (
        <p className="mistake-empty">暂无错题。开启猜下一手训练后，猜错的局面会自动进入这里。</p>
      ) : (
        <div className="mistake-card-list">
          {displayCards.map((card) => {
            const normalized = normalizeMistakeCard(card);
            const interval = getSpacedReviewIntervalDays(normalized.reviewStage);
            const isDue = new Date(normalized.dueAt).getTime() <= Date.now();
            return (
              <article className={`mistake-card ${isDue ? 'due' : ''}`} key={normalized.id}>
                <div>
                  <strong>{normalized.positionLabel}</strong>
                  <p>
                    你的选择：{normalized.guessedSan} · 正解：{normalized.actualSan} · 引擎：{normalized.stockfishBestSan || '-'}
                  </p>
                  <small>
                    尝试 {normalized.attempts} 次 · 完成 {normalized.solvedCount} 次 · 阶段 {normalized.reviewStage} · 下次间隔 {interval} 天 · 到期{' '}
                    {new Date(normalized.dueAt).toLocaleDateString()} · {normalized.tags.join('、')}
                  </small>
                </div>
                <div className="mistake-card-actions">
                  <button type="button" onClick={() => onPractice(normalized)}>
                    完成复习
                  </button>
                  <button type="button" onClick={() => onMarkUnsolved(normalized)}>
                    仍需复习
                  </button>
                  <button type="button" onClick={() => onDelete(normalized.id)}>
                    删除
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function GlobalAnalysisPanel({
  analyses,
  isAnalyzing,
  progress,
  canAnalyze,
  depthPreset,
  presetConfig,
  momentFilter,
  cacheStatus,
  onDepthPresetChange,
  onMomentFilterChange,
  onAnalyze,
  onRefresh,
  onCancel,
}: {
  analyses: GlobalMoveAnalysis[];
  isAnalyzing: boolean;
  progress: string;
  canAnalyze: boolean;
  depthPreset: AnalysisDepthPreset;
  presetConfig: AnalysisDepthPresetConfig;
  momentFilter: GlobalAnalysisMomentFilter;
  cacheStatus: string;
  onDepthPresetChange: (preset: AnalysisDepthPreset) => void;
  onMomentFilterChange: (filter: GlobalAnalysisMomentFilter) => void;
  onAnalyze: () => void;
  onRefresh: () => void;
  onCancel: () => void;
}) {
  const swingPoints = analyses.filter((item) => item.isSwingPoint);
  const keyMomentSummary = buildKeyMomentSummary(filterGlobalAnalysisMoments(analyses, 'key'));

  return (
    <section className="global-analysis-panel" aria-label="一键全局分析">
      <div className="global-analysis-header">
        <div>
          <span>一键全局分析</span>
          <p>{progress || '自动分析整盘棋，为每一步打标签并标出局势突变点。'}</p>
          <small>{presetConfig.label} · 深度 {presetConfig.depth} · MultiPV {presetConfig.multiPv} · {cacheStatus}</small>
        </div>
        <div className="global-analysis-actions">
          <button type="button" onClick={onAnalyze} disabled={!canAnalyze || isAnalyzing}>
            {isAnalyzing ? '分析中…' : '分析整盘'}
          </button>
          <button type="button" onClick={onRefresh} disabled={!canAnalyze || isAnalyzing}>
            刷新分析
          </button>
          <button type="button" className="analysis-cancel-button" onClick={onCancel} disabled={!isAnalyzing} aria-label={isAnalyzing ? '取消当前整盘分析' : '整盘分析未运行，无法取消'}>
            {isAnalyzing ? '取消分析' : '取消'}
          </button>
        </div>
      </div>

      <div className="analysis-control-row">
        <div className="analysis-depth-controls" aria-label="分析深度选择">
          {(['fast', 'standard', 'deep'] as AnalysisDepthPreset[]).map((preset) => {
            const config = getAnalysisDepthPresetConfig(preset);
            return (
              <button
                type="button"
                key={preset}
                className={depthPreset === preset ? 'active' : ''}
                onClick={() => onDepthPresetChange(preset)}
                disabled={isAnalyzing}
              >
                {config.label} · D{config.depth}
              </button>
            );
          })}
        </div>
        <div className="analysis-filter-controls" aria-label="关键时刻筛选">
          <button type="button" className={momentFilter === 'all' ? 'active' : ''} onClick={() => onMomentFilterChange('all')}>
            全部
          </button>
          <button type="button" className={momentFilter === 'key' ? 'active' : ''} onClick={() => onMomentFilterChange('key')}>
            关键时刻
          </button>
          <button type="button" className={momentFilter === 'white' ? 'active' : ''} onClick={() => onMomentFilterChange('white')}>
            白棋行动
          </button>
          <button type="button" className={momentFilter === 'black' ? 'active' : ''} onClick={() => onMomentFilterChange('black')}>
            黑棋行动
          </button>
          <button type="button" className={momentFilter === 'key-white' ? 'active' : ''} onClick={() => onMomentFilterChange('key-white')}>
            白棋关键
          </button>
          <button type="button" className={momentFilter === 'key-black' ? 'active' : ''} onClick={() => onMomentFilterChange('key-black')}>
            黑棋关键
          </button>
        </div>
      </div>

      <p className="analysis-preset-help">{presetConfig.description}</p>
      {analyses.length > 0 && (
        <div className="analysis-player-summaries" aria-label="黑白行动统计">
          {(['w', 'b'] as Color[]).map((color) => {
            const playerSummary = buildGlobalAnalysisPlayerSummary(analyses, color);
            return <span key={color}>{playerSummary.summary}</span>;
          })}
        </div>
      )}
      {analyses.length > 0 && <p className="analysis-key-summary">{keyMomentSummary}</p>}

      {swingPoints.length > 0 && (
        <div className="swing-summary">
          <span>局势突变点</span>
          <p>{swingPoints.map((item) => item.label).join('、')}</p>
        </div>
      )}
    </section>
  );
}

function EvaluationSideSwitch({
  label,
  side,
  onChange,
}: {
  label: string;
  side: EvaluationSide;
  onChange: (side: EvaluationSide) => void;
}) {
  const options: EvaluationSide[] = ['white', 'black', 'both'];

  return (
    <div className="evaluation-side-switch" role="group" aria-label={label}>
      <span>{label}</span>
      {options.map((option) => (
        <button
          type="button"
          key={option}
          className={side === option ? 'active' : ''}
          aria-pressed={side === option}
          onClick={() => onChange(option)}
        >
          {getEvaluationSideLabel(option)}
        </button>
      ))}
    </div>
  );
}

function MiddlegamePlanPanel({
  plan,
  evaluationSide,
  onEvaluationSideChange,
  onSelectMove,
}: {
  plan: MiddlegamePlanTraining;
  evaluationSide: EvaluationSide;
  onEvaluationSideChange: (side: EvaluationSide) => void;
  onSelectMove: (moveIndex: number) => void;
}) {
  return (
    <section className="middlegame-plan-panel" aria-label="中局计划训练">
      <div className="middlegame-plan-header">
        <span>中局计划训练</span>
        <strong>{plan.focusCards.length}</strong>
      </div>
      <EvaluationSideSwitch label="中局训练评价方" side={evaluationSide} onChange={onEvaluationSideChange} />
      <p>{plan.summary}</p>

      {plan.themeStats.length > 0 && (
        <div className="middlegame-theme-list">
          {plan.themeStats.slice(0, 4).map((theme) => (
            <span key={theme.theme}>
              {theme.theme}：{theme.count} 次 · 损失 {theme.totalLoss} cp
            </span>
          ))}
        </div>
      )}

      {plan.focusCards.length > 0 ? (
        <div className="middlegame-card-list">
          {plan.focusCards.map((card) => (
            <button
              type="button"
              className="middlegame-plan-card"
              key={card.id}
              onClick={() => onSelectMove(card.moveIndex)}
            >
              <span>
                {card.label} · {card.topic}
              </span>
              <strong>优先级 {card.priority}</strong>
              <p>{card.recommendedPlan}</p>
              <small>{card.reason}</small>
            </button>
          ))}
        </div>
      ) : (
        <p className="middlegame-empty">运行“一键全局分析”后，会自动生成本局中局计划训练卡。</p>
      )}
    </section>
  );
}

function EndgameTrainingPanel({
  plan,
  evaluationSide,
  onEvaluationSideChange,
  onSelectMove,
}: {
  plan: EndgameTrainingPlan;
  evaluationSide: EvaluationSide;
  onEvaluationSideChange: (side: EvaluationSide) => void;
  onSelectMove: (moveIndex: number) => void;
}) {
  return (
    <section className="endgame-training-panel" aria-label="残局训练">
      <div className="endgame-training-header">
        <span>残局训练</span>
        <strong>{plan.type}</strong>
      </div>
      <EvaluationSideSwitch label="残局训练评价方" side={evaluationSide} onChange={onEvaluationSideChange} />
      <p>{plan.summary}</p>

      {plan.themes.length > 0 && (
        <div className="endgame-theme-list">
          {plan.themes.map((theme) => (
            <span key={theme}>{theme}</span>
          ))}
        </div>
      )}

      {plan.cards.length > 0 ? (
        <div className="endgame-card-list">
          {plan.cards.map((card) => (
            <button
              type="button"
              className="endgame-training-card"
              key={card.id}
              onClick={() => onSelectMove(card.moveIndex)}
            >
              <span>
                {card.label} · {card.missedChance}
              </span>
              <strong>{card.endgameType}</strong>
              <p>{card.prompt}</p>
              <small>
                训练标签：{card.tags.join(' / ')} · 走棋方：{card.moverLabel} · 评价方：{card.evaluatedSideLabel}
              </small>
            </button>
          ))}
        </div>
      ) : (
        <p className="endgame-empty">运行“一键全局分析”后，会自动识别残局类型并生成残局错题。</p>
      )}
    </section>
  );
}

function StrengthProfilePanel({
  profile,
  historyStats,
  evaluationSide,
  onEvaluationSideChange,
  range,
  onRangeChange,
}: {
  profile: StrengthProfile;
  historyStats: ReviewReportHistoryStats;
  evaluationSide: EvaluationSide;
  onEvaluationSideChange: (side: EvaluationSide) => void;
  range: StrengthProfileRange;
  onRangeChange: (range: StrengthProfileRange) => void;
}) {
  const sideOptions: EvaluationSide[] = ['white', 'black', 'both'];
  const rangeOptions: StrengthProfileRange[] = ['current', 'recent-5', 'recent-20', 'all'];

  return (
    <section className="strength-profile-panel" aria-label="个人棋力画像">
      <div className="strength-profile-header">
        <span>个人棋力画像</span>
        <strong>{profile.weakAreas.length || '待分析'}</strong>
      </div>
      <div className="strength-profile-side-switch" aria-label="棋力画像评价方">
        <span>评价方</span>
        <div className="segmented-control">
          {sideOptions.map((option) => (
            <button
              type="button"
              key={option}
              className={evaluationSide === option ? 'active' : ''}
              onClick={() => onEvaluationSideChange(option)}
            >
              {getEvaluationSideLabel(option)}
            </button>
          ))}
        </div>
      </div>
      <div className="strength-profile-side-switch" aria-label="棋力画像统计范围">
        <span>统计范围</span>
        <div className="segmented-control">
          {rangeOptions.map((option) => (
            <button
              type="button"
              key={option}
              className={range === option ? 'active' : ''}
              onClick={() => onRangeChange(option)}
            >
              {getStrengthProfileRangeLabel(option)}
            </button>
          ))}
        </div>
      </div>
      {profile.sampleInfo && <p className="strength-history-summary">样本：{profile.sampleInfo.rangeLabel}，{profile.sampleInfo.gameCount} 局</p>}
      <p>{profile.summary}</p>
      <p className="strength-history-summary">{historyStats.summary}</p>

      <div className="strength-radar-grid">
        {profile.radarAxes.map((axis) => (
          <div className="strength-radar-axis" key={axis.axis}>
            <div>
              <span>{axis.axis}</span>
              <strong>{axis.score}</strong>
            </div>
            <progress max="100" value={axis.score} />
            <small>{axis.note}</small>
          </div>
        ))}
      </div>

      <div className="strength-profile-grid">
        <div>
          <strong>阶段失分</strong>
          {profile.phaseBreakdown.map((phase) => (
            <span key={phase.phase}>
              {phase.phase}：{phase.totalLoss} cp / {phase.mistakes} 次
            </span>
          ))}
        </div>
        <div>
          <strong>错误类型</strong>
          {profile.mistakeTypes.length ? (
            profile.mistakeTypes.slice(0, 4).map((item) => (
              <span key={item.type}>
                {item.type}：{item.count} 次 · {item.totalLoss} cp
              </span>
            ))
          ) : (
            <span>暂无错误类型数据</span>
          )}
        </div>
      </div>

      {profile.trainingPriorities.length > 0 && (
        <div className="strength-priorities">
          <strong>训练优先级</strong>
          {profile.trainingPriorities.map((priority) => (
            <span key={priority}>{priority}</span>
          ))}
        </div>
      )}
    </section>
  );
}

function ReviewReportPanel({
  report,
  evaluationSide,
  onEvaluationSideChange,
  onCopy,
  onExport,
  onSave,
}: {
  report: ReviewReport;
  evaluationSide: EvaluationSide;
  onEvaluationSideChange: (side: EvaluationSide) => void;
  onCopy: () => void;
  onExport: () => void;
  onSave: () => void;
}) {
  return (
    <section className="review-report-panel" aria-label="复盘报告">
      <div className="review-report-header">
        <div>
          <span>复盘报告</span>
          <p>{report.summary}</p>
        </div>
        <div className="review-report-actions">
          <EvaluationSideSwitch label="复盘报告评价方" side={evaluationSide} onChange={onEvaluationSideChange} />
          <button type="button" onClick={onSave}>
            保存到历史
          </button>
          <button type="button" onClick={onCopy}>
            复制 Markdown
          </button>
          <button type="button" onClick={onExport}>
            导出 Markdown
          </button>
        </div>
      </div>

      <div className="review-report-grid">
        <article>
          <span>开局阶段表现</span>
          <p>{report.sections.opening}</p>
        </article>
        <article>
          <span>中局关键转折</span>
          <p>{report.sections.middlegame}</p>
        </article>
        <article>
          <span>残局准确性</span>
          <p>{report.sections.endgame}</p>
        </article>
        <article>
          <span>最大失误</span>
          <p>{report.sections.biggestMistake}</p>
        </article>
      </div>

      <div className="review-training-advice">
        <strong>下一次训练建议</strong>
        <p>{report.trainingAdvice}</p>
      </div>
    </section>
  );
}

function NaturalLanguageCoachPanel({
  report,
  onCopy,
  onExport,
}: {
  report: NaturalLanguageCoachReport;
  onCopy: () => void;
  onExport: () => void;
}) {
  return (
    <section className="natural-language-coach-panel" aria-label="自然语言教练">
      <div className="natural-language-coach-header">
        <div>
          <span>自然语言教练</span>
          <p>{report.summary}</p>
          <small>当前筛选：{report.filterLabel}</small>
        </div>
        <div className="natural-language-coach-actions">
          <button type="button" onClick={onCopy}>
            复制教练报告
          </button>
          <button type="button" onClick={onExport}>
            导出教练报告
          </button>
        </div>
      </div>

      <div className="natural-language-coach-grid">
        <article>
          <span>推荐练习主题</span>
          {report.practiceThemes.slice(0, 4).map((theme) => (
            <p key={`${theme.theme}-${theme.source}`}>
              <strong>{theme.theme}</strong> · {theme.priority} · {theme.evidence}。{theme.nextAction}
            </p>
          ))}
        </article>
        <article>
          <span>关键局面解释</span>
          {report.positionExplanations.length ? (
            report.positionExplanations.slice(0, 3).map((explanation) => (
              <div className="natural-language-position" key={explanation.moveLabel}>
                <strong>{explanation.title}</strong>
                <p>{explanation.whyBad}</p>
                <p>{explanation.candidateGuidance}</p>
                <small>主题：{explanation.practiceThemes.join('、') || '候选着法与风险控制'}</small>
              </div>
            ))
          ) : (
            <p>运行“一键全局分析”后，会根据关键失误生成可复制的中文教练解释。</p>
          )}
        </article>
      </div>
    </section>
  );
}

function ReviewReportHistoryPanel({
  history,
  stats,
  search,
  resultFilter,
  favoriteOnly,
  onSearchChange,
  onResultFilterChange,
  onFavoriteOnlyChange,
  onOpen,
  onToggleFavorite,
  onDelete,
}: {
  history: ReviewReportHistoryItem[];
  stats: ReviewReportHistoryStats;
  search: string;
  resultFilter: string;
  favoriteOnly: boolean;
  onSearchChange: (value: string) => void;
  onResultFilterChange: (value: string) => void;
  onFavoriteOnlyChange: (value: boolean) => void;
  onOpen: (item: ReviewReportHistoryItem) => void;
  onToggleFavorite: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="review-history-panel" aria-label="历史复盘报告">
      <div className="review-history-header">
        <div>
          <span>历史复盘报告</span>
          <p>{stats.summary}</p>
        </div>
        <strong>{stats.favoriteReports} 份重要</strong>
      </div>

      <div className="review-history-filters">
        <input
          type="search"
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索赛事、棋手、建议或关键着法"
          aria-label="搜索历史复盘报告"
        />
        <select value={resultFilter} onChange={(event) => onResultFilterChange(event.target.value)} aria-label="按结果筛选">
          <option value="all">全部结果</option>
          <option value="1-0">白胜</option>
          <option value="0-1">黑胜</option>
          <option value="1/2-1/2">和棋</option>
          <option value="*">未结束</option>
        </select>
        <label>
          <input
            type="checkbox"
            checked={favoriteOnly}
            onChange={(event) => onFavoriteOnlyChange(event.target.checked)}
          />
          只看重要
        </label>
      </div>

      {stats.mostCommonTrainingAdvice.length > 0 && (
        <div className="review-history-stats">
          <strong>历史训练主题</strong>
          {stats.mostCommonTrainingAdvice.slice(0, 3).map((advice) => (
            <span key={advice}>{advice}</span>
          ))}
        </div>
      )}

      <div className="review-history-list">
        {history.length ? (
          history.map((item) => (
            <article className={item.isFavorite ? 'review-history-item favorite' : 'review-history-item'} key={item.id}>
              <div>
                <strong>{item.meta.event}</strong>
                <span>
                  {item.meta.white} vs {item.meta.black} · {item.meta.result} · {new Date(item.savedAt).toLocaleDateString()}
                </span>
                <p>{item.summary}</p>
                <small>关键时刻：{item.keyMoments.map((moment) => moment.label).join('、') || '暂无'}</small>
              </div>
              <div className="review-history-actions">
                <button type="button" onClick={() => onOpen(item)}>
                  打开
                </button>
                <button type="button" onClick={() => onToggleFavorite(item.id)}>
                  {item.isFavorite ? '取消重要' : '标记重要'}
                </button>
                <button type="button" onClick={() => onDelete(item.id)}>
                  删除
                </button>
              </div>
            </article>
          ))
        ) : (
          <p className="review-history-empty">暂无匹配报告。保存当前复盘后，可在这里搜索、筛选并重新打开。</p>
        )}
      </div>
    </section>
  );
}

function SavedVariationsPanel({
  variations,
  onDelete,
}: {
  variations: SavedVariation[];
  onDelete: (id: string) => void;
}) {
  if (variations.length === 0) {
    return null;
  }

  return (
    <section className="saved-variations" aria-label="已保存变化">
      <div className="saved-variations-header">
        <span>已保存变化</span>
        <strong>{variations.length}</strong>
      </div>
      <div className="saved-variation-list">
        {variations.map((variation) => (
          <div className="saved-variation-item" key={variation.id}>
            <p>
              {variation.baseIndex === 0 ? '开局' : `第 ${variation.baseIndex} 手`} 后：{' '}
              {variation.labels.join(' ')}
            </p>
            <button type="button" onClick={() => onDelete(variation.id)}>
              删除
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function OpeningPanel({
  opening,
  playedPly,
  improvementPlan,
}: {
  opening: OpeningMatch;
  playedPly: number;
  improvementPlan: OpeningImprovementPlan;
}) {
  const statusText: Record<OpeningMatch['status'], string> = {
    start: '起始局面',
    book: '仍在开局库',
    recognized: '已识别',
    deviation: '已脱离内置开局线',
    unknown: '未识别',
  };

  return (
    <section className="opening-panel" aria-label="开局识别">
      <div className="opening-header">
        <span>开局提升</span>
        <strong>{opening.eco}</strong>
      </div>
      <h2>{opening.name}</h2>
      <p>{statusText[opening.status]} · 已走 {playedPly} ply</p>
      {opening.nextBookMove && (
        <p>
          内置库下一手：<strong>{opening.nextBookMove}</strong>
        </p>
      )}
      {opening.status === 'deviation' && (
        <p>
          分歧点：实战走了 <strong>{opening.deviationMove}</strong>，库线是{' '}
          <strong>{opening.nextBookMove ?? '-'}</strong>
        </p>
      )}

      <div className="opening-improvement-summary">
        <span>{improvementPlan.summary}</span>
        <p>自动识别常下开局、脱谱位置，并把关键开局分歧整理成复习提示。</p>
      </div>

      {improvementPlan.commonOpenings.length > 0 && (
        <div className="opening-stat-list">
          {improvementPlan.commonOpenings.slice(0, 3).map((stat) => (
            <span key={`${stat.eco}-${stat.name}`}>
              {stat.eco} {stat.name}：{stat.games} 盘 · 脱谱率 {stat.deviationRate}%
            </span>
          ))}
        </div>
      )}

      {improvementPlan.deviationCards.length > 0 && (
        <div className="opening-card-list">
          {improvementPlan.deviationCards.slice(0, 3).map((card) => (
            <article className="opening-review-card" key={card.id}>
              <strong>
                {card.eco} {card.openingName} · 第 {card.deviationPly} ply
              </strong>
              <p>
                实战 {card.playedMove}，建议复习库线 <strong>{card.bookMove}</strong>
              </p>
              <small>{card.reviewPrompt}</small>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function TrainingNotes({
  pgnComment,
  note,
  onNoteChange,
}: {
  pgnComment?: string;
  note: string;
  onNoteChange: (value: string) => void;
}) {
  return (
    <section className="notes-panel" aria-label="复盘笔记">
      {pgnComment && (
        <div className="pgn-comment">
          <span>PGN 注释</span>
          <p>{pgnComment}</p>
        </div>
      )}
      <label className="note-input">
        <span>我的笔记</span>
        <textarea
          value={note}
          onChange={(event) => onNoteChange(event.target.value)}
          placeholder="记录这一步的判断、漏算、计划或训练结论。"
        />
      </label>
    </section>
  );
}

function MoveList({
  source,
  moves,
  positions,
  activeIndex,
  variationPositions,
  activeVariationIndex,
  notesByPosition,
  noteContext,
  hiddenMoveIndex,
  onSelect,
  onVariationSelect,
  analyses,
}: {
  source: ReplayMode;
  moves: Move[];
  positions: ReplayPosition[];
  activeIndex: number;
  variationPositions: VariationPosition[];
  activeVariationIndex: number;
  notesByPosition: Record<string, string>;
  noteContext: {
    mode: ReplayMode;
    text: string;
  };
  hiddenMoveIndex: number | null;
  onSelect: (index: number) => void;
  onVariationSelect: (index: number) => void;
  analyses?: GlobalMoveAnalysis[];
}) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());

  const toggleExpand = (moveIndex: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(moveIndex)) {
        next.delete(moveIndex);
      } else {
        next.add(moveIndex);
      }
      return next;
    });
  };

  const expandAllProblematic = () => {
    if (!analyses) return;
    const problematic = analyses.filter((a) => a.quality !== '好棋');
    setExpandedIndices(new Set(problematic.map((a) => a.moveIndex)));
  };

  const collapseAll = () => {
    setExpandedIndices(new Set());
  };

  const analysisByMoveIndex = useMemo(() => {
    const map = new Map<number, GlobalMoveAnalysis>();
    analyses?.forEach((a) => map.set(a.moveIndex, a));
    return map;
  }, [analyses]);

  if (source === 'fen') {
    return (
      <div className="move-list">
        <h2>局面序列</h2>
        <div className="moves-grid single">
          {positions.map((position, index) => (
            <button
              type="button"
              key={`${position.fen}-${index}`}
              className={activeIndex === index && activeVariationIndex < 0 ? 'active' : ''}
              onClick={() => onSelect(index)}
            >
              <MoveButtonContent
                label={position.label}
                hasComment={Boolean(position.comment)}
                hasNote={Boolean(
                  notesByPosition[
                    getPositionNoteKey(noteContext.mode, noteContext.text, index, position.fen)
                  ],
                )}
              />
            </button>
          ))}
        </div>
        <VariationMoveList
          positions={variationPositions}
          activeIndex={activeVariationIndex}
          onSelect={onVariationSelect}
        />
      </div>
    );
  }

  const hasAnalyses = analyses && analyses.length > 0;
  const problematicCount = analyses?.filter((a) => a.quality !== '好棋').length ?? 0;
  const allProblematicExpanded =
    problematicCount > 0 &&
    analyses?.filter((a) => a.quality !== '好棋').every((a) => expandedIndices.has(a.moveIndex));

  return (
    <div className="move-list">
      <div className="move-list-header">
        <h2>走法</h2>
        {hasAnalyses && problematicCount > 0 && (
          <button
            type="button"
            className="move-expand-all-btn"
            onClick={allProblematicExpanded ? collapseAll : expandAllProblematic}
          >
            {allProblematicExpanded ? '收起问题着法' : '展开问题着法'}
          </button>
        )}
      </div>
      <button
        type="button"
        className={activeIndex === 0 && activeVariationIndex < 0 ? 'active' : ''}
        onClick={() => onSelect(0)}
      >
        <MoveButtonContent
          label="开局"
          hasComment={Boolean(positions[0]?.comment)}
          hasNote={Boolean(
            positions[0] &&
              notesByPosition[getPositionNoteKey(noteContext.mode, noteContext.text, 0, positions[0].fen)]
          )}
        />
      </button>
      <div className="moves-grid">
        {moves.map((move, index) => {
          const moveIndex = index + 1;
          const isHidden = hiddenMoveIndex === index;
          const analysis = analysisByMoveIndex.get(index);
          const isExpanded = expandedIndices.has(index);
          return (
            <Fragment key={`${move.lan}-${index}`}>
              <button
                type="button"
                className={activeIndex === moveIndex && activeVariationIndex < 0 ? 'active' : ''}
                onClick={() => onSelect(moveIndex)}
              >
                <MoveButtonContent
                  label={
                    isHidden ? `${formatMoveLabel(move, index).split(' ')[0]} ??` : formatMoveLabel(move, index)
                  }
                  hasComment={Boolean(positions[moveIndex]?.comment)}
                  hasNote={Boolean(
                    positions[moveIndex] &&
                      notesByPosition[
                        getPositionNoteKey(
                          noteContext.mode,
                          noteContext.text,
                          moveIndex,
                          positions[moveIndex].fen,
                        )
                      ],
                  )}
                  qualityBadge={analysis?.quality}
                />
              </button>
              {analysis && (
                <>
                  <button
                    type="button"
                    className="move-expand-toggle"
                    onClick={() => toggleExpand(index)}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? '收起' : '展开'} ${analysis.label} 分析详情`}
                  >
                    {isExpanded ? '收起' : '详情'}
                  </button>
                  {isExpanded && (
                    <div className="move-analysis-detail">
                      <div className="move-analysis-header">
                        <span className={`move-quality-badge quality-badge-${analysis.quality}`}>
                          {analysis.quality}
                        </span>
                        {analysis.isSwingPoint && (
                          <span className="move-swing-badge">局势突变</span>
                        )}
                        <span className="move-analysis-loss">
                          {describeGlobalAnalysisPerspective(analysis).summary}
                        </span>
                      </div>
                      <div className="move-analysis-best">
                        首选 {analysis.bestMoveSan || '-'}
                      </div>
                      {analysis.multiPvLines.length > 0 && (
                        <div className="move-analysis-multipv">
                          {formatMultiPvDisplayLines({
                            multiPvLines: analysis.multiPvLines,
                            fallbackBestMoveSan: analysis.bestMoveSan,
                            fallbackPv: analysis.primaryPv?.length
                              ? analysis.primaryPv
                              : analysis.bestMoveSan
                                ? [analysis.bestMoveSan]
                                : [],
                          }).map((line, i) => (
                            <span key={i}>{line}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </Fragment>
          );
        })}
      </div>
      <VariationMoveList
        positions={variationPositions}
        activeIndex={activeVariationIndex}
        onSelect={onVariationSelect}
      />
    </div>
  );
}

function MoveButtonContent({
  label,
  hasComment,
  hasNote,
  qualityBadge,
}: {
  label: string;
  hasComment: boolean;
  hasNote: boolean;
  qualityBadge?: MoveQualityLabel;
}) {
  return (
    <span className="move-button-content">
      <span>{label}</span>
      <span className="move-right-badges">
        {qualityBadge && (
          <span className={`move-quality-badge quality-badge-${qualityBadge}`} aria-hidden="true">
            {qualityBadge}
          </span>
        )}
        {(hasComment || hasNote) && (
          <span className="move-badges" aria-hidden="true">
            {hasComment && <span>C</span>}
            {hasNote && <span>N</span>}
          </span>
        )}
      </span>
    </span>
  );
}

function VariationMoveList({
  positions,
  activeIndex,
  onSelect,
}: {
  positions: VariationPosition[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (positions.length === 0) {
    return null;
  }

  return (
    <div className="variation-moves">
      <h2>试走棋谱</h2>
      <div className="moves-grid">
        {positions.map((position, index) => (
          <button
            type="button"
            key={`${position.fen}-${index}`}
            className={activeIndex === index ? 'active variation-active' : 'variation-entry'}
            onClick={() => onSelect(index)}
          >
            {position.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export {
  App,
  getLayoutRegionClassNames,
  getLayoutRegionProps,
  getLayoutPanelGroups,
  getResponsiveLayoutConfig,
  getResponsiveCollapseSections,
  analyzeCandidateMoveTraining,
  analyzeGuessMove,
  buildDailyTrainingPlan,
  buildEndgameTrainingPlan,
  buildMistakeCardFromGuess,
  buildOpeningImprovementPlan,
  buildReviewReport,
  buildNaturalLanguageCoachReport,
  buildNaturalLanguagePositionExplanation,
  buildPracticeThemeRecommendations,
  buildReviewReportHistoryStats,
  normalizeReviewReportHistoryItem,
  createReviewReportHistoryItem,
  filterReviewReportHistory,
  toggleReviewReportHistoryFavorite,
  buildStrengthProfile,
  buildStrengthProfileGameSnapshot,
  selectStrengthProfileSnapshots,
  buildStrengthProfileSnapshotsFromHistory,
  buildBulkPgnLibraryInsights,
  buildCandidateMultiPvComparison,
  buildGlobalAnalysisCacheKey,
  buildGlobalAnalysisCancellationPlan,
  buildGlobalAnalysisPlayerSummary,
  buildGlobalAnalysisPartialReport,
  buildGlobalAnalysisReport,
  buildGlobalAnalysisPerspectiveLabel,
  evaluationSideToColor,
  filterAnalysesByEvaluationSide,
  filterKeyAnalysesByEvaluationSide,
  getEvaluationSideLabel,
  buildKeyMomentSummary,
  buildMiddlegamePlanTraining,
  classifyKeyAnalysisMoment,
  formatMultiPvDisplayLines,
  parseStockfishInfo,
  rankMultiPvLines,
  completeEngineAnalysisFromRequest,
  filterGlobalAnalysisMoments,
  getAnalysisDepthPresetConfig,
  getPgnReplyAfterCorrectGuess,
  classifyMoveFromEvaluationDrop,
  detectSwingPoint,
  getSpacedReviewIntervalDays,
  identifyOpening,
  normalizeSan,
  filterBulkPgnLibraryGames,
  parseBulkPgnLibrary,
  parseCandidateMoveEntries,
  scoreToWhiteCentipawns,
  shouldClearBulkPgnLibraryAfterTextUpdate,
  toggleBulkPgnGameImportant,
  updateMistakeCardReview,
  upsertMistakeCard,
};
