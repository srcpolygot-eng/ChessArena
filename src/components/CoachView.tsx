import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import {
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Copy,
  Crosshair,
  Download,
  Flag,
  GraduationCap,
  Lightbulb,
  Loader2,
  Microscope,
  Play,
  RotateCcw,
  Shuffle,
  Sparkles,
  Swords,
  Target,
  Timer,
  Undo2,
  Upload,
} from 'lucide-react';
import { ChessBoard } from './ChessBoard';
import { EvalBar } from './EvalBar';
import { useChessAudio } from '../contexts/ChessAudioContext';
import {
  askCoachPosition,
  evaluateMoveWithCoach,
  getCoachPracticeMove,
  type CoachMoveFeedback,
  type CoachPositionReport,
  type CoachSkillTier,
} from '../lib/coachEngine';
import { createChessFromInitialFen, getChess960Position, randomChess960Id, STANDARD_START_FEN } from '../lib/chess960';
import { detectOpening, FEATURED_OPENINGS, type OpeningCatalogEntry } from '../lib/openings';
import { ENDGAME_DRILLS, type EndgameDrill } from '../lib/puzzlesData';
import { downloadPgnFile, generateMatchPgn } from '../lib/pgn';
import { recordVisionScore } from '../lib/firestoreService';
import type {
  LocalPlayPreferences,
  MatchVariant,
  UserPrivateProfile,
  UserProgression,
  UserSettings,
} from '../types/chess';

export type CoachTab = 'play' | 'analysis' | 'openings' | 'drills';

