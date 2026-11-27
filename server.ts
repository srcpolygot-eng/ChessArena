import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { Chess } from 'chess.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '128kb' }));

function calculateEloDeltas(whiteRating: number, blackRating: number, result: '1-0' | '0-1' | '1/2-1/2') {
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

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.post('/api/chess/validate-move', (req, res) => {
  try {
    const {
      fen,
      initialFen,
      moves,
      from,
      to,
      promotion,
      whiteRating = 1200,
      blackRating = 1200,
      isRated = true,
    } = req.body ?? {};

    if (typeof from !== 'string' || typeof to !== 'string' || !/^[a-h][1-8]$/.test(from) || !/^[a-h][1-8]$/.test(to)) {
      res.status(400).json({ valid: false, error: 'Invalid square coordinates.' });
      return;
    }

    const chess =
      typeof initialFen === 'string' && initialFen.trim().length >= 10
        ? new Chess(initialFen.trim())
        : new Chess();
    if (Array.isArray(moves) && moves.length > 0) {
      for (const san of moves) {
        if (typeof san !== 'string') {
          res.status(400).json({ valid: false, error: 'Corrupt move history.' });
          return;
        }
        const replayed = chess.move(san);
        if (!replayed) {
          res.status(400).json({ valid: false, error: 'Unable to replay match history.' });
          return;
        }
      }
    } else if (typeof fen === 'string' && fen.length >= 10) {
      chess.load(fen);
    }

    const moveOptions: { from: string; to: string; promotion?: string } = { from, to };
    if (typeof promotion === 'string' && ['q', 'r', 'b', 'n'].includes(promotion)) {
      moveOptions.promotion = promotion;
    }

    const executed = chess.move(moveOptions);
    if (!executed) {
      res.status(400).json({ valid: false, error: 'Illegal chess move.' });
      return;
    }

    let isGameOver = false;
    let result: '' | '1-0' | '0-1' | '1/2-1/2' = '';
    let resultReason = '';
    let whiteRatingDelta = 0;
    let blackRatingDelta = 0;

    if (chess.isCheckmate()) {
      isGameOver = true;
      result = chess.turn() === 'w' ? '0-1' : '1-0';
      resultReason = 'checkmate';
    } else if (chess.isStalemate()) {
      isGameOver = true;
      result = '1/2-1/2';
      resultReason = 'stalemate';
    } else if (chess.isThreefoldRepetition()) {
      isGameOver = true;
      result = '1/2-1/2';
      resultReason = 'threefold_repetition';
    } else if (chess.isInsufficientMaterial()) {
      isGameOver = true;
      result = '1/2-1/2';
      resultReason = 'insufficient_material';
    } else if (chess.isDraw()) {
      isGameOver = true;
      result = '1/2-1/2';
      resultReason = 'fifty_move_rule';
    }

    if (isGameOver && result && isRated) {
      const deltas = calculateEloDeltas(Number(whiteRating) || 1200, Number(blackRating) || 1200, result);
      whiteRatingDelta = deltas.whiteRatingDelta;
      blackRatingDelta = deltas.blackRatingDelta;
    }

    res.json({
      valid: true,
      fen: chess.fen(),
      pgn: chess.pgn(),
      san: executed.san,
      from: executed.from,
      to: executed.to,
      turn: chess.turn(),
      moves: chess.history(),
      inCheck: chess.inCheck(),
      isGameOver,
      result,
      resultReason,
      whiteRatingDelta,
      blackRatingDelta,
    });
  } catch (err) {
    res.status(400).json({
      valid: false,
      error: err instanceof Error ? err.message : 'Move validation failed.',
    });
  }
});

async function startServer() {
  const port = Number(process.env.PORT) || 3000;

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Chess Arena server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
