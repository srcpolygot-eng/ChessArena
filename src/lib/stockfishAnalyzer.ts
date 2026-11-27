import { Chess, type PieceSymbol } from 'chess.js';
import { computeBestBotMove } from './chessEngine';
import { createChessFromInitialFen } from './chess960';
import type { ComputerBot } from '../types/chess';

export type MoveClassification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export interface AnalyzedMove {
  ply: number;
  moveNumber: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  bestMoveUci: string;
  bestMoveSan: string;
  evalBeforeWhiteCp: number;
  evalAfterWhiteCp: number;
  evalBeforeMate: number | null;
  evalAfterMate: number | null;
  evalLabel: string;
  centipawnLoss: number;
  winPctBefore: number;
  winPctAfter: number;
  winPctDrop: number;
  classification: MoveClassification;
  accuracy: number;
  coachComment: string;
}

export interface SideAnalysisStats {
  accuracy: number;
  bestCount: number;
  goodCount: number;
  inaccuracyCount: number;
  mistakeCount: number;
  blunderCount: number;
  avgCentipawnLoss: number;
}

export interface GameAnalysisResult {
  engineName: string;
  depth: number;
  moves: AnalyzedMove[];
  evalSeriesWhiteCp: number[];
  white: SideAnalysisStats;
  black: SideAnalysisStats;
  blunders: AnalyzedMove[];
  mistakes: AnalyzedMove[];
  bestMoves: AnalyzedMove[];
}

interface PositionEval {
  cpWhite: number;
  mateWhite: number | null;
  bestMoveUci: string;
}

export interface AnalysisProgress {
  completed: number;
  total: number;
  engineName: string;
}

/** Convert centipawns (White perspective) to White's expected winning percentage (0-100). */
export function cpToWinPercentage(cp: number): number {
  const clamped = Math.max(-1500, Math.min(1500, cp));
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * clamped)) - 1);
}

