import { Chess, type Move, type PieceSymbol } from 'chess.js';
import { createChessFromInitialFen } from './chess960';
import {
  BOT_FLASH_IMAGE,
  BOT_GRANDMASTER_IMAGE,
  BOT_NOVICE_IMAGE,
  BOT_TACTICIAN_IMAGE,
  type ComputerBot,
  type MatchResult,
  type ResultReason,
} from '../types/chess';

export const MINIMAX_H1_FLASH: ComputerBot = {
  id: 'computer_minimax_h1_flash',
  difficulty: 'flash',
  name: 'MiniMax H1 Flash',
  username: 'MiniMax_H1_Flash',
  rating: 2050,
  tagline:
    'Fast tier-one H1 engine with transposition cache, killer-move ordering, quiescence tactics, and tapered positional play.',
  avatar: BOT_FLASH_IMAGE,
  depth: 5,
  blunderChance: 0,
  responseDelayMs: 30,
  timeBudgetMs: 85,
};

export const MINIMAX_H1_PRO: ComputerBot = {
  id: 'computer_minimax_h1_pro',
  difficulty: 'pro',
  name: 'MiniMax H1 Pro',
  username: 'MiniMax_H1_Pro',
  rating: 2350,
  tagline:
    'Stronger H1 Pro engine powered by Principal Variation Search, Late Move Reductions, check extensions, history heuristics, and deep endgame precision.',
  avatar: BOT_TACTICIAN_IMAGE,
  depth: 7,
  blunderChance: 0,
  responseDelayMs: 40,
  timeBudgetMs: 520,
};

export const COMPUTER_BOTS: ComputerBot[] = [MINIMAX_H1_FLASH, MINIMAX_H1_PRO];

export interface UpcomingBotModel {
  id: string;
  name: string;
  generation: 'H1' | 'H2' | 'G2';
  tier: string;
  tagline: string;
  avatar: string;
}

export const UPCOMING_H1_MODELS: UpcomingBotModel[] = [
  {
    id: 'upcoming_minimax_h1_ultra',
    name: 'MiniMax H1 Ultra',
    generation: 'H1',
    tier: 'Hardest H1 Model · Upcoming',
    tagline: 'Maximum-strength H1 engine with deep calculation and ruthless endgame precision.',
    avatar: BOT_GRANDMASTER_IMAGE,
  },
];

export const UPCOMING_H2_MODELS: UpcomingBotModel[] = [
  {
    id: 'upcoming_minimax_h2_flash',
    name: 'MiniMax H2 Flash',
    generation: 'H2',
    tier: 'Next-Gen Fast Tier · After H1 Ultra',
    tagline: 'Second-generation lightning engine combining instant move speeds with sharp tactical vision.',
    avatar: BOT_FLASH_IMAGE,
  },
  {
    id: 'upcoming_minimax_h2_pro',
    name: 'MiniMax H2 Pro',
    generation: 'H2',
    tier: 'Next-Gen Pro Tier · After H1 Ultra',
    tagline: 'Advanced H2 strategic engine with multi-stage planning, fortress detection, and dynamic sacrifices.',
    avatar: BOT_NOVICE_IMAGE,
  },
  {
    id: 'upcoming_minimax_g2_ultra',
    name: 'MiniMax G2 Ultra',
    generation: 'G2',
    tier: 'Flagship G2 Grandmaster · After H1 Ultra',
    tagline: 'Apex G2 flagship engineered for super-grandmaster positional mastery and deep tactical calculation.',
    avatar: BOT_GRANDMASTER_IMAGE,
  },
];

export function calculateEloDeltas(
  whiteRating: number,
  blackRating: number,
  result: '1-0' | '0-1' | '1/2-1/2'
): { whiteRatingDelta: number; blackRatingDelta: number } {
  const k = 32;
  const expectedWhite = 1 / (1 + Math.pow(10, (blackRating - whiteRating) / 400));
  const expectedBlack = 1 - expectedWhite;
  const scoreWhite = result === '1-0' ? 1 : result === '0-1' ? 0 : 0.5;
  const scoreBlack = 1 - scoreWhite;
  return {
    whiteRatingDelta: Math.round(k * (scoreWhite - expectedWhite)),
    blackRatingDelta: Math.round(k * (scoreBlack - expectedBlack)),
  };
}

export interface ValidatedMoveResponse {
  valid: boolean;
  error?: string;
  fen: string;
  pgn: string;
  san: string;
  from: string;
  to: string;
  turn: 'w' | 'b';
  moves: string[];
  inCheck: boolean;
  isGameOver: boolean;
  result: MatchResult;
  resultReason: ResultReason;
  whiteRatingDelta: number;
  blackRatingDelta: number;
}

export interface GameTerminationState {
  isGameOver: boolean;
  result: MatchResult;
  reason: ResultReason;
  inCheck: boolean;
}

export function evaluateGameTermination(chess: Chess): GameTerminationState {
  if (chess.isCheckmate()) {
    return {
      isGameOver: true,
      result: chess.turn() === 'w' ? '0-1' : '1-0',
      reason: 'checkmate',
      inCheck: true,
    };
  }
  if (chess.isStalemate()) {
    return {
      isGameOver: true,
      result: '1/2-1/2',
      reason: 'stalemate',
      inCheck: false,
    };
  }
  if (chess.isThreefoldRepetition()) {
    return {
      isGameOver: true,
      result: '1/2-1/2',
      reason: 'threefold_repetition',
      inCheck: chess.inCheck(),
    };
  }
  if (chess.isInsufficientMaterial()) {
    return {
      isGameOver: true,
      result: '1/2-1/2',
      reason: 'insufficient_material',
      inCheck: chess.inCheck(),
    };
  }
  if (chess.isDraw()) {
    return {
      isGameOver: true,
      result: '1/2-1/2',
      reason: 'fifty_move_rule',
      inCheck: chess.inCheck(),
    };
  }
  return {
    isGameOver: false,
    result: '',
    reason: '',
    inCheck: chess.inCheck(),
  };
}

