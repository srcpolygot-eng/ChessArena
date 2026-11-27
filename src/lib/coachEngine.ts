import { Chess, type PieceSymbol } from 'chess.js';
import { computeBestBotMove, evaluatePositionFast, MINIMAX_H1_FLASH } from './chessEngine';
import { cpToWinPercentage, formatWhiteEval, type MoveClassification } from './stockfishAnalyzer';

export interface CoachCandidateLine {
  rank: number;
  cpWhite: number;
  mateWhite: number | null;
  evalLabel: string;
  firstMoveUci: string;
  firstMoveSan: string;
  pvSan: string[];
}

export interface CoachPositionReport {
  cpWhite: number;
  mateWhite: number | null;
  evalLabel: string;
  depth: number;
  bestMoveUci: string;
  bestMoveSan: string;
  lines: CoachCandidateLine[];
  headline: string;
  advice: string;
}

export interface CoachMoveFeedback {
  classification: MoveClassification;
  playedSan: string;
  bestMoveSan: string;
  bestMoveUci: string;
  cpLoss: number;
  evalLabel: string;
  message: string;
}

export type CoachSkillTier = 'guided' | 'club' | 'master';

function pvUciToSan(fen: string, uciMoves: string[], maxPlies = 6): string[] {
  const chess = new Chess(fen);
  const out: string[] = [];
  for (const uci of uciMoves.slice(0, maxPlies)) {
    if (!uci || uci.length < 4) break;
    try {
      const m = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci.length >= 5 ? (uci[4] as PieceSymbol) : undefined,
      });
      if (!m) break;
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

function describePositionForCoach(
  chess: Chess,
  cpWhite: number,
  mateWhite: number | null,
  bestMoveSan: string
): { headline: string; advice: string } {
  const sideLabel = chess.turn() === 'w' ? 'White' : 'Black';

  if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? 'Black' : 'White';
    return {
      headline: `Checkmate — ${winner} wins!`,
      advice: 'The king has no legal escape squares.',
    };
  }
  if (chess.isStalemate()) {
    return {
      headline: 'Stalemate — Drawn position',
      advice: `${sideLabel} has no legal moves but is not in check.`,
    };
  }
  if (chess.isDraw()) {
    return {
      headline: 'Drawn position',
      advice: 'Neither side can force a win under standard draw rules.',
    };
  }

  if (mateWhite !== null) {
    const matingSide = mateWhite > 0 ? 'White' : 'Black';
    const plies = Math.abs(mateWhite);
    const headline = `${matingSide} has a forced mate in ${plies}`;
    const advice = bestMoveSan
      ? `Play ${bestMoveSan} to stay on the forced checkmate path.`
      : 'Calculate forcing checks to finish the attack cleanly.';
    return { headline, advice };
  }

  let headline = 'Balanced position';
  if (cpWhite >= 250) headline = 'White has a winning advantage';
  else if (cpWhite >= 90) headline = 'White stands clearly better';
  else if (cpWhite <= -250) headline = 'Black has a winning advantage';
  else if (cpWhite <= -90) headline = 'Black stands clearly better';

  const tips: string[] = [];
  if (bestMoveSan) {
    if (bestMoveSan.includes('#')) {
      tips.push(`${bestMoveSan} delivers checkmate right away!`);
    } else if (bestMoveSan.includes('+')) {
      tips.push(`Look closely at ${bestMoveSan} — it gives check and seizes the initiative.`);
    } else if (bestMoveSan.includes('x')) {
      tips.push(`${bestMoveSan} wins key material or removes a crucial defender.`);
    } else if (bestMoveSan === 'O-O' || bestMoveSan === 'O-O-O') {
      tips.push(`Castling (${bestMoveSan}) tucks your king to safety and activates your rook.`);
    } else {
      tips.push(`Coach likes ${bestMoveSan} to improve piece activity and central control.`);
    }
  }

  if (chess.inCheck()) {
    tips.push(`${sideLabel} is in check and must answer the threat immediately.`);
  }

  return {
    headline,
    advice: tips.join(' ') || `Focus on active piece coordination for ${sideLabel}.`,
  };
}

class PersistentCoachEngine {
  private worker: Worker | null = null;
  private initPromise: Promise<boolean> | null = null;
  private listeners: Set<(line: string) => void> = new Set();
  private busyQueue: Promise<unknown> = Promise.resolve();