/** Format a White-perspective evaluation nicely (e.g. "+1.4", "-0.6", "M3", "-M2"). */
export function formatWhiteEval(cpWhite: number, mateWhite: number | null): string {
  if (mateWhite !== null) {
    if (mateWhite === 0) return '#';
    return mateWhite > 0 ? `M${mateWhite}` : `-M${Math.abs(mateWhite)}`;
  }
  const pawns = cpWhite / 100;
  if (Math.abs(pawns) < 0.05) return '0.0';
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

function moveAccuracyFromWinDrop(winDrop: number): number {
  if (winDrop <= 0.3) return 100;
  const raw = 103.1668 * Math.exp(-0.04354 * winDrop) - 3.1669;
  return Math.max(0, Math.min(100, Math.round(raw * 10) / 10));
}

function classifyMove(params: {
  playedUci: string;
  bestMoveUci: string;
  isCheckmateMove: boolean;
  winDrop: number;
  cpLoss: number;
  missedForcedMate: boolean;
}): MoveClassification {
  const { playedUci, bestMoveUci, isCheckmateMove, winDrop, cpLoss, missedForcedMate } = params;

  if (isCheckmateMove || (bestMoveUci && playedUci === bestMoveUci)) {
    return 'best';
  }
  if (winDrop >= 18 || (cpLoss >= 250 && winDrop >= 10) || (missedForcedMate && winDrop >= 12)) {
    return 'blunder';
  }
  if (winDrop >= 9 || (cpLoss >= 120 && winDrop >= 6)) {
    return 'mistake';
  }
  if (winDrop >= 4.5 || cpLoss >= 60) {
    return 'inaccuracy';
  }
  if (winDrop <= 1.0 && cpLoss <= 20) {
    return 'best';
  }
  return 'good';
}

function buildCoachMoveComment(params: {
  san: string;
  bestMoveSan: string;
  classification: MoveClassification;
  isCheckmateMove: boolean;
  missedForcedMate: boolean;
  cpLoss: number;
}): string {
  const { san, bestMoveSan, classification, isCheckmateMove, missedForcedMate, cpLoss } = params;
  if (isCheckmateMove) {
    return `${san} delivers checkmate — clinical finish!`;
  }
  if (missedForcedMate && bestMoveSan && bestMoveSan !== san) {
    return `You had a forced checkmate starting with ${bestMoveSan}. ${san} lets the opponent stay in the game.`;
  }
  const pawnsLost = (cpLoss / 100).toFixed(1);
  switch (classification) {
    case 'best':
      if (san.includes('+')) return `${san} is the strongest move, keeping maximum initiative with check.`;
      if (san.includes('x')) return `Sharp capture! ${san} was Coach's top choice in this position.`;
      if (san === 'O-O' || san === 'O-O-O') return `Great timing to castle (${san}) and secure your king.`;
      return `${san} is the top move, maintaining full control of the position.`;
    case 'good':
      return bestMoveSan && bestMoveSan !== san
        ? `${san} is solid and playable. Coach slightly preferred ${bestMoveSan}.`
        : `${san} keeps a healthy position.`;
    case 'inaccuracy':
      return bestMoveSan && bestMoveSan !== san
        ? `${san} gives up a bit of momentum (-${pawnsLost}). Playing ${bestMoveSan} kept stronger pressure.`
        : `${san} is slightly imprecise, loosening control of key squares.`;
    case 'mistake':
      return bestMoveSan && bestMoveSan !== san
        ? `${san} is a mistake (-${pawnsLost}). ${bestMoveSan} was much stronger here.`
        : `${san} weakens your position significantly.`;
    case 'blunder':
      return bestMoveSan && bestMoveSan !== san
        ? `${san} is a costly blunder (-${pawnsLost}). Coach recommends ${bestMoveSan} instead.`
        : `${san} drops a decisive advantage.`;
  }
}

function uciToSan(fen: string, uci: string): string {
  if (!uci || uci.length < 4 || uci === '(none)') return '';
  try {
    const chess = new Chess(fen);
    const from = uci.slice(0, 2);
    const to = uci.slice(2, 4);
    const promotion = uci.length >= 5 ? (uci[4] as PieceSymbol) : undefined;
    const moved = chess.move({ from, to, promotion });
    return moved ? moved.san : uci;
  } catch {
    return uci;
  }
}

class CoachWorkerClient {
  private worker: Worker;
  private listeners: Set<(line: string) => void> = new Set();
  private terminated = false;

  constructor(scriptUrl = '/engine/stockfish-19-lite-single.js') {
    this.worker = new Worker(scriptUrl);
    this.worker.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== 'string') return;
      for (const listener of this.listeners) {
        listener(event.data);
      }
    };
  }

  private waitForLine(
    predicate: (line: string) => boolean,
    timeoutMs: number,
    signal?: AbortSignal
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.terminated || signal?.aborted) {
        reject(new DOMException('Analysis aborted', 'AbortError'));
        return;
      }

      const timer = window.setTimeout(() => {
        cleanup();
        reject(new Error('Coach analysis timed out'));
      }, timeoutMs);

      const onAbort = () => {
        cleanup();
        this.terminate();
        reject(new DOMException('Analysis aborted', 'AbortError'));
      };

      const onMessage = (line: string) => {
        if (predicate(line)) {
          cleanup();
          resolve(line);
        }
      };

      const onError = () => {
        cleanup();
        reject(new Error('Coach could not initialize in this browser.'));
      };

      const cleanup = () => {
        window.clearTimeout(timer);
        this.listeners.delete(onMessage);
        this.worker.removeEventListener('error', onError);
        signal?.removeEventListener('abort', onAbort);
      };

      this.listeners.add(onMessage);
      this.worker.addEventListener('error', onError);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
  }

  async init(signal?: AbortSignal): Promise<void> {
    const uciReady = this.waitForLine((l) => l.includes('uciok'), 8000, signal);
    this.worker.postMessage('uci');
    await uciReady;

    this.worker.postMessage('setoption name Hash value 16');
    this.worker.postMessage('ucinewgame');

    const readyPromise = this.waitForLine((l) => l.includes('readyok'), 5000, signal);
    this.worker.postMessage('isready');
    await readyPromise;
  }

  async evaluateFen(
    fen: string,
    turn: 'w' | 'b',
    depth: number,
    movetimeMs: number,
    signal?: AbortSignal
  ): Promise<PositionEval> {
    let latestDepth = -1;
    let latestCpSide = 0;
    let latestMateSide: number | null = null;
    let latestPvMove = '';

    const captureInfo = (line: string) => {
      if (!line.startsWith('info ')) return;
      const depthMatch = line.match(/\bdepth (\d+)/);
      const d = depthMatch ? Number.parseInt(depthMatch[1], 10) : 0;
      const isBound = line.includes(' upperbound') || line.includes(' lowerbound');

      const cpMatch = line.match(/\bscore cp (-?\d+)/);
      const mateMatch = line.match(/\bscore mate (-?\d+)/);
      if (!cpMatch && !mateMatch) return;

      if (d >= latestDepth && (!isBound || d > latestDepth)) {
        latestDepth = d;
        if (mateMatch) {
          const m = Number.parseInt(mateMatch[1], 10);
          latestMateSide = m;
          latestCpSide = m >= 0 ? 10000 - m * 10 : -10000 - m * 10;
        } else if (cpMatch) {
          latestMateSide = null;
          latestCpSide = Number.parseInt(cpMatch[1], 10);
        }

        const pvMatch = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)/);
        if (pvMatch) {
          latestPvMove = pvMatch[1];
        }
      }
    };

    this.listeners.add(captureInfo);
    try {
      const bestLine = await new Promise<string>((resolve, reject) => {
        this.waitForLine((l) => l.startsWith('bestmove '), Math.max(4000, movetimeMs + 3000), signal)
          .then(resolve)
          .catch(reject);
        this.worker.postMessage(`position fen ${fen}`);
        this.worker.postMessage(`go depth ${depth} movetime ${movetimeMs}`);
      });

      const bestMatch = bestLine.match(/^bestmove (\S+)/);
      const bestMove = bestMatch && bestMatch[1] !== '(none)' ? bestMatch[1] : latestPvMove;

      const sign = turn === 'w' ? 1 : -1;
      const cpWhite = latestCpSide * sign;
      const mateWhite = latestMateSide !== null ? latestMateSide * sign : null;

      return { cpWhite, mateWhite, bestMoveUci: bestMove };
    } finally {
      this.listeners.delete(captureInfo);
    }
  }

  terminate(): void {
    if (this.terminated) return;
    this.terminated = true;
    try {
      this.worker.postMessage('quit');
    } catch {
      // ignore
    }
    this.worker.terminate();
  }
}

