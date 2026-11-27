import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type PieceSymbol } from 'chess.js';
import {
  ArrowLeft,
  ArrowLeftRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Flag,
  GraduationCap,
  Handshake,
  Loader2,
  RefreshCw,
  RotateCcw,
  SkipBack,
  SkipForward,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  evaluateGameTermination,
  evaluatePositionFast,
  formatResultReason,
  getCapturedPieces,
} from '../lib/chessEngine';
import { createChessFromInitialFen } from '../lib/chess960';
import { detectOpening } from '../lib/openings';
import { buildPgnFilename, downloadPgnFile, generateMatchPgn } from '../lib/pgn';
import {
  analyzeMatchWithStockfish,
  type AnalysisProgress,
  type GameAnalysisResult,
} from '../lib/stockfishAnalyzer';
import { useChessAudio } from '../contexts/ChessAudioContext';
import {
  DEFAULT_LOCAL_PLAY_PREFERENCES,
  type LocalPlayPreferences,
  type MatchResult,
  type MatchVariant,
  type ResultReason,
  type UserSettings,
} from '../types/chess';
import { ChessBoard } from './ChessBoard';
import { ChessPieceSvg } from './ChessPieces';
import { EvalBar } from './EvalBar';
import { GameAnalysisPanel } from './GameAnalysisPanel';

export interface PassAndPlayOptions {
  whiteLabel?: string;
  blackLabel?: string;
  autoFlip?: boolean;
  showEvalBar?: boolean;
  variant?: MatchVariant;
  initialFen?: string;
  chess960Id?: number;
}

interface PassAndPlayArenaProps {
  settings: UserSettings;
  localPrefs?: LocalPlayPreferences;
  options?: PassAndPlayOptions;
  onToggleSound: () => void;
  onExit: () => void;
}

interface MoveRecord {
  san: string;
  from: string;
  to: string;
  fen: string;
}