interface CoachViewProps {
  user: UserPrivateProfile;
  settings: UserSettings;
  localPrefs: LocalPlayPreferences;
  progression: UserProgression | null;
  initialTab?: CoachTab;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['1', '2', '3', '4', '5', '6', '7', '8'] as const;

function randomSquare(exclude?: string): Square {
  let sq = 'e4' as Square;
  for (let i = 0; i < 6; i++) {
    const f = FILES[Math.floor(Math.random() * 8)];
    const r = RANKS[Math.floor(Math.random() * 8)];
    sq = `${f}${r}` as Square;
    if (sq !== exclude) break;
  }
  return sq;
}

export const CoachView: React.FC<CoachViewProps> = ({
  user,
  settings,
  localPrefs,
  progression,
  initialTab = 'play',
}) => {
  const { playSound } = useChessAudio();
  const [activeTab, setActiveTab] = useState<CoachTab>(initialTab);

  // =========================================================================
  // TAB 1: PLAY WITH COACH STATE
  // =========================================================================
  const [coachTier, setCoachTier] = useState<CoachSkillTier>('club');
  const [coachPlayerColor, setCoachPlayerColor] = useState<Color>('w');
  const [coachVariant, setCoachVariant] = useState<MatchVariant>('standard');
  const [coachInitialFen, setCoachInitialFen] = useState<string>(STANDARD_START_FEN);
  const [coachMoves, setCoachMoves] = useState<string[]>([]);
  const [coachLastMove, setCoachLastMove] = useState<{ from: string; to: string } | null>(null);
  const [coachOrientation, setCoachOrientation] = useState<Color>('w');
  const [coachThinking, setCoachThinking] = useState(false);
  const [coachFeedback, setCoachFeedback] = useState<CoachMoveFeedback | null>(null);
  const [coachHint, setCoachHint] = useState<{ from: string; to: string; san: string; advice: string } | null>(null);
  const [coachHintLoading, setCoachHintLoading] = useState(false);
  const [coachEval, setCoachEval] = useState<{ cpWhite: number; mateWhite: number | null }>({
    cpWhite: 18,
    mateWhite: null,
  });
  const [coachActiveLabel, setCoachActiveLabel] = useState<string>('Guided Game');
  const coachReplyLockRef = useRef<number>(-1);

  const coachGame = useMemo(() => {
    const c = createChessFromInitialFen(coachInitialFen);
    for (const san of coachMoves) {
      try {
        c.move(san);
      } catch {
        break;
      }
    }
    return c;
  }, [coachInitialFen, coachMoves]);

  const coachFen = coachGame.fen();
  const coachIsOver = coachGame.isGameOver();
  const coachOpening = useMemo(
    () => (coachVariant === 'standard' ? detectOpening(coachMoves) : null),
    [coachVariant, coachMoves]
  );

  const coachOutcome = useMemo(() => {
    if (!coachIsOver) return null;
    if (coachGame.isCheckmate()) {
      return {
        result: (coachGame.turn() === 'w' ? '0-1' : '1-0') as '1-0' | '0-1',
        reason: 'checkmate' as const,
      };
    }
    return { result: '1/2-1/2' as const, reason: 'stalemate' as const };
  }, [coachGame, coachIsOver]);

  const startNewCoachGame = useCallback(
    (opts?: {
      color?: Color;
      variant?: MatchVariant;
      initialFen?: string;
      presetMoves?: string[];
      label?: string;
    }) => {
      const nextColor = opts?.color ?? coachPlayerColor;
      const nextVariant = opts?.variant ?? coachVariant;
      let startFen = opts?.initialFen ?? STANDARD_START_FEN;
      if (!opts?.initialFen && nextVariant === 'chess960') {
        startFen = getChess960Position(randomChess960Id()).fen;
      }
      coachReplyLockRef.current = -1;
      setCoachPlayerColor(nextColor);
      setCoachVariant(nextVariant);
      setCoachInitialFen(startFen);
      setCoachMoves(opts?.presetMoves ?? []);
      setCoachLastMove(null);
      setCoachOrientation(nextColor);
      setCoachFeedback(null);
      setCoachHint(null);
      setCoachEval({ cpWhite: 15, mateWhite: null });
      setCoachActiveLabel(opts?.label || (nextVariant === 'chess960' ? 'Chess960 vs Coach' : 'Guided Game'));
      playSound('gameStart');
    },
    [coachPlayerColor, coachVariant, playSound]
  );

  // Trigger Coach reply automatically when it's Coach's turn
  useEffect(() => {
    if (activeTab !== 'play') return;
    if (coachIsOver) return;
    if (coachGame.turn() === coachPlayerColor) return;
    if (coachReplyLockRef.current === coachMoves.length) return;
    coachReplyLockRef.current = coachMoves.length;

    let cancelled = false;
    setCoachThinking(true);
    const timer = window.setTimeout(() => {
      void getCoachPracticeMove(coachFen, coachTier)
        .then((mv) => {
          if (cancelled || !mv) return;
          const temp = new Chess(coachFen);
          const played = temp.move({ from: mv.from, to: mv.to, promotion: mv.promotion });
          if (!played) return;
          setCoachMoves((prev) => [...prev, played.san]);
          setCoachLastMove({ from: played.from, to: played.to });
          setCoachHint(null);
          if (temp.isCheckmate()) playSound('defeat');
          else if (temp.isDraw()) playSound('draw');
          else if (temp.inCheck()) playSound('check');
          else if (played.captured) playSound('capture');
          else if (played.san === 'O-O' || played.san === 'O-O-O') playSound('castle');
          else playSound('move');
        })
        .finally(() => {
          if (!cancelled) setCoachThinking(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab, coachFen, coachGame, coachIsOver, coachMoves.length, coachPlayerColor, coachTier, playSound]);

  const handleCoachPlayerMove = (from: string, to: string, promotion?: PieceSymbol) => {
    if (coachThinking || coachIsOver || coachGame.turn() !== coachPlayerColor) return;
    const fenBefore = coachFen;
    const temp = new Chess(fenBefore);
    const played = temp.move({ from, to, promotion: promotion || 'q' });
    if (!played) {
      playSound('illegal');
      return;
    }

    const fenAfter = temp.fen();
    setCoachMoves((prev) => [...prev, played.san]);
    setCoachLastMove({ from: played.from, to: played.to });
    setCoachHint(null);

    if (temp.isCheckmate()) playSound('victory');
    else if (temp.isDraw()) playSound('draw');
    else if (temp.inCheck()) playSound('check');
    else if (played.promotion) playSound('promote');
    else if (played.san === 'O-O' || played.san === 'O-O-O') playSound('castle');
    else if (played.captured) playSound('capture');
    else playSound('move');

    const playedUci = `${played.from}${played.to}${played.promotion || ''}`;
    void evaluateMoveWithCoach({
      fenBefore,
      fenAfter,
      playedUci,
      playedSan: played.san,
      moverColor: coachPlayerColor,
    }).then((fb) => {
      setCoachFeedback(fb);
      // Update eval bar from quick position report
      void askCoachPosition(fenAfter, { depth: 9, movetimeMs: 120, multiPv: 1 }).then((rep) => {
        setCoachEval({ cpWhite: rep.cpWhite, mateWhite: rep.mateWhite });
      });
    });
  };

  const handleCoachUndo = () => {
    if (coachMoves.length === 0 || coachThinking) return;
    coachReplyLockRef.current = -1;
    // Pop back to player's turn (usually 2 plies, or 1 ply if Coach hadn't moved yet)
    const nextMoves = [...coachMoves];
    if (coachGame.turn() === coachPlayerColor && nextMoves.length >= 2) {
      nextMoves.pop();
      nextMoves.pop();
    } else {
      nextMoves.pop();
    }
    setCoachMoves(nextMoves);
    setCoachLastMove(null);
    setCoachFeedback(null);
    setCoachHint(null);
  };

  const handleAskCoachHint = async () => {
    if (coachIsOver || coachHintLoading) return;
    setCoachHintLoading(true);
    try {
      const report = await askCoachPosition(coachFen, { depth: 12, movetimeMs: 260, multiPv: 2 });
      setCoachEval({ cpWhite: report.cpWhite, mateWhite: report.mateWhite });
      if (report.bestMoveUci.length >= 4) {
        setCoachHint({
          from: report.bestMoveUci.slice(0, 2),
          to: report.bestMoveUci.slice(2, 4),
          san: report.bestMoveSan,
          advice: `${report.headline}. ${report.advice}`,
        });
      }
    } finally {
      setCoachHintLoading(false);
    }
  };

  const handleExportCoachPgn = () => {
    const pgn = generateMatchPgn({
      mode: 'coach',
      variant: coachVariant,
      initialFen: coachInitialFen,
      whiteName: coachPlayerColor === 'w' ? user.username : `Coach (${coachTier})`,
      blackName: coachPlayerColor === 'b' ? user.username : `Coach (${coachTier})`,
      whiteRating: coachPlayerColor === 'w' ? user.rating : 2200,
      blackRating: coachPlayerColor === 'b' ? user.rating : 2200,
      moves: coachMoves,
      result: coachOutcome?.result || '',
      resultReason: coachOutcome?.reason || '',
    });
    downloadPgnFile(pgn, `coach-game-${Date.now()}.pgn`);
  };

  // =========================================================================
  // TAB 2: ANALYSIS BOARD STATE
  // =========================================================================
  const [analysisInitialFen, setAnalysisInitialFen] = useState<string>(STANDARD_START_FEN);
  const [analysisMoves, setAnalysisMoves] = useState<string[]>([]);
  const [analysisPly, setAnalysisPly] = useState<number>(0);
  const [analysisOrientation, setAnalysisOrientation] = useState<Color>('w');
  const [analysisReport, setAnalysisReport] = useState<CoachPositionReport | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [importText, setImportText] = useState('');
  const [importError, setImportError] = useState<string | null>(null);
  const [copiedFen, setCopiedFen] = useState(false);

  const analysisPositions = useMemo(() => {
    const list: { fen: string; lastMove: { from: string; to: string } | null }[] = [];
    const c = createChessFromInitialFen(analysisInitialFen);
    list.push({ fen: c.fen(), lastMove: null });
    for (const san of analysisMoves) {
      try {
        const m = c.move(san);
        if (!m) break;
        list.push({ fen: c.fen(), lastMove: { from: m.from, to: m.to } });
      } catch {
        break;
      }
    }
    return list;
  }, [analysisInitialFen, analysisMoves]);

  const currentAnalysisPos = analysisPositions[Math.min(analysisPly, analysisPositions.length - 1)] || analysisPositions[0];
  const analysisOpening = useMemo(
    () => (analysisInitialFen === STANDARD_START_FEN ? detectOpening(analysisMoves.slice(0, analysisPly)) : null),
    [analysisInitialFen, analysisMoves, analysisPly]
  );

  // Auto-evaluate current Analysis Board position with Coach MultiPV=3
  useEffect(() => {
    if (activeTab !== 'analysis') return;
    let cancelled = false;
    setAnalysisLoading(true);
    const timer = window.setTimeout(() => {
      void askCoachPosition(currentAnalysisPos.fen, { depth: 13, movetimeMs: 280, multiPv: 3 })
        .then((rep) => {
          if (!cancelled) setAnalysisReport(rep);
        })
        .finally(() => {
          if (!cancelled) setAnalysisLoading(false);
        });
    }, 120);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeTab, currentAnalysisPos.fen]);

  const handleAnalysisMove = (from: string, to: string, promotion?: PieceSymbol) => {
    const temp = new Chess(currentAnalysisPos.fen);
    const played = temp.move({ from, to, promotion: promotion || 'q' });
    if (!played) {
      playSound('illegal');
      return;
    }
    const base = analysisMoves.slice(0, analysisPly);
    const next = [...base, played.san];
    setAnalysisMoves(next);
    setAnalysisPly(next.length);
    if (temp.inCheck()) playSound('check');
    else if (played.captured) playSound('capture');
    else playSound('move');
  };

  const handleImportFenOrPgn = () => {
    const raw = importText.trim();
    if (!raw) return;
    setImportError(null);

    // Try FEN first
    try {
      const c = new Chess(raw);
      setAnalysisInitialFen(c.fen());
      setAnalysisMoves([]);
      setAnalysisPly(0);
      setImportText('');
      return;
    } catch {
      // Not a raw FEN — try PGN
    }

    try {
      const c = new Chess();
      c.loadPgn(raw);
      const fenHeader = c.header()['FEN'];
      const hist = c.history();
      setAnalysisInitialFen(fenHeader || STANDARD_START_FEN);
      setAnalysisMoves(hist);
      setAnalysisPly(hist.length);
      setImportText('');
    } catch {
      setImportError('Invalid FEN or PGN format. Paste a valid chess FEN string or PGN notation.');
    }
  };

  const handleCopyAnalysisFen = async () => {
    try {
      await navigator.clipboard.writeText(currentAnalysisPos.fen);
      setCopiedFen(true);
      window.setTimeout(() => setCopiedFen(false), 1800);
    } catch {
      // ignore
    }
  };

  // =========================================================================
  // TAB 3: OPENING EXPLORER STATE
  // =========================================================================
  const [openingCat, setOpeningCat] = useState<'All' | '1.e4' | '1.d4' | 'Flank'>('All');
  const [selectedOpening, setSelectedOpening] = useState<OpeningCatalogEntry>(FEATURED_OPENINGS[0]);
  const [openingStep, setOpeningStep] = useState<number>(FEATURED_OPENINGS[0].moves.length);

  const filteredOpenings = useMemo(
    () => (openingCat === 'All' ? FEATURED_OPENINGS : FEATURED_OPENINGS.filter((o) => o.category === openingCat)),
    [openingCat]
  );

  const openingPos = useMemo(() => {
    const c = new Chess();
    let lastMove: { from: string; to: string } | null = null;
    const target = Math.min(openingStep, selectedOpening.moves.length);
    for (let i = 0; i < target; i++) {
      try {
        const m = c.move(selectedOpening.moves[i]);
        if (m) lastMove = { from: m.from, to: m.to };
      } catch {
        break;
      }
    }
    return { fen: c.fen(), lastMove };
  }, [selectedOpening, openingStep]);

  const handlePracticeOpeningWithCoach = (entry: OpeningCatalogEntry, side: Color) => {
    startNewCoachGame({
      color: side,
      variant: 'standard',
      initialFen: STANDARD_START_FEN,
      presetMoves: entry.moves,
      label: `${entry.eco} ${entry.name}`,
    });
    setActiveTab('play');
  };

  // =========================================================================
  // TAB 4: BOARD VISION (30s) & ENDGAME DRILLS STATE
  // =========================================================================
  const [drillSubTab, setDrillSubTab] = useState<'vision' | 'endgames'>('vision');
  const [visionActive, setVisionActive] = useState(false);
  const [visionTimeLeft, setVisionTimeLeft] = useState(30);
  const [visionTarget, setVisionTarget] = useState<Square>('e4');
  const [visionScore, setVisionScore] = useState(0);
  const [visionAttempts, setVisionAttempts] = useState(0);
  const [visionStreak, setVisionStreak] = useState(0);
  const [visionOrientation, setVisionOrientation] = useState<Color>('w');
  const [visionShowCoords, setVisionShowCoords] = useState(false);
  const [visionLastFlash, setVisionLastFlash] = useState<'hit' | 'miss' | null>(null);
  const [visionNewRecord, setVisionNewRecord] = useState(false);

  useEffect(() => {
    if (!visionActive) return;
    if (visionTimeLeft <= 0) {
      setVisionActive(false);
      playSound('victory');
      void recordVisionScore(user.uid, visionScore).then((improved) => {
        if (improved) setVisionNewRecord(true);
      });
      return;
    }
    const id = window.setTimeout(() => setVisionTimeLeft((t) => t - 1), 1000);
    return () => window.clearTimeout(id);
  }, [visionActive, visionTimeLeft, visionScore, user.uid, playSound]);

  const startVisionDrill = () => {
    setVisionScore(0);
    setVisionAttempts(0);
    setVisionStreak(0);
    setVisionTimeLeft(30);
    setVisionTarget(randomSquare());
    setVisionLastFlash(null);
    setVisionNewRecord(false);
    setVisionActive(true);
    playSound('gameStart');
  };

  const handleVisionTap = (sq: Square) => {
    if (!visionActive) return;
    setVisionAttempts((a) => a + 1);
    if (sq === visionTarget) {
      setVisionScore((s) => s + 1);
      setVisionStreak((st) => st + 1);
      setVisionLastFlash('hit');
      setVisionTarget(randomSquare(sq));
      playSound('move');
    } else {
      setVisionStreak(0);
      setVisionLastFlash('miss');
      playSound('illegal');
    }
  };

  const launchEndgameDrill = (drill: EndgameDrill) => {
    startNewCoachGame({
      color: drill.playerColor,
      variant: 'standard',
      initialFen: drill.fen,
      presetMoves: [],
      label: `Endgame Drill: ${drill.title}`,
    });
    setCoachHint({
      from: '',
      to: '',
      san: '',
      advice: drill.coachTip,
    });
    setActiveTab('play');
  };

  const coachTopArrow =
    activeTab === 'play' && coachHint?.from && coachHint?.to
      ? { from: coachHint.from, to: coachHint.to }
      : null;

  const analysisTopArrow =
    analysisReport && analysisReport.bestMoveUci.length >= 4
      ? { from: analysisReport.bestMoveUci.slice(0, 2), to: analysisReport.bestMoveUci.slice(2, 4) }
      : null;

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-8">
      {/* Header & Tabs */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight flex items-center gap-2.5">
            <GraduationCap className="w-7 h-7 text-emerald-500" />
            Coach
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Play guided games, explore variations, master openings, and sharpen board vision with Coach.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37]">
          {(
            [
              { id: 'play', label: 'Play with Coach', icon: Swords },
              { id: 'analysis', label: 'Analysis Board', icon: Microscope },
              { id: 'openings', label: 'Openings', icon: BookOpen },
              { id: 'drills', label: 'Vision & Endgames', icon: Target },
            ] as { id: CoachTab; label: string; icon: React.ComponentType<{ className?: string }> }[]
          ).map((t) => {
            const Icon = t.icon;
            const active = activeTab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-emerald-600 text-white'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-[#312F2C]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* =================================================================== */}
      {/* TAB 1: PLAY WITH COACH                                              */}
      {/* =================================================================== */}
      {activeTab === 'play' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          {/* Board + EvalBar */}
          <div className="xl:col-span-7 flex items-stretch gap-2.5">
            <EvalBar
              evalCpWhite={coachEval.cpWhite}
              mateWhite={coachEval.mateWhite}
              orientation={coachOrientation}
              className="hidden sm:block"
            />
            <div className="flex-1 min-w-0 space-y-2.5">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <GraduationCap className="w-4 h-4 text-emerald-500" />
                  Coach · {coachTier === 'guided' ? 'Guided (1100)' : coachTier === 'club' ? 'Club (1600)' : 'Master (2200)'}
                  {coachThinking && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500 ml-1" />}
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  {coachActiveLabel}
                  {coachOpening ? ` · ${coachOpening.eco} ${coachOpening.name}` : ''}
                </span>
              </div>

              <ChessBoard
                fen={coachFen}
                orientation={coachOrientation}
                interactive={!coachIsOver && !coachThinking && coachGame.turn() === coachPlayerColor}
                allowedColor={coachPlayerColor}
                lastMove={coachLastMove}
                hintSquares={coachTopArrow}
                gameOutcome={coachOutcome}
                boardTheme={settings.boardTheme}
                pieceStyle={settings.pieceStyle}
                animationsEnabled={settings.animationsEnabled}
                showCoordinates={localPrefs.showCoordinates}
                autoQueen={localPrefs.autoQueen}
                onMove={handleCoachPlayerMove}
                onIllegalAttempt={() => playSound('illegal')}
              />

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void handleAskCoachHint()}
                    disabled={coachIsOver || coachHintLoading}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {coachHintLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Lightbulb className="w-3.5 h-3.5" />}
                    Ask Coach
                  </button>
                  <button
                    type="button"
                    onClick={handleCoachUndo}
                    disabled={coachMoves.length === 0 || coachThinking}
                    className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] disabled:opacity-40 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    Undo & Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => setCoachOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                    className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Flip
                  </button>
                </div>

                {coachMoves.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExportCoachPgn}
                    className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export PGN
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right Coach Feedback & Setup Panel */}
          <div className="xl:col-span-5 space-y-4">
            {/* Coach Live Commentary Card */}
            <div className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-emerald-500" />
                  Coach Feedback
                </span>
                <span className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  {coachMoves.length} plies
                </span>
              </div>

              {coachFeedback ? (
                <div
                  className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
                    coachFeedback.classification === 'blunder'
                      ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
                      : coachFeedback.classification === 'mistake'
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
                      : coachFeedback.classification === 'best'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
                      : 'bg-slate-50 dark:bg-[#1F1E1B] border-slate-200 dark:border-[#353330] text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono font-bold">
                      {coachFeedback.playedSan} · <span className="capitalize">{coachFeedback.classification}</span>
                    </span>
                    <span className="font-mono opacity-80 tabular-nums">Eval {coachFeedback.evalLabel}</span>
                  </div>
                  <p className="leading-relaxed">{coachFeedback.message}</p>
                </div>
              ) : (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  Make your move on the board and Coach will immediately grade your move quality, highlight stronger alternatives, and explain the best plan.
                </p>
              )}

              {coachHint && (
                <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-800 dark:text-emerald-200 space-y-1">
                  {coachHint.san && (
                    <p className="font-mono font-bold">Coach recommends: {coachHint.san}</p>
                  )}
                  <p className="leading-relaxed">{coachHint.advice}</p>
                </div>
              )}
            </div>

            {/* Coach Session Controls */}
            <div className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-5 space-y-4">
              <h2 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Session Setup
              </h2>

              <div className="space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Coach Playing Strength</p>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'guided', label: 'Guided', sub: '1100' },
                      { id: 'club', label: 'Club', sub: '1600' },
                      { id: 'master', label: 'Master', sub: '2200' },
                    ] as { id: CoachSkillTier; label: string; sub: string }[]
                  ).map((tier) => (
                    <button
                      key={tier.id}
                      type="button"
                      onClick={() => setCoachTier(tier.id)}
                      className={`p-2.5 rounded-lg border text-center transition-colors cursor-pointer ${
                        coachTier === tier.id
                          ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-[#3C3A37] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      <span className="block text-xs font-bold">{tier.label}</span>
                      <span className="block text-[11px] font-mono opacity-80 tabular-nums">{tier.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Your Side</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['w', 'b'] as Color[]).map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => startNewCoachGame({ color: c })}
                        className={`py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                          coachPlayerColor === c
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-[#3C3A37] text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {c === 'w' ? 'White' : 'Black'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Variant</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(['standard', 'chess960'] as MatchVariant[]).map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => startNewCoachGame({ variant: v })}
                        className={`py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                          coachVariant === v
                            ? 'border-emerald-500 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-[#3C3A37] text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {v === 'standard' ? 'Standard' : 'Chess960'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => startNewCoachGame({ variant: coachVariant, color: coachPlayerColor })}
                className="w-full py-2.5 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:opacity-90 text-xs font-semibold inline-flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                Start Fresh Coach Game
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: ANALYSIS BOARD (FREE SANDBOX + COACH TOP 3 LINES)            */}
      {/* =================================================================== */}
      {activeTab === 'analysis' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-7 flex items-stretch gap-2.5">
            <EvalBar
              evalCpWhite={analysisReport?.cpWhite ?? 15}
              mateWhite={analysisReport?.mateWhite ?? null}
              orientation={analysisOrientation}
              className="hidden sm:block"
            />
            <div className="flex-1 min-w-0 space-y-2.5">
              <div className="flex items-center justify-between text-xs px-1">
                <span className="font-semibold text-slate-900 dark:text-white">
                  {analysisOpening ? `${analysisOpening.eco} · ${analysisOpening.name}` : 'Free Analysis Board'}
                </span>
                <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  Ply {analysisPly} / {analysisMoves.length}
                </span>
              </div>

              <ChessBoard
                fen={currentAnalysisPos.fen}
                orientation={analysisOrientation}
                interactive={true}
                allowedColor="both"
                lastMove={currentAnalysisPos.lastMove}
                hintSquares={analysisTopArrow}
                boardTheme={settings.boardTheme}
                pieceStyle={settings.pieceStyle}
                animationsEnabled={settings.animationsEnabled}
                showCoordinates={localPrefs.showCoordinates}
                autoQueen={localPrefs.autoQueen}
                onMove={handleAnalysisMove}
                onIllegalAttempt={() => playSound('illegal')}
              />

              {/* Step & Board Controls */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAnalysisPly(0)}
                    disabled={analysisPly === 0}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-[#312F2C] disabled:opacity-40 text-slate-700 dark:text-slate-200 cursor-pointer"
                    aria-label="Start position"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalysisPly((p) => Math.max(0, p - 1))}
                    disabled={analysisPly === 0}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-[#312F2C] disabled:opacity-40 text-slate-700 dark:text-slate-200 cursor-pointer"
                    aria-label="Previous move"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalysisPly((p) => Math.min(analysisMoves.length, p + 1))}
                    disabled={analysisPly >= analysisMoves.length}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-[#312F2C] disabled:opacity-40 text-slate-700 dark:text-slate-200 cursor-pointer"
                    aria-label="Next move"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAnalysisPly(analysisMoves.length)}
                    disabled={analysisPly >= analysisMoves.length}
                    className="p-2 rounded-lg bg-slate-100 dark:bg-[#312F2C] disabled:opacity-40 text-slate-700 dark:text-slate-200 cursor-pointer"
                    aria-label="Latest position"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setAnalysisOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#312F2C] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Flip
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const pos = getChess960Position(randomChess960Id());
                      setAnalysisInitialFen(pos.fen);
                      setAnalysisMoves([]);
                      setAnalysisPly(0);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#312F2C] text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Shuffle className="w-3.5 h-3.5 text-emerald-500" />
                    Chess960
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAnalysisInitialFen(STANDARD_START_FEN);
                      setAnalysisMoves([]);
                      setAnalysisPly(0);
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#312F2C] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Right Analysis Lines & FEN/PGN Panel */}
          <div className="xl:col-span-5 space-y-4">
            {/* Coach Top 3 Lines */}
            <div className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <GraduationCap className="w-4 h-4 text-emerald-500" />
                  Coach Top Lines
                </span>
                <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                  {analysisLoading ? 'Thinking...' : analysisReport ? `Depth ${analysisReport.depth}` : ''}
                </span>
              </div>

              {analysisReport && (
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  <span className="font-semibold text-slate-900 dark:text-white">{analysisReport.headline}.</span>{' '}
                  {analysisReport.advice}
                </p>
              )}

              <div className="space-y-1.5">
                {(analysisReport?.lines || []).map((line) => (
                  <button
                    key={line.rank}
                    type="button"
                    onClick={() => {
                      if (line.firstMoveUci.length >= 4) {
                        handleAnalysisMove(
                          line.firstMoveUci.slice(0, 2),
                          line.firstMoveUci.slice(2, 4),
                          line.firstMoveUci[4] as PieceSymbol | undefined
                        );
                      }
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#1F1E1B] hover:bg-emerald-500/10 border border-slate-200/80 dark:border-[#353330] flex items-center gap-3 transition-colors cursor-pointer"
                    title="Click to play Coach's top move"
                  >
                    <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 w-12 shrink-0 tabular-nums">
                      {line.evalLabel}
                    </span>
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-200 truncate">
                      {line.pvSan.join(' ')}
                    </span>
                  </button>
                ))}
                {!analysisLoading && (!analysisReport || analysisReport.lines.length === 0) && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                    No legal moves remaining in this position.
                  </p>
                )}
              </div>
            </div>

            {/* Import / Export FEN & PGN */}
            <div className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
                  FEN & PGN Studio
                </h3>
                <button
                  type="button"
                  onClick={() => void handleCopyAnalysisFen()}
                  className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1 cursor-pointer"
                >
                  {copiedFen ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedFen ? 'Copied FEN' : 'Copy FEN'}
                </button>
              </div>

              <textarea
                rows={3}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder="Paste any FEN position or full PGN game here..."
                className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-[#1F1E1B] border border-slate-200 dark:border-[#3C3A37] text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:border-emerald-500"
              />
              {importError && <p className="text-xs text-red-500">{importError}</p>}

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={handleImportFenOrPgn}
                  className="px-3.5 py-2 rounded-lg btn-chess-primary text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Load Position
                </button>
                <button
                  type="button"
                  onClick={() => {
                    startNewCoachGame({
                      color: new Chess(currentAnalysisPos.fen).turn(),
                      variant: analysisInitialFen === STANDARD_START_FEN ? 'standard' : 'chess960',
                      initialFen: currentAnalysisPos.fen,
                      presetMoves: [],
                      label: 'Custom Position vs Coach',
                    });
                    setActiveTab('play');
                  }}
                  className="px-3.5 py-2 rounded-lg bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  Play This vs Coach
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: OPENING EXPLORER                                             */}
      {/* =================================================================== */}
      {activeTab === 'openings' && (
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
          <div className="xl:col-span-6 space-y-3">
            <ChessBoard
              fen={openingPos.fen}
              orientation="w"
              interactive={false}
              lastMove={openingPos.lastMove}
              boardTheme={settings.boardTheme}
              pieceStyle={settings.pieceStyle}
              animationsEnabled={settings.animationsEnabled}
              showCoordinates={localPrefs.showCoordinates}
            />
            <div className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-bold">
                    {selectedOpening.eco} · {selectedOpening.category}
                  </p>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    {selectedOpening.name}
                  </h2>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setOpeningStep((s) => Math.max(0, s - 1))}
                    disabled={openingStep === 0}
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#312F2C] disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setOpeningStep((s) => Math.min(selectedOpening.moves.length, s + 1))}
                    disabled={openingStep >= selectedOpening.moves.length}
                    className="p-1.5 rounded-lg bg-slate-100 dark:bg-[#312F2C] disabled:opacity-40 cursor-pointer"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-xs font-mono text-slate-600 dark:text-slate-300">
                {selectedOpening.moves.join(' ')}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                {selectedOpening.idea}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handlePracticeOpeningWithCoach(selectedOpening, 'w')}
                  className="px-3.5 py-2 rounded-lg btn-chess-primary text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Swords className="w-3.5 h-3.5" />
                  Practice as White vs Coach
                </button>
                <button
                  type="button"
                  onClick={() => handlePracticeOpeningWithCoach(selectedOpening, 'b')}
                  className="px-3.5 py-2 rounded-lg bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-800 dark:text-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Practice as Black vs Coach
                </button>
              </div>
            </div>
          </div>

          <div className="xl:col-span-6 bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Opening Repertoire ({filteredOpenings.length})
              </h2>
              <div className="flex items-center gap-1">
                {(['All', '1.e4', '1.d4', 'Flank'] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setOpeningCat(cat)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                      openingCat === cat
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-[#312F2C] text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2 max-h-[540px] overflow-y-auto pr-1">
              {filteredOpenings.map((op) => {
                const active = op.name === selectedOpening.name && op.eco === selectedOpening.eco;
                return (
                  <button
                    key={`${op.eco}-${op.name}`}
                    type="button"
                    onClick={() => {
                      setSelectedOpening(op);
                      setOpeningStep(op.moves.length);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition-colors cursor-pointer ${
                      active
                        ? 'border-emerald-500 bg-emerald-500/8'
                        : 'border-slate-200 dark:border-[#353330] hover:border-slate-400 bg-slate-50/70 dark:bg-[#1F1E1B]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-white">{op.name}</p>
                      <span className="font-mono text-xs text-emerald-600 dark:text-emerald-400 font-semibold shrink-0">
                        {op.eco}
                      </span>
                    </div>
                    <p className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">
                      {op.moves.join(' ')}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: BOARD VISION (30s) & ENDGAME DRILLS                          */}
      {/* =================================================================== */}
      {activeTab === 'drills' && (
        <div className="space-y-5">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDrillSubTab('vision')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                drillSubTab === 'vision'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] text-slate-700 dark:text-slate-200'
              }`}
            >
              <Crosshair className="w-3.5 h-3.5" />
              Board Vision Trainer (30s)
            </button>
            <button
              type="button"
              onClick={() => setDrillSubTab('endgames')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors ${
                drillSubTab === 'endgames'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] text-slate-700 dark:text-slate-200'
              }`}
            >
              <Flag className="w-3.5 h-3.5" />
              Endgame Drills ({ENDGAME_DRILLS.length})
            </button>
          </div>

          {drillSubTab === 'vision' ? (
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
              <div className="xl:col-span-7 relative">
                <ChessBoard
                  fen="8/8/8/8/8/8/8/8 w - - 0 1"
                  orientation={visionOrientation}
                  interactive={false}
                  showCoordinates={visionShowCoords}
                  boardTheme={settings.boardTheme}
                  pieceStyle={settings.pieceStyle}
                  animationsEnabled={false}
                  onSquareTap={handleVisionTap}
                />
                {visionActive && (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <span
                      className={`font-mono text-6xl sm:text-7xl font-black tracking-tight drop-shadow-[0_4px_16px_rgba(0,0,0,0.65)] ${
                        visionLastFlash === 'miss' ? 'text-red-400' : 'text-white'
                      }`}
                    >
                      {visionTarget}
                    </span>
                  </div>
                )}
              </div>

              <div className="xl:col-span-5 bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-6 space-y-5">
                <div>
                  <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                    Coordinate Speed Drill
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Click the square shown on the board as quickly and accurately as possible in 30 seconds.
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1F1E1B] border border-slate-200 dark:border-[#353330]">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center justify-center gap-1">
                      <Timer className="w-3 h-3" /> Time
                    </p>
                    <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                      {visionTimeLeft}s
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1F1E1B] border border-slate-200 dark:border-[#353330]">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Score</p>
                    <p className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                      {visionScore}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1F1E1B] border border-slate-200 dark:border-[#353330]">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Best</p>
                    <p className="font-mono text-2xl font-bold text-amber-500 tabular-nums mt-0.5">
                      {Math.max(progression?.visionBest ?? 0, visionScore)}
                    </p>
                  </div>
                </div>

                {visionAttempts > 0 && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                    Accuracy: {Math.round((visionScore / visionAttempts) * 100)}% · Current Streak: {visionStreak}
                    {visionNewRecord ? ' · New Personal Record!' : ''}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setVisionOrientation((o) => (o === 'w' ? 'b' : 'w'))}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#312F2C] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Perspective: {visionOrientation === 'w' ? 'White' : 'Black'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setVisionShowCoords((c) => !c)}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#312F2C] text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    Coords: {visionShowCoords ? 'Shown' : 'Hidden (Pro)'}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={startVisionDrill}
                  className="w-full py-3 rounded-xl btn-chess-primary font-semibold text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  {visionActive ? 'Restart 30s Drill' : 'Start 30s Vision Drill'}
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ENDGAME_DRILLS.map((drill) => (
                <div
                  key={drill.id}
                  className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-5 flex flex-col justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                        {drill.difficulty}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Play as {drill.playerColor === 'w' ? 'White' : 'Black'}
                      </span>
                    </div>
                    <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                      {drill.title}
                    </h3>
                    <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">{drill.goal}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 italic leading-relaxed">
                      Coach tip: {drill.coachTip}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => launchEndgameDrill(drill)}
                    className="w-full py-2.5 rounded-lg btn-chess-primary text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Swords className="w-3.5 h-3.5" />
                    Practice vs Coach
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
