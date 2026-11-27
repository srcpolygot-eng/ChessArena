import { detectOpening } from './openings';
import { formatResultReason } from './chessEngine';
import { createChessFromInitialFen, isNonStandardStartFen } from './chess960';
import type { ChessMatch, MatchMode, MatchResult, MatchVariant, ResultReason } from '../types/chess';

export interface BuildPgnParams {
  moves: string[];
  whiteName: string;
  blackName: string;
  whiteRating?: number | null;
  blackRating?: number | null;
  result: MatchResult;
  resultReason?: ResultReason;
  mode?: MatchMode | 'pass_and_play' | 'coach';
  variant?: MatchVariant;
  initialFen?: string;
  date?: Date | null;
  round?: string;
}

function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n"]+/g, ' ').trim() || '?';
}

function formatPgnDate(date?: Date | null): string {
  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function formatEventName(mode?: MatchMode | 'pass_and_play' | 'coach', variant?: MatchVariant): string {
  const suffix = variant === 'chess960' ? ' (Chess960)' : '';
  switch (mode) {
    case 'online':
      return `Chess Arena Rated Online Match${suffix}`;
    case 'friend':
      return `Chess Arena Friend Match${suffix}`;
    case 'private':
      return `Chess Arena Private Room Match${suffix}`;
    case 'computer':
      return `Chess Arena vs Computer${suffix}`;
    case 'pass_and_play':
      return `Chess Arena Pass & Play Match${suffix}`;
    case 'coach':
      return `Chess Arena Coach Session${suffix}`;
    default:
      return `Chess Arena Match${suffix}`;
  }
}

function formatPgnTermination(result: MatchResult, reason?: ResultReason): string {
  if (!result) return 'Unterminated';
  if (!reason) return 'Normal';
  return formatResultReason(reason);
}

/**
 * Generates a complete, FIDE/PGN-compliant Portable Game Notation string
 * supporting both Standard and Chess960 (with SetUp/FEN/Variant headers).
 */
export function generateMatchPgn(params: BuildPgnParams): string {
  const {
    moves,
    whiteName,
    blackName,
    whiteRating,
    blackRating,
    result,
    resultReason,
    mode,
    variant = 'standard',
    initialFen,
    date,
    round = '-',
  } = params;

  const chess = createChessFromInitialFen(initialFen);
  const validMoves: string[] = [];
  for (const san of moves) {
    try {
      const m = chess.move(san);
      if (!m) break;
      validMoves.push(m.san);
    } catch {
      break;
    }
  }

  const pgnResult: string = result || '*';
  const customStart = isNonStandardStartFen(initialFen);
  const opening = !customStart && variant !== 'chess960' ? detectOpening(validMoves) : null;

  const headers: [string, string][] = [
    ['Event', formatEventName(mode, variant)],
    ['Site', 'Chess Arena'],
    ['Date', formatPgnDate(date)],
    ['Round', round],
    ['White', whiteName || 'White'],
    ['Black', blackName || 'Black'],
    ['Result', pgnResult],
  ];

  if (variant === 'chess960') {
    headers.push(['Variant', 'Chess960']);
  }
  if (customStart && initialFen) {
    headers.push(['SetUp', '1']);
    headers.push(['FEN', initialFen.trim()]);
  }

  if (typeof whiteRating === 'number' && Number.isFinite(whiteRating) && whiteRating > 0) {
    headers.push(['WhiteElo', String(Math.round(whiteRating))]);
  }
  if (typeof blackRating === 'number' && Number.isFinite(blackRating) && blackRating > 0) {
    headers.push(['BlackElo', String(Math.round(blackRating))]);
  }

  headers.push(['TimeControl', '-']);

  if (opening) {
    headers.push(['ECO', opening.eco]);
    headers.push(['Opening', opening.name]);
  }

  headers.push(['Termination', formatPgnTermination(result, resultReason)]);

  const headerBlock = headers
    .map(([key, value]) => `[${key} "${sanitizeHeaderValue(value)}"]`)
    .join('\n');

  const tokens: string[] = [];
  for (let i = 0; i < validMoves.length; i += 2) {
    const moveNo = Math.floor(i / 2) + 1;
    const whiteSan = validMoves[i];
    const blackSan = validMoves[i + 1];
    tokens.push(`${moveNo}.`);
    tokens.push(whiteSan);
    if (blackSan) {
      tokens.push(blackSan);
    }
  }
  tokens.push(pgnResult);

  const lines: string[] = [];
  let currentLine = '';
  for (const token of tokens) {
    if (!currentLine) {
      currentLine = token;
    } else if (currentLine.length + 1 + token.length <= 80) {
      currentLine += ` ${token}`;
    } else {
      lines.push(currentLine);
      currentLine = token;
    }
  }
  if (currentLine) {
    lines.push(currentLine);
  }

  return `${headerBlock}\n\n${lines.join('\n')}\n`;
}

export function generateMatchPgnFromMatch(match: ChessMatch): string {
  const matchDate =
    match.completedAt?.toDate() ||
    match.createdAt?.toDate() ||
    null;

  return generateMatchPgn({
    moves: match.moves || [],
    whiteName: match.whiteUsername || match.whiteDisplayName || 'White',
    blackName: match.blackUsername || match.blackDisplayName || 'Black',
    whiteRating: match.whiteRating,
    blackRating: match.blackRating,
    result: match.result,
    resultReason: match.resultReason,
    mode: match.mode,
    variant: match.variant || 'standard',
    initialFen: match.initialFen,
    date: matchDate,
  });
}

export function buildPgnFilename(whiteName: string, blackName: string, date?: Date | null): string {
  const clean = (s: string) =>
    (s || 'player')
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'player';

  const d = date instanceof Date && !Number.isNaN(date.getTime()) ? date : new Date();
  const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `chess-arena_${clean(whiteName)}_vs_${clean(blackName)}_${stamp}.pgn`;
}

export function downloadPgnFile(pgnText: string, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const safeName = filename.endsWith('.pgn') ? filename : `${filename}.pgn`;
  const blob = new Blob([pgnText], { type: 'application/x-chess-pgn;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = safeName;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