  private async ensureReady(): Promise<boolean> {
    if (typeof Worker === 'undefined') return false;
    if (this.initPromise) return this.initPromise;

    this.initPromise = new Promise<boolean>((resolve) => {
      try {
        const w = new Worker('/engine/stockfish-19-lite-single.js');
        this.worker = w;

        const timer = window.setTimeout(() => {
          cleanup();
          this.dispose();
          resolve(false);
        }, 7000);

        let stage: 'uci' | 'ready' = 'uci';
        const onLine = (line: string) => {
          if (stage === 'uci' && line.includes('uciok')) {
            stage = 'ready';
            w.postMessage('setoption name Hash value 16');
            w.postMessage('isready');
          } else if (stage === 'ready' && line.includes('readyok')) {
            cleanup();
            resolve(true);
          }
        };

        const onError = () => {
          cleanup();
          this.dispose();
          resolve(false);
        };

        const cleanup = () => {
          window.clearTimeout(timer);
          this.listeners.delete(onLine);
          w.removeEventListener('error', onError);
        };

        w.onmessage = (e: MessageEvent<unknown>) => {
          if (typeof e.data !== 'string') return;
          for (const fn of this.listeners) fn(e.data);
        };
        w.addEventListener('error', onError);
        this.listeners.add(onLine);
        w.postMessage('uci');
      } catch {
        this.dispose();
        resolve(false);
      }
    });

    return this.initPromise;
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.busyQueue.then(task, task);
    this.busyQueue = run.catch(() => {});
    return run;
  }