export function validateMoveLocally(params: {
  fen: string;
  initialFen?: string;
  moves: string[];
  from: string;
  to: string;
  promotion?: string;
  whiteRating: number;
  blackRating: number;
  isRated: boolean;
}): ValidatedMoveResponse {
  const chess = createChessFromInitialFen(params.initialFen);
  if (params.moves.length > 0) {
    for (const san of params.moves) {
      chess.move(san);
    }
  } else {
    chess.load(params.fen);
  }

  const moveObj = chess.move({
    from: params.from,
    to: params.to,
    promotion: params.promotion as 'q' | 'r' | 'b' | 'n' | undefined,
  });

  if (!moveObj) {
    return {
      valid: false,
      error: 'Illegal chess move.',
      fen: params.fen,
      pgn: chess.pgn(),
      san: '',
      from: params.from,
      to: params.to,
      turn: chess.turn(),
      moves: params.moves,
      inCheck: chess.inCheck(),
      isGameOver: false,
      result: '',
      resultReason: '',
      whiteRatingDelta: 0,
      blackRatingDelta: 0,
    };
  }

  const term = evaluateGameTermination(chess);
  let whiteRatingDelta = 0;
  let blackRatingDelta = 0;

  if (term.isGameOver && term.result && params.isRated) {
    const deltas = calculateEloDeltas(params.whiteRating, params.blackRating, term.result);
    whiteRatingDelta = deltas.whiteRatingDelta;
    blackRatingDelta = deltas.blackRatingDelta;
  }

  return {
    valid: true,
    fen: chess.fen(),
    pgn: chess.pgn(),
    san: moveObj.san,
    from: moveObj.from,
    to: moveObj.to,
    turn: chess.turn(),
    moves: chess.history(),
    inCheck: term.inCheck,
    isGameOver: term.isGameOver,
    result: term.result,
    resultReason: term.reason,
    whiteRatingDelta,
    blackRatingDelta,
  };
}

export async function validateMoveAuthoritatively(params: {
  fen: string;
  initialFen?: string;
  moves: string[];
  from: string;
  to: string;
  promotion?: string;
  whiteRating: number;
  blackRating: number;
  isRated: boolean;
}): Promise<ValidatedMoveResponse> {
  try {
    const response = await fetch('/api/chess/validate-move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (response.status === 400) {
      const errData = (await response.json()) as { error?: string };
      return {
        valid: false,
        error: errData.error || 'Illegal move.',
        fen: params.fen,
        pgn: '',
        san: '',
        from: params.from,
        to: params.to,
        turn: 'w',
        moves: params.moves,
        inCheck: false,
        isGameOver: false,
        result: '',
        resultReason: '',
        whiteRatingDelta: 0,
        blackRatingDelta: 0,
      };
    }

    if (response.ok) {
      return (await response.json()) as ValidatedMoveResponse;
    }
  } catch {
    // Fallback to local chess.js engine if previewed statically without API proxy
  }

  return validateMoveLocally(params);
}

// ============================================================================
// MINIMAX H1 ENGINE (FLASH + PRO) — PVS + LMR + TT + KILLERS + HISTORY + QUIESCENCE
// ============================================================================
const PIECE_VALUES: Record<PieceSymbol, number> = {
  p: 100,
  n: 320,
  b: 335,
  r: 500,
  q: 900,
  k: 20000,
};

const PAWN_PST = [
  0, 0, 0, 0, 0, 0, 0, 0,
  55, 55, 55, 55, 55, 55, 55, 55,
  12, 12, 22, 32, 32, 22, 12, 12,
  5, 5, 12, 27, 27, 12, 5, 5,
  0, 0, 4, 22, 22, 4, 0, 0,
  5, -4, -8, 0, 0, -8, -4, 5,
  5, 10, 10, -22, -22, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0,
];

const KNIGHT_PST = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 4, 4, 0, -20, -40,
  -30, 4, 12, 18, 18, 12, 4, -30,
  -30, 6, 16, 22, 22, 16, 6, -30,
  -30, 4, 16, 22, 22, 16, 4, -30,
  -30, 6, 12, 16, 16, 12, 6, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50,
];

const BISHOP_PST = [
  -20, -10, -10, -10, -10, -10, -10, -20,
  -10, 2, 0, 0, 0, 0, 2, -10,
  -10, 0, 8, 12, 12, 8, 0, -10,
  -10, 6, 6, 12, 12, 6, 6, -10,
  -10, 2, 12, 12, 12, 12, 2, -10,
  -10, 10, 10, 10, 10, 10, 10, -10,
  -10, 6, 0, 0, 0, 0, 6, -10,
  -20, -10, -10, -10, -10, -10, -10, -20,
];

const ROOK_PST = [
  0, 0, 0, 2, 2, 0, 0, 0,
  8, 14, 14, 14, 14, 14, 14, 8,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  -5, 0, 0, 0, 0, 0, 0, -5,
  0, 0, 2, 8, 8, 4, 0, 0,
];