const FALLBACK_ANALYSIS_BOT: ComputerBot = {
  id: 'analysis_fallback',
  difficulty: 'flash',
  name: 'Coach',
  username: 'Coach',
  rating: 2050,
  tagline: 'Coach analyzer',
  avatar: '',
  depth: 2,
  blunderChance: 0,
  timeBudgetMs: 45,
};

function evaluateWithLocalFallback(fen: string): PositionEval {
  const chess = new Chess(fen);
  const best = computeBestBotMove(fen, FALLBACK_ANALYSIS_BOT);
  const bestMoveUci = best ? `${best.from}${best.to}${best.promotion || ''}` : '';

  const values: Record<PieceSymbol, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  let score = 0;
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      score += sq.color === 'w' ? values[sq.type] : -values[sq.type];
    }
  }
  return { cpWhite: score, mateWhite: null, bestMoveUci };
}

function summarizeSide(moves: AnalyzedMove[], color: 'w' | 'b'): SideAnalysisStats {
  const sideMoves = moves.filter((m) => m.color === color);
  if (sideMoves.length === 0) {
    return {
      accuracy: 100,
      bestCount: 0,
      goodCount: 0,
      inaccuracyCount: 0,
      mistakeCount: 0,
      blunderCount: 0,
      avgCentipawnLoss: 0,
    };
  }

  let accSum = 0;
  let cplSum = 0;
  let bestCount = 0;
  let goodCount = 0;
  let inaccuracyCount = 0;
  let mistakeCount = 0;
  let blunderCount = 0;

  for (const m of sideMoves) {
    accSum += m.accuracy;
    cplSum += m.centipawnLoss;
    if (m.classification === 'best') bestCount++;
    else if (m.classification === 'good') goodCount++;
    else if (m.classification === 'inaccuracy') inaccuracyCount++;
    else if (m.classification === 'mistake') mistakeCount++;
    else if (m.classification === 'blunder') blunderCount++;
  }

  return {
    accuracy: Math.round((accSum / sideMoves.length) * 10) / 10,
    bestCount,
    goodCount,
    inaccuracyCount,
    mistakeCount,
    blunderCount,
    avgCentipawnLoss: Math.round(cplSum / sideMoves.length),
  };
}

