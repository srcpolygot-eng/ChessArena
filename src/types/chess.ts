import type { Timestamp } from 'firebase/firestore';

export type BoardTheme = 'classic' | 'walnut' | 'slate' | 'emerald';
export type PieceStyle = 'neo' | 'classic' | 'minimal';
export type OnlineStatus = 'online' | 'offline' | 'in_game';
export type MatchMode = 'online' | 'friend' | 'private' | 'computer';
export type MatchVariant = 'standard' | 'chess960';
export type MatchStatus = 'waiting' | 'active' | 'completed' | 'abandoned';
export type MatchResult = '' | '1-0' | '0-1' | '1/2-1/2';
export type ResultReason =
  | ''
  | 'checkmate'
  | 'stalemate'
  | 'draw_agreement'
  | 'threefold_repetition'
  | 'fifty_move_rule'
  | 'insufficient_material'
  | 'resignation';

export type NavSection =
  | 'home'
  | 'play'
  | 'puzzles'
  | 'coach'
  | 'friends'
  | 'leaderboard'
  | 'history'
  | 'profile'
  | 'settings';

export interface UserSettings {
  theme: 'dark' | 'light';
  soundEnabled: boolean;
  boardTheme: BoardTheme;
  pieceStyle: PieceStyle;
  animationsEnabled: boolean;
}

export interface LocalPlayPreferences {
  autoQueen: boolean;
  showCoordinates: boolean;
  enablePremoves: boolean;
}

export const DEFAULT_LOCAL_PLAY_PREFERENCES: LocalPlayPreferences = {
  autoQueen: false,
  showCoordinates: true,
  enablePremoves: true,
};

export interface UserPrivateProfile {
  uid: string;
  username: string;
  usernameLower: string;
  displayName: string;
  email: string;
  photoURL: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  puzzlesSolved: number;
  puzzleRating: number;
  solvedPuzzleIds: string[];
  settings: UserSettings;
  onlineStatus: OnlineStatus;
  lastSeen: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface UserProgression {
  uid: string;
  xp: number;
  coins: number;
  currentStreak: number;
  longestStreak: number;
  lastRewardDate: string; // YYYY-MM-DD or ''
  lastRewardDay: number; // 0..7
  dailyPuzzleStreak: number;
  lastDailyPuzzleDate: string; // YYYY-MM-DD or ''
  dailyPuzzlesCompleted: number;
  puzzleRushBest: number;
  visionBest: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface PublicProfile {
  uid: string;
  username: string;
  usernameLower: string;
  displayName: string;
  photoURL: string;
  rating: number;
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  puzzlesSolved: number;
  onlineStatus: OnlineStatus;
  isPublic: boolean;
  lastSeen: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string;
  senderPhotoURL: string;
  senderRating: number;
  receiverId: string;
  receiverUsername: string;
  receiverDisplayName: string;
  receiverPhotoURL: string;
  receiverRating: number;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface Friendship {
  id: string;
  userIds: string[];
  userA: string;
  userB: string;
  createdAt: Timestamp | null;
}

export interface MatchInvitation {
  id: string;
  senderId: string;
  senderUsername: string;
  senderDisplayName: string;
  senderPhotoURL: string;
  senderRating: number;
  receiverId: string;
  receiverUsername: string;
  receiverDisplayName: string;
  matchId: string;
  senderColor: 'white' | 'black' | 'random';
  status: 'pending' | 'accepted' | 'rejected' | 'cancelled';
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface ChessMatch {
  matchId: string;
  mode: MatchMode;
  variant?: MatchVariant;
  initialFen?: string;
  roomCode: string;
  whiteId: string;
  whiteUsername: string;
  whiteDisplayName: string;
  whitePhotoURL: string;
  whiteRating: number;
  blackId: string;
  blackUsername: string;
  blackDisplayName: string;
  blackPhotoURL: string;
  blackRating: number;
  participants: string[];
  fen: string;
  pgn: string;
  moves: string[];
  lastMoveFrom: string;
  lastMoveTo: string;
  turn: 'w' | 'b';
  moveCount: number;
  status: MatchStatus;
  result: MatchResult;
  winnerId: string;
  resultReason: ResultReason;
  drawOfferBy: string;
  whiteRatingDelta: number;
  blackRatingDelta: number;
  whiteStatsApplied: boolean;
  blackStatsApplied: boolean;
  whiteLastSeen: Timestamp | null;
  blackLastSeen: Timestamp | null;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
  completedAt: Timestamp | null;
}

export interface ComputerBot {
  id: string;
  difficulty: 'flash' | 'pro' | 'ultra';
  name: string;
  username: string;
  rating: number;
  tagline: string;
  avatar: string;
  depth: number;
  blunderChance: number;
  responseDelayMs?: number;
  timeBudgetMs?: number;
}

export interface ChessPuzzle {
  id: string;
  title: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced' | 'Master';
  rating: number;
  theme: string;
  fen: string;
  /** Solution moves in UCI format (e.g., ['e2e4', 'e7e5', 'd1h5']) — index 0, 2, 4... are player moves; 1, 3... are opponent replies */
  solution: string[];
  description: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  theme: 'dark',
  soundEnabled: true,
  boardTheme: 'classic',
  pieceStyle: 'neo',
  animationsEnabled: true,
};

export const HERO_CHESS_IMAGE = '/src/assets/images/hero_chess_arena_1795239891813.jpg';
export const BOT_NOVICE_IMAGE = '/src/assets/images/bot_avatar_novice_1795239891512.jpg';
export const BOT_TACTICIAN_IMAGE = '/src/assets/images/bot_avatar_tactician_1795239890766.jpg';
export const BOT_FLASH_IMAGE = '/src/assets/images/bot_avatar_flash_1795243073650.jpg';
export const BOT_GRANDMASTER_IMAGE = '/src/assets/images/bot_avatar_grandmaster_1795239891115.jpg';

export const PRESET_AVATARS: string[] = [
  BOT_NOVICE_IMAGE,
  BOT_TACTICIAN_IMAGE,
  BOT_FLASH_IMAGE,
  BOT_GRANDMASTER_IMAGE,
  HERO_CHESS_IMAGE,
];

export const BOARD_THEMES: Record<
  BoardTheme,
  {
    name: string;
    light: string;
    dark: string;
    coordLight: string;
    coordDark: string;
    lastMoveLight: string;
    lastMoveDark: string;
  }
> = {
  classic: {
    name: 'Tournament Green',
    light: '#EEEED2',
    dark: '#769656',
    coordLight: '#769656',
    coordDark: '#EEEED2',
    lastMoveLight: '#F6F669',
    lastMoveDark: '#BACA2B',
  },
  walnut: {
    name: 'Walnut Wood',
    light: '#F0D9B5',
    dark: '#B58863',
    coordLight: '#946B48',
    coordDark: '#F0D9B5',
    lastMoveLight: '#CDD26A',
    lastMoveDark: '#AAA23A',
  },
  slate: {
    name: 'Slate Steel',
    light: '#DEE3E6',
    dark: '#7B8FA1',
    coordLight: '#5C6F80',
    coordDark: '#DEE3E6',
    lastMoveLight: '#E8E38B',
    lastMoveDark: '#9CB27C',
  },
  emerald: {
    name: 'Emerald Felt',
    light: '#E6EFE9',
    dark: '#2F6F4E',
    coordLight: '#24583E',
    coordDark: '#E6EFE9',
    lastMoveLight: '#D8E88A',
    lastMoveDark: '#699C4E',
  },
};