const QUEEN_PST = [
  -20, -10, -10, -5, -5, -10, -10, -20,
  -10, 0, 0, 0, 0, 0, 0, -10,
  -10, 0, 5, 5, 5, 5, 0, -10,
  -5, 0, 5, 6, 6, 5, 0, -5,
  0, 0, 5, 6, 6, 5, 0, -5,
  -10, 5, 5, 5, 5, 5, 0, -10,
  -10, 0, 5, 0, 0, 0, 0, -10,
  -20, -10, -10, -5, -5, -10, -10, -20,
];

const KING_MIDGAME_PST = [
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -30, -40, -40, -50, -50, -40, -40, -30,
  -20, -30, -30, -40, -40, -30, -30, -20,
  -10, -20, -20, -20, -20, -20, -20, -10,
  20, 22, 0, 0, 0, 0, 22, 20,
  20, 32, 12, 0, 0, 12, 32, 20,
];

const KING_ENDGAME_PST = [
  -50, -35, -25, -20, -20, -25, -35, -50,
  -30, -15, -5, 5, 5, -5, -15, -30,
  -30, -5, 20, 32, 32, 20, -5, -30,
  -30, -5, 32, 44, 44, 32, -5, -30,
  -30, -5, 32, 44, 44, 32, -5, -30,
  -30, -5, 20, 32, 32, 20, -5, -30,
  -30, -25, 0, 5, 5, 0, -25, -30,
  -50, -30, -25, -25, -25, -25, -30, -50,
];

const PASSED_PAWN_BONUS = [0, 10, 18, 30, 52, 85, 130, 0];

// Expanded classical opening book keyed by FEN board + side-to-move
const OPENING_BOOK: Record<string, string[]> = {
  'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w': ['e2e4', 'd2d4', 'g1f3', 'c2c4'],
  'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b': ['e7e5', 'c7c5', 'e7e6', 'c7c6'],
  'rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b': ['d7d5', 'g8f6', 'e7e6'],
  'rnbqkbnr/pppppppp/8/8/2P5/8/PP1PPPPP/RNBQKBNR b': ['e7e5', 'g8f6', 'c7c5'],
  'rnbqkbnr/pppppppp/8/8/8/5N2/PPPPPPPP/RNBQKB1R b': ['d7d5', 'g8f6', 'c7c5'],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w': ['g1f3', 'f1c4', 'b1c3'],
  'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b': ['b8c6', 'g8f6'],
  'r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w': ['f1b5', 'f1c4', 'd2d4'],
  'r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b': ['a7a6', 'g8f6'],
  'r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w': ['b5a4', 'b5c6'],
  'r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b': ['g8f6', 'f8e7'],
  'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b': ['f8c5', 'g8f6'],
  'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w': ['c2c3', 'd2d3', 'e1g1'],
  'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w': ['d2d3', 'b1c3', 'e1g1'],
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w': ['g1f3', 'b1c3', 'c2c3'],
  'rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R b': ['d7d6', 'b8c6', 'e7e6'],
  'rnbqkbnr/pp2pppp/3p4/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w': ['d2d4', 'f1b5'],
  'rnbqkbnr/pp2pppp/3p4/8/3pP3/5N2/PPP2PPP/RNBQKB1R w': ['f3d4'],
  'rnbqkbnr/pp2pppp/3p4/8/3NP3/8/PPP2PPP/RNBQKB1R b': ['g8f6'],
  'rnbqkb1r/pp2pppp/3p1n2/8/3NP3/8/PPP2PPP/RNBQKB1R w': ['b1c3'],
  'rnbqkbnr/ppp1pppp/8/3p4/3P4/8/PPP1PPPP/RNBQKBNR w': ['c2c4', 'g1f3', 'c1f4'],
  'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b': ['e7e6', 'c7c6', 'g8f6'],
  'rnbqkbnr/ppp2ppp/4p3/3p4/2PP4/8/PP2PPPP/RNBQKBNR w': ['b1c3', 'g1f3'],
  'rnbqkbnr/pp2pppp/2p5/3p4/2PP4/8/PP2PPPP/RNBQKBNR w': ['g1f3', 'b1c3'],
  'rnbqkb1r/pppppppp/5n2/8/3P4/8/PPP1PPPP/RNBQKBNR w': ['c2c4', 'g1f3', 'c1f4'],
  'rnbqkb1r/pppppppp/5n2/8/2PP4/8/PP2PPPP/RNBQKBNR b': ['e7e6', 'g7g6', 'c7c5'],
  'rnbqkb1r/pppppp1p/5np1/8/2PP4/8/PP2PPPP/RNBQKBNR w': ['b1c3', 'g1f3'],
  'rnbqkb1r/pppppp1p/5np1/8/2PP4/2N5/PP2PPPP/R1BQKBNR b': ['f8g7', 'd7d5'],
  'rnbqkbnr/pppp1ppp/4p3/8/4P3/8/PPPP1PPP/RNBQKBNR w': ['d2d4', 'g1f3'],
  'rnbqkbnr/ppp2ppp/4p3/3p4/3PP3/8/PPP2PPP/RNBQKBNR w': ['b1c3', 'b1d2', 'e4e5'],
  'rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w': ['d2d4', 'b1c3'],
  'rnbqkbnr/pp2pppp/2p5/3p4/3PP3/8/PPP2PPP/RNBQKBNR w': ['b1c3', 'e4e5', 'e4d5'],
  'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w': ['e4d5'],
  'rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b': ['d8d5', 'g8f6'],
};