export async function analyzeMatchWithStockfish(params: {
  moves: string[];
  initialFen?: string;
  depth?: number;
  movetimeMs?: number;
  signal?: AbortSignal;
  onProgress?: (progress: AnalysisProgress) => void;
}): Promise<GameAnalysisResult> {
  const { moves, initialFen, depth = 10, movetimeMs = 95, signal, onProgress } = params;

  const chess = createChessFromInitialFen(initialFen);
  const snapshots: {
    fen: string;
    turn: 'w' | 'b';
    isCheckmate: boolean;
    isDraw: boolean;
  }[] = [
    {
      fen: chess.fen(),
      turn: chess.turn(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw() || chess.isStalemate() || chess.isInsufficientMaterial(),
    },
  ];

  const playedMeta: {
    ply: number;
    moveNumber: number;
    color: 'w' | 'b';
    san: string;
    uci: string;
    isCheckmateMove: boolean;
  }[] = [];

  for (let i = 0; i < moves.length; i++) {
    const moved = chess.move(moves[i]);
    if (!moved) break;
    playedMeta.push({
      ply: i + 1,
      moveNumber: Math.floor(i / 2) + 1,
      color: moved.color,
      san: moved.san,
      uci: `${moved.from}${moved.to}${moved.promotion || ''}`,
      isCheckmateMove: chess.isCheckmate(),
    });
    snapshots.push({
      fen: chess.fen(),
      turn: chess.turn(),
      isCheckmate: chess.isCheckmate(),
      isDraw: chess.isDraw() || chess.isStalemate() || chess.isInsufficientMaterial(),
    });
  }

  let client: CoachWorkerClient | null = null;
  let engineName = 'Coach';

  if (typeof Worker !== 'undefined') {
    try {
      client = new CoachWorkerClient('/engine/stockfish-19-lite-single.js');
      await client.init(signal);
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw err;
      }
      client?.terminate();
      client = null;
      engineName = 'Coach (Fast)';
    }
  } else {
    engineName = 'Coach (Fast)';
  }

  const totalPositions = snapshots.length;
  const evals: PositionEval[] = [];

  try {
    for (let i = 0; i < totalPositions; i++) {
      if (signal?.aborted) {
        throw new DOMException('Analysis aborted', 'AbortError');
      }

      const snap = snapshots[i];
      onProgress?.({ completed: i, total: totalPositions, engineName });

      let posEval: PositionEval;
      if (snap.isCheckmate) {
        posEval = {
          cpWhite: snap.turn === 'w' ? -10000 : 10000,
          mateWhite: 0,
          bestMoveUci: '',
        };
      } else if (snap.isDraw) {
        posEval = {
          cpWhite: 0,
          mateWhite: null,
          bestMoveUci: '',
        };
      } else if (client) {
        try {
          posEval = await client.evaluateFen(snap.fen, snap.turn, depth, movetimeMs, signal);
        } catch (err) {
          if (err instanceof DOMException && err.name === 'AbortError') throw err;
          posEval = evaluateWithLocalFallback(snap.fen);
        }
      } else {
        posEval = evaluateWithLocalFallback(snap.fen);
      }

      evals.push(posEval);
    }
    onProgress?.({ completed: totalPositions, total: totalPositions, engineName });
  } finally {
    client?.terminate();
  }

  const analyzedMoves: AnalyzedMove[] = [];

  for (let i = 0; i < playedMeta.length; i++) {
    const meta = playedMeta[i];
    const before = evals[i];
    const after = evals[i + 1];
    const fenBefore = snapshots[i].fen;

    const signMover = meta.color === 'w' ? 1 : -1;
    const evalBeforeMover = before.cpWhite * signMover;
    const evalAfterMover = after.cpWhite * signMover;

    const winWhiteBefore = cpToWinPercentage(before.cpWhite);
    const winWhiteAfter = cpToWinPercentage(after.cpWhite);

    const winPctBefore = meta.color === 'w' ? winWhiteBefore : 100 - winWhiteBefore;
    const winPctAfter = meta.color === 'w' ? winWhiteAfter : 100 - winWhiteAfter;
    const winPctDrop = meta.isCheckmateMove ? 0 : Math.max(0, winPctBefore - winPctAfter);

    const cpLoss = meta.isCheckmateMove ? 0 : Math.max(0, evalBeforeMover - evalAfterMover);
    const missedForcedMate =
      before.mateWhite !== null &&
      before.mateWhite * signMover > 0 &&
      (after.mateWhite === null || after.mateWhite * signMover <= 0);

    const classification = classifyMove({
      playedUci: meta.uci,
      bestMoveUci: before.bestMoveUci,
      isCheckmateMove: meta.isCheckmateMove,
      winDrop: winPctDrop,
      cpLoss,
      missedForcedMate,
    });

    const bestMoveSan = before.bestMoveUci ? uciToSan(fenBefore, before.bestMoveUci) : meta.san;
    const coachComment = buildCoachMoveComment({
      san: meta.san,
      bestMoveSan: bestMoveSan || meta.san,
      classification,
      isCheckmateMove: meta.isCheckmateMove,
      missedForcedMate,
      cpLoss,
    });

    analyzedMoves.push({
      ply: meta.ply,
      moveNumber: meta.moveNumber,
      color: meta.color,
      san: meta.san,
      uci: meta.uci,
      bestMoveUci: before.bestMoveUci || meta.uci,
      bestMoveSan: bestMoveSan || meta.san,
      evalBeforeWhiteCp: before.cpWhite,
      evalAfterWhiteCp: after.cpWhite,
      evalBeforeMate: before.mateWhite,
      evalAfterMate: after.mateWhite,
      evalLabel: meta.isCheckmateMove ? '#' : formatWhiteEval(after.cpWhite, after.mateWhite),
      centipawnLoss: Math.round(cpLoss),
      winPctBefore: Math.round(winPctBefore * 10) / 10,
      winPctAfter: Math.round(winPctAfter * 10) / 10,
      winPctDrop: Math.round(winPctDrop * 10) / 10,
      classification,
      accuracy: meta.isCheckmateMove ? 100 : moveAccuracyFromWinDrop(winPctDrop),
      coachComment,
    });
  }

  return {
    engineName,
    depth,
    moves: analyzedMoves,
    evalSeriesWhiteCp: evals.map((e) => e.cpWhite),
    white: summarizeSide(analyzedMoves, 'w'),
    black: summarizeSide(analyzedMoves, 'b'),
    blunders: analyzedMoves.filter((m) => m.classification === 'blunder'),
    mistakes: analyzedMoves.filter((m) => m.classification === 'mistake'),
    bestMoves: analyzedMoves.filter((m) => m.classification === 'best'),
  };
}
