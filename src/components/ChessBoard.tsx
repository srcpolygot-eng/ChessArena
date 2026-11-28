import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Chess, type Color, type Move, type PieceSymbol, type Square } from 'chess.js';
import { motion, AnimatePresence } from 'motion/react';
import { BOARD_THEMES, type BoardTheme, type MatchResult, type PieceStyle, type ResultReason } from '../types/chess';
import { ChessPieceSvg } from './ChessPieces';

interface BoardArrow {
  from: Square;
  to: Square;
  color: string;
}

interface ChessBoardProps {
  fen: string;
  orientation?: Color;
  interactive?: boolean;
  allowedColor?: Color | 'both';
  lastMove?: { from: string; to: string } | null;
  hintSquares?: { from?: string; to?: string } | null;
  premove?: { from: string; to: string } | null;
  allowPremove?: boolean;
  showCoordinates?: boolean;
  autoQueen?: boolean;
  gameOutcome?: { result: MatchResult; reason: ResultReason } | null;
  boardTheme?: BoardTheme;
  pieceStyle?: PieceStyle;
  animationsEnabled?: boolean;
  onMove?: (from: string, to: string, promotion?: PieceSymbol) => void;
  onQueuePremove?: (from: string, to: string) => void;
  onCancelPremove?: () => void;
  onSquareTap?: (square: Square) => void;
  onIllegalAttempt?: () => void;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

function getAnnotationColor(e: React.MouseEvent): string {
  if (e.shiftKey) return 'rgba(34, 197, 94, 0.72)'; // Green
  if (e.altKey) return 'rgba(59, 130, 246, 0.72)'; // Blue
  if (e.ctrlKey || e.metaKey) return 'rgba(245, 158, 11, 0.75)'; // Amber
  return 'rgba(235, 97, 80, 0.75)'; // Chess.com Red/Orange
}

function squareToBoardCoords(sq: Square, orientation: Color): { x: number; y: number } {
  const fileIdx = FILES.indexOf(sq[0] as (typeof FILES)[number]);
  const rankIdx = RANKS.indexOf(sq[1] as (typeof RANKS)[number]);
  const col = orientation === 'w' ? fileIdx : 7 - fileIdx;
  const row = orientation === 'w' ? rankIdx : 7 - rankIdx;
  return { x: col * 100 + 50, y: row * 100 + 50 };
}

export const ChessBoard: React.FC<ChessBoardProps> = ({
  fen,
  orientation = 'w',
  interactive = true,
  allowedColor = 'both',
  lastMove = null,
  hintSquares = null,
  premove = null,
  allowPremove = false,
  showCoordinates = true,
  autoQueen = false,
  gameOutcome = null,
  boardTheme = 'classic',
  pieceStyle = 'neo',
  animationsEnabled = true,
  onMove,
  onQueuePremove,
  onCancelPremove,
  onSquareTap,
  onIllegalAttempt,
}) => {
  const [selectedSquare, setSelectedSquare] = useState<Square | null>(null);
  const [premoveSelected, setPremoveSelected] = useState<Square | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square; color: Color } | null>(null);
  const [markedSquares, setMarkedSquares] = useState<Record<string, string>>({});
  const [arrows, setArrows] = useState<BoardArrow[]>([]);
  const rightDragStartRef = useRef<{ sq: Square; color: string } | null>(null);

  // Clear transient selections, promotion modal & annotations when the position advances
  useEffect(() => {
    setSelectedSquare(null);
    setPremoveSelected(null);
    setPendingPromotion(null);
    setMarkedSquares({});
    setArrows([]);
  }, [fen]);

  const theme = BOARD_THEMES[boardTheme] || BOARD_THEMES.classic;

  const chess = useMemo(() => {
    const c = new Chess();
    try {
      c.load(fen);
    } catch {
      // Keep starting FEN if malformed
    }
    return c;
  }, [fen]);

  const legalMovesForSelected = useMemo(() => {
    if (!selectedSquare || !interactive) return [] as Move[];
    return chess.moves({ square: selectedSquare, verbose: true });
  }, [chess, selectedSquare, interactive]);

