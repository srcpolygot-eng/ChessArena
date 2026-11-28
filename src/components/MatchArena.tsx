import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type PieceSymbol } from 'chess.js';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Copy,
  Check,
  Download,
  Flag,
  GraduationCap,
  Handshake,
  Lightbulb,
  MessageSquare,
  RotateCcw,
  Volume2,
  VolumeX,
  AlertCircle,
  Trophy,
  ChevronLeft,
  ChevronRight,
  SkipBack,
  SkipForward,
  Wifi,
  WifiOff,
  Loader2,
  X,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  COMPUTER_BOTS,
  MINIMAX_H1_FLASH,
  computeBestBotMove,
  evaluatePositionFast,
  formatResultReason,
  formatSanWithFigurine,
  getBotMatchCommentary,
  getCapturedPieces,
  validateMoveLocally,
} from '../lib/chessEngine';
import { computeBestBotMoveAsync } from '../lib/botWorkerClient';
import { createChessFromInitialFen } from '../lib/chess960';
import { askCoachPosition, type CoachPositionReport } from '../lib/coachEngine';
import { detectOpening } from '../lib/openings';
import {
  buildPgnFilename,
  downloadPgnFile,
  generateMatchPgnFromMatch,
} from '../lib/pgn';
import {
  analyzeMatchWithStockfish,
  type AnalysisProgress,
  type GameAnalysisResult,
  type MoveClassification,
} from '../lib/stockfishAnalyzer';
import {
  acceptDraw,
  applyMatchStatsForUser,
  cancelPrivateMatch,
  declineDraw,
  offerDraw,
  resignMatch,
  sendMatchHeartbeat,
  submitValidatedMove,
} from '../lib/firestoreService';
import { useChessAudio } from '../contexts/ChessAudioContext';
import {
  DEFAULT_LOCAL_PLAY_PREFERENCES,
  type ChessMatch,
  type ComputerBot,
  type LocalPlayPreferences,
  type UserPrivateProfile,
  type UserSettings,
} from '../types/chess';
import { ChessBoard } from './ChessBoard';
import { ChessPieceSvg } from './ChessPieces';
import { EvalBar } from './EvalBar';
import { GameAnalysisPanel } from './GameAnalysisPanel';
import { PlayerAvatar } from './PlayerAvatar';

interface MatchArenaProps {
  matchId: string;
  user: UserPrivateProfile;
  settings: UserSettings;
  localPrefs?: LocalPlayPreferences;
  onToggleSound: () => void;
  onExitMatch: () => void;
  onPlayAgain: () => void;
}

interface OptimisticPreview {
  fen: string;
  from: string;
  to: string;
  moves: string[];
  turn: Color;
  moveCount: number;
}

function renderMoveQualityBadge(cls?: MoveClassification) {
  if (!cls) return null;
  switch (cls) {
    case 'best':
      return (
        <span className="ml-1 px-1 py-0.2 rounded bg-[#81B64C]/25 text-[#81B64C] text-[9px] font-extrabold">
          ★
        </span>
      );
    case 'inaccuracy':
      return (
        <span className="ml-1 px-1 py-0.2 rounded bg-sky-500/20 text-sky-400 text-[9px] font-extrabold">
          ?!
        </span>
      );
    case 'mistake':
      return (
        <span className="ml-1 px-1 py-0.2 rounded bg-amber-500/20 text-amber-400 text-[9px] font-extrabold">
          ?
        </span>
      );
    case 'blunder':
      return (
        <span className="ml-1 px-1 py-0.2 rounded bg-red-500/25 text-red-400 text-[9px] font-extrabold">
          ??
        </span>
      );
    default:
      return null;
  }
}