  async analyze(
    fen: string,
    opts?: { depth?: number; movetimeMs?: number; multiPv?: number }
  ): Promise<CoachPositionReport> {
    return this.enqueue(async () => {
      const chess = new Chess(fen);
      const turn = chess.turn();

      if (chess.isGameOver()) {
        const isMate = chess.isCheckmate();
        const cpWhite = isMate ? (turn === 'w' ? -10000 : 10000) : 0;
        const mateWhite = isMate ? 0 : null;
        const { headline, advice } = describePositionForCoach(chess, cpWhite, mateWhite, '');
        return {
          cpWhite,
          mateWhite,
          evalLabel: isMate ? '#' : '0.0',
          depth: 0,
          bestMoveUci: '',
          bestMoveSan: '',
          lines: [],
          headline,
          advice,
        };
      }

      const ready = await this.ensureReady();
      const depth = opts?.depth ?? 12;
      const movetimeMs = opts?.movetimeMs ?? 240;
      const multiPv = Math.max(1, Math.min(3, opts?.multiPv ?? 3));

      if (!ready || !this.worker) {
        const fast = evaluatePositionFast(fen);
        const best = computeBestBotMove(fen, MINIMAX_H1_FLASH);
        const bestMoveUci = best ? `${best.from}${best.to}${best.promotion || ''}` : '';
        const pvSan = bestMoveUci ? pvUciToSan(fen, [bestMoveUci], 1) : [];
        const bestMoveSan = pvSan[0] || '';
        const evalLabel = formatWhiteEval(fast.cpWhite, fast.mateWhite);
        const { headline, advice } = describePositionForCoach(chess, fast.cpWhite, fast.mateWhite, bestMoveSan);
        return {
          cpWhite: fast.cpWhite,
          mateWhite: fast.mateWhite,
          evalLabel,
          depth: 5,
          bestMoveUci,
          bestMoveSan,
          lines: bestMoveSan
            ? [
                {
                  rank: 1,
                  cpWhite: fast.cpWhite,
                  mateWhite: fast.mateWhite,
                  evalLabel,
                  firstMoveUci: bestMoveUci,
                  firstMoveSan: bestMoveSan,
                  pvSan,
                },
              ]
            : [],
          headline,
          advice,
        };
      }

      const w = this.worker;
      const pvMap = new Map<
        number,
        { depth: number; cpSide: number; mateSide: number | null; uciMoves: string[] }
      >();

      let topDepth = 0;

      const resultBestMove = await new Promise<string>((resolve) => {
        const timer = window.setTimeout(() => {
          cleanup();
          w.postMessage('stop');
          resolve('');
        }, Math.max(3000, movetimeMs + 2200));

        const onLine = (line: string) => {
          if (line.startsWith('info ') && line.includes(' pv ')) {
            const mpvMatch = line.match(/\bmultipv (\d+)/);
            const rank = mpvMatch ? Number.parseInt(mpvMatch[1], 10) : 1;
            const depthMatch = line.match(/\bdepth (\d+)/);
            const d = depthMatch ? Number.parseInt(depthMatch[1], 10) : 0;
            const cpMatch = line.match(/\bscore cp (-?\d+)/);
            const mateMatch = line.match(/\bscore mate (-?\d+)/);
            const pvMatch = line.match(/\bpv (.+)$/);
            if (!pvMatch || (!cpMatch && !mateMatch)) return;

            let cpSide = 0;
            let mateSide: number | null = null;
            if (mateMatch) {
              const m = Number.parseInt(mateMatch[1], 10);
              mateSide = m;
              cpSide = m >= 0 ? 10000 - m * 10 : -10000 - m * 10;
            } else if (cpMatch) {
              cpSide = Number.parseInt(cpMatch[1], 10);
            }

            const existing = pvMap.get(rank);
            if (!existing || d >= existing.depth) {
              pvMap.set(rank, {
                depth: d,
                cpSide,
                mateSide,
                uciMoves: pvMatch[1].trim().split(/\s+/),
              });
              if (d > topDepth) topDepth = d;
            }
          } else if (line.startsWith('bestmove ')) {
            cleanup();
            const match = line.match(/^bestmove (\S+)/);
            resolve(match && match[1] !== '(none)' ? match[1] : '');
          }
        };

        const cleanup = () => {
          window.clearTimeout(timer);
          this.listeners.delete(onLine);
        };

        this.listeners.add(onLine);
        w.postMessage(`setoption name MultiPV value ${multiPv}`);
        w.postMessage(`position fen ${fen}`);
        w.postMessage(`go depth ${depth} movetime ${movetimeMs}`);
      });

      const sign = turn === 'w' ? 1 : -1;
      const lines: CoachCandidateLine[] = [...pvMap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([rank, entry]) => {
          const cpWhite = entry.cpSide * sign;
          const mateWhite = entry.mateSide !== null ? entry.mateSide * sign : null;
          const pvSan = pvUciToSan(fen, entry.uciMoves, 6);
          return {
            rank,
            cpWhite,
            mateWhite,
            evalLabel: formatWhiteEval(cpWhite, mateWhite),
            firstMoveUci: entry.uciMoves[0] || '',
            firstMoveSan: pvSan[0] || '',
            pvSan,
          };
        })
        .filter((l) => l.firstMoveUci.length >= 4);

      const primary = lines[0];
      const cpWhite = primary?.cpWhite ?? 0;
      const mateWhite = primary?.mateWhite ?? null;
      const bestMoveUci = primary?.firstMoveUci || resultBestMove;
      const bestMoveSan = primary?.firstMoveSan || (bestMoveUci ? pvUciToSan(fen, [bestMoveUci], 1)[0] || '' : '');
      const evalLabel = formatWhiteEval(cpWhite, mateWhite);
      const { headline, advice } = describePositionForCoach(chess, cpWhite, mateWhite, bestMoveSan);

      return {
        cpWhite,
        mateWhite,
        evalLabel,
        depth: topDepth || depth,
        bestMoveUci,
        bestMoveSan,
        lines,
        headline,
        advice,
      };
    });
  }

  dispose(): void {
    if (this.worker) {
      try {
        this.worker.postMessage('quit');
      } catch {
        // ignore
      }
      this.worker.terminate();
      this.worker = null;
    }
    this.initPromise = null;
    this.listeners.clear();
  }
}

const coachSingleton = new PersistentCoachEngine();

export async function askCoachPosition(
  fen: string,
  opts?: { depth?: number; movetimeMs?: number; multiPv?: number }
): Promise<CoachPositionReport> {
  return coachSingleton.analyze(fen, opts);
}

