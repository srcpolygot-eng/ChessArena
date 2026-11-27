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
  getCapturedPieces,
  validateMoveLocally,
} from '../lib/chessEngine';
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
  const [showEvalBar, setShowEvalBar] = useState(false);
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

  // Real-time Firestore match listener (syncs moves across devices & restores on refresh)
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

        // Reconcile optimistic move once server state catches up
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

  // Presence heartbeat inside live match (tracks connection status — NEVER forfeits or times out!)
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

  const activeBotName = useMemo(() => {
    if (!match || match.mode !== 'computer' || !userColor) return 'MiniMax H1 Flash';
    const botId = userColor === 'w' ? match.blackId : match.whiteId;
    const found = COMPUTER_BOTS.find((b) => b.id === botId);
    return found?.name || (userColor === 'w' ? match.blackDisplayName : match.whiteDisplayName) || 'MiniMax H1 Flash';
  }, [match, userColor]);

  // Computer AI move automation (MiniMax H1 Flash & MiniMax H1 Pro)
  useEffect(() => {
    if (!match || match.mode !== 'computer' || match.status !== 'active' || !userColor) return;
    const botColor: Color = userColor === 'w' ? 'b' : 'w';
    if (match.turn !== botColor) return;

    const botId = botColor === 'w' ? match.whiteId : match.blackId;
    const bot = COMPUTER_BOTS.find((b) => b.id === botId) || MINIMAX_H1_FLASH;

    let cancelled = false;
    setBotThinking(true);
    const delayMs = bot.responseDelayMs ?? 30;
    const timeout = window.setTimeout(async () => {
      try {
        const best = computeBestBotMove(match.fen, bot);
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
      window.clearTimeout(timeout);
      setBotThinking(false);
    };
  }, [match?.fen, match?.turn, match?.status, match?.moveCount, match?.mode, userColor, user.uid]);

  // Build position list for move history inspection (supports Standard and Chess960)
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

      // Optimistic local validation & immediate animation + sound for ultra-snappy feel
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
        // Revert optimistic move on rejection
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

  // Auto-execute queued premove the moment it becomes the player's turn
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
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400">
        <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
        <p className="text-sm font-medium">Loading live chessboard...</p>
      </div>
    );
  }

  if (!match) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 text-center">
        <p className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
          {error || 'Match could not be loaded.'}
        </p>
        <button
          type="button"
          onClick={onExitMatch}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  const baseOrientation: Color = userColor === 'b' ? 'b' : 'w';
  const boardOrientation: Color = flipped ? (baseOrientation === 'w' ? 'b' : 'w') : baseOrientation;

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

  return (
    <div className="max-w-7xl mx-auto pb-8 space-y-4">
      {/* Top Match Utility Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={onExitMatch}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </button>

        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
          <span className="capitalize font-medium text-slate-700 dark:text-slate-300">
            {match.mode === 'computer' ? `vs ${activeBotName}` : `${match.mode} Match`}
          </span>
          {match.variant === 'chess960' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                Chess960
              </span>
            </>
          )}
          <span aria-hidden="true">·</span>
          <span>Untimed Classical (No Clock)</span>
          {match.roomCode && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                Room {match.roomCode}
              </span>
            </>
          )}
          {canUseEvalBar && (
            <button
              type="button"
              onClick={() => setShowEvalBar((v) => !v)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                showEvalBar
                  ? 'bg-emerald-600/15 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-200/70 dark:bg-[#222833] text-slate-600 dark:text-slate-300'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Eval Bar
            </button>
          )}
        </div>
      </div>

      {/* Private Room Waiting Banner */}
      {match.status === 'waiting' && (
        <div className="bg-emerald-600/10 border border-emerald-500/30 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <p className="font-display font-bold text-sm text-slate-900 dark:text-white">
              Waiting for opponent to join room{' '}
              <span className="font-mono tracking-wider text-emerald-600 dark:text-emerald-400">
                {match.roomCode}
              </span>
            </p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              Share the room code or invite link — the match starts automatically the moment they join.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleCopyInviteLink}
              className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedInvite ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedInvite ? 'Link Copied' : 'Copy Invite Link'}
            </button>
            <button
              type="button"
              onClick={handleCancelWaitingRoom}
              className="px-3 py-2 rounded-lg bg-slate-200 dark:bg-[#222833] text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer"
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

      {/* Main Chess Workspace: Board Centerpiece (Left/Center) + Match Sidebar (Right) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left/Center: Player Bars + EvalBar + ChessBoard */}
        <div className="xl:col-span-8 space-y-3">
          {/* Top Player Bar */}
          <div
            className={`max-w-[680px] mx-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white dark:bg-[#1A1E26] border transition-colors ${
              topPlayer.isTurn
                ? 'border-emerald-500/70'
                : 'border-slate-200 dark:border-[#2A313D]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <PlayerAvatar src={topPlayer.photoURL} name={topPlayer.displayName} size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                    {topPlayer.username}
                  </span>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    ({topPlayer.rating})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {isPlayerConnected(topPlayer.id, topPlayer.lastSeen) ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <Wifi className="w-3 h-3" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <WifiOff className="w-3 h-3" />
                      {topPlayer.id ? 'Away' : 'Open Seat'}
                    </span>
                  )}
                  {topPlayer.isTurn && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {botThinking && topPlayer.id.startsWith('computer_') ? 'Thinking...' : 'To Move'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Captured Pieces */}
            <div className="flex items-center gap-1 shrink-0">
              <div className="flex items-center -space-x-1.5">
                {topPlayer.captured.slice(0, 12).map((p, i) => (
                  <ChessPieceSvg
                    key={`${p}-${i}`}
                    type={p}
                    color={topPlayer.capturedPieceColor}
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

          {/* Eval Bar + Interactive Chessboard Centerpiece */}
          <div className="max-w-[716px] mx-auto flex items-stretch justify-center gap-2.5">
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

              {/* End-of-Game Summary Overlay (Chess.com-style) */}
              {match.status === 'completed' && showEndModal && (
                <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-4 rounded-md">
                  <div className="w-full max-w-sm bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl shadow-2xl p-6 text-center space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
                      <Trophy className="w-6 h-6" />
                    </div>
                    <div>
                      <h3 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                        {match.result === '1/2-1/2'
                          ? 'Game Drawn'
                          : match.winnerId === user.uid
                          ? 'You Won!'
                          : match.result === '1-0'
                          ? `${match.whiteUsername} Won`
                          : `${match.blackUsername} Won`}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {formatResultReason(match.resultReason)} · {match.result}
                        {match.mode !== 'computer' && userDelta !== 0 && (
                          <span
                            className={`font-mono font-semibold ml-1.5 tabular-nums ${
                              userDelta > 0 ? 'text-emerald-500' : 'text-red-500'
                            }`}
                          >
                            ({userDelta > 0 ? `+${userDelta}` : userDelta} Elo)
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="space-y-2 pt-1">
                      {match.moves.length > 0 && (
                        <button
                          type="button"
                          onClick={() => void handleRunAnalysis()}
                          className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <GraduationCap className="w-4 h-4" />
                          Coach Review
                        </button>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => void handleCopyPgn()}
                          className="py-2 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          {copiedPgn ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedPgn ? 'Copied PGN' : 'Copy PGN'}
                        </button>
                        <button
                          type="button"
                          onClick={handleDownloadPgn}
                          className="py-2 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Export .pgn
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={onPlayAgain}
                          className="py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
                        >
                          New Match
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowEndModal(false)}
                          className="py-2 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold cursor-pointer"
                        >
                          View Board
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Player Bar */}
          <div
            className={`max-w-[680px] mx-auto flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl bg-white dark:bg-[#1A1E26] border transition-colors ${
              bottomPlayer.isTurn
                ? 'border-emerald-500/70'
                : 'border-slate-200 dark:border-[#2A313D]'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <PlayerAvatar src={bottomPlayer.photoURL} name={bottomPlayer.displayName} size="sm" />
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-sm text-slate-900 dark:text-white truncate">
                    {bottomPlayer.username}
                  </span>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    ({bottomPlayer.rating})
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  {isPlayerConnected(bottomPlayer.id, bottomPlayer.lastSeen) ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                      <Wifi className="w-3 h-3" />
                      Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <WifiOff className="w-3 h-3" />
                      Away
                    </span>
                  )}
                  {bottomPlayer.isTurn && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                        {bottomPlayer.id === user.uid ? 'Your Turn' : 'To Move'}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <div className="flex items-center -space-x-1.5">
                {bottomPlayer.captured.slice(0, 12).map((p, i) => (
                  <ChessPieceSvg
                    key={`${p}-${i}`}
                    type={p}
                    color={bottomPlayer.capturedPieceColor}
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

          <p className="max-w-[680px] mx-auto text-[11px] text-slate-400 dark:text-slate-500 text-center">
            Tip: Right-click a square to highlight · Right-click &amp; drag to draw arrows · Use ← → keys to step moves · Press F to flip
          </p>
        </div>

        {/* Right Sidebar: Status, Opening, Move History, Analysis & Controls */}
        <aside className="xl:col-span-4 space-y-4">
          <div className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl flex flex-col overflow-hidden">
            {/* Status Banner */}
            <div className="p-4 border-b border-slate-200 dark:border-[#2A313D]">
              {match.status === 'completed' ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                    <Trophy className="w-4 h-4" />
                    <span className="font-display font-bold text-sm">
                      {match.result === '1/2-1/2'
                        ? 'Match Drawn (½ – ½)'
                        : match.winnerId === user.uid
                        ? 'Victory!'
                        : match.result === '1-0'
                        ? `${match.whiteUsername} Wins (1–0)`
                        : `${match.blackUsername} Wins (0–1)`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatResultReason(match.resultReason)}
                    {match.mode !== 'computer' && userDelta !== 0 && (
                      <span
                        className={`font-mono font-semibold ml-2 tabular-nums ${
                          userDelta > 0 ? 'text-emerald-500' : 'text-red-500'
                        }`}
                      >
                        {userDelta > 0 ? `+${userDelta}` : userDelta} Elo
                      </span>
                    )}
                  </p>
                  <div className="pt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={onPlayAgain}
                      className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                    >
                      New Match
                    </button>
                    {match.moves.length > 0 && (
                      <button
                        type="button"
                        onClick={() => void handleRunAnalysis()}
                        disabled={analyzing}
                        className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap disabled:opacity-60"
                      >
                        <GraduationCap className="w-3.5 h-3.5" />
                        {analyzing ? 'Reviewing...' : 'Coach Review'}
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleDownloadPgn}
                      className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                      title="Download PGN file"
                    >
                      <Download className="w-3.5 h-3.5" />
                      .pgn
                    </button>
                  </div>
                </div>
              ) : match.status === 'waiting' ? (
                <div>
                  <p className="font-display font-bold text-sm text-slate-900 dark:text-white">
                    Waiting for Opponent
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Share room code <span className="font-mono font-semibold">{match.roomCode}</span> to begin.
                  </p>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="font-display font-bold text-sm text-slate-900 dark:text-white">
                      {isInCheckNow ? 'Check! ' : ''}
                      {effectiveTurn === 'w' ? 'White to Move' : 'Black to Move'}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {isUserTurn
                        ? 'Your turn — click or drag a piece to move'
                        : botThinking
                        ? `${activeBotName} calculating reply...`
                        : premove
                        ? `Premove queued: ${premove.from}→${premove.to} (right-click to cancel)`
                        : 'Waiting for opponent’s move'}
                    </p>
                  </div>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                    Move {Math.floor(effectiveMoveCount / 2) + 1}
                  </span>
                </div>
              )}
            </div>

            {/* Live ECO Opening Explorer Bar */}
            {currentOpening && (
              <div className="px-4 py-2 bg-slate-50 dark:bg-[#14181F] border-b border-slate-200 dark:border-[#2A313D] flex items-center gap-2 text-xs">
                <BookOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span className="font-mono font-semibold text-slate-500 dark:text-slate-400">
                  {currentOpening.eco}
                </span>
                <span className="text-slate-700 dark:text-slate-200 font-medium truncate">
                  {currentOpening.name}
                </span>
              </div>
            )}

            {/* Incoming Draw Offer Alert */}
            {incomingDrawOffer && (
              <div className="p-3.5 bg-amber-500/10 border-b border-amber-500/30 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-amber-700 dark:text-amber-300">
                  Opponent offered a draw
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => void handleAcceptDraw()}
                    className="px-2.5 py-1 rounded bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDeclineDraw()}
                    className="px-2.5 py-1 rounded bg-slate-200 dark:bg-[#222833] text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            )}

            {/* Viewing Historical Position Notice */}
            {viewingPly !== null && (
              <div className="px-4 py-2 bg-sky-500/10 border-b border-sky-500/25 flex items-center justify-between text-xs">
                <span className="text-sky-700 dark:text-sky-300 font-medium">
                  Inspecting move {viewingPly} of {effectiveMoveCount}
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

            {/* Move History Table */}
            <div ref={moveListRef} className="flex-1 min-h-[240px] max-h-[380px] overflow-y-auto p-3">
              {movePairs.length === 0 ? (
                <div className="h-full min-h-[200px] flex items-center justify-center text-xs text-slate-400">
                  Moves will be recorded here in algebraic notation.
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
                        onClick={() => setViewingPly(row.wPly === effectiveMoveCount ? null : row.wPly)}
                        className={`col-span-5 py-1.5 px-2 text-left rounded cursor-pointer ${
                          currentPly === row.wPly
                            ? 'bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 font-semibold'
                            : 'text-slate-800 dark:text-slate-200'
                        }`}
                      >
                        {row.white}
                      </button>
                      {row.black ? (
                        <button
                          type="button"
                          onClick={() => setViewingPly(row.bPly === effectiveMoveCount ? null : (row.bPly ?? null))}
                          className={`col-span-5 py-1.5 px-2 text-left rounded cursor-pointer ${
                            currentPly === row.bPly
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

            {/* Replay Scrubber & Utility Controls */}
            <div className="px-3 py-2 border-t border-slate-200 dark:border-[#2A313D] flex items-center justify-between gap-1 bg-slate-50 dark:bg-[#14181F]">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={effectiveMoveCount === 0}
                  onClick={() => setViewingPly(0)}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer"
                  title="Start position (Home)"
                >
                  <SkipBack className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  disabled={currentPly <= 0}
                  onClick={() => setViewingPly(Math.max(0, currentPly - 1))}
                  className="p-1.5 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-slate-600 dark:text-slate-300 disabled:opacity-35 cursor-pointer"
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
                  title="Latest move (End)"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setFlipped((f) => !f)}
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
                  onClick={handleCopyPgn}
                  className="px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                  title="Copy full PGN"
                >
                  {copiedPgn ? '✓ PGN' : 'PGN'}
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
                  onClick={handleCopyFen}
                  className="px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-[#222833] text-[11px] font-mono font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                  title="Copy current FEN"
                >
                  {copiedFen ? '✓ FEN' : 'FEN'}
                </button>
              </div>
            </div>

            {/* Live Coach Tip Banner (Computer Matches or Completed Review) */}
            {coachAdvice && (
              <div className="px-4 py-3 bg-emerald-600/10 border-t border-emerald-500/25 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 inline-flex items-center gap-1.5">
                    <GraduationCap className="w-3.5 h-3.5" />
                    Coach · {coachAdvice.evalLabel}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCoachAdvice(null)}
                    className="p-0.5 text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
                    aria-label="Dismiss coach advice"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {coachAdvice.headline}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {coachAdvice.advice}
                </p>
              </div>
            )}

            {/* Active Match Actions (Hint & Ask Coach in Computer mode, Offer Draw & Resign) */}
            {match.status === 'active' && userColor && (
              <div className="p-3.5 border-t border-slate-200 dark:border-[#2A313D] space-y-2">
                {confirmResign ? (
                  <div className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/30">
                    <span className="text-xs font-semibold text-red-600 dark:text-red-400">
                      Confirm resignation?
                    </span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleResign()}
                        className="px-3 py-1 rounded bg-red-600 hover:bg-red-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Yes, Resign
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
                ) : match.mode === 'computer' ? (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      disabled={!isUserTurn}
                      onClick={handleRequestHint}
                      className="py-2 px-2.5 rounded-lg bg-amber-500/12 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-45 whitespace-nowrap cursor-pointer"
                    >
                      <Lightbulb className="w-3.5 h-3.5" />
                      Hint
                    </button>
                    <button
                      type="button"
                      disabled={coachLoading}
                      onClick={() => void handleAskCoach()}
                      className="py-2 px-2.5 rounded-lg bg-emerald-600/12 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-300 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-45 whitespace-nowrap cursor-pointer"
                    >
                      {coachLoading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <GraduationCap className="w-3.5 h-3.5" />
                      )}
                      Coach
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmResign(true)}
                      className="py-2 px-2.5 rounded-lg bg-red-500/10 hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
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
                      className="py-2 px-3 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 whitespace-nowrap cursor-pointer"
                    >
                      <Handshake className="w-3.5 h-3.5" />
                      {outgoingDrawOffer ? 'Draw Offered' : 'Offer Draw'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmResign(true)}
                      className="py-2 px-3 rounded-lg bg-red-500/10 hover:bg-red-600 text-red-600 dark:text-red-400 hover:text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <Flag className="w-3.5 h-3.5" />
                      Resign
                    </button>
                  </div>
                )}
              </div>
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