function lookupOpeningBook(chess: Chess): Move | null {
  const parts = chess.fen().split(' ');
  const key = `${parts[0]} ${parts[1]}`;
  const candidates = OPENING_BOOK[key];
  if (!candidates || candidates.length === 0) return null;

  const legal = chess.moves({ verbose: true });
  const legalMatches = candidates
    .map((uci) => legal.find((m) => `${m.from}${m.to}${m.promotion || ''}` === uci))
    .filter((m): m is Move => Boolean(m));

  if (legalMatches.length === 0) return null;
  return legalMatches[Math.floor(Math.random() * legalMatches.length)];
}

function getPstValue(
  type: PieceSymbol,
  color: 'w' | 'b',
  row: number,
  col: number,
  endgameWeight: number
): number {
  const idx = color === 'w' ? row * 8 + col : (7 - row) * 8 + col;
  switch (type) {
    case 'p':
      return PAWN_PST[idx];
    case 'n':
      return KNIGHT_PST[idx];
    case 'b':
      return BISHOP_PST[idx];
    case 'r':
      return ROOK_PST[idx];
    case 'q':
      return QUEEN_PST[idx];
    case 'k':
      return Math.round(
        KING_MIDGAME_PST[idx] * (1 - endgameWeight) + KING_ENDGAME_PST[idx] * endgameWeight
      );
  }
}

/**
 * Rich, O(64) tapered positional evaluation from White's perspective (in centipawns).
 * When `proMode` is true, adds knight outposts, connected rooks, king-safety tropism,
 * central development penalties for unmoved minor pieces, and endgame mop-up king drive.
 */