export async function evaluateMoveWithCoach(params: {
  fenBefore: string;
  fenAfter: string;
  playedUci: string;
  playedSan: string;
  moverColor: 'w' | 'b';
}): Promise<CoachMoveFeedback> {
  const { fenBefore, fenAfter, playedUci, playedSan, moverColor } = params;
  const before = await coachSingleton.analyze(fenBefore, { depth: 11, movetimeMs: 180, multiPv: 1 });
  const after = await coachSingleton.analyze(fenAfter, { depth: 11, movetimeMs: 180, multiPv: 1 });

  const sign = moverColor === 'w' ? 1 : -1;
  const evalBeforeMover = before.cpWhite * sign;
  const evalAfterMover = after.cpWhite * sign;
  const winWhiteBefore = cpToWinPercentage(before.cpWhite);
  const winWhiteAfter = cpToWinPercentage(after.cpWhite);
  const winDrop = Math.max(
    0,
    (moverColor === 'w' ? winWhiteBefore : 100 - winWhiteBefore) -
      (moverColor === 'w' ? winWhiteAfter : 100 - winWhiteAfter)
  );
  const cpLoss = Math.max(0, Math.round(evalBeforeMover - evalAfterMover));
  const isMate = playedSan.includes('#');

  let classification: MoveClassification = 'good';
  if (isMate || playedUci === before.bestMoveUci || (winDrop <= 1.2 && cpLoss <= 22)) {
    classification = 'best';
  } else if (winDrop >= 18 || cpLoss >= 250) {
    classification = 'blunder';
  } else if (winDrop >= 9 || cpLoss >= 120) {
    classification = 'mistake';
  } else if (winDrop >= 4.5 || cpLoss >= 60) {
    classification = 'inaccuracy';
  }

  let message = '';
  if (isMate) {
    message = `Checkmate with ${playedSan}! Spotless execution.`;
  } else if (classification === 'best') {
    message = `Excellent! ${playedSan} is Coach's top recommendation here.`;
  } else if (classification === 'good') {
    message =
      before.bestMoveSan && before.bestMoveSan !== playedSan
        ? `Solid move (${playedSan}). Coach also liked ${before.bestMoveSan}.`
        : `Good move (${playedSan}) keeping your position well coordinated.`;
  } else if (classification === 'inaccuracy') {
    message = `${playedSan} is a slight inaccuracy. ${before.bestMoveSan || 'Another option'} kept sharper control.`;
  } else if (classification === 'mistake') {
    message = `${playedSan} is a mistake (-${(cpLoss / 100).toFixed(1)}). Try ${before.bestMoveSan} to keep the advantage — you can hit Undo to retry!`;
  } else {
    message = `Watch out! ${playedSan} is a blunder (-${(cpLoss / 100).toFixed(1)}). ${before.bestMoveSan} was much stronger — hit Undo to try again!`;
  }

  return {
    classification,
    playedSan,
    bestMoveSan: before.bestMoveSan || playedSan,
    bestMoveUci: before.bestMoveUci || playedUci,
    cpLoss,
    evalLabel: after.evalLabel,
    message,
  };
}

export async function getCoachPracticeMove(
  fen: string,
  tier: CoachSkillTier = 'club'
): Promise<{ from: string; to: string; promotion?: PieceSymbol } | null> {
  const depth = tier === 'master' ? 13 : tier === 'club' ? 9 : 6;
  const movetimeMs = tier === 'master' ? 280 : tier === 'club' ? 160 : 90;
  const multiPv = tier === 'master' ? 1 : 3;

  const report = await coachSingleton.analyze(fen, { depth, movetimeMs, multiPv });
  if (report.lines.length === 0 && !report.bestMoveUci) return null;

  let chosenUci = report.bestMoveUci;
  if (tier === 'guided' && report.lines.length >= 2) {
    // Give instructional, realistic club/beginner play without absurd blunders
    const idx = Math.random() < 0.45 ? 0 : Math.min(report.lines.length - 1, Math.random() < 0.7 ? 1 : 2);
    chosenUci = report.lines[idx].firstMoveUci;
  } else if (tier === 'club' && report.lines.length >= 2) {
    const idx = Math.random() < 0.72 ? 0 : 1;
    chosenUci = report.lines[idx].firstMoveUci;
  }

  if (!chosenUci || chosenUci.length < 4) return null;
  return {
    from: chosenUci.slice(0, 2),
    to: chosenUci.slice(2, 4),
    promotion: chosenUci.length >= 5 ? (chosenUci[4] as PieceSymbol) : undefined,
  };
}