  const legalTargetsMap = useMemo(() => {
    const map = new Map<string, Move>();
    for (const m of legalMovesForSelected) {
      map.set(m.to, m);
    }
    return map;
  }, [legalMovesForSelected]);

  const kingSquares = useMemo(() => {
    let wKing: Square | null = null;
    let bKing: Square | null = null;
    const board = chess.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = board[r][c];
        if (piece?.type === 'k') {
          const sq = `${FILES[c]}${RANKS[r]}` as Square;
          if (piece.color === 'w') wKing = sq;
          else bKing = sq;
        }
      }
    }
    return { w: wKing, b: bKing };
  }, [chess]);

  const checkedKingSquare = useMemo(() => {
    if (!chess.inCheck()) return null;
    return chess.turn() === 'w' ? kingSquares.w : kingSquares.b;
  }, [chess, kingSquares]);

  const canInteractWithColor = (pieceColor: Color) => {
    if (!interactive) return false;
    if (chess.turn() !== pieceColor) return false;
    if (allowedColor === 'both') return true;
    return allowedColor === pieceColor;
  };

  const canPremoveWithColor = (pieceColor: Color) => {
    if (!allowPremove || !onQueuePremove) return false;
    if (allowedColor === 'both') return false;
    return allowedColor === pieceColor && chess.turn() !== allowedColor;
  };

  const attemptMove = (from: Square, to: Square) => {
    const candidateMoves = chess.moves({ square: from, verbose: true }).filter((m) => m.to === to);
    if (candidateMoves.length === 0) {
      onIllegalAttempt?.();
      return false;
    }

    const isPromotion = candidateMoves.some((m) => m.isPromotion() || Boolean(m.promotion));
    if (isPromotion) {
      if (autoQueen) {
        setSelectedSquare(null);
        setMarkedSquares({});
        setArrows([]);
        onMove?.(from, to, 'q');
        return true;
      }
      const piece = chess.get(from);
      setPendingPromotion({ from, to, color: piece?.color || chess.turn() });
      setSelectedSquare(null);
      return true;
    }

    setSelectedSquare(null);
    setMarkedSquares({});
    setArrows([]);
    onMove?.(from, to);
    return true;
  };

  const handleSquareClick = (sq: Square) => {
    if (onSquareTap) {
      onSquareTap(sq);
      return;
    }

    // Left click clears right-click arrows/highlights just like Chess.com
    if (Object.keys(markedSquares).length > 0 || arrows.length > 0) {
      setMarkedSquares({});
      setArrows([]);
    }

    if (pendingPromotion) return;

    const clickedPiece = chess.get(sq);

    // Premove flow when waiting for opponent's move
    if (allowPremove && allowedColor !== 'both' && chess.turn() !== allowedColor && onQueuePremove) {
      if (premoveSelected) {
        if (premoveSelected === sq) {
          setPremoveSelected(null);
          onCancelPremove?.();
          return;
        }
        if (clickedPiece && clickedPiece.color === allowedColor) {
          setPremoveSelected(sq);
          return;
        }
        onQueuePremove(premoveSelected, sq);
        setPremoveSelected(null);
        return;
      }
      if (clickedPiece && canPremoveWithColor(clickedPiece.color)) {
        setPremoveSelected(sq);
      } else if (premove) {
        onCancelPremove?.();
      }
      return;
    }

    if (!interactive) return;

    if (selectedSquare) {
      if (selectedSquare === sq) {
        setSelectedSquare(null);
        return;
      }

      if (legalTargetsMap.has(sq)) {
        attemptMove(selectedSquare, sq);
        return;
      }

      if (clickedPiece && canInteractWithColor(clickedPiece.color)) {
        setSelectedSquare(sq);
        return;
      }

      setSelectedSquare(null);
      onIllegalAttempt?.();
      return;
    }

    if (clickedPiece && canInteractWithColor(clickedPiece.color)) {
      setSelectedSquare(sq);
    }
  };

  const handleMouseDown = (e: React.MouseEvent, sq: Square) => {
    if (e.button === 2) {
      if (premove || premoveSelected) {
        setPremoveSelected(null);
        onCancelPremove?.();
      }
      rightDragStartRef.current = { sq, color: getAnnotationColor(e) };
    }
  };

  const handleMouseUp = (e: React.MouseEvent, sq: Square) => {
    if (e.button !== 2 || !rightDragStartRef.current) return;
    const start = rightDragStartRef.current;
    rightDragStartRef.current = null;

    if (start.sq === sq) {
      // Toggle right-click square highlight
      setMarkedSquares((prev) => {
        const next = { ...prev };
        if (next[sq]) delete next[sq];
        else next[sq] = start.color;
        return next;
      });
    } else {
      // Toggle right-click tactical arrow from start.sq -> sq
      setArrows((prev) => {
        const existsIdx = prev.findIndex((a) => a.from === start.sq && a.to === sq);
        if (existsIdx >= 0) {
          return prev.filter((_, idx) => idx !== existsIdx);
        }
        return [...prev, { from: start.sq, to: sq, color: start.color }];
      });
    }
  };

  const handleDragStart = (e: React.DragEvent, sq: Square) => {
    const piece = chess.get(sq);
    const isRegular = Boolean(piece && canInteractWithColor(piece.color));
    const isPre = Boolean(piece && canPremoveWithColor(piece.color));
    if (!isRegular && !isPre) {
      e.preventDefault();
      return;
    }
    if (isRegular) setSelectedSquare(sq);
    else setPremoveSelected(sq);
    e.dataTransfer.setData('text/plain', sq);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDrop = (e: React.DragEvent, targetSq: Square) => {
    e.preventDefault();
    if (pendingPromotion) return;
    const fromSq = (e.dataTransfer.getData('text/plain') || selectedSquare || premoveSelected) as Square | '';
    if (!fromSq || fromSq === targetSq) {
      setSelectedSquare(null);
      setPremoveSelected(null);
      return;
    }
    if (allowPremove && allowedColor !== 'both' && chess.turn() !== allowedColor && onQueuePremove) {
      const movingPiece = chess.get(fromSq as Square);
      if (movingPiece && movingPiece.color === allowedColor) {
        onQueuePremove(fromSq, targetSq);
      }
      setPremoveSelected(null);
      return;
    }
    if (!interactive) return;
    attemptMove(fromSq as Square, targetSq);
  };

  const handlePromotionChoice = (pieceType: PieceSymbol) => {
    if (!pendingPromotion) return;
    const { from, to } = pendingPromotion;
    setPendingPromotion(null);
    onMove?.(from, to, pieceType);
  };

  const getKingBadge = (sq: Square): { text: string; bg: string } | null => {
    if (!gameOutcome || !gameOutcome.result) return null;
    if (gameOutcome.result === '1/2-1/2') {
      if (sq === kingSquares.w || sq === kingSquares.b) {
        return { text: '½', bg: 'bg-slate-600 text-white' };
      }
      return null;
    }
    const whiteWon = gameOutcome.result === '1-0';
    if (sq === (whiteWon ? kingSquares.w : kingSquares.b)) {
      return { text: '♛', bg: 'bg-emerald-600 text-white' };
    }
    if (sq === (whiteWon ? kingSquares.b : kingSquares.w)) {
      return {
        text: gameOutcome.reason === 'checkmate' ? '#' : '⚑',
        bg: 'bg-red-600 text-white',
      };
    }
    return null;
  };

  const displayRanks = orientation === 'w' ? RANKS : [...RANKS].reverse();
  const displayFiles = orientation === 'w' ? FILES : [...FILES].reverse();

  // Include hint arrow if hintSquares specifies both from and to
  const combinedArrows: BoardArrow[] = useMemo(() => {
    const list = [...arrows];
    if (hintSquares?.from && hintSquares?.to) {
      list.push({
        from: hintSquares.from as Square,
        to: hintSquares.to as Square,
        color: 'rgba(129, 182, 76, 0.86)',
      });
    }
    return list;
  }, [arrows, hintSquares]);

  return (
    <div
      className="relative w-full aspect-square max-w-[680px] mx-auto select-none"
      onContextMenu={(e) => e.preventDefault()}
      onMouseLeave={() => {
        rightDragStartRef.current = null;
      }}
    >
      <div
        className="w-full h-full grid grid-cols-8 grid-rows-8 rounded-[4px] overflow-hidden ring-1 ring-black/30 dark:ring-black/45 shadow-[0_12px_32px_rgba(0,0,0,0.42)]"
        role="grid"
        aria-label="Interactive chessboard"
      >
        {displayRanks.map((rank, rIdx) =>
          displayFiles.map((file, fIdx) => {
            const sq = `${file}${rank}` as Square;
            const piece = chess.get(sq);
            const isLight = (FILES.indexOf(file) + RANKS.indexOf(rank)) % 2 === 0;
            const isSelected = selectedSquare === sq || premoveSelected === sq;
            const isLastMove = lastMove?.from === sq || lastMove?.to === sq;
            const isPremoveSq = premove?.from === sq || premove?.to === sq;
            const isHint = hintSquares?.from === sq || hintSquares?.to === sq;
            const isCheckedKing = checkedKingSquare === sq;
            const legalMove = legalTargetsMap.get(sq);
            const isCaptureTarget = Boolean(legalMove && (piece || legalMove.isEnPassant()));
            const markedColor = markedSquares[sq];
            const kingBadge = getKingBadge(sq);

            let squareBg = isLight ? theme.light : theme.dark;
            if (isLastMove) {
              squareBg = isLight ? theme.lastMoveLight : theme.lastMoveDark;
            }
            if (isPremoveSq) {
              squareBg = isLight ? '#F5A5A5' : '#C95B5B';
            }
            if (isSelected) {
              squareBg = premoveSelected === sq ? '#E06B6B' : isLight ? '#F6F669' : '#BACA2B';
            }

            const coordColor = isLight ? theme.coordLight : theme.coordDark;
            const canDrag = Boolean(
              piece && (canInteractWithColor(piece.color) || canPremoveWithColor(piece.color))
            );

            return (
              <button
                key={sq}
                type="button"
                onClick={() => handleSquareClick(sq)}
                onMouseDown={(e) => handleMouseDown(e, sq)}
                onMouseUp={(e) => handleMouseUp(e, sq)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDrop(e, sq)}
                style={{ backgroundColor: squareBg }}
                className="relative flex items-center justify-center w-full h-full focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#81B64C] cursor-pointer"
                aria-label={`${sq}${piece ? ` ${piece.color === 'w' ? 'white' : 'black'} ${piece.type}` : ''}`}
              >
                {/* Right-click User Square Highlight */}
                {markedColor && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{ backgroundColor: markedColor }}
                  />
                )}

                {/* Check Radial Highlight */}
                {isCheckedKing && (
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        'radial-gradient(circle, rgba(220,38,38,0.92) 0%, rgba(220,38,38,0.52) 55%, rgba(220,38,38,0) 80%)',
                    }}
                  />
                )}

                {/* Hint Outline */}
                {isHint && (
                  <div className="absolute inset-1 rounded-[3px] ring-3 ring-[#81B64C] bg-[#81B64C]/22 pointer-events-none" />
                )}

                {/* Rank Coordinate (top-left edge, Chess.com style) */}
                {showCoordinates && fIdx === 0 && (
                  <span
                    style={{ color: coordColor }}
                    className="absolute top-1 left-1 text-[10px] sm:text-[11px] font-display font-extrabold leading-none pointer-events-none"
                  >
                    {rank}
                  </span>
                )}

                {/* File Coordinate (bottom-right edge, Chess.com style) */}
                {showCoordinates && rIdx === 7 && (
                  <span
                    style={{ color: coordColor }}
                    className="absolute bottom-1 right-1 text-[10px] sm:text-[11px] font-display font-extrabold leading-none pointer-events-none"
                  >
                    {file}
                  </span>
                )}

                {/* Legal Empty Square Dot */}
                {legalMove && !isCaptureTarget && (
                  <span className="w-[31%] h-[31%] rounded-full bg-black/18 pointer-events-none" />
                )}

                {/* Legal Capture Ring */}
                {legalMove && isCaptureTarget && (
                  <span className="absolute inset-[5%] rounded-full border-[5px] sm:border-[6px] border-black/20 pointer-events-none" />
                )}

                {/* Chess Piece */}
                {piece && (
                  <motion.div
                    key={`${sq}-${piece.color}${piece.type}`}
                    draggable={canDrag}
                    onDragStart={(e) => handleDragStart(e as unknown as React.DragEvent, sq)}
                    initial={animationsEnabled ? { scale: 0.94, opacity: 0.9 } : false}
                    animate={{ scale: isSelected ? 1.06 : 1, opacity: 1 }}
                    transition={{ duration: animationsEnabled ? 0.08 : 0, ease: [0.16, 1, 0.3, 1] }}
                    className={`w-[87%] h-[87%] z-10 flex items-center justify-center ${
                      canDrag ? 'cursor-grab active:cursor-grabbing' : ''
                    }`}
                  >
                    <ChessPieceSvg type={piece.type} color={piece.color} style={pieceStyle} />
                  </motion.div>
                )}

                {/* End-of-game King Result Badge */}
                {kingBadge && (
                  <span
                    className={`absolute -top-0.5 -right-0.5 z-20 w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center text-[11px] font-bold shadow-md ring-2 ring-white dark:ring-[#262421] pointer-events-none ${kingBadge.bg}`}
                  >
                    {kingBadge.text}
                  </span>
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Tactical SVG Arrows Layer (Right-Click Drag & Engine Hint Arrows) */}
      {combinedArrows.length > 0 && (
        <svg
          viewBox="0 0 800 800"
          className="absolute inset-0 w-full h-full pointer-events-none z-20"
        >
          {combinedArrows.map((arrow, idx) => {
            const p1 = squareToBoardCoords(arrow.from, orientation);
            const p2 = squareToBoardCoords(arrow.to, orientation);
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.hypot(dx, dy);
            if (len < 1) return null;
            const ux = dx / len;
            const uy = dy / len;

            const startX = p1.x + ux * 16;
            const startY = p1.y + uy * 16;
            const tipX = p2.x - ux * 12;
            const tipY = p2.y - uy * 12;
            const headLen = 30;
            const headWidth = 22;
            const baseX = tipX - ux * headLen;
            const baseY = tipY - uy * headLen;
            const perpX = -uy;
            const perpY = ux;

            const headPoints = [
              `${tipX},${tipY}`,
              `${baseX + perpX * headWidth},${baseY + perpY * headWidth}`,
              `${baseX - perpX * headWidth},${baseY - perpY * headWidth}`,
            ].join(' ');

            return (
              <g key={`${arrow.from}-${arrow.to}-${idx}`} opacity={0.92}>
                <line
                  x1={startX}
                  y1={startY}
                  x2={baseX}
                  y2={baseY}
                  stroke={arrow.color}
                  strokeWidth="16"
                  strokeLinecap="round"
                />
                <polygon points={headPoints} fill={arrow.color} />
              </g>
            );
          })}
        </svg>
      )}

      {/* Pawn Promotion Selection Modal */}
      <AnimatePresence>
        {pendingPromotion && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="absolute inset-0 z-30 bg-black/60 backdrop-blur-[2px] rounded-[4px] flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.94, opacity: 0 }}
              transition={{ duration: 0.14 }}
              className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-5 shadow-2xl max-w-xs w-full text-center"
            >
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white mb-1">
                Promote Pawn
              </h3>
              <p className="text-xs text-stone-500 dark:text-[#9E9C98] mb-4">
                Choose promotion piece on {pendingPromotion.to}.
              </p>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {(['q', 'r', 'b', 'n'] as PieceSymbol[]).map((pType) => (
                  <button
                    key={pType}
                    type="button"
                    onClick={() => handlePromotionChoice(pType)}
                    className="aspect-square p-2 rounded-lg bg-stone-100 dark:bg-[#312F2C] hover:bg-[#81B64C]/20 border border-[#DFDDD8] dark:border-[#3C3A37] hover:border-[#81B64C] transition-colors flex flex-col items-center justify-center cursor-pointer"
                    title={pType === 'q' ? 'Queen' : pType === 'r' ? 'Rook' : pType === 'b' ? 'Bishop' : 'Knight'}
                  >
                    <ChessPieceSvg type={pType} color={pendingPromotion.color} style={pieceStyle} className="w-10 h-10" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setPendingPromotion(null)}
                className="text-xs font-semibold text-stone-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
