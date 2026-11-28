import { computeBestBotMove } from '../lib/chessEngine';
import type { ComputerBot } from '../types/chess';

export interface BotWorkerRequest {
  id: number;
  fen: string;
  bot: ComputerBot;
  priorPositionKeys?: string[];
}

export interface BotWorkerResponse {
  id: number;
  move: { from: string; to: string; promotion?: string } | null;
  error?: string;
}

self.onmessage = (event: MessageEvent<BotWorkerRequest>) => {
  const { id, fen, bot, priorPositionKeys } = event.data;
  try {
    const move = computeBestBotMove(fen, bot, priorPositionKeys);
    const payload: BotWorkerResponse = { id, move };
    self.postMessage(payload);
  } catch (err) {
    const payload: BotWorkerResponse = {
      id,
      move: null,
      error: err instanceof Error ? err.message : 'Bot calculation failed.',
    };
    self.postMessage(payload);
  }
};