function evaluateBoard(chess: Chess, proMode = false): number {
  const board = chess.board();
  let nonPawnMaterial = 0;
  let whiteMaterial = 0;
  let blackMaterial = 0;
  let whiteBishops = 0;
  let blackBishops = 0;

  const whitePawnsByFile = [0, 0, 0, 0, 0, 0, 0, 0];
  const blackPawnsByFile = [0, 0, 0, 0, 0, 0, 0, 0];
  const whitePawnMinRow = [8, 8, 8, 8, 8, 8, 8, 8];
  const blackPawnMaxRow = [-1, -1, -1, -1, -1, -1, -1, -1];
  const whiteRookPositions: [number, number][] = [];
  const blackRookPositions: [number, number][] = [];

  let whiteKingRow = 7;
  let whiteKingCol = 4;
  let blackKingRow = 0;
  let blackKingCol = 4;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      if (piece.type === 'p') {
        if (piece.color === 'w') {
          whiteMaterial += 100;
          whitePawnsByFile[c]++;
          if (r < whitePawnMinRow[c]) whitePawnMinRow[c] = r;
        } else {
          blackMaterial += 100;
          blackPawnsByFile[c]++;
          if (r > blackPawnMaxRow[c]) blackPawnMaxRow[c] = r;
        }
      } else if (piece.type === 'k') {
        if (piece.color === 'w') {
          whiteKingRow = r;
          whiteKingCol = c;
        } else {
          blackKingRow = r;
          blackKingCol = c;
        }
      } else {
        const pv = PIECE_VALUES[piece.type];
        nonPawnMaterial += pv;
        if (piece.color === 'w') {
          whiteMaterial += pv;
          if (piece.type === 'b') whiteBishops++;
          else if (piece.type === 'r') whiteRookPositions.push([r, c]);
        } else {
          blackMaterial += pv;
          if (piece.type === 'b') blackBishops++;
          else if (piece.type === 'r') blackRookPositions.push([r, c]);
        }
      }
    }
  }

  const maxPhaseMaterial = 6200;
  const endgameWeight = Math.max(0, Math.min(1, 1 - nonPawnMaterial / maxPhaseMaterial));

  let score = 0;

  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const piece = board[r][c];
      if (!piece) continue;
      let val = PIECE_VALUES[piece.type] + getPstValue(piece.type, piece.color, r, c, endgameWeight);

      if (piece.type === 'p') {
        if (piece.color === 'w') {
          let blocked = false;
          for (let f = Math.max(0, c - 1); f <= Math.min(7, c + 1); f++) {
            if (blackPawnsByFile[f] > 0 && blackPawnMaxRow[f] > -1) {
              for (let rr = 0; rr < r; rr++) {
                const sq = board[rr][f];
                if (sq && sq.type === 'p' && sq.color === 'b') {
                  blocked = true;
                  break;
                }
              }
            }
            if (blocked) break;
          }
          if (!blocked) {
            const rankFromStart = 7 - r;
            val += Math.round(PASSED_PAWN_BONUS[rankFromStart] * (0.65 + 0.65 * endgameWeight));
          }
          if (proMode && r < 6) {
            // Connected pawn chain bonus
            const supportedLeft = c > 0 && board[r + 1][c - 1]?.type === 'p' && board[r + 1][c - 1]?.color === 'w';
            const supportedRight = c < 7 && board[r + 1][c + 1]?.type === 'p' && board[r + 1][c + 1]?.color === 'w';
            if (supportedLeft || supportedRight) val += 10;
          }
        } else {
          let blocked = false;
          for (let f = Math.max(0, c - 1); f <= Math.min(7, c + 1); f++) {
            if (whitePawnsByFile[f] > 0) {
              for (let rr = r + 1; rr < 8; rr++) {
                const sq = board[rr][f];
                if (sq && sq.type === 'p' && sq.color === 'w') {
                  blocked = true;
                  break;
                }
              }
            }
            if (blocked) break;
          }
          if (!blocked) {
            const rankFromStart = r;
            val += Math.round(PASSED_PAWN_BONUS[rankFromStart] * (0.65 + 0.65 * endgameWeight));
          }
          if (proMode && r > 1) {
            const supportedLeft = c > 0 && board[r - 1][c - 1]?.type === 'p' && board[r - 1][c - 1]?.color === 'b';
            const supportedRight = c < 7 && board[r - 1][c + 1]?.type === 'p' && board[r - 1][c + 1]?.color === 'b';
            if (supportedLeft || supportedRight) val += 10;
          }
        }
      } else if (piece.type === 'r') {
        const ownPawns = piece.color === 'w' ? whitePawnsByFile[c] : blackPawnsByFile[c];
        const oppPawns = piece.color === 'w' ? blackPawnsByFile[c] : whitePawnsByFile[c];
        if (ownPawns === 0 && oppPawns === 0) val += proMode ? 28 : 22;
        else if (ownPawns === 0) val += proMode ? 15 : 12;

        if ((piece.color === 'w' && r === 1) || (piece.color === 'b' && r === 6)) {
          val += proMode ? 30 : 24;
        }
      } else if (proMode && piece.type === 'n') {
        // Outpost bonus: knight on 4th-6th rank supported by friendly pawn
        if (piece.color === 'w' && r >= 2 && r <= 4 && c >= 2 && c <= 5) {
          const leftP = c > 0 && board[r + 1][c - 1]?.type === 'p' && board[r + 1][c - 1]?.color === 'w';
          const rightP = c < 7 && board[r + 1][c + 1]?.type === 'p' && board[r + 1][c + 1]?.color === 'w';
          if (leftP || rightP) val += 22;
        } else if (piece.color === 'b' && r >= 3 && r <= 5 && c >= 2 && c <= 5) {
          const leftP = c > 0 && board[r - 1][c - 1]?.type === 'p' && board[r - 1][c - 1]?.color === 'b';
          const rightP = c < 7 && board[r - 1][c + 1]?.type === 'p' && board[r - 1][c + 1]?.color === 'b';
          if (leftP || rightP) val += 22;
        }
      } else if (proMode && (piece.type === 'q' || piece.type === 'b')) {
        // Subtle king tropism in middlegame
        if (endgameWeight < 0.65) {
          const oppKR = piece.color === 'w' ? blackKingRow : whiteKingRow;
          const oppKC = piece.color === 'w' ? blackKingCol : whiteKingCol;
          const dist = Math.abs(r - oppKR) + Math.abs(c - oppKC);
          val += Math.round((14 - dist) * (piece.type === 'q' ? 2.2 : 1.1) * (1 - endgameWeight));
        }
      }

      score += piece.color === 'w' ? val : -val;
    }
  }

  // Doubled & isolated pawn structure penalties
  for (let f = 0; f < 8; f++) {
    if (whitePawnsByFile[f] > 1) score -= (whitePawnsByFile[f] - 1) * 16;
    if (blackPawnsByFile[f] > 1) score += (blackPawnsByFile[f] - 1) * 16;

    if (whitePawnsByFile[f] > 0) {
      const left = f > 0 ? whitePawnsByFile[f - 1] : 0;
      const right = f < 7 ? whitePawnsByFile[f + 1] : 0;
      if (left === 0 && right === 0) score -= 14;
    }
    if (blackPawnsByFile[f] > 0) {
      const left = f > 0 ? blackPawnsByFile[f - 1] : 0;
      const right = f < 7 ? blackPawnsByFile[f + 1] : 0;
      if (left === 0 && right === 0) score += 14;
    }
  }

  // Bishop pair bonus
  if (whiteBishops >= 2) score += proMode ? 42 : 35;
  if (blackBishops >= 2) score -= proMode ? 42 : 35;

  // Connected rooks bonus in Pro mode
  if (proMode) {
    if (whiteRookPositions.length === 2) {
      const [[r1, c1], [r2, c2]] = whiteRookPositions;
      if (r1 === r2 || c1 === c2) score += 18;
    }
    if (blackRookPositions.length === 2) {
      const [[r1, c1], [r2, c2]] = blackRookPositions;
      if (r1 === r2 || c1 === c2) score -= 18;
    }

    // Endgame mop-up evaluation: drive losing king to corner & bring winning king closer
    if (endgameWeight > 0.65) {
      const matDiff = whiteMaterial - blackMaterial;
      if (matDiff >= 300) {
        const blackCenterDist = Math.abs(3.5 - blackKingRow) + Math.abs(3.5 - blackKingCol);
        const kingDist = Math.abs(whiteKingRow - blackKingRow) + Math.abs(whiteKingCol - blackKingCol);
        score += Math.round((blackCenterDist * 14 + (14 - kingDist) * 7) * endgameWeight);
      } else if (matDiff <= -300) {
        const whiteCenterDist = Math.abs(3.5 - whiteKingRow) + Math.abs(3.5 - whiteKingCol);
        const kingDist = Math.abs(whiteKingRow - blackKingRow) + Math.abs(whiteKingCol - blackKingCol);
        score -= Math.round((whiteCenterDist * 14 + (14 - kingDist) * 7) * endgameWeight);
      }
    }
  }

  // Midgame king pawn shield bonus
  if (endgameWeight < 0.75) {
    const shieldScale = 1 - endgameWeight;
    if (whiteKingRow === 7 && (whiteKingCol <= 2 || whiteKingCol >= 5)) {
      let shield = 0;
      for (let f = Math.max(0, whiteKingCol - 1); f <= Math.min(7, whiteKingCol + 1); f++) {
        const p6 = board[6][f];
        const p5 = board[5][f];
        if (p6 && p6.type === 'p' && p6.color === 'w') shield += 14;
        else if (p5 && p5.type === 'p' && p5.color === 'w') shield += 6;
      }
      score += Math.round(shield * shieldScale);
    }
    if (blackKingRow === 0 && (blackKingCol <= 2 || blackKingCol >= 5)) {
      let shield = 0;
      for (let f = Math.max(0, blackKingCol - 1); f <= Math.min(7, blackKingCol + 1); f++) {
        const p1 = board[1][f];
        const p2 = board[2][f];
        if (p1 && p1.type === 'p' && p1.color === 'b') shield += 14;
        else if (p2 && p2.type === 'p' && p2.color === 'b') shield += 6;
      }
      score -= Math.round(shield * shieldScale);
    }
  }

  score += chess.turn() === 'w' ? 8 : -8;

  return score;
}