export const PassAndPlayArena: React.FC<PassAndPlayArenaProps> = ({
  settings,
  localPrefs = DEFAULT_LOCAL_PLAY_PREFERENCES,
  options,
  onToggleSound,
  onExit,
}) => {
  const { playSound, playMoveFromSan } = useChessAudio();
  const variant: MatchVariant = options?.variant ?? 'standard';
  const initialFen = options?.initialFen;

  const [whiteLabel, setWhiteLabel] = useState(options?.whiteLabel?.trim() || 'White');
  const [blackLabel, setBlackLabel] = useState(options?.blackLabel?.trim() || 'Black');
  const [autoFlip, setAutoFlip] = useState(options?.autoFlip ?? true);
  const [showEvalBar, setShowEvalBar] = useState(options?.showEvalBar ?? false);
  const [manualFlipped, setManualFlipped] = useState(false);

  const [history, setHistory] = useState<MoveRecord[]>([]);
  const [viewingPly, setViewingPly] = useState<number | null>(null);
  const [result, setResult] = useState<MatchResult>('');
  const [resultReason, setResultReason] = useState<ResultReason>('');
  const [drawOfferedBy, setDrawOfferedBy] = useState<Color | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const [showEndModal, setShowEndModal] = useState(false);
  const [copiedType, setCopiedType] = useState<'pgn' | 'fen' | null>(null);

  // Coach post-match review state
  const [analysis, setAnalysis] = useState<GameAnalysisResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const moveListRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    playSound('gameStart');
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, [playSound]);

  // Reconstruct authoritative Chess instance from move history
  const liveChess = useMemo(() => {
    const c = createChessFromInitialFen(initialFen);
    for (const m of history) {
      c.move(m.san);
    }
    return c;
  }, [history, initialFen]);

  const liveFen = liveChess.fen();
  const liveTurn = liveChess.turn();
  const isGameOver = result !== '';

  const allPositions = useMemo(() => {
    const startFen = createChessFromInitialFen(initialFen).fen();
    return [{ fen: startFen, from: '', to: '', san: '' }, ...history];
  }, [history, initialFen]);

  const activePly = viewingPly ?? history.length;
  const displayedPos = allPositions[activePly] || allPositions[allPositions.length - 1];

  const sanMoves = useMemo(() => history.map((h) => h.san), [history]);
  const opening = useMemo(() => detectOpening(sanMoves), [sanMoves]);
  const capturedSummary = useMemo(() => getCapturedPieces(displayedPos.fen), [displayedPos.fen]);

  const fastEval = useMemo(() => {
    if (!showEvalBar && !analysis) return { cpWhite: 0, mateWhite: null as number | null };
    if (analysis && activePly < analysis.evalSeriesWhiteCp.length) {
      const analyzedMove = activePly > 0 ? analysis.moves[activePly - 1] : null;
      return {
        cpWhite: analysis.evalSeriesWhiteCp[activePly],
        mateWhite: analyzedMove?.evalAfterMate ?? null,
      };
    }
    return evaluatePositionFast(displayedPos.fen);
  }, [showEvalBar, analysis, activePly, displayedPos.fen]);

  const isInCheckNow = useMemo(() => {
    try {
      return new Chess(displayedPos.fen).inCheck();
    } catch {
      return false;
    }
  }, [displayedPos.fen]);

  // Auto-scroll move list when new moves arrive
  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [history.length]);

  // Keyboard navigation (Chess.com style: Left, Right, Home, End, F to flip)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setViewingPly((prev) => Math.max(0, (prev ?? history.length) - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setViewingPly((prev) => {
          if (prev === null) return null;
          const next = prev + 1;
          return next >= history.length ? null : next;
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (history.length > 0) setViewingPly(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setViewingPly(null);
      } else if (e.key.toLowerCase() === 'f') {
        setAutoFlip(false);
        setManualFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [history.length]);

  const handleMove = useCallback(
    (from: string, to: string, promotion?: PieceSymbol) => {
      if (isGameOver || viewingPly !== null) return;
      const nextChess = createChessFromInitialFen(initialFen);
      for (const m of history) {
        nextChess.move(m.san);
      }

      const moved = nextChess.move({ from, to, promotion });
      if (!moved) {
        playSound('illegal');
        return;
      }

      const nextHistory: MoveRecord[] = [
        ...history,
        { san: moved.san, from: moved.from, to: moved.to, fen: nextChess.fen() },
      ];
      setHistory(nextHistory);
      setDrawOfferedBy(null);
      setConfirmResign(false);
      setAnalysis(null);
      setAnalysisError(null);

      const term = evaluateGameTermination(nextChess);
      if (term.isGameOver) {
        setResult(term.result);
        setResultReason(term.reason);
        setShowEndModal(true);
        if (term.reason === 'stalemate') {
          playSound('stalemate');
        } else if (term.result === '1/2-1/2') {
          playSound('draw');
        } else {
          playSound('victory');
        }
      } else {
        playMoveFromSan(moved.san);
      }
    },
    [history, initialFen, isGameOver, viewingPly, playMoveFromSan, playSound]
  );

  const handleTakeback = () => {
    if (history.length === 0) return;
    abortRef.current?.abort();
    setAnalyzing(false);
    setAnalysis(null);
    setAnalysisError(null);
    setHistory((prev) => prev.slice(0, -1));
    setViewingPly(null);
    setResult('');
    setResultReason('');
    setDrawOfferedBy(null);
    setConfirmResign(false);
    setShowEndModal(false);
    playSound('undo');
  };

  const handleOfferOrAcceptDraw = () => {
    if (isGameOver) return;
    if (drawOfferedBy && drawOfferedBy !== liveTurn) {
      setResult('1/2-1/2');
      setResultReason('draw_agreement');
      setDrawOfferedBy(null);
      setShowEndModal(true);
      playSound('draw');
    } else {
      setDrawOfferedBy(liveTurn);
      playSound('notify');
    }
  };

  const handleAgreeDrawDirect = () => {
    if (isGameOver) return;
    setResult('1/2-1/2');
    setResultReason('draw_agreement');
    setDrawOfferedBy(null);
    setConfirmResign(false);
    setShowEndModal(true);
    playSound('draw');
  };

  const handleResignCurrentSide = () => {
    if (isGameOver) return;
    const winnerResult: MatchResult = liveTurn === 'w' ? '0-1' : '1-0';
    setResult(winnerResult);
    setResultReason('resignation');
    setConfirmResign(false);
    setDrawOfferedBy(null);
    setShowEndModal(true);
    playSound('gameEnd');
  };

  const handleRematch = (swapSides = false) => {
    abortRef.current?.abort();
    setAnalyzing(false);
    setAnalysis(null);
    setAnalysisError(null);
    setAnalysisProgress(null);
    setHistory([]);
    setViewingPly(null);
    setResult('');
    setResultReason('');
    setDrawOfferedBy(null);
    setConfirmResign(false);
    setShowEndModal(false);
    if (swapSides) {
      setWhiteLabel(blackLabel);
      setBlackLabel(whiteLabel);
    }
    playSound('gameStart');
  };

  const handleRunAnalysis = async () => {
    if (sanMoves.length === 0) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setAnalyzing(true);
    setAnalysisProgress(null);
    setAnalysisError(null);
    setShowEndModal(false);

    try {
      const res = await analyzeMatchWithStockfish({
        moves: sanMoves,
        initialFen,
        depth: 10,
        movetimeMs: 95,
        signal: controller.signal,
        onProgress: (p) => {
          if (!controller.signal.aborted) setAnalysisProgress(p);
        },
      });
      if (!controller.signal.aborted) {
        setAnalysis(res);
        setShowEvalBar(true);
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setAnalysisError(err instanceof Error ? err.message : 'Coach review failed.');
    } finally {
      if (abortRef.current === controller) {
        setAnalyzing(false);
        abortRef.current = null;
      }
    }
  };

  const fullPgn = useMemo(
    () =>
      generateMatchPgn({
        moves: sanMoves,
        whiteName: whiteLabel,
        blackName: blackLabel,
        result,
        resultReason,
        mode: 'pass_and_play',
        variant,
        initialFen,
      }),
    [sanMoves, whiteLabel, blackLabel, result, resultReason, variant, initialFen]
  );

  const handleCopy = async (type: 'pgn' | 'fen') => {
    const text = type === 'pgn' ? fullPgn : displayedPos.fen;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 1800);
    } catch {
      // ignore
    }
  };

  const handleDownloadPgn = () => {
    const filename = buildPgnFilename(whiteLabel, blackLabel, new Date());
    downloadPgnFile(fullPgn, filename);
  };

  const boardOrientation: Color = autoFlip
    ? isGameOver
      ? manualFlipped
        ? 'b'
        : 'w'
      : liveTurn
    : manualFlipped
    ? 'b'
    : 'w';

  const topIsWhite = boardOrientation === 'b';
  const topPlayer = topIsWhite
    ? {
        name: whiteLabel,
        side: 'White',
        captured: capturedSummary.capturedByWhite,
        advantage: capturedSummary.whiteAdvantage,
        capturedColor: 'b' as Color,
        isTurn: !isGameOver && liveTurn === 'w',
        swatch: 'bg-white border-slate-300',
      }
    : {
        name: blackLabel,
        side: 'Black',
        captured: capturedSummary.capturedByBlack,
        advantage: capturedSummary.blackAdvantage,
        capturedColor: 'w' as Color,
        isTurn: !isGameOver && liveTurn === 'b',
        swatch: 'bg-slate-800 border-slate-600',
      };

  const bottomPlayer = topIsWhite
    ? {
        name: blackLabel,
        side: 'Black',
        captured: capturedSummary.capturedByBlack,
        advantage: capturedSummary.blackAdvantage,
        capturedColor: 'w' as Color,
        isTurn: !isGameOver && liveTurn === 'b',
        swatch: 'bg-slate-800 border-slate-600',
      }
    : {
        name: whiteLabel,
        side: 'White',
        captured: capturedSummary.capturedByWhite,
        advantage: capturedSummary.whiteAdvantage,
        capturedColor: 'b' as Color,
        isTurn: !isGameOver && liveTurn === 'w',
        swatch: 'bg-white border-slate-300',
      };

  const movePairs: { num: number; white: string; black?: string; wPly: number; bPly?: number }[] = [];
  for (let i = 0; i < sanMoves.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: sanMoves[i],
      black: sanMoves[i + 1],
      wPly: i + 1,
      bPly: sanMoves[i + 1] ? i + 2 : undefined,
    });
  }

  const activeAnalyzedMove = analysis && activePly > 0 ? analysis.moves[activePly - 1] || null : null;
  const hintSquares =
    activeAnalyzedMove &&
    activeAnalyzedMove.classification !== 'best' &&
    activeAnalyzedMove.bestMoveUci.length >= 4 &&
    activeAnalyzedMove.bestMoveUci !== activeAnalyzedMove.uci
      ? {
          from: activeAnalyzedMove.bestMoveUci.slice(0, 2),
          to: activeAnalyzedMove.bestMoveUci.slice(2, 4),
        }
      : null;

  const outcomeTitle =
    result === '1/2-1/2'
      ? resultReason === 'stalemate'
        ? 'Stalemate — Draw (½ – ½)'
        : 'Match Drawn (½ – ½)'
      : result === '1-0'
      ? `${whiteLabel} Wins (1 – 0)`
      : `${blackLabel} Wins (0 – 1)`;

  return (
    <div className="max-w-7xl mx-auto pb-8 space-y-4">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Exit 2 Players
        </button>

        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="font-semibold text-slate-800 dark:text-slate-200">
            2 Players · Pass & Play
          </span>
          {variant === 'chess960' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                Chess960{options?.chess960Id !== undefined ? ` #${options.chess960Id}` : ''}
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>Same Device · Untimed</span>

          <button
            type="button"
            onClick={() => setAutoFlip((v) => !v)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
              autoFlip
                ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-200 dark:bg-[#222833] text-slate-600 dark:text-slate-300'
            }`}
            title="Automatically rotate board after each move"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Auto-Flip: {autoFlip ? 'On' : 'Off'}
          </button>

          <button
            type="button"
            onClick={() => setShowEvalBar((v) => !v)}
            className={`px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
              showEvalBar
                ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300'
                : 'bg-slate-200 dark:bg-[#222833] text-slate-600 dark:text-slate-300'
            }`}
            title="Toggle live evaluation bar"
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Eval Bar
          </button>
        </div>
      </div>

      {/* Main Split Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left/Center: Player Bars + EvalBar + Board */}
        <div className="xl:col-span-8 space-y-3">
          {/* Top Player Strip */}
          <div
            className={`max-w-[716px] mx-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white dark:bg-[#1A1E26] border transition-colors ${
              topPlayer.isTurn ? 'border-emerald-500/70' : 'border-slate-200 dark:border-[#2A313D]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-7 h-7 rounded-lg border-2 shrink-0 ${topPlayer.swatch}`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                    {topPlayer.name}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({topPlayer.side})
                  </span>
                </div>
                {topPlayer.isTurn && (
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {isInCheckNow ? 'In Check · Your Turn' : 'Your Turn'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <div className="flex items-center -space-x-1.5">
                {topPlayer.captured.slice(0, 12).map((p, i) => (
                  <ChessPieceSvg
                    key={`${p}-${i}`}
                    type={p}
                    color={topPlayer.capturedColor}
                    style={settings.pieceStyle}
                    className="w-4 h-4"
                  />
                ))}
              </div>
              {topPlayer.advantage > 0 && (
                <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 ml-1 tabular-nums">
                  +{topPlayer.advantage}
                </span>
              )}
            </div>
          </div>

          {/* Board + Optional Eval Bar + Dismissible Game Over Overlay */}
          <div className="max-w-[716px] mx-auto flex items-stretch gap-2.5 relative">
            {showEvalBar && (
              <EvalBar
                evalCpWhite={fastEval.cpWhite}
                mateWhite={fastEval.mateWhite}
                orientation={boardOrientation}
              />
            )}

            <div className="flex-1 relative">
              <ChessBoard
                fen={displayedPos.fen}
                orientation={boardOrientation}
                interactive={!isGameOver && viewingPly === null}
                allowedColor="both"
                lastMove={
                  displayedPos.from && displayedPos.to
                    ? { from: displayedPos.from, to: displayedPos.to }
                    : null
                }
                hintSquares={hintSquares}
                gameOutcome={isGameOver ? { result, reason: resultReason } : null}
                boardTheme={settings.boardTheme}
                pieceStyle={settings.pieceStyle}
                animationsEnabled={settings.animationsEnabled}
                showCoordinates={localPrefs.showCoordinates}
                autoQueen={localPrefs.autoQueen}
                onMove={handleMove}
                onIllegalAttempt={() => playSound('illegal')}
              />

              {/* End-of-Game Summary Modal */}
              {isGameOver && showEndModal && (
                <div className="absolute inset-0 z-30 bg-black/55 backdrop-blur-[2px] rounded-lg flex items-center justify-center p-4">
                  <div className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 max-w-sm w-full shadow-2xl text-center space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
                      <Trophy className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                        {outcomeTitle}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {formatResultReason(resultReason)} · {Math.ceil(history.length / 2)} moves played
                      </p>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => handleRematch(false)}
                        className="py-2.5 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold whitespace-nowrap cursor-pointer"
                      >
                        Rematch
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRematch(true)}
                        className="py-2.5 px-3 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5" />
                        Swap & Play
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleCopy('pgn')}
                        className="py-2 px-3 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        {copiedType === 'pgn' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedType === 'pgn' ? 'Copied PGN' : 'Copy PGN'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadPgn}
                        className="py-2 px-3 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Export .pgn
                      </button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={sanMoves.length === 0 || analyzing}
                        onClick={() => void handleRunAnalysis()}
                        className="flex-1 py-2 px-3 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                        Coach Review
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowEndModal(false)}
                        className="py-2 px-3 rounded-lg text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        View Board
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Player Strip */}
          <div
            className={`max-w-[716px] mx-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white dark:bg-[#1A1E26] border transition-colors ${
              bottomPlayer.isTurn ? 'border-emerald-500/70' : 'border-slate-200 dark:border-[#2A313D]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className={`w-7 h-7 rounded-lg border-2 shrink-0 ${bottomPlayer.swatch}`} />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                    {bottomPlayer.name}
                  </span>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    ({bottomPlayer.side})
                  </span>
                </div>
                {bottomPlayer.isTurn && (
                  <p className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                    {isInCheckNow ? 'In Check · Your Turn' : 'Your Turn'}
                  </p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <div className="flex items-center -space-x-1.5">
                {bottomPlayer.captured.slice(0, 12).map((p, i) => (
                  <ChessPieceSvg
                    key={`${p}-${i}`}
                    type={p}
                    color={bottomPlayer.capturedColor}
                    style={settings.pieceStyle}
                    className="w-4 h-4"
                  />
                ))}
              </div>
              {bottomPlayer.advantage > 0 && (
                <span className="font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 ml-1 tabular-nums">
                  +{bottomPlayer.advantage}
                </span>
              )}
            </div>
          </div>

          {/* Coach Review Panel (when triggered) */}
          {(analyzing || analysis || analysisError) && (
            <div className="max-w-[716px] mx-auto">
              <GameAnalysisPanel
                whiteName={whiteLabel}
                blackName={blackLabel}
                analyzing={analyzing}
                progress={analysisProgress}
                analysis={analysis}
                error={analysisError}
                currentPly={activePly}
                onSelectPly={(nextPly) => setViewingPly(nextPly === history.length ? null : nextPly)}
                onRunAnalysis={() => void handleRunAnalysis()}
              />
            </div>
          )}
        </div>

        {/* Right Sidebar: Status, Opening, Moves, Scrubbing, Draw/Takeback/Resign */}
        <aside className="xl:col-span-4 bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl flex flex-col overflow-hidden">
          {/* Status Header */}
          <div className="p-4 border-b border-slate-200 dark:border-[#2A313D]">
            {isGameOver ? (
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <Trophy className="w-4 h-4 shrink-0" />
                  <span className="font-display font-bold text-sm">{outcomeTitle}</span>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatResultReason(resultReason)} · Local 2-Player Match
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleRematch(false)}
                    className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    New Game
                  </button>
                  <button
                    type="button"
                    disabled={sanMoves.length === 0 || analyzing}
                    onClick={() => void handleRunAnalysis()}
                    className="py-2 px-3 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                  >
                    {analyzing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GraduationCap className="w-3.5 h-3.5" />}
                    Coach Review
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPgn}
                    className="py-2 px-3 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                    title="Download .pgn file"
                  >
                    <Download className="w-3.5 h-3.5" />
                    .pgn
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-display font-bold text-sm text-slate-900 dark:text-white">
                    {isInCheckNow ? 'Check! ' : ''}
                    {liveTurn === 'w' ? `${whiteLabel} to Move` : `${blackLabel} to Move`}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Click or drag pieces · Right-click to draw arrows
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                  Move {Math.floor(history.length / 2) + 1}
                </span>
              </div>
            )}

            {/* Live Opening Classification */}
            {opening && (
              <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-[#242A35] flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="font-mono text-slate-400 shrink-0">{opening.eco}</span>
                <span className="truncate font-medium">{opening.name}</span>
              </div>
            )}
          </div>

          {/* Pending Draw Offer Banner */}
          {drawOfferedBy && !isGameOver && (
            <div className="p-3.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                {drawOfferedBy === 'w' ? whiteLabel : blackLabel} offered a draw
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleAgreeDrawDirect}
                  className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => setDrawOfferedBy(null)}
                  className="px-2.5 py-1 rounded bg-slate-200 dark:bg-[#222833] text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Historical Ply Viewing Notice */}
          {viewingPly !== null && (
            <div className="px-4 py-2 bg-sky-500/10 border-b border-sky-500/25 flex items-center justify-between text-xs">
              <span className="text-sky-700 dark:text-sky-300 font-medium">
                Inspecting ply {viewingPly} of {history.length}
              </span>
              <button
                type="button"
                onClick={() => setViewingPly(null)}
                className="font-semibold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
              >
                Live Position
              </button>
            </div>
          )}

          {/* Move List */}
          <div ref={moveListRef} className="flex-1 min-h-[240px] max-h-[380px] overflow-y-auto p-3">
            {movePairs.length === 0 ? (
              <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center text-xs text-slate-400 px-4">
                <p>White moves first.</p>
                <p className="mt-1">Pass the device or play side-by-side — zero accounts or clocks.</p>
              </div>
            ) : (
              <div className="space-y-0.5 font-mono text-xs tabular-nums">
                {movePairs.map((row) => (
                  <div
                    key={row.num}
                    className="grid grid-cols-12 items-center rounded hover:bg-slate-50 dark:hover:bg-[#202631]"
                  >
                    <span className="col-span-2 py-1.5 px-2 text-slate-400">{row.num}.</span>
                    <button
                      type="button"
                      onClick={() => setViewingPly(row.wPly === history.length ? null : row.wPly)}
                      className={`col-span-5 py-1.5 px-2 text-left rounded cursor-pointer ${
                        activePly === row.wPly
                          ? 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 font-semibold'
                          : 'text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {row.white}
                    </button>
                    {row.black ? (
                      <button
                        type="button"
                        onClick={() => setViewingPly(row.bPly === history.length ? null : (row.bPly ?? null))}
                        className={`col-span-5 py-1.5 px-2 text-left rounded cursor-pointer ${
                          activePly === row.bPly
                            ? 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 font-semibold'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {row.black}
                      </button>
                    ) : (
                      <span className="col-span-5" />
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scrubber & Utility Bar */}
          <div className="px-3 py-2 border-t border-slate-200 dark:border-[#2A313D] flex items-center justify-between gap-1 bg-slate-50 dark:bg-[#14181F]">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={history.length === 0}
                onClick={() => setViewingPly(0)}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer"
                title="Start position (Home)"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={activePly <= 0}
                onClick={() => setViewingPly(Math.max(0, activePly - 1))}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer"
                title="Previous move (←)"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={viewingPly === null}
                onClick={() => {
                  const next = activePly + 1;
                  setViewingPly(next >= history.length ? null : next);
                }}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer"
                title="Next move (→)"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={viewingPly === null}
                onClick={() => setViewingPly(null)}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer"
                title="Live position (End)"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setAutoFlip(false);
                  setManualFlipped((f) => !f);
                }}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-slate-600 dark:text-slate-300 cursor-pointer"
                title="Flip board (F)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onToggleSound}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-slate-600 dark:text-slate-300 cursor-pointer"
                title={settings.soundEnabled ? 'Mute sounds' : 'Enable sounds'}
              >
                {settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy('pgn')}
                className="px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-slate-600 dark:text-slate-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                title="Copy full PGN"
              >
                {copiedType === 'pgn' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                PGN
              </button>
              <button
                type="button"
                onClick={handleDownloadPgn}
                className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-slate-600 dark:text-slate-300 cursor-pointer"
                title="Download .pgn file"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void handleCopy('fen')}
                className="px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-slate-600 dark:text-slate-300 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                title="Copy FEN"
              >
                {copiedType === 'fen' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                FEN
              </button>
            </div>
          </div>

          {/* Match Controls: Takeback, Agree Draw, Resign */}
          <div className="p-3.5 border-t border-slate-200 dark:border-[#2A313D] space-y-2">
            {confirmResign && !isGameOver ? (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
                <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                  Resign as {liveTurn === 'w' ? whiteLabel : blackLabel}?
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleResignCurrentSide}
                    className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Resign
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResign(false)}
                    className="px-2.5 py-1 rounded bg-slate-200 dark:bg-[#222833] text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={history.length === 0}
                  onClick={handleTakeback}
                  className="py-2 px-2.5 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 cursor-pointer"
                  title="Undo last move"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Takeback
                </button>
                <button
                  type="button"
                  disabled={isGameOver}
                  onClick={handleOfferOrAcceptDraw}
                  className="py-2 px-2.5 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 cursor-pointer"
                >
                  <Handshake className="w-3.5 h-3.5" />
                  {drawOfferedBy ? 'Accept Draw' : 'Draw'}
                </button>
                <button
                  type="button"
                  disabled={isGameOver}
                  onClick={() => setConfirmResign(true)}
                  className="py-2 px-2.5 rounded-lg bg-red-500/10 hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-40 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Resign
                </button>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
};
