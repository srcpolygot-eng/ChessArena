import { Chess } from 'chess.js';

export const STANDARD_START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const STANDARD_CHESS960_ID = 518;

// Exact 10 placements of 2 knights among 5 remaining squares (Scharnagl standard)
const KNIGHT_TABLE: [number, number][] = [
  [0, 1],
  [0, 2],
  [0, 3],
  [0, 4],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 3],
  [2, 4],
  [3, 4],
];

export interface Chess960Position {
  id: number;
  backRank: string; // e.g. 'RNBQKBNR'
  fen: string;
}

/**
 * Generates any of the 960 official Fischer Random (Chess960) starting positions
 * using Reinhard Scharnagl's canonical numbering (0..959, where #518 is standard chess).
 *
 * Castling availability is encoded cleanly for strict chess.js compatibility:
 * K/k if King is on e-file and kingside rook on h-file, Q/q if King is on e-file
 * and queenside rook on a-file, otherwise '-'.
 */
export function getChess960Position(rawId: number): Chess960Position {
  const id = ((Math.floor(rawId) % 960) + 960) % 960;
  const rank: (string | null)[] = Array(8).fill(null);

  let n = id;
  // 1. Light-squared bishop (files b, d, f, h -> indices 1, 3, 5, 7)
  const lightBishop = n % 4;
  n = Math.floor(n / 4);
  rank[lightBishop * 2 + 1] = 'B';

  // 2. Dark-squared bishop (files a, c, e, g -> indices 0, 2, 4, 6)
  const darkBishop = n % 4;
  n = Math.floor(n / 4);
  rank[darkBishop * 2] = 'B';

  // 3. Queen on one of the 6 remaining empty squares
  const queenIdx = n % 6;
  n = Math.floor(n / 6);
  const emptyAfterBishops = rank
    .map((p, idx) => (p === null ? idx : -1))
    .filter((idx) => idx !== -1);
  rank[emptyAfterBishops[queenIdx]] = 'Q';

  // 4. Two knights on 2 of the 5 remaining empty squares (0..9)
  const [kn1, kn2] = KNIGHT_TABLE[n % 10];
  const emptyAfterQueen = rank
    .map((p, idx) => (p === null ? idx : -1))
    .filter((idx) => idx !== -1);
  rank[emptyAfterQueen[kn1]] = 'N';
  rank[emptyAfterQueen[kn2]] = 'N';

  // 5. Remaining 3 squares receive Rook, King, Rook in order (King always between Rooks)
  const finalThree = rank
    .map((p, idx) => (p === null ? idx : -1))
    .filter((idx) => idx !== -1);
  rank[finalThree[0]] = 'R';
  rank[finalThree[1]] = 'K';
  rank[finalThree[2]] = 'R';

  const whiteRank = rank.join('');
  const blackRank = whiteRank.toLowerCase();

  // Compute chess.js-compatible castling rights
  let castling = '';
  const kingIdx = rank.indexOf('K');
  if (kingIdx === 4) {
    if (rank[7] === 'R') castling += 'K';
    if (rank[0] === 'R') castling += 'Q';
    if (rank[7] === 'R') castling += 'k';
    if (rank[0] === 'R') castling += 'q';
  }
  const castlingField = castling || '-';

  const fen = `${blackRank}/pppppppp/8/8/8/8/PPPPPPPP/${whiteRank} w ${castlingField} - 0 1`;

  return {
    id,
    backRank: whiteRank,
    fen,
  };
}

/** Returns a random Chess960 position ID (excluding #518 so Chess960 always feels fresh). */
export function randomChess960Id(): number {
  let id = Math.floor(Math.random() * 960);
  if (id === STANDARD_CHESS960_ID) {
    id = (id + 1 + Math.floor(Math.random() * 958)) % 960;
  }
  return id;
}

/** Safely constructs a Chess instance from an optional custom starting FEN (e.g. Chess960). */
export function createChessFromInitialFen(initialFen?: string | null): Chess {
  if (initialFen && initialFen.trim().length >= 10 && initialFen.trim() !== STANDARD_START_FEN) {
    try {
      return new Chess(initialFen.trim());
    } catch {
      return new Chess();
    }
  }
  return new Chess();
}

export function isNonStandardStartFen(initialFen?: string | null): boolean {
  if (!initialFen) return false;
  return initialFen.trim().length >= 10 && initialFen.trim() !== STANDARD_START_FEN;
}