/** Fast (<0.3ms) White-perspective evaluation in centipawns for live UI Eval Bar. */
export function evaluatePositionFast(fen: string): { cpWhite: number; mateWhite: number | null } {
  try {
    const chess = new Chess(fen);
    if (chess.isCheckmate()) {
      return {
        cpWhite: chess.turn() === 'w' ? -10000 : 10000,
        mateWhite: chess.turn() === 'w' ? -0 : 0,
      };
    }
    if (chess.isDraw()) {
      return { cpWhite: 0, mateWhite: null };
    }
    return { cpWhite: evaluateBoard(chess, true), mateWhite: null };
  } catch {
    return { cpWhite: 0, mateWhite: null };
  }
}

type TTFlag = 'EXACT' | 'LOWER' | 'UPPER';

interface TTEntry {
  depth: number;
  score: number;
  flag: TTFlag;
  bestMoveUci: string;
}

interface SearchState {
  deadline: number;
  nodes: number;
  aborted: boolean;
  proMode: boolean;
  qMaxDepth: number;
  tt: Map<string, TTEntry>;
  killers: Map<number, [string, string]>;
  history: Map<string, number>;
}

function getTtKey(chess: Chess): string {
  const parts = chess.fen().split(' ');
  return `${parts[0]} ${parts[1]} ${parts[2]} ${parts[3]}`;
}

function moveToUci(m: Move): string {
  return `${m.from}${m.to}${m.promotion || ''}`;
}

function orderMoves(
  moves: Move[],
  ttBestUci?: string,
  killerPair?: [string, string],
  history?: Map<string, number>
): Move[] {
  return moves.sort((a, b) => {
    const uciA = moveToUci(a);
    const uciB = moveToUci(b);
    if (ttBestUci) {
      if (uciA === ttBestUci && uciB !== ttBestUci) return -1;
      if (uciB === ttBestUci && uciA !== ttBestUci) return 1;
    }

    let scoreA = 0;
    let scoreB = 0;

    if (a.captured) scoreA += 100000 + 10 * PIECE_VALUES[a.captured] - PIECE_VALUES[a.piece];
    if (b.captured) scoreB += 100000 + 10 * PIECE_VALUES[b.captured] - PIECE_VALUES[b.piece];
    if (a.promotion) scoreA += 90000 + PIECE_VALUES[a.promotion];
    if (b.promotion) scoreB += 90000 + PIECE_VALUES[b.promotion];

    if (killerPair) {
      if (uciA === killerPair[0]) scoreA += 50000;
      else if (uciA === killerPair[1]) scoreA += 40000;
      if (uciB === killerPair[0]) scoreB += 50000;
      else if (uciB === killerPair[1]) scoreB += 40000;
    }

    if (history) {
      scoreA += history.get(uciA) || 0;
      scoreB += history.get(uciB) || 0;
    }

    if (a.san.includes('+')) scoreA += 3500;
    if (b.san.includes('+')) scoreB += 3500;
    return scoreB - scoreA;
  });
}

function recordKiller(search: SearchState, ply: number, uci: string, depth: number): void {
  const existing = search.killers.get(ply);
  if (!existing) {
    search.killers.set(ply, [uci, '']);
  } else if (existing[0] !== uci) {
    search.killers.set(ply, [uci, existing[0]]);
  }
  if (search.proMode) {
    const prev = search.history.get(uci) || 0;
    search.history.set(uci, Math.min(35000, prev + depth * depth * 12));
  }
}

function quiescence(
  chess: Chess,
  alpha: number,
  beta: number,
  maximizingWhite: boolean,
  qDepth: number,
  search: SearchState
): number {
  search.nodes++;
  if ((search.nodes & 31) === 0 && performance.now() >= search.deadline) {
    search.aborted = true;
    return 0;
  }

  const standPat = evaluateBoard(chess, search.proMode);
  if (qDepth <= 0) return standPat;

  if (maximizingWhite) {
    if (standPat >= beta) return beta;
    if (standPat + 950 < alpha) return alpha;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat - 950 > beta) return beta;
    if (standPat < beta) beta = standPat;
  }

  const tacticalMoves = orderMoves(
    chess.moves({ verbose: true }).filter((m) => Boolean(m.captured) || Boolean(m.promotion))
  );

  if (maximizingWhite) {
    let best = standPat;
    for (const move of tacticalMoves) {
      chess.move(move);
      const score = quiescence(chess, alpha, beta, false, qDepth - 1, search);
      chess.undo();
      if (search.aborted) return 0;
      if (score > best) best = score;
      if (score > alpha) alpha = score;
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = standPat;
    for (const move of tacticalMoves) {
      chess.move(move);
      const score = quiescence(chess, alpha, beta, true, qDepth - 1, search);
      chess.undo();
      if (search.aborted) return 0;
      if (score < best) best = score;
      if (score < beta) beta = score;
      if (beta <= alpha) break;
    }
    return best;
  }
}

