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
  Lightbulb,
  Loader2,
  RefreshCw,
  RotateCcw,
  SkipBack,
  SkipForward,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  COMPUTER_BOTS,
  MINIMAX_H1_FLASH,
  computeBestBotMove,
  evaluateGameTermination,
  evaluatePositionFast,
  formatResultReason,
  formatSanWithFigurine,
  getBotMatchCommentary,
  getCapturedPieces,
} from '../lib/chessEngine';
import { computeBestBotMoveAsync } from '../lib/botWorkerClient';
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
  type ComputerBot,
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
import { PlayerAvatar } from './PlayerAvatar';

export interface PassAndPlayOptions {
  whiteLabel?: string;
  blackLabel?: string;
  autoFlip?: boolean;
  showEvalBar?: boolean;
  variant?: MatchVariant;
  initialFen?: string;
  chess960Id?: number;
  bot?: ComputerBot;
  playerColor?: Color;
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

  const [activeBot, setActiveBot] = useState<ComputerBot | null>(options?.bot ?? null);
  const [humanColor, setHumanColor] = useState<Color>(options?.playerColor ?? 'w');
  const [botThinking, setBotThinking] = useState(false);
  const [liveHint, setLiveHint] = useState<{ from: string; to: string } | null>(null);

  const [whiteLabel, setWhiteLabel] = useState(
    options?.bot
      ? (options.playerColor ?? 'w') === 'w'
        ? 'You'
        : options.bot.name
      : options?.whiteLabel?.trim() || 'White'
  );
  const [blackLabel, setBlackLabel] = useState(
    options?.bot
      ? (options.playerColor ?? 'w') === 'w'
        ? options.bot.name
        : 'You'
      : options?.blackLabel?.trim() || 'Black'
  );
  const [autoFlip, setAutoFlip] = useState(options?.bot ? false : (options?.autoFlip ?? true));
  const [showEvalBar, setShowEvalBar] = useState(options?.bot ? true : (options?.showEvalBar ?? false));
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
  const opening = useMemo(() => detectOpening(sanMoves.slice(0, activePly)), [sanMoves, activePly]);
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

  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [history.length]);

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

  const applyExecutedMove = useCallback(
    (from: string, to: string, promotion?: PieceSymbol) => {
      const nextChess = createChessFromInitialFen(initialFen);
      for (const m of history) {
        nextChess.move(m.san);
      }

      const moved = nextChess.move({ from, to, promotion });
      if (!moved) {
        playSound('illegal');
        return false;
      }

      const nextHistory: MoveRecord[] = [
        ...history,
        { san: moved.san, from: moved.from, to: moved.to, fen: nextChess.fen() },
      ];
      setHistory(nextHistory);
      setLiveHint(null);
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
      return true;
    },
    [history, initialFen, playMoveFromSan, playSound]
  );

  const handleMove = useCallback(
    (from: string, to: string, promotion?: PieceSymbol) => {
      if (isGameOver || viewingPly !== null || botThinking) return;
      if (activeBot && liveTurn !== humanColor) {
        playSound('illegal');
        return;
      }
      applyExecutedMove(from, to, promotion);
    },
    [isGameOver, viewingPly, botThinking, activeBot, liveTurn, humanColor, applyExecutedMove, playSound]
  );

  // Local AI Bot automation (MiniMax H1 Flash / Pro / Ultra in Web Worker)
  useEffect(() => {
    if (!activeBot || isGameOver) return;
    const botSide: Color = humanColor === 'w' ? 'b' : 'w';
    if (liveTurn !== botSide) return;

    let cancelled = false;
    const workerAbort = new AbortController();
    setBotThinking(true);

    const priorKeys = allPositions.map((p) => p.fen);
    const delayMs = activeBot.responseDelayMs ?? 40;

    const timer = window.setTimeout(async () => {
      try {
        const best = await computeBestBotMoveAsync(liveFen, activeBot, priorKeys, workerAbort.signal);
        if (best && !cancelled) {
          applyExecutedMove(best.from, best.to, best.promotion as PieceSymbol | undefined);
        }
      } finally {
        if (!cancelled) setBotThinking(false);
      }
    }, delayMs);

    return () => {
      cancelled = true;
      workerAbort.abort();
      window.clearTimeout(timer);
      setBotThinking(false);
    };
  }, [activeBot, isGameOver, humanColor, liveTurn, liveFen, allPositions, applyExecutedMove]);

  const handleTakeback = () => {
    if (history.length === 0 || botThinking) return;
    abortRef.current?.abort();
    setAnalyzing(false);
    setAnalysis(null);
    setAnalysisError(null);
    // In bot mode, undo full pair (player + bot reply) if it's currently player's turn
    const stepsBack = activeBot && liveTurn === humanColor && history.length >= 2 ? 2 : 1;
    setHistory((prev) => prev.slice(0, Math.max(0, prev.length - stepsBack)));
    setViewingPly(null);
    setLiveHint(null);
    setResult('');
    setResultReason('');
    setDrawOfferedBy(null);
    setConfirmResign(false);
    setShowEndModal(false);
    playSound('undo');
  };

  const handleRequestHint = () => {
    if (isGameOver || viewingPly !== null || botThinking) return;
    const best = computeBestBotMove(displayedPos.fen, MINIMAX_H1_FLASH);
    if (best) {
      setLiveHint({ from: best.from, to: best.to });
      playSound('notify');
    }
  };

  const handleSwitchBot = (nextBot: ComputerBot) => {
    setActiveBot(nextBot);
    if (humanColor === 'w') {
      setWhiteLabel('You');
      setBlackLabel(nextBot.name);
    } else {
      setWhiteLabel(nextBot.name);
      setBlackLabel('You');
    }
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
    const resigningSide = activeBot ? humanColor : liveTurn;
    const winnerResult: MatchResult = resigningSide === 'w' ? '0-1' : '1-0';
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
    setLiveHint(null);
    setResult('');
    setResultReason('');
    setDrawOfferedBy(null);
    setConfirmResign(false);
    setShowEndModal(false);
    if (swapSides) {
      if (activeBot) {
        const nextHuman: Color = humanColor === 'w' ? 'b' : 'w';
        setHumanColor(nextHuman);
        setWhiteLabel(nextHuman === 'w' ? 'You' : activeBot.name);
        setBlackLabel(nextHuman === 'w' ? activeBot.name : 'You');
      } else {
        setWhiteLabel(blackLabel);
        setBlackLabel(whiteLabel);
      }
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
        mode: activeBot ? 'computer' : 'pass_and_play',
        variant,
        initialFen,
      }),
    [sanMoves, whiteLabel, blackLabel, result, resultReason, activeBot, variant, initialFen]
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

  const baseOrient: Color = activeBot ? humanColor : 'w';
  const boardOrientation: Color = activeBot
    ? manualFlipped
      ? baseOrient === 'w'
        ? 'b'
        : 'w'
      : baseOrient
    : autoFlip
    ? isGameOver
      ? manualFlipped
        ? 'b'
        : 'w'
      : liveTurn
    : manualFlipped
    ? 'b'
    : 'w';

  const topIsWhite = boardOrientation === 'b';
  const whiteIsBot = Boolean(activeBot && humanColor === 'b');
  const blackIsBot = Boolean(activeBot && humanColor === 'w');

  const topPlayer = topIsWhite
    ? {
        name: whiteLabel,
        side: 'White',
        bot: whiteIsBot ? activeBot : null,
        captured: capturedSummary.capturedByWhite,
        advantage: capturedSummary.whiteAdvantage,
        capturedColor: 'b' as Color,
        isTurn: !isGameOver && liveTurn === 'w',
        swatch: 'bg-white border-stone-300',
      }
    : {
        name: blackLabel,
        side: 'Black',
        bot: blackIsBot ? activeBot : null,
        captured: capturedSummary.capturedByBlack,
        advantage: capturedSummary.blackAdvantage,
        capturedColor: 'w' as Color,
        isTurn: !isGameOver && liveTurn === 'b',
        swatch: 'bg-[#262421] border-stone-600',
      };

  const bottomPlayer = topIsWhite
    ? {
        name: blackLabel,
        side: 'Black',
        bot: blackIsBot ? activeBot : null,
        captured: capturedSummary.capturedByBlack,
        advantage: capturedSummary.blackAdvantage,
        capturedColor: 'w' as Color,
        isTurn: !isGameOver && liveTurn === 'b',
        swatch: 'bg-[#262421] border-stone-600',
      }
    : {
        name: whiteLabel,
        side: 'White',
        bot: whiteIsBot ? activeBot : null,
        captured: capturedSummary.capturedByWhite,
        advantage: capturedSummary.whiteAdvantage,
        capturedColor: 'b' as Color,
        isTurn: !isGameOver && liveTurn === 'w',
        swatch: 'bg-white border-stone-300',
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
    liveHint ||
    (activeAnalyzedMove &&
    activeAnalyzedMove.classification !== 'best' &&
    activeAnalyzedMove.bestMoveUci.length >= 4 &&
    activeAnalyzedMove.bestMoveUci !== activeAnalyzedMove.uci
      ? {
          from: activeAnalyzedMove.bestMoveUci.slice(0, 2),
          to: activeAnalyzedMove.bestMoveUci.slice(2, 4),
        }
      : null);

  const botSpeech = useMemo(() => {
    if (!activeBot) return null;
    const botSide: Color = humanColor === 'w' ? 'b' : 'w';
    const isDraw = result === '1/2-1/2';
    const botWon = isGameOver && !isDraw && ((result === '1-0' && botSide === 'w') || (result === '0-1' && botSide === 'b'));
    return getBotMatchCommentary({
      bot: activeBot,
      moveCount: history.length,
      lastSan: sanMoves[sanMoves.length - 1] || '',
      isGameOver,
      botWon,
      isDraw,
      botThinking,
    });
  }, [activeBot, humanColor, result, isGameOver, history.length, sanMoves, botThinking]);

  const outcomeTitle =
    result === '1/2-1/2'
      ? resultReason === 'stalemate'
        ? 'Stalemate — Draw (½–½)'
        : 'Game Drawn (½–½)'
      : result === '1-0'
      ? `${whiteLabel} Won (1–0)`
      : `${blackLabel} Won (0–1)`;

  return (
    <div className="max-w-7xl mx-auto pb-8 space-y-3.5">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExit}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-stone-600 dark:text-[#C3C2C0] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 dark:text-[#9E9C98]">
          {activeBot ? (
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-800 dark:text-white mr-1">Engine:</span>
              {COMPUTER_BOTS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  disabled={botThinking}
                  onClick={() => handleSwitchBot(b)}
                  className={`px-2.5 py-1 rounded-md text-xs font-bold transition-colors cursor-pointer ${
                    activeBot.id === b.id
                      ? 'bg-[#81B64C] text-white'
                      : 'bg-stone-200/80 dark:bg-[#262421] text-stone-600 dark:text-[#C3C2C0]'
                  }`}
                >
                  {b.difficulty === 'ultra' ? 'H1 Ultra (2650)' : b.difficulty === 'pro' ? 'H1 Pro (2350)' : 'H1 Flash (2050)'}
                </button>
              ))}
            </div>
          ) : (
            <>
              <span className="font-bold text-slate-800 dark:text-white">2 Players · Pass &amp; Play</span>
              <button
                type="button"
                onClick={() => setAutoFlip((v) => !v)}
                className={`px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
                  autoFlip
                    ? 'bg-[#81B64C]/20 text-slate-900 dark:text-[#D5E8C0]'
                    : 'bg-stone-200/80 dark:bg-[#262421] text-stone-600 dark:text-[#9E9C98]'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5 text-[#81B64C]" />
                Auto-Flip: {autoFlip ? 'On' : 'Off'}
              </button>
            </>
          )}

          <button
            type="button"
            onClick={() => setShowEvalBar((v) => !v)}
            className={`px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
              showEvalBar
                ? 'bg-[#81B64C]/20 text-slate-900 dark:text-[#D5E8C0]'
                : 'bg-stone-200/80 dark:bg-[#262421] text-stone-600 dark:text-[#9E9C98]'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 text-[#81B64C]" />
            Eval
          </button>
        </div>
      </div>

      {/* Main Chess.com Split Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        <div className="xl:col-span-8 space-y-2">
          {/* Top Player Strip + Bot Speech Bubble */}
          <div className="max-w-[716px] mx-auto space-y-2">
            {topPlayer.bot && botSpeech && (
              <div className="pl-1">
                <div className="cc-speech-bubble px-3.5 py-2 text-xs font-medium leading-snug max-w-xl">
                  {botSpeech}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 px-2 py-1.5">
              <div className="flex items-center gap-2.5 min-w-0">
                {topPlayer.bot ? (
                  <PlayerAvatar src={topPlayer.bot.avatar} name={topPlayer.bot.name} size="sm" />
                ) : (
                  <span className={`w-8 h-8 rounded-md border-2 shrink-0 ${topPlayer.swatch}`} />
                )}
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                      {topPlayer.name}
                    </span>
                    {topPlayer.bot ? (
                      <>
                        <span className="font-mono text-xs text-stone-500 dark:text-[#9E9C98] tabular-nums">
                          ({topPlayer.bot.rating})
                        </span>
                        {topPlayer.bot.titleTag && (
                          <span
                            className={`cc-title-badge ${
                              topPlayer.bot.titleTag === 'GM'
                                ? 'cc-title-gm'
                                : topPlayer.bot.titleTag === 'IM'
                                ? 'cc-title-im'
                                : 'cc-title-fm'
                            }`}
                          >
                            {topPlayer.bot.titleTag}
                          </span>
                        )}
                        {topPlayer.bot.difficulty === 'ultra' && (
                          <span className="cc-title-badge cc-title-ultra">ULTRA</span>
                        )}
                      </>
                    ) : (
                      <span className="text-xs text-stone-500 dark:text-[#9E9C98]">({topPlayer.side})</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 min-h-[16px] mt-0.5">
                    <div className="flex items-center -space-x-1">
                      {topPlayer.captured.slice(0, 14).map((p, i) => (
                        <ChessPieceSvg
                          key={`${p}-${i}`}
                          type={p}
                          color={topPlayer.capturedColor}
                          style={settings.pieceStyle}
                          className="w-3.5 h-3.5 opacity-90"
                        />
                      ))}
                    </div>
                    {topPlayer.advantage > 0 && (
                      <span className="font-mono text-[11px] font-bold text-stone-500 dark:text-[#9E9C98] ml-1 tabular-nums">
                        +{topPlayer.advantage}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`px-3 py-1.5 rounded-[4px] font-mono text-xs font-bold tabular-nums shrink-0 flex items-center gap-1.5 ${
                  topPlayer.isTurn
                    ? 'bg-white dark:bg-[#F2F1EE] text-[#262421] shadow-sm'
                    : 'bg-stone-200/70 dark:bg-[#262421] text-stone-500 dark:text-[#8B8985]'
                }`}
              >
                {botThinking && topPlayer.bot ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin text-[#81B64C]" />
                    <span>Thinking</span>
                  </>
                ) : topPlayer.isTurn ? (
                  <span>To Move</span>
                ) : (
                  <span>Waiting</span>
                )}
              </div>
            </div>
          </div>

          {/* EvalBar + Board */}
          <div className="max-w-[716px] mx-auto flex items-stretch gap-2 relative">
            {showEvalBar && (
              <EvalBar
                evalCpWhite={fastEval.cpWhite}
                mateWhite={fastEval.mateWhite}
                orientation={boardOrientation}
                className="hidden sm:flex min-h-[320px]"
              />
            )}

            <div className="flex-1 max-w-[680px] relative">
              <ChessBoard
                fen={displayedPos.fen}
                orientation={boardOrientation}
                interactive={
                  !isGameOver &&
                  viewingPly === null &&
                  !botThinking &&
                  (!activeBot || liveTurn === humanColor)
                }
                allowedColor={activeBot ? humanColor : 'both'}
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
                <div className="absolute inset-0 z-30 bg-black/55 backdrop-blur-[2px] rounded-[4px] flex items-center justify-center p-4">
                  <div className="w-full max-w-xs sm:max-w-sm bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl shadow-2xl overflow-hidden text-center">
                    <div className="bg-[#81B64C] px-5 py-4 text-white relative">
                      <button
                        type="button"
                        onClick={() => setShowEndModal(false)}
                        aria-label="Close modal"
                        className="absolute top-3 right-3 p-1 rounded hover:bg-black/15 text-white/90 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      <Trophy className="w-7 h-7 mx-auto mb-1" />
                      <h3 className="font-display text-xl font-extrabold">{outcomeTitle}</h3>
                      <p className="text-xs text-white/90 font-medium mt-0.5">
                        by {formatResultReason(resultReason)} · {Math.ceil(history.length / 2)} moves
                      </p>
                    </div>
                    <div className="p-5 space-y-2.5">
                      <button
                        type="button"
                        disabled={sanMoves.length === 0 || analyzing}
                        onClick={() => void handleRunAnalysis()}
                        className="w-full py-3 rounded-lg btn-chess-primary text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <GraduationCap className="w-4 h-4" />
                        Game Review
                      </button>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => handleRematch(false)}
                          className="py-2.5 px-3 rounded-lg btn-chess-secondary text-xs cursor-pointer"
                        >
                          Rematch
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRematch(true)}
                          className="py-2.5 px-3 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <ArrowLeftRight className="w-3.5 h-3.5" />
                          Swap Color
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Player Strip */}
          <div className="max-w-[716px] mx-auto flex items-center justify-between gap-3 px-2 py-1.5">
            <div className="flex items-center gap-2.5 min-w-0">
              {bottomPlayer.bot ? (
                <PlayerAvatar src={bottomPlayer.bot.avatar} name={bottomPlayer.bot.name} size="sm" />
              ) : (
                <span className={`w-8 h-8 rounded-md border-2 shrink-0 ${bottomPlayer.swatch}`} />
              )}
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                    {bottomPlayer.name}
                  </span>
                  <span className="text-xs text-stone-500 dark:text-[#9E9C98]">({bottomPlayer.side})</span>
                </div>
                <div className="flex items-center gap-1 min-h-[16px] mt-0.5">
                  <div className="flex items-center -space-x-1">
                    {bottomPlayer.captured.slice(0, 14).map((p, i) => (
                      <ChessPieceSvg
                        key={`${p}-${i}`}
                        type={p}
                        color={bottomPlayer.capturedColor}
                        style={settings.pieceStyle}
                        className="w-3.5 h-3.5 opacity-90"
                      />
                    ))}
                  </div>
                  {bottomPlayer.advantage > 0 && (
                    <span className="font-mono text-[11px] font-bold text-stone-500 dark:text-[#9E9C98] ml-1 tabular-nums">
                      +{bottomPlayer.advantage}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div
              className={`px-3 py-1.5 rounded-[4px] font-mono text-xs font-bold tabular-nums shrink-0 ${
                bottomPlayer.isTurn
                  ? 'bg-[#81B64C] text-white shadow-sm'
                  : 'bg-stone-200/70 dark:bg-[#262421] text-stone-500 dark:text-[#8B8985]'
              }`}
            >
              {bottomPlayer.isTurn ? 'Your Turn' : 'Waiting'}
            </div>
          </div>

          {(analyzing || analysis || analysisError) && (
            <div className="max-w-[716px] mx-auto pt-2">
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

        {/* Right Chess.com Console */}
        <aside className="xl:col-span-4 bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl flex flex-col overflow-hidden shadow-lg">
          <div className="px-4 py-3 bg-stone-50 dark:bg-[#211F1C] border-b border-[#DFDDD8] dark:border-[#353330] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-display font-extrabold text-sm text-slate-900 dark:text-white truncate">
                {isGameOver
                  ? outcomeTitle
                  : isInCheckNow
                  ? `Check! · ${liveTurn === 'w' ? whiteLabel : blackLabel} to Move`
                  : `${liveTurn === 'w' ? whiteLabel : blackLabel} to Move`}
              </p>
              <p className="text-[11px] text-stone-500 dark:text-[#9E9C98] truncate">
                {isGameOver
                  ? formatResultReason(resultReason)
                  : botThinking && activeBot
                  ? `${activeBot.name} calculating...`
                  : 'Click or drag pieces · Right-click to draw arrows'}
              </p>
            </div>
            <span className="px-2 py-0.5 rounded bg-stone-200/80 dark:bg-[#312F2C] font-mono text-[11px] font-bold text-stone-600 dark:text-[#C3C2C0] tabular-nums shrink-0">
              Move {Math.floor(history.length / 2) + 1}
            </span>
          </div>

          <div className="px-4 py-2 bg-stone-100/70 dark:bg-[#1F1E1B] border-b border-[#DFDDD8] dark:border-[#353330] flex items-center gap-2 text-xs">
            <BookOpen className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />
            {opening ? (
              <>
                <span className="font-mono font-bold text-stone-500 dark:text-[#9E9C98]">{opening.eco}</span>
                <span className="text-slate-800 dark:text-[#E7E6E4] font-semibold truncate">{opening.name}</span>
              </>
            ) : (
              <span className="text-stone-500 dark:text-[#9E9C98] font-medium">Starting Position</span>
            )}
          </div>

          {drawOfferedBy && !isGameOver && (
            <div className="p-3 bg-amber-500/12 border-b border-amber-500/30 flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                {drawOfferedBy === 'w' ? whiteLabel : blackLabel} offered a draw
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={handleAgreeDrawDirect}
                  className="px-2.5 py-1 rounded bg-[#81B64C] text-white text-xs font-bold cursor-pointer"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => setDrawOfferedBy(null)}
                  className="px-2.5 py-1 rounded bg-stone-200 dark:bg-[#312F2C] text-stone-700 dark:text-[#C3C2C0] text-xs font-semibold cursor-pointer"
                >
                  Decline
                </button>
              </div>
            </div>
          )}

          {/* Zebra Move List with Figurine Notation */}
          <div ref={moveListRef} className="flex-1 min-h-[260px] max-h-[380px] overflow-y-auto">
            {movePairs.length === 0 ? (
              <div className="h-full min-h-[220px] flex flex-col items-center justify-center text-center text-xs text-stone-400 dark:text-[#8B8985] px-4">
                <p>White moves first.</p>
                <p className="mt-1">
                  {activeBot ? `Challenge ${activeBot.name} (${activeBot.rating}) right on the board.` : 'Pass the device or play side-by-side.'}
                </p>
              </div>
            ) : (
              <div className="font-mono text-xs tabular-nums">
                {movePairs.map((row, idx) => (
                  <div
                    key={row.num}
                    className={`grid grid-cols-12 items-center px-2 py-1 ${
                      idx % 2 === 0 ? 'bg-transparent' : 'bg-stone-50/90 dark:bg-[#2B2926]'
                    }`}
                  >
                    <span className="col-span-2 px-1.5 text-stone-400 dark:text-[#8B8985]">{row.num}.</span>
                    <button
                      type="button"
                      onClick={() => setViewingPly(row.wPly === history.length ? null : row.wPly)}
                      className={`col-span-5 py-1 px-2 text-left rounded-[4px] font-semibold cursor-pointer ${
                        activePly === row.wPly
                          ? 'bg-[#81B64C]/25 dark:bg-[#48453F] text-slate-900 dark:text-white font-bold'
                          : 'text-slate-800 dark:text-[#DFDEDB] hover:bg-stone-200/60 dark:hover:bg-[#383531]'
                      }`}
                    >
                      {formatSanWithFigurine(row.white, 'w')}
                    </button>
                    {row.black ? (
                      <button
                        type="button"
                        onClick={() => setViewingPly(row.bPly === history.length ? null : (row.bPly ?? null))}
                        className={`col-span-5 py-1 px-2 text-left rounded-[4px] font-semibold cursor-pointer ${
                          activePly === row.bPly
                            ? 'bg-[#81B64C]/25 dark:bg-[#48453F] text-slate-900 dark:text-white font-bold'
                            : 'text-slate-800 dark:text-[#DFDEDB] hover:bg-stone-200/60 dark:hover:bg-[#383531]'
                        }`}
                      >
                        {formatSanWithFigurine(row.black, 'b')}
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
          <div className="px-3 py-2 border-t border-[#DFDDD8] dark:border-[#353330] flex items-center justify-between gap-1 bg-stone-50 dark:bg-[#1F1E1B]">
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                disabled={history.length === 0}
                onClick={() => setViewingPly(0)}
                className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] disabled:opacity-35 cursor-pointer"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={activePly <= 0}
                onClick={() => setViewingPly(Math.max(0, activePly - 1))}
                className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] disabled:opacity-35 cursor-pointer"
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
                className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] disabled:opacity-35 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                type="button"
                disabled={viewingPly === null}
                onClick={() => setViewingPly(null)}
                className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] disabled:opacity-35 cursor-pointer"
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
                className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] cursor-pointer"
                title="Flip board (F)"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={onToggleSound}
                className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] cursor-pointer"
              >
                {settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy('pgn')}
                className="px-2 py-1 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-[11px] font-mono font-bold text-stone-600 dark:text-[#C3C2C0] cursor-pointer"
              >
                {copiedType === 'pgn' ? '✓ PGN' : 'PGN'}
              </button>
              <button
                type="button"
                onClick={handleDownloadPgn}
                className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => void handleCopy('fen')}
                className="px-2 py-1 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-[11px] font-mono font-bold text-stone-600 dark:text-[#C3C2C0] cursor-pointer"
              >
                {copiedType === 'fen' ? '✓ FEN' : 'FEN'}
              </button>
            </div>
          </div>

          {/* Match Controls */}
          <div className="p-3.5 border-t border-[#DFDDD8] dark:border-[#353330] space-y-2">
            {isGameOver ? (
              <div className="space-y-2">
                <button
                  type="button"
                  disabled={sanMoves.length === 0 || analyzing}
                  onClick={() => void handleRunAnalysis()}
                  className="w-full py-2.5 px-4 rounded-lg btn-chess-primary text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <GraduationCap className="w-4 h-4" />
                  {analyzing ? 'Reviewing...' : 'Game Review'}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleRematch(false)}
                    className="py-2 rounded-lg btn-chess-secondary text-xs cursor-pointer"
                  >
                    New Game
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRematch(true)}
                    className="py-2 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeftRight className="w-3.5 h-3.5" />
                    Swap Color
                  </button>
                </div>
              </div>
            ) : confirmResign ? (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
                <span className="text-xs font-bold text-red-600 dark:text-red-400">Resign game?</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={handleResignCurrentSide}
                    className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-bold cursor-pointer"
                  >
                    Resign
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmResign(false)}
                    className="px-2.5 py-1 rounded bg-stone-200 dark:bg-[#312F2C] text-stone-700 dark:text-[#C3C2C0] text-xs font-semibold cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : activeBot ? (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={history.length === 0 || botThinking}
                  onClick={handleTakeback}
                  className="py-2 px-2.5 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Takeback
                </button>
                <button
                  type="button"
                  disabled={botThinking || liveTurn !== humanColor}
                  onClick={handleRequestHint}
                  className="py-2 px-2.5 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                  Hint
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResign(true)}
                  className="py-2 px-2.5 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 hover:!text-red-400 cursor-pointer"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Resign
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  disabled={history.length === 0}
                  onClick={handleTakeback}
                  className="py-2 px-2.5 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-40 cursor-pointer"
                >
                  <Undo2 className="w-3.5 h-3.5" />
                  Takeback
                </button>
                <button
                  type="button"
                  onClick={handleOfferOrAcceptDraw}
                  className="py-2 px-2.5 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Handshake className="w-3.5 h-3.5" />
                  {drawOfferedBy ? 'Accept' : 'Draw'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmResign(true)}
                  className="py-2 px-2.5 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 hover:!text-red-400 cursor-pointer"
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