export const MatchArena: React.FC<MatchArenaProps> = ({
  matchId,
  user,
  settings,
  localPrefs = DEFAULT_LOCAL_PLAY_PREFERENCES,
  onToggleSound,
  onExitMatch,
  onPlayAgain,
}) => {
  const [match, setMatch] = useState<ChessMatch | null>(null);
  const [optimistic, setOptimistic] = useState<OptimisticPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingMove, setSubmittingMove] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [copiedPgn, setCopiedPgn] = useState(false);
  const [copiedFen, setCopiedFen] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [viewingPly, setViewingPly] = useState<number | null>(null);
  const [botThinking, setBotThinking] = useState(false);
  const [nowTick, setNowTick] = useState(Date.now());
  const [showEvalBar, setShowEvalBar] = useState(true);
  const [showBotChat, setShowBotChat] = useState(true);
  const [hintSquares, setHintSquares] = useState<{ from: string; to: string } | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);
  const [premove, setPremove] = useState<{ from: string; to: string } | null>(null);
  const [coachAdvice, setCoachAdvice] = useState<CoachPositionReport | null>(null);
  const [coachLoading, setCoachLoading] = useState(false);

  // Post-match Coach review state
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgress | null>(null);
  const [analysisResult, setAnalysisResult] = useState<GameAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showAnalysis, setShowAnalysis] = useState(false);

  const { playSound, playMoveFromSan, playGameResult } = useChessAudio();

  const prevMoveCountRef = useRef<number>(0);
  const prevStatusRef = useRef<ChessMatch['status'] | null>(null);
  const optimisticMoveCountRef = useRef<number>(0);
  const moveListRef = useRef<HTMLDivElement | null>(null);
  const analysisAbortRef = useRef<AbortController | null>(null);

  // Real-time Firestore match listener
  useEffect(() => {
    setLoading(true);
    setError(null);
    setOptimistic(null);
    setHintSquares(null);
    setPremove(null);
    setCoachAdvice(null);
    setShowEndModal(false);
    setAnalysisResult(null);
    setShowAnalysis(false);
    prevMoveCountRef.current = 0;
    prevStatusRef.current = null;
    optimisticMoveCountRef.current = 0;

    const matchRef = doc(db, 'matches', matchId);
    const unsub = onSnapshot(
      matchRef,
      (snap) => {
        if (!snap.exists()) {
          setError('Match not found.');
          setLoading(false);
          return;
        }
        const data = snap.data() as ChessMatch;
        setMatch(data);
        setLoading(false);

        if (data.moveCount >= optimisticMoveCountRef.current) {
          setOptimistic(null);
        }

        const isInitialSnapshot = prevStatusRef.current === null;
        const hadNewMove = !isInitialSnapshot && data.moveCount > prevMoveCountRef.current;
        const alreadyPlayedOptimistically = data.moveCount <= optimisticMoveCountRef.current;
        const justCompleted =
          !isInitialSnapshot &&
          prevStatusRef.current !== 'completed' &&
          data.status === 'completed';

        if (hadNewMove) {
          setHintSquares(null);
          setCoachAdvice(null);
          const lastSan = data.moves[data.moves.length - 1] || '';
          if (justCompleted) {
            if (data.resultReason === 'stalemate') {
              playSound('stalemate');
            } else {
              playGameResult({ result: data.result, winnerId: data.winnerId, currentUid: user.uid });
            }
            setShowEndModal(true);
          } else if (!alreadyPlayedOptimistically && data.status === 'active') {
            playMoveFromSan(lastSan);
          }
          setViewingPly(null);
        } else if (justCompleted) {
          if (data.resultReason === 'stalemate') {
            playSound('stalemate');
          } else {
            playGameResult({ result: data.result, winnerId: data.winnerId, currentUid: user.uid });
          }
          setShowEndModal(true);
        }

        prevMoveCountRef.current = data.moveCount;
        prevStatusRef.current = data.status;
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `matches/${matchId}`, false);
        setError('Unable to subscribe to match updates.');
        setLoading(false);
      }
    );

    return () => {
      unsub();
      analysisAbortRef.current?.abort();
    };
  }, [matchId, user.uid, playSound, playMoveFromSan, playGameResult]);

  // Apply Elo & W/L/D stats idempotently as soon as the match finishes
  useEffect(() => {
    if (!match || match.status !== 'completed') return;
    void applyMatchStatsForUser(match, user.uid);
  }, [match, user.uid]);

  // Presence heartbeat inside live match
  useEffect(() => {
    if (!match || (match.status !== 'active' && match.status !== 'waiting')) return;
    const side = match.whiteId === user.uid ? 'white' : match.blackId === user.uid ? 'black' : null;
    if (!side) return;

    void sendMatchHeartbeat(match.matchId, side);
    const timer = window.setInterval(() => {
      void sendMatchHeartbeat(match.matchId, side);
      setNowTick(Date.now());
    }, 25000);

    return () => window.clearInterval(timer);
  }, [match?.matchId, match?.status, match?.whiteId, match?.blackId, user.uid]);

  const effectiveMoves = optimistic ? optimistic.moves : match?.moves ?? [];
  const effectiveMoveCount = optimistic ? optimistic.moveCount : match?.moveCount ?? 0;
  const effectiveTurn: Color = optimistic ? optimistic.turn : match?.turn ?? 'w';
  const effectiveFen = optimistic ? optimistic.fen : match?.fen ?? new Chess().fen();
  const effectiveLastFrom = optimistic ? optimistic.from : match?.lastMoveFrom ?? '';
  const effectiveLastTo = optimistic ? optimistic.to : match?.lastMoveTo ?? '';

  // Auto-scroll move list
  useEffect(() => {
    if (moveListRef.current) {
      moveListRef.current.scrollTop = moveListRef.current.scrollHeight;
    }
  }, [effectiveMoveCount]);

  const userColor: Color | null = useMemo(() => {
    if (!match) return null;
    if (match.whiteId === user.uid) return 'w';
    if (match.blackId === user.uid) return 'b';
    return null;
  }, [match, user.uid]);

  const activeBot: ComputerBot | null = useMemo(() => {
    if (!match || match.mode !== 'computer' || !userColor) return null;
    const botId = userColor === 'w' ? match.blackId : match.whiteId;
    return COMPUTER_BOTS.find((b) => b.id === botId) || MINIMAX_H1_FLASH;
  }, [match, userColor]);

  const activeBotName = activeBot?.name || 'MiniMax H1 Ultra';

  // Build position list for move history inspection & repetition awareness
  const replayPositions = useMemo(() => {
    const c = createChessFromInitialFen(match?.initialFen);
    const positions: { fen: string; from: string; to: string }[] = [{ fen: c.fen(), from: '', to: '' }];
    for (const san of effectiveMoves) {
      const m = c.move(san);
      if (!m) break;
      positions.push({ fen: c.fen(), from: m.from, to: m.to });
    }
    return positions;
  }, [effectiveMoves, match?.initialFen]);

  // Computer AI move automation (MiniMax H1 Flash, H1 Pro & H1 Ultra via Web Worker)
  useEffect(() => {
    if (!match || match.mode !== 'computer' || match.status !== 'active' || !userColor) return;
    const botColor: Color = userColor === 'w' ? 'b' : 'w';
    if (match.turn !== botColor) return;

    const botId = botColor === 'w' ? match.whiteId : match.blackId;
    const bot = COMPUTER_BOTS.find((b) => b.id === botId) || MINIMAX_H1_FLASH;

    let cancelled = false;
    const workerAbort = new AbortController();
    setBotThinking(true);

    // Build prior position keys from authoritative match.moves for repetition contempt
    const historyChess = createChessFromInitialFen(match.initialFen);
    const priorKeys: string[] = [historyChess.fen()];
    for (const san of match.moves) {
      if (!historyChess.move(san)) break;
      priorKeys.push(historyChess.fen());
    }

    const delayMs = bot.responseDelayMs ?? 35;
    const timeout = window.setTimeout(async () => {
      try {
        const best = await computeBestBotMoveAsync(match.fen, bot, priorKeys, workerAbort.signal);
        if (best && !cancelled) {
          await submitValidatedMove({
            match,
            actorUid: user.uid,
            from: best.from,
            to: best.to,
            promotion: best.promotion,
          });
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Computer move failed.');
        }
      } finally {
        if (!cancelled) {
          setBotThinking(false);
        }
      }
    }, delayMs);

    return () => {
      cancelled = true;
      workerAbort.abort();
      window.clearTimeout(timeout);
      setBotThinking(false);
    };
  }, [match?.fen, match?.turn, match?.status, match?.moveCount, match?.mode, userColor, user.uid]);

  const displayedPosition = useMemo(() => {
    if (viewingPly !== null && replayPositions[viewingPly]) {
      return replayPositions[viewingPly];
    }
    return { fen: effectiveFen, from: effectiveLastFrom, to: effectiveLastTo };
  }, [viewingPly, replayPositions, effectiveFen, effectiveLastFrom, effectiveLastTo]);

  const currentPly = viewingPly ?? effectiveMoveCount;

  // Live ECO opening detection
  const currentOpening = useMemo(
    () => detectOpening(effectiveMoves.slice(0, currentPly)),
    [effectiveMoves, currentPly]
  );

  // Eval Bar is permitted only in computer mode or after any match concludes (fair play)
  const canUseEvalBar = match?.mode === 'computer' || match?.status === 'completed';

  const evalScore = useMemo(() => {
    if (!canUseEvalBar || !showEvalBar) return { cpWhite: 0, mateWhite: null as number | null };
    if (analysisResult && analysisResult.evalSeriesWhiteCp[currentPly] !== undefined) {
      return { cpWhite: analysisResult.evalSeriesWhiteCp[currentPly], mateWhite: null as number | null };
    }
    return evaluatePositionFast(displayedPosition.fen);
  }, [canUseEvalBar, showEvalBar, analysisResult, currentPly, displayedPosition.fen]);

  const capturedSummary = useMemo(() => getCapturedPieces(displayedPosition.fen), [displayedPosition.fen]);

  const isInCheckNow = useMemo(() => {
    try {
      return new Chess(displayedPosition.fen).inCheck();
    } catch {
      return false;
    }
  }, [displayedPosition.fen]);

  // Bot live speech bubble line
  const botSpeechLine = useMemo(() => {
    if (!activeBot || !match) return null;
    const isOver = match.status === 'completed';
    const isDraw = match.result === '1/2-1/2';
    const botWon = isOver && !isDraw && match.winnerId !== user.uid;
    return getBotMatchCommentary({
      bot: activeBot,
      moveCount: effectiveMoveCount,
      lastSan: effectiveMoves[effectiveMoves.length - 1] || '',
      isGameOver: isOver,
      botWon,
      isDraw,
      botThinking,
    });
  }, [activeBot, match, effectiveMoveCount, effectiveMoves, user.uid, botThinking]);

  // Keyboard shortcuts (←, →, Home, End, F to flip)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setViewingPly((prev) => {
          const cur = prev ?? effectiveMoveCount;
          return Math.max(0, cur - 1);
        });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setViewingPly((prev) => {
          if (prev === null) return null;
          const next = prev + 1;
          return next >= effectiveMoveCount ? null : next;
        });
      } else if (e.key === 'Home') {
        e.preventDefault();
        if (effectiveMoveCount > 0) setViewingPly(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setViewingPly(null);
      } else if (e.key.toLowerCase() === 'f') {
        setFlipped((f) => !f);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [effectiveMoveCount]);

  const handlePlayerMove = useCallback(
    async (from: string, to: string, promotion?: PieceSymbol) => {
      if (!match || !userColor || match.status !== 'active' || submittingMove) return;
      if (viewingPly !== null) return;
      if (effectiveTurn !== userColor) {
        playSound('illegal');
        return;
      }

      const preview = validateMoveLocally({
        fen: match.fen,
        initialFen: match.initialFen,
        moves: match.moves,
        from,
        to,
        promotion,
        whiteRating: match.whiteRating,
        blackRating: match.blackRating,
        isRated: match.mode !== 'computer',
      });
      if (!preview.valid) {
        playSound('illegal');
        return;
      }

      const nextMoveCount = match.moveCount + 1;
      optimisticMoveCountRef.current = nextMoveCount;
      setHintSquares(null);
      setCoachAdvice(null);
      setPremove(null);
      setOptimistic({
        fen: preview.fen,
        from,
        to,
        moves: preview.moves,
        turn: preview.turn,
        moveCount: nextMoveCount,
      });

      if (!preview.isGameOver) {
        playMoveFromSan(preview.san);
      }

      setSubmittingMove(true);
      setError(null);
      try {
        await submitValidatedMove({
          match,
          actorUid: user.uid,
          from,
          to,
          promotion,
        });
      } catch (err) {
        optimisticMoveCountRef.current = match.moveCount;
        setOptimistic(null);
        playSound('illegal');
        setError(err instanceof Error ? err.message : 'Move could not be submitted.');
      } finally {
        setSubmittingMove(false);
      }
    },
    [match, userColor, submittingMove, viewingPly, effectiveTurn, playSound, playMoveFromSan, user.uid]
  );

  // Auto-execute queued premove when turn arrives
  useEffect(() => {
    if (!premove || !match || !userColor) return;
    if (match.status !== 'active') {
      setPremove(null);
      return;
    }
    if (effectiveTurn !== userColor || viewingPly !== null || submittingMove || botThinking) {
      return;
    }
    const queued = premove;
    setPremove(null);

    let promo: PieceSymbol | undefined;
    try {
      const checkBoard = new Chess(match.fen);
      const piece = checkBoard.get(queued.from as Parameters<Chess['get']>[0]);
      if (piece?.type === 'p' && (queued.to[1] === '8' || queued.to[1] === '1')) {
        promo = 'q';
      }
    } catch {
      return;
    }

    const test = validateMoveLocally({
      fen: match.fen,
      initialFen: match.initialFen,
      moves: match.moves,
      from: queued.from,
      to: queued.to,
      promotion: promo,
      whiteRating: match.whiteRating,
      blackRating: match.blackRating,
      isRated: match.mode !== 'computer',
    });

    if (test.valid) {
      void handlePlayerMove(queued.from, queued.to, promo);
    }
  }, [premove, match, userColor, effectiveTurn, viewingPly, submittingMove, botThinking, handlePlayerMove]);

  const handleRequestHint = () => {
    if (!match || match.mode !== 'computer' || match.status !== 'active') return;
    if (viewingPly !== null) return;
    const best = computeBestBotMove(displayedPosition.fen, MINIMAX_H1_FLASH);
    if (best) {
      setHintSquares({ from: best.from, to: best.to });
      playSound('notify');
    }
  };

  const handleAskCoach = useCallback(async () => {
    if (!match || coachLoading) return;
    if (match.mode !== 'computer' && match.status !== 'completed') return;
    setCoachLoading(true);
    try {
      const report = await askCoachPosition(displayedPosition.fen, { depth: 12, movetimeMs: 260, multiPv: 1 });
      setCoachAdvice(report);
      if (report.bestMoveUci && report.bestMoveUci.length >= 4) {
        setHintSquares({ from: report.bestMoveUci.slice(0, 2), to: report.bestMoveUci.slice(2, 4) });
      }
      playSound('notify');
    } catch {
      setError('Coach could not inspect this position right now.');
    } finally {
      setCoachLoading(false);
    }
  }, [match, coachLoading, displayedPosition.fen, playSound]);

  const handleRunAnalysis = useCallback(async () => {
    if (!match || match.moves.length === 0) return;
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;

    setShowEndModal(false);
    setShowAnalysis(true);
    setShowEvalBar(true);
    setAnalyzing(true);
    setAnalysisError(null);
    setAnalysisProgress({
      completed: 0,
      total: match.moves.length + 1,
      engineName: 'Coach',
    });

    try {
      const result = await analyzeMatchWithStockfish({
        moves: match.moves,
        initialFen: match.initialFen,
        depth: 10,
        signal: controller.signal,
        onProgress: (p: AnalysisProgress) => setAnalysisProgress(p),
      });
      setAnalysisResult(result);
    } catch (err) {
      if ((err as Error)?.name !== 'AbortError') {
        setAnalysisError(err instanceof Error ? err.message : 'Coach review failed.');
      }
    } finally {
      setAnalyzing(false);
    }
  }, [match]);

  const fullPgn = useMemo(() => {
    if (!match) return '';
    return generateMatchPgnFromMatch({
      ...match,
      moves: effectiveMoves,
    });
  }, [match, effectiveMoves]);

  const handleCopyPgn = async () => {
    if (!match || !fullPgn) return;
    try {
      await navigator.clipboard.writeText(fullPgn);
      setCopiedPgn(true);
      setTimeout(() => setCopiedPgn(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadPgn = () => {
    if (!match || !fullPgn) return;
    const matchDate = match.completedAt?.toDate() || match.createdAt?.toDate() || null;
    const filename = buildPgnFilename(
      match.whiteUsername || match.whiteDisplayName || 'White',
      match.blackUsername || match.blackDisplayName || 'Black',
      matchDate
    );
    downloadPgnFile(fullPgn, filename);
  };

  const handleCopyFen = async () => {
    try {
      await navigator.clipboard.writeText(displayedPosition.fen);
      setCopiedFen(true);
      setTimeout(() => setCopiedFen(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCopyInviteLink = async () => {
    if (!match?.roomCode) return;
    const url = `${window.location.origin}${window.location.pathname}?join=${match.roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedInvite(true);
      setTimeout(() => setCopiedInvite(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleCancelWaitingRoom = async () => {
    if (!match) return;
    try {
      await cancelPrivateMatch(match.matchId, match.roomCode);
      onExitMatch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel waiting room.');
    }
  };

  const handleAcceptDraw = async () => {
    if (!match) return;
    try {
      await acceptDraw(match);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to accept draw.');
    }
  };

  const handleDeclineDraw = async () => {
    if (!match) return;
    try {
      await declineDraw(match.matchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to decline draw.');
    }
  };

  const handleOfferDraw = async () => {
    if (!match) return;
    try {
      await offerDraw(match.matchId, user.uid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to send draw offer.');
    }
  };

  const handleResign = async () => {
    if (!match) return;
    setConfirmResign(false);
    try {
      await resignMatch(match, user.uid);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to resign match.');
    }
  };

  // Best-move arrow from Coach review when inspecting a completed match
  const activeHintSquares = useMemo(() => {
    if (hintSquares) return hintSquares;
    if (analysisResult && currentPly > 0) {
      const m = analysisResult.moves[currentPly - 1];
      if (m && m.bestMoveUci && m.bestMoveUci.length >= 4 && m.bestMoveUci !== m.uci) {
        return { from: m.bestMoveUci.slice(0, 2), to: m.bestMoveUci.slice(2, 4) };
      }
    }
    return null;
  }, [hintSquares, analysisResult, currentPly]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-stone-500 dark:text-[#9E9C98]">
        <Loader2 className="w-7 h-7 animate-spin text-[#81B64C]" />
        <p className="text-sm font-semibold">Loading live chessboard...</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-6 text-center">
        <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
          {error || 'Match could not be loaded.'}
        </p>
        <button
          type="button"
          onClick={onExitMatch}
          className="px-4 py-2 rounded-lg btn-chess-primary text-xs cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const baseOrientation: Color = userColor === 'b' ? 'b' : 'w';
  const boardOrientation: Color = flipped ? (baseOrientation === 'w' ? 'b' : 'w') : baseOrientation;

  const getBotMetaForId = (pid: string): ComputerBot | null =>
    pid.startsWith('computer_') ? COMPUTER_BOTS.find((b) => b.id === pid) || null : null;

  const topIsWhite = boardOrientation === 'b';
  const topPlayer = topIsWhite
    ? {
        id: match.whiteId,
        username: match.whiteUsername,
        displayName: match.whiteDisplayName,
        photoURL: match.whitePhotoURL,
        rating: match.whiteRating,
        lastSeen: match.whiteLastSeen,
        captured: capturedSummary.capturedByWhite,
        advantage: capturedSummary.whiteAdvantage,
        capturedPieceColor: 'b' as Color,
        isTurn: effectiveTurn === 'w' && match.status === 'active',
        botMeta: getBotMetaForId(match.whiteId),
      }
    : {
        id: match.blackId,
        username: match.blackUsername,
        displayName: match.blackDisplayName,
        photoURL: match.blackPhotoURL,
        rating: match.blackRating,
        lastSeen: match.blackLastSeen,
        captured: capturedSummary.capturedByBlack,
        advantage: capturedSummary.blackAdvantage,
        capturedPieceColor: 'w' as Color,
        isTurn: effectiveTurn === 'b' && match.status === 'active',
        botMeta: getBotMetaForId(match.blackId),
      };

  const bottomPlayer = topIsWhite
    ? {
        id: match.blackId,
        username: match.blackUsername,
        displayName: match.blackDisplayName,
        photoURL: match.blackPhotoURL,
        rating: match.blackRating,
        lastSeen: match.blackLastSeen,
        captured: capturedSummary.capturedByBlack,
        advantage: capturedSummary.blackAdvantage,
        capturedPieceColor: 'w' as Color,
        isTurn: effectiveTurn === 'b' && match.status === 'active',
        botMeta: getBotMetaForId(match.blackId),
      }
    : {
        id: match.whiteId,
        username: match.whiteUsername,
        displayName: match.whiteDisplayName,
        photoURL: match.whitePhotoURL,
        rating: match.whiteRating,
        lastSeen: match.whiteLastSeen,
        captured: capturedSummary.capturedByWhite,
        advantage: capturedSummary.whiteAdvantage,
        capturedPieceColor: 'b' as Color,
        isTurn: effectiveTurn === 'w' && match.status === 'active',
        botMeta: getBotMetaForId(match.whiteId),
      };

  const isPlayerConnected = (playerId: string, lastSeen: ChessMatch['whiteLastSeen']) => {
    if (match.mode === 'computer' && playerId.startsWith('computer_')) return true;
    if (!playerId) return false;
    if (playerId === user.uid) return true;
    if (!lastSeen) return false;
    return nowTick - lastSeen.toMillis() < 75000;
  };

  const isUserTurn =
    match.status === 'active' &&
    userColor !== null &&
    effectiveTurn === userColor &&
    viewingPly === null &&
    !submittingMove;

  const incomingDrawOffer =
    match.status === 'active' && match.drawOfferBy !== '' && match.drawOfferBy !== user.uid;
  const outgoingDrawOffer =
    match.status === 'active' && match.drawOfferBy === user.uid;

  // Group SAN moves into numbered pairs
  const movePairs: { num: number; white: string; black?: string; wPly: number; bPly?: number }[] = [];
  for (let i = 0; i < effectiveMoves.length; i += 2) {
    movePairs.push({
      num: Math.floor(i / 2) + 1,
      white: effectiveMoves[i],
      black: effectiveMoves[i + 1],
      wPly: i + 1,
      bPly: effectiveMoves[i + 1] ? i + 2 : undefined,
    });
  }

  const userDelta = userColor === 'w' ? match.whiteRatingDelta : userColor === 'b' ? match.blackRatingDelta : 0;

  const renderTitlePills = (botMeta: ComputerBot | null) => {
    if (!botMeta) return null;
    const tag = botMeta.titleTag || 'BOT';
    const cls =
      tag === 'GM'
        ? 'cc-title-badge cc-title-gm'
        : tag === 'IM'
        ? 'cc-title-badge cc-title-im'
        : 'cc-title-badge cc-title-fm';
    return (
      <>
        <span className={cls}>{tag}</span>
        {botMeta.difficulty === 'ultra' && (
          <span className="cc-title-badge cc-title-ultra">ULTRA</span>
        )}
      </>
    );
  };

  return (
    <div className="max-w-7xl mx-auto pb-8 space-y-3.5">
      {/* Top Match Utility Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExitMatch}
          className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bold text-stone-600 dark:text-[#C3C2C0] hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Exit Match
        </button>

        <div className="flex flex-wrap items-center gap-2.5 text-xs text-stone-500 dark:text-[#9E9C98]">
          <span className="capitalize font-bold text-slate-800 dark:text-[#E7E6E4]">
            {match.mode === 'computer' ? `vs ${activeBotName}` : `${match.mode} Match`}
          </span>
          {match.variant === 'chess960' && (
            <span className="px-1.5 py-0.5 rounded bg-[#81B64C]/20 font-mono font-bold text-[#81B64C]">
              Chess960
            </span>
          )}
          <span aria-hidden="true">·</span>
          <span>Untimed</span>
          {match.roomCode && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-bold text-[#81B64C]">Room {match.roomCode}</span>
            </>
          )}
          {match.mode === 'computer' && (
            <button
              type="button"
              onClick={() => setShowBotChat((v) => !v)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                showBotChat
                  ? 'bg-[#81B64C]/20 text-slate-900 dark:text-[#D5E8C0]'
                  : 'bg-stone-200/80 dark:bg-[#262421] text-stone-600 dark:text-[#9E9C98]'
              }`}
              title="Toggle Bot Dialogue Bubble"
            >
              <MessageSquare className="w-3.5 h-3.5 text-[#81B64C]" />
              Bot Chat
            </button>
          )}
          {canUseEvalBar && (
            <button
              type="button"
              onClick={() => setShowEvalBar((v) => !v)}
              className={`px-2.5 py-1 rounded-md text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                showEvalBar
                  ? 'bg-[#81B64C]/20 text-slate-900 dark:text-[#D5E8C0]'
                  : 'bg-stone-200/80 dark:bg-[#262421] text-stone-600 dark:text-[#9E9C98]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#81B64C]" />
              Eval
            </button>
          )}
        </div>
      </div>

      {/* Private Room Waiting Banner */}
      {match.status === 'waiting' && (
        <div className="bg-[#81B64C]/12 border border-[#81B64C]/35 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="font-display font-bold text-sm text-slate-900 dark:text-white">
              Waiting for opponent to join room{' '}
              <span className="font-mono tracking-wider text-[#81B64C]">{match.roomCode}</span>
            </p>
            <p className="text-xs text-stone-600 dark:text-[#9E9C98] mt-0.5">
              Share the room code or invite link — the match starts automatically when they join.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="px-3.5 py-2 rounded-lg btn-chess-primary text-xs inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedInvite ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedInvite ? 'Link Copied' : 'Copy Invite Link'}
            </button>
            <button
              type="button"
              onClick={handleCancelWaitingRoom}
              className="px-3 py-2 rounded-lg btn-chess-secondary text-xs cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Main Chess.com Workspace: Board Centerpiece (Left) + Game Console (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left/Center: Top Player Strip + EvalBar & Board + Bottom Player Strip */}
        <div className="xl:col-span-8 space-y-2">
          {/* Top Player Strip (Chess.com Compact Player Header + Bot Speech Bubble) */}
          <div className="max-w-[716px] mx-auto space-y-2">
            {match.mode === 'computer' && showBotChat && botSpeechLine && topPlayer.botMeta && (
              <div className="flex items-center gap-3 pl-1">
                <div className="cc-speech-bubble px-3.5 py-2 text-xs font-medium leading-snug max-w-xl">
                  {botSpeechLine}
                </div>
              </div>
            )}

            <div className="flex items-center justify-between gap-3 px-2 py-1.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatar src={topPlayer.photoURL} name={topPlayer.displayName} size="sm" />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                      {topPlayer.botMeta ? topPlayer.botMeta.name : topPlayer.username}
                    </span>
                    <span className="font-mono text-xs text-stone-500 dark:text-[#9E9C98] tabular-nums">
                      ({topPlayer.rating})
                    </span>
                    {renderTitlePills(topPlayer.botMeta)}
                    {!topPlayer.botMeta && (
                      <span className="inline-flex items-center ml-0.5">
                        {isPlayerConnected(topPlayer.id, topPlayer.lastSeen) ? (
                          <Wifi className="w-3 h-3 text-[#81B64C]" />
                        ) : (
                          <WifiOff className="w-3 h-3 text-stone-400" />
                        )}
                      </span>
                    )}
                  </div>

                  {/* Captured Pieces Row directly under name (Chess.com style) */}
                  <div className="flex items-center gap-1 min-h-[16px] mt-0.5">
                    <div className="flex items-center -space-x-1">
                      {topPlayer.captured.slice(0, 14).map((p, i) => (
                        <ChessPieceSvg
                          key={`${p}-${i}`}
                          type={p}
                          color={topPlayer.capturedPieceColor}
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

              {/* Right Turn / Thinking Status Pill (Chess.com Clock Box Spot) */}
              <div
                className={`px-3 py-1.5 rounded-[4px] font-mono text-xs font-bold tabular-nums shrink-0 flex items-center gap-1.5 ${
                  topPlayer.isTurn
                    ? 'bg-white dark:bg-[#F2F1EE] text-[#262421] shadow-sm'
                    : 'bg-stone-200/70 dark:bg-[#262421] text-stone-500 dark:text-[#8B8985]'
                }`}
              >
                {botThinking && topPlayer.botMeta ? (
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

          {/* Eval Bar + Interactive Chessboard Centerpiece */}
          <div className="max-w-[716px] mx-auto flex items-stretch justify-center gap-2">
            {canUseEvalBar && showEvalBar && (
              <EvalBar
                evalCpWhite={evalScore.cpWhite}
                mateWhite={evalScore.mateWhite}
                orientation={boardOrientation}
                className="hidden sm:flex min-h-[320px]"
              />
            )}
            <div className="relative flex-1 max-w-[680px]">
              <ChessBoard
                fen={displayedPosition.fen}
                orientation={boardOrientation}
                interactive={isUserTurn}
                allowedColor={userColor || 'w'}
                lastMove={
                  displayedPosition.from && displayedPosition.to
                    ? { from: displayedPosition.from, to: displayedPosition.to }
                    : null
                }
                hintSquares={activeHintSquares}
                gameOutcome={
                  match.status === 'completed' && viewingPly === null
                    ? { result: match.result, reason: match.resultReason }
                    : null
                }
                boardTheme={settings.boardTheme}
                pieceStyle={settings.pieceStyle}
                animationsEnabled={settings.animationsEnabled}
                showCoordinates={localPrefs.showCoordinates}
                autoQueen={localPrefs.autoQueen}
                premove={premove}
                allowPremove={
                  localPrefs.enablePremoves &&
                  match.status === 'active' &&
                  userColor !== null &&
                  effectiveTurn !== userColor &&
                  viewingPly === null
                }
                onQueuePremove={(from, to) => setPremove({ from, to })}
                onCancelPremove={() => setPremove(null)}
                onMove={handlePlayerMove}
                onIllegalAttempt={() => playSound('illegal')}
              />

              {/* End-of-Game Summary Overlay (Chess.com Game Over Modal) */}
              {match.status === 'completed' && showEndModal && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 backdrop-blur-[2px] p-4 rounded-[4px]">
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
                      <h3 className="font-display text-xl font-extrabold">
                        {match.result === '1/2-1/2'
                          ? 'Game Drawn'
                          : match.winnerId === user.uid
                          ? 'You Won!'
                          : match.result === '1-0'
                          ? `${match.whiteUsername} Won`
                          : `${match.blackUsername} Won`}
                      </h3>
                      <p className="text-xs text-white/90 font-medium mt-0.5">
                        by {formatResultReason(match.resultReason)}
                        {match.mode !== 'computer' && userDelta !== 0 && (
                          <span className="font-mono font-bold ml-1.5">
                            ({userDelta > 0 ? `+${userDelta}` : userDelta} Elo)
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="p-5 space-y-2.5">
                      {match.moves.length > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleRunAnalysis()}
                          className="w-full py-3 rounded-lg btn-chess-primary text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                        >
                          <GraduationCap className="w-4 h-4" />
                          Game Review
                        </button>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={onPlayAgain}
                          className="py-2.5 rounded-lg btn-chess-secondary text-xs cursor-pointer"
                        >
                          New Game
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadPgn}
                          className="py-2.5 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download PGN
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
              <PlayerAvatar src={bottomPlayer.photoURL} name={bottomPlayer.displayName} size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                    {bottomPlayer.botMeta ? bottomPlayer.botMeta.name : bottomPlayer.username}
                  </span>
                  <span className="font-mono text-xs text-stone-500 dark:text-[#9E9C98] tabular-nums">
                    ({bottomPlayer.rating})
                  </span>
                  {renderTitlePills(bottomPlayer.botMeta)}
                </div>
                <div className="flex items-center gap-1 min-h-[16px] mt-0.5">
                  <div className="flex items-center -space-x-1">
                    {bottomPlayer.captured.slice(0, 14).map((p, i) => (
                      <ChessPieceSvg
                        key={`${p}-${i}`}
                        type={p}
                        color={bottomPlayer.capturedPieceColor}
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
              {bottomPlayer.isTurn
                ? bottomPlayer.id === user.uid
                  ? 'Your Turn'
                  : 'To Move'
                : 'Waiting'}
            </div>
          </div>
        </div>

        {/* Right Console: Chess.com Dark Walnut Move Sheet, Opening Bar & Match Controls */}
        <aside className="xl:col-span-4 space-y-4">
          <div className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl flex flex-col overflow-hidden shadow-lg">
            {/* Console Header */}
            <div className="px-4 py-3 bg-stone-50 dark:bg-[#211F1C] border-b border-[#DFDDD8] dark:border-[#353330] flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="font-display font-extrabold text-sm text-slate-900 dark:text-white truncate">
                  {match.status === 'completed'
                    ? match.result === '1/2-1/2'
                      ? 'Game Drawn (½–½)'
                      : match.winnerId === user.uid
                      ? 'Victory!'
                      : match.result === '1-0'
                      ? 'White Won (1–0)'
                      : 'Black Won (0–1)'
                    : isInCheckNow
                    ? `Check! · ${effectiveTurn === 'w' ? 'White' : 'Black'} to Move`
                    : `${effectiveTurn === 'w' ? 'White' : 'Black'} to Move`}
                </p>
                <p className="text-[11px] text-stone-500 dark:text-[#9E9C98] truncate">
                  {match.status === 'completed'
                    ? formatResultReason(match.resultReason)
                    : botThinking
                    ? `${activeBotName} calculating...`
                    : premove
                    ? `Premove: ${premove.from}→${premove.to}`
                    : isUserTurn
                    ? 'Click or drag a piece to move'
                    : 'Waiting for opponent'}
                </p>
              </div>
              <span className="px-2 py-0.5 rounded bg-stone-200/80 dark:bg-[#312F2C] font-mono text-[11px] font-bold text-stone-600 dark:text-[#C3C2C0] tabular-nums shrink-0">
                Move {Math.floor(effectiveMoveCount / 2) + 1}
              </span>
            </div>

            {/* Live ECO Opening Explorer Bar */}
            <div className="px-4 py-2 bg-stone-100/70 dark:bg-[#1F1E1B] border-b border-[#DFDDD8] dark:border-[#353330] flex items-center gap-2 text-xs">
              <BookOpen className="w-3.5 h-3.5 text-[#81B64C] shrink-0" />
              {currentOpening ? (
                <>
                  <span className="font-mono font-bold text-stone-500 dark:text-[#9E9C98]">
                    {currentOpening.eco}
                  </span>
                  <span className="text-slate-800 dark:text-[#E7E6E4] font-semibold truncate">
                    {currentOpening.name}
                  </span>
                </>
              ) : (
                <span className="text-stone-500 dark:text-[#9E9C98] font-medium">
                  {match.variant === 'chess960' ? 'Chess960 Starting Position' : 'Starting Position'}
                </span>
              )}
            </div>

            {/* Incoming Draw Offer Alert */}
            {incomingDrawOffer && (
              <div className="p-3 bg-amber-500/12 border-b border-amber-500/30 flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-amber-700 dark:text-amber-300">
                  Opponent offered a draw
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleAcceptDraw()}
                    className="px-2.5 py-1 rounded bg-[#81B64C] text-white text-xs font-bold cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeclineDraw()}
                    className="px-2.5 py-1 rounded bg-stone-200 dark:bg-[#312F2C] text-stone-700 dark:text-[#C3C2C0] text-xs font-semibold cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}

            {/* Viewing Historical Position Notice */}
            {viewingPly !== null && (
              <div className="px-4 py-1.5 bg-sky-500/12 border-b border-sky-500/25 flex items-center justify-between text-xs">
                <span className="text-sky-700 dark:text-sky-300 font-medium">
                  Move {viewingPly} of {effectiveMoveCount}
                </span>
                <button
                  type="button"
                  onClick={() => setViewingPly(null)}
                  className="font-bold text-sky-600 dark:text-sky-400 hover:underline cursor-pointer"
                >
                  Jump to Live
                </button>
              </div>
            )}

            {/* Chess.com Zebra-Striped Figurine Algebraic Notation Move List */}
            <div ref={moveListRef} className="flex-1 min-h-[260px] max-h-[380px] overflow-y-auto">
              {movePairs.length === 0 ? (
                <div className="h-full min-h-[220px] flex items-center justify-center text-xs text-stone-400 dark:text-[#8B8985] px-4 text-center">
                  Moves appear here in figurine algebraic notation (♘f3, ♗b5).
                </div>
              ) : (
                <div className="font-mono text-xs tabular-nums">
                  {movePairs.map((row, idx) => {
                    const wAnalyzed = analysisResult?.moves[row.wPly - 1];
                    const bAnalyzed = row.bPly ? analysisResult?.moves[row.bPly - 1] : undefined;

                    return (
                      <div
                        key={row.num}
                        className={`grid grid-cols-12 items-center px-2 py-1 ${
                          idx % 2 === 0
                            ? 'bg-transparent'
                            : 'bg-stone-50/90 dark:bg-[#2B2926]'
                        }`}
                      >
                        <span className="col-span-2 px-1.5 text-stone-400 dark:text-[#8B8985] select-none">
                          {row.num}.
                        </span>
                        <button
                          type="button"
                          onClick={() => setViewingPly(row.wPly === effectiveMoveCount ? null : row.wPly)}
                          className={`col-span-5 py-1 px-2 text-left rounded-[4px] font-semibold cursor-pointer transition-colors ${
                            currentPly === row.wPly
                              ? 'bg-[#81B64C]/25 dark:bg-[#48453F] text-slate-900 dark:text-white font-bold'
                              : 'text-slate-800 dark:text-[#DFDEDB] hover:bg-stone-200/60 dark:hover:bg-[#383531]'
                          }`}
                        >
                          <span>{formatSanWithFigurine(row.white, 'w')}</span>
                          {renderMoveQualityBadge(wAnalyzed?.classification)}
                        </button>
                        {row.black ? (
                          <button
                            type="button"
                            onClick={() => setViewingPly(row.bPly === effectiveMoveCount ? null : (row.bPly ?? null))}
                            className={`col-span-5 py-1 px-2 text-left rounded-[4px] font-semibold cursor-pointer transition-colors ${
                              currentPly === row.bPly
                                ? 'bg-[#81B64C]/25 dark:bg-[#48453F] text-slate-900 dark:text-white font-bold'
                                : 'text-slate-800 dark:text-[#DFDEDB] hover:bg-stone-200/60 dark:hover:bg-[#383531]'
                            }`}
                          >
                            <span>{formatSanWithFigurine(row.black, 'b')}</span>
                            {renderMoveQualityBadge(bAnalyzed?.classification)}
                          </button>
                        ) : (
                          <span className="col-span-5" />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Chess.com Replay Scrubber & Utility Bar */}
            <div className="px-3 py-2 border-t border-[#DFDDD8] dark:border-[#353330] flex items-center justify-between gap-1 bg-stone-50 dark:bg-[#1F1E1B]">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={effectiveMoveCount === 0}
                  onClick={() => setViewingPly(0)}
                  className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] disabled:opacity-35 cursor-pointer"
                  title="Start position (Home)"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPly <= 0}
                  onClick={() => setViewingPly(Math.max(0, currentPly - 1))}
                  className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] disabled:opacity-35 cursor-pointer"
                  title="Previous move (←)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={viewingPly === null}
                  onClick={() => {
                    const next = currentPly + 1;
                    setViewingPly(next >= effectiveMoveCount ? null : next);
                  }}
                  className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] disabled:opacity-35 cursor-pointer"
                  title="Next move (→)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={viewingPly === null}
                  onClick={() => setViewingPly(null)}
                  className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] disabled:opacity-35 cursor-pointer"
                  title="Latest move (End)"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFlipped((f) => !f)}
                  className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] cursor-pointer"
                  title="Flip board (F)"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={onToggleSound}
                  className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] cursor-pointer"
                  title={settings.soundEnabled ? 'Mute sounds' : 'Enable sounds'}
                >
                  {settings.soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={handleCopyPgn}
                  className="px-2 py-1 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-[11px] font-mono font-bold text-stone-600 dark:text-[#C3C2C0] cursor-pointer"
                  title="Copy full PGN"
                >
                  {copiedPgn ? '✓ PGN' : 'PGN'}
                </button>
                <button
                  type="button"
                  onClick={handleDownloadPgn}
                  className="p-1.5 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-stone-600 dark:text-[#C3C2C0] cursor-pointer"
                  title="Download .pgn file"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={handleCopyFen}
                  className="px-2 py-1 rounded hover:bg-stone-200 dark:hover:bg-[#312F2C] text-[11px] font-mono font-bold text-stone-600 dark:text-[#C3C2C0] cursor-pointer"
                  title="Copy current FEN"
                >
                  {copiedFen ? '✓ FEN' : 'FEN'}
                </button>
              </div>
            </div>

            {/* Live Coach Tip Banner */}
            {coachAdvice && (
              <div className="px-4 py-3 bg-[#81B64C]/12 border-t border-[#81B64C]/30 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-[#81B64C] inline-flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5" />
                    Coach · {coachAdvice.evalLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCoachAdvice(null)}
                    className="p-0.5 text-stone-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    aria-label="Dismiss coach advice"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs font-bold text-slate-800 dark:text-white">
                  {coachAdvice.headline}
                </p>
                <p className="text-xs text-stone-600 dark:text-[#C3C2C0] leading-relaxed">
                  {coachAdvice.advice}
                </p>
              </div>
            )}

            {/* Bottom Console Actions (Active Match OR Completed Match CTAs) */}
            {match.status === 'completed' ? (
              <div className="p-3.5 border-t border-[#DFDDD8] dark:border-[#353330] space-y-2">
                {match.moves.length > 0 && (
                  <button
                    type="button"
                    onClick={() => void handleRunAnalysis()}
                    disabled={analyzing}
                    className="w-full py-2.5 px-4 rounded-lg btn-chess-primary text-xs sm:text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <GraduationCap className="w-4 h-4" />
                    {analyzing ? 'Analyzing Match...' : 'Game Review'}
                  </button>
                )}
                <button
                  type="button"
                  onClick={onPlayAgain}
                  className="w-full py-2.5 px-4 rounded-lg btn-chess-secondary text-xs sm:text-sm cursor-pointer"
                >
                  New Game
                </button>
              </div>
            ) : (
              match.status === 'active' &&
              userColor && (
                <div className="p-3.5 border-t border-[#DFDDD8] dark:border-[#353330] space-y-2">
                  {confirmResign ? (
                    <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
                      <span className="text-xs font-bold text-red-600 dark:text-red-400">
                        Resign this game?
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => void handleResign()}
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
                  ) : match.mode === 'computer' ? (
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={!isUserTurn}
                        onClick={handleRequestHint}
                        className="py-2 px-2.5 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-45 whitespace-nowrap cursor-pointer"
                      >
                        <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
                        Hint
                      </button>
                      <button
                        type="button"
                        disabled={coachLoading}
                        onClick={() => void handleAskCoach()}
                        className="py-2 px-2.5 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-45 whitespace-nowrap cursor-pointer"
                      >
                        {coachLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-[#81B64C]" />
                        ) : (
                          <GraduationCap className="w-3.5 h-3.5 text-sky-400" />
                        )}
                        Coach
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmResign(true)}
                        className="py-2 px-2.5 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 hover:!text-red-400 whitespace-nowrap cursor-pointer"
                      >
                        <Flag className="w-3.5 h-3.5" />
                        Resign
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        disabled={outgoingDrawOffer}
                        onClick={() => void handleOfferDraw()}
                        className="py-2 px-3 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap cursor-pointer"
                      >
                        <Handshake className="w-3.5 h-3.5" />
                        {outgoingDrawOffer ? 'Draw Sent' : 'Draw'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmResign(true)}
                        className="py-2 px-3 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 hover:!text-red-400 whitespace-nowrap cursor-pointer"
                      >
                        <Flag className="w-3.5 h-3.5" />
                        Resign
                      </button>
                    </div>
                  )}
                </div>
              )
            )}
          </div>

          {/* Post-Match Coach Review Panel */}
          {showAnalysis && match.status === 'completed' && (
            <GameAnalysisPanel
              whiteName={match.whiteUsername}
              blackName={match.blackUsername}
              analyzing={analyzing}
              progress={analysisProgress}
              analysis={analysisResult}
              error={analysisError}
              currentPly={currentPly}
              onSelectPly={(ply) => setViewingPly(ply >= effectiveMoveCount ? null : ply)}
              onRunAnalysis={() => void handleRunAnalysis()}
            />
          )}
        </aside>
      </div>
    </div>
  );
};