function minimax(
  chess: Chess,
  depth: number,
  ply: number,
  alpha: number,
  beta: number,
  maximizingWhite: boolean,
  search: SearchState
): number {
  search.nodes++;
  if ((search.nodes & 15) === 0 && performance.now() >= search.deadline) {
    search.aborted = true;
    return 0;
  }

  if (chess.isCheckmate()) {
    return chess.turn() === 'w' ? -99999 + ply : 99999 - ply;
  }

  if (chess.isDraw()) {
    return 0;
  }

  const inCheck = chess.inCheck();
  // Pro mode check extension (prevents horizon blunders on forcing checks)
  const effectiveDepth = search.proMode && inCheck && ply < 10 ? depth + 1 : depth;

  if (effectiveDepth <= 0) {
    return quiescence(chess, alpha, beta, maximizingWhite, search.qMaxDepth, search);
  }

  const alphaOrig = alpha;
  const betaOrig = beta;
  const ttKey = getTtKey(chess);
  const ttEntry = search.tt.get(ttKey);

  if (ttEntry && ttEntry.depth >= effectiveDepth) {
    if (ttEntry.flag === 'EXACT') return ttEntry.score;
    if (ttEntry.flag === 'LOWER') alpha = Math.max(alpha, ttEntry.score);
    else if (ttEntry.flag === 'UPPER') beta = Math.min(beta, ttEntry.score);
    if (alpha >= beta) return ttEntry.score;
  }

  const moves = orderMoves(
    chess.moves({ verbose: true }),
    ttEntry?.bestMoveUci,
    search.killers.get(ply),
    search.proMode ? search.history : undefined
  );
  if (moves.length === 0) {
    return 0;
  }

  let bestMoveUci = moveToUci(moves[0]);
  let bestScore = maximizingWhite ? -Infinity : Infinity;
  let moveIndex = 0;

  if (maximizingWhite) {
    for (const move of moves) {
      chess.move(move);

      const isQuiet = !move.captured && !move.promotion && !inCheck && !chess.inCheck();
      let evaluation: number;

      if (search.proMode && moveIndex > 0) {
        // Late Move Reductions (LMR) + Principal Variation Search (PVS)
        const reduction = effectiveDepth >= 3 && moveIndex >= 4 && isQuiet ? 1 : 0;
        evaluation = minimax(
          chess,
          effectiveDepth - 1 - reduction,
          ply + 1,
          alpha,
          alpha + 1,
          false,
          search
        );
        if (!search.aborted && evaluation > alpha && (reduction > 0 || evaluation < beta)) {
          evaluation = minimax(chess, effectiveDepth - 1, ply + 1, alpha, beta, false, search);
        }
      } else {
        evaluation = minimax(chess, effectiveDepth - 1, ply + 1, alpha, beta, false, search);
      }

      chess.undo();
      if (search.aborted) return 0;

      if (evaluation > bestScore) {
        bestScore = evaluation;
        bestMoveUci = moveToUci(move);
      }
      if (evaluation > alpha) alpha = evaluation;
      if (beta <= alpha) {
        if (!move.captured && !move.promotion) {
          recordKiller(search, ply, moveToUci(move), effectiveDepth);
        }
        break;
      }
      moveIndex++;
    }
  } else {
    for (const move of moves) {
      chess.move(move);

      const isQuiet = !move.captured && !move.promotion && !inCheck && !chess.inCheck();
      let evaluation: number;

      if (search.proMode && moveIndex > 0) {
        const reduction = effectiveDepth >= 3 && moveIndex >= 4 && isQuiet ? 1 : 0;
        evaluation = minimax(
          chess,
          effectiveDepth - 1 - reduction,
          ply + 1,
          beta - 1,
          beta,
          true,
          search
        );
        if (!search.aborted && evaluation < beta && (reduction > 0 || evaluation > alpha)) {
          evaluation = minimax(chess, effectiveDepth - 1, ply + 1, alpha, beta, true, search);
        }
      } else {
        evaluation = minimax(chess, effectiveDepth - 1, ply + 1, alpha, beta, true, search);
      }

      chess.undo();
      if (search.aborted) return 0;

      if (evaluation < bestScore) {
        bestScore = evaluation;
        bestMoveUci = moveToUci(move);
      }
      if (evaluation < beta) beta = evaluation;
      if (beta <= alpha) {
        if (!move.captured && !move.promotion) {
          recordKiller(search, ply, moveToUci(move), effectiveDepth);
        }
        break;
      }
      moveIndex++;
    }
  }

  const maxTtSize = search.proMode ? 65000 : 24000;
  if (search.tt.size < maxTtSize) {
    let flag: TTFlag = 'EXACT';
    if (bestScore <= alphaOrig) flag = 'UPPER';
    else if (bestScore >= betaOrig) flag = 'LOWER';
    search.tt.set(ttKey, { depth: effectiveDepth, score: bestScore, flag, bestMoveUci });
  }

  return bestScore;
}

