import { computeBestBotMove, MINIMAX_H1_FLASH } from './chessEngine';
import type { ComputerBot } from '../types/chess';
import type { BotWorkerRequest, BotWorkerResponse } from '../workers/botEngineWorker';

let sharedWorker: Worker | null = null;
let nextRequestId = 1;

function getOrCreateBotWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null;
  if (!sharedWorker) {
    try {
      sharedWorker = new Worker(new URL('../workers/botEngineWorker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      sharedWorker = null;
    }
  }
  return sharedWorker;
}

/**
 * Runs MiniMax H1 (Flash / Pro / Ultra) asynchronously in a background Web Worker
 * so deep 9-ply Ultra searches never block 60fps UI animations or board interactions.
 */
export function computeBestBotMoveAsync(
  fen: string,
  bot: ComputerBot = MINIMAX_H1_FLASH,
  priorPositionKeys?: string[],
  signal?: AbortSignal
): Promise<{ from: string; to: string; promotion?: string } | null> {
  if (signal?.aborted) {
    return Promise.resolve(null);
  }

  const worker = getOrCreateBotWorker();
  if (!worker) {
    return Promise.resolve(computeBestBotMove(fen, bot, priorPositionKeys));
  }

  return new Promise((resolve) => {
    const reqId = nextRequestId++;
    let settled = false;

    const cleanup = () => {
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      signal?.removeEventListener('abort', onAbort);
    };

    const onAbort = () => {
      if (settled) return;
      settled = true;
      cleanup();
      // Terminate & reset busy worker so next game gets a fresh instant thread
      try {
        sharedWorker?.terminate();
      } catch {
        // ignore
      }
      sharedWorker = null;
      resolve(null);
    };

    const onMessage = (e: MessageEvent<BotWorkerResponse>) => {
      if (!e.data || e.data.id !== reqId || settled) return;
      settled = true;
      cleanup();
      if (e.data.error) {
        resolve(computeBestBotMove(fen, bot, priorPositionKeys));
      } else {
        resolve(e.data.move);
      }
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      sharedWorker = null;
      resolve(computeBestBotMove(fen, bot, priorPositionKeys));
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);
    signal?.addEventListener('abort', onAbort, { once: true });

    const req: BotWorkerRequest = { id: reqId, fen, bot, priorPositionKeys };
    worker.postMessage(req);
  });
}