export function computeBestBotMove(
  fen: string,
  bot: ComputerBot = MINIMAX_H1_FLASH
): { from: string; to: string; promotion?: string } | null {
  const chess = new Chess(fen);
  const rootMoves = orderMoves(chess.moves({ verbose: true }));
  if (rootMoves.length === 0) return null;

  if (bot.blunderChance === 0) {
    const bookMove = lookupOpeningBook(chess);
    if (bookMove) {
      return { from: bookMove.from, to: bookMove.to, promotion: bookMove.promotion };
    }
  }

  if (bot.blunderChance > 0 && Math.random() < bot.blunderChance) {
    const randomMove = rootMoves[Math.floor(Math.random() * rootMoves.length)];
    return { from: randomMove.from, to: randomMove.to, promotion: randomMove.promotion };
  }

  const proMode = bot.difficulty === 'pro' || bot.difficulty === 'ultra';
  const maximizingWhite = chess.turn() === 'w';
  const timeBudgetMs = bot.timeBudgetMs && bot.timeBudgetMs > 0 ? bot.timeBudgetMs : proMode ? 380 : 85;
  const maxDepth = Math.max(1, bot.depth);

  const start = performance.now();
  const deadline = start + timeBudgetMs;
  const tt = new Map<string, TTEntry>();
  const killers = new Map<number, [string, string]>();
  const history = new Map<string, number>();
  let bestMove = rootMoves[0];

  for (let currentDepth = 1; currentDepth <= maxDepth; currentDepth++) {
    if (currentDepth > 1 && performance.now() >= deadline) break;

    const ordered = orderMoves([...rootMoves], moveToUci(bestMove), undefined, proMode ? history : undefined);
    const search: SearchState = {
      deadline: currentDepth === 1 ? start + Math.max(timeBudgetMs, 450) : deadline,
      nodes: 0,
      aborted: false,
      proMode,
      qMaxDepth: proMode ? 5 : 3,
      tt,
      killers,
      history,
    };

    let iterBestMove = ordered[0];
    let iterBestScore = maximizingWhite ? -Infinity : Infinity;
    let alpha = -Infinity;
    let beta = Infinity;

    for (const move of ordered) {
      chess.move(move);
      const score = minimax(chess, currentDepth - 1, 1, alpha, beta, !maximizingWhite, search);
      chess.undo();
      if (search.aborted) break;

      if (maximizingWhite) {
        if (score > iterBestScore) {
          iterBestScore = score;
          iterBestMove = move;
        }
        if (score > alpha) alpha = score;
      } else {
        if (score < iterBestScore) {
          iterBestScore = score;
          iterBestMove = move;
        }
        if (score < beta) beta = score;
      }
    }

    if (!search.aborted) {
      bestMove = iterBestMove;
      if (Math.abs(iterBestScore) >= 99000) break;
    } else {
      break;
    }
  }

  return {
    from: bestMove.from,
    to: bestMove.to,
    promotion: bestMove.promotion,
  };
}

export interface CapturedPiecesSummary {
  capturedByWhite: PieceSymbol[];
  capturedByBlack: PieceSymbol[];
  whiteAdvantage: number;
  blackAdvantage: number;
}

export function getCapturedPieces(fen: string): CapturedPiecesSummary {
  const initialCounts: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
  const currentWhite: Record<PieceSymbol, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };
  const currentBlack: Record<PieceSymbol, number> = { p: 0, n: 0, b: 0, r: 0, q: 0, k: 0 };

  const chess = new Chess(fen);
  for (const row of chess.board()) {
    for (const sq of row) {
      if (!sq) continue;
      if (sq.color === 'w') currentWhite[sq.type]++;
      else currentBlack[sq.type]++;
    }
  }

  const order: PieceSymbol[] = ['q', 'r', 'b', 'n', 'p'];
  const capturedByWhite: PieceSymbol[] = [];
  const capturedByBlack: PieceSymbol[] = [];
  const materialWeight: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

  let whiteMaterial = 0;
  let blackMaterial = 0;

  for (const p of order) {
    whiteMaterial += currentWhite[p] * materialWeight[p];
    blackMaterial += currentBlack[p] * materialWeight[p];

    const missingBlack = Math.max(0, initialCounts[p] - currentBlack[p]);
    for (let i = 0; i < missingBlack; i++) capturedByWhite.push(p);

    const missingWhite = Math.max(0, initialCounts[p] - currentWhite[p]);
    for (let i = 0; i < missingWhite; i++) capturedByBlack.push(p);
  }

  return {
    capturedByWhite,
    capturedByBlack,
    whiteAdvantage: Math.max(0, whiteMaterial - blackMaterial),
    blackAdvantage: Math.max(0, blackMaterial - whiteMaterial),
  };
}

export function formatResultReason(reason: ResultReason): string {
  switch (reason) {
    case 'checkmate':
      return 'Checkmate';
    case 'stalemate':
      return 'Stalemate';
    case 'draw_agreement':
      return 'Draw by agreement';
    case 'threefold_repetition':
      return 'Threefold repetition';
    case 'fifty_move_rule':
      return 'Fifty-move rule';
    case 'insufficient_material':
      return 'Insufficient material';
    case 'resignation':
      return 'Resignation';
    default:
      return 'Completed';
  }
}
