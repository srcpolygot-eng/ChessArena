import type { ChessMatch, UserPrivateProfile, UserProgression } from '../types/chess';

export interface DailyRewardTier {
  day: number;
  label: string;
  xp: number;
  coins: number;
  isGrandPrize?: boolean;
}

export const DAILY_REWARD_SCHEDULE: DailyRewardTier[] = [
  { day: 1, label: 'Day 1', xp: 50, coins: 25 },
  { day: 2, label: 'Day 2', xp: 75, coins: 35 },
  { day: 3, label: 'Day 3', xp: 100, coins: 50 },
  { day: 4, label: 'Day 4', xp: 125, coins: 65 },
  { day: 5, label: 'Day 5', xp: 150, coins: 80 },
  { day: 6, label: 'Day 6', xp: 200, coins: 100 },
  { day: 7, label: 'Day 7 Chest', xp: 350, coins: 200, isGrandPrize: true },
];

export function getLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getYesterdayDateKey(baseDate: Date = new Date()): string {
  const d = new Date(baseDate);
  d.setDate(d.getDate() - 1);
  return getLocalDateKey(d);
}

export function isDailyRewardClaimable(progression: UserProgression | null, today = getLocalDateKey()): boolean {
  if (!progression) return true;
  return progression.lastRewardDate !== today;
}

export function computeNextRewardClaim(
  progression: UserProgression | null,
  today = getLocalDateKey(),
  yesterday = getYesterdayDateKey()
): {
  nextStreak: number;
  nextLongestStreak: number;
  nextRewardDay: number;
  reward: DailyRewardTier;
} {
  const prevLast = progression?.lastRewardDate || '';
  const prevStreak = progression?.currentStreak || 0;
  const prevLongest = progression?.longestStreak || 0;
  const prevRewardDay = progression?.lastRewardDay || 0;

  const continued = prevLast === yesterday;
  const nextStreak = continued ? prevStreak + 1 : 1;
  const nextLongestStreak = Math.max(prevLongest, nextStreak);
  const nextRewardDay = continued ? (prevRewardDay >= 7 ? 1 : prevRewardDay + 1) : 1;
  const reward = DAILY_REWARD_SCHEDULE[nextRewardDay - 1] || DAILY_REWARD_SCHEDULE[0];

  return {
    nextStreak,
    nextLongestStreak,
    nextRewardDay,
    reward,
  };
}

export function getPlayerLevel(xp: number): {
  level: number;
  title: string;
  currentLevelXp: number;
  nextLevelXp: number;
  progressPct: number;
} {
  const safeXp = Math.max(0, xp);
  const level = Math.floor(safeXp / 250) + 1;
  const currentLevelXp = safeXp % 250;
  const nextLevelXp = 250;
  const progressPct = Math.min(100, Math.round((currentLevelXp / nextLevelXp) * 100));

  const title =
    level >= 25
      ? 'Arena Grandmaster'
      : level >= 15
      ? 'International Master'
      : level >= 10
      ? 'FIDE Master'
      : level >= 6
      ? 'Candidate Master'
      : level >= 3
      ? 'Club Tactician'
      : 'Arena Challenger';

  return { level, title, currentLevelXp, nextLevelXp, progressPct };
}

export interface AchievementItem {
  id: string;
  title: string;
  description: string;
  category: 'Matches' | 'Tactics' | 'Streaks' | 'Variants';
  unlocked: boolean;
  progressLabel: string;
}

export function computePlayerAchievements(
  user: UserPrivateProfile,
  progression: UserProgression | null,
  completedMatches: ChessMatch[]
): AchievementItem[] {
  const chess960Games = completedMatches.filter((m) => m.variant === 'chess960').length;
  const beatUltra = completedMatches.some(
    (m) =>
      m.winnerId === user.uid &&
      (m.whiteId === 'computer_minimax_h1_ultra' || m.blackId === 'computer_minimax_h1_ultra')
  );
  const beatPro = completedMatches.some(
    (m) =>
      m.winnerId === user.uid &&
      (m.whiteId === 'computer_minimax_h1_pro' || m.blackId === 'computer_minimax_h1_pro')
  );
  const beatFlash = completedMatches.some(
    (m) =>
      m.winnerId === user.uid &&
      (m.whiteId === 'computer_minimax_h1_flash' || m.blackId === 'computer_minimax_h1_flash')
  );
  const streak = progression?.longestStreak || 0;
  const dailyPuzzles = progression?.dailyPuzzlesCompleted || 0;
  const rushBest = progression?.puzzleRushBest || 0;
  const visionBest = progression?.visionBest || 0;

  return [
    {
      id: 'first_win',
      title: 'First Blood',
      description: 'Win your first completed chess match.',
      category: 'Matches',
      unlocked: user.wins >= 1,
      progressLabel: `${Math.min(1, user.wins)} / 1`,
    },
    {
      id: 'ten_games',
      title: 'Dedicated Competitor',
      description: 'Play 10 completed games in Chess Arena.',
      category: 'Matches',
      unlocked: user.gamesPlayed >= 10,
      progressLabel: `${Math.min(10, user.gamesPlayed)} / 10`,
    },
    {
      id: 'beat_flash',
      title: 'Flash Tamer',
      description: 'Defeat MiniMax H1 Flash (2050) in a full game.',
      category: 'Matches',
      unlocked: beatFlash,
      progressLabel: beatFlash ? 'Unlocked' : '0 / 1',
    },
    {
      id: 'beat_pro',
      title: 'Pro Challenger',
      description: 'Defeat MiniMax H1 Pro (2350) in a full game.',
      category: 'Matches',
      unlocked: beatPro,
      progressLabel: beatPro ? 'Unlocked' : '0 / 1',
    },
    {
      id: 'beat_ultra',
      title: 'Ultra Conqueror',
      description: 'Defeat the flagship MiniMax H1 Ultra (2650 GM) engine.',
      category: 'Matches',
      unlocked: beatUltra,
      progressLabel: beatUltra ? 'Unlocked' : '0 / 1',
    },
    {
      id: 'tactician_10',
      title: 'Sharp Tactician',
      description: 'Solve 10 tactical puzzles from the library.',
      category: 'Tactics',
      unlocked: user.puzzlesSolved >= 10,
      progressLabel: `${Math.min(10, user.puzzlesSolved)} / 10`,
    },
    {
      id: 'puzzle_rush_5',
      title: 'Speed Calculator',
      description: 'Score 5 or more in a single Puzzle Rush session.',
      category: 'Tactics',
      unlocked: rushBest >= 5,
      progressLabel: `${Math.min(5, rushBest)} / 5`,
    },
    {
      id: 'daily_puzzle_1',
      title: 'Daily Solver',
      description: 'Complete your first Daily Puzzle.',
      category: 'Streaks',
      unlocked: dailyPuzzles >= 1,
      progressLabel: `${Math.min(1, dailyPuzzles)} / 1`,
    },
    {
      id: 'streak_3',
      title: '3-Day Streak',
      description: 'Claim daily rewards 3 days in a row.',
      category: 'Streaks',
      unlocked: streak >= 3,
      progressLabel: `${Math.min(3, streak)} / 3`,
    },
    {
      id: 'streak_7',
      title: 'Grandmaster Chest',
      description: 'Reach a 7-day check-in streak.',
      category: 'Streaks',
      unlocked: streak >= 7,
      progressLabel: `${Math.min(7, streak)} / 7`,
    },
    {
      id: 'chess960_explorer',
      title: 'Fischer Random Explorer',
      description: 'Complete a Chess960 match.',
      category: 'Variants',
      unlocked: chess960Games >= 1,
      progressLabel: `${Math.min(1, chess960Games)} / 1`,
    },
    {
      id: 'vision_15',
      title: 'Board Vision Ace',
      description: 'Hit 15+ coordinates in a 30s Vision drill.',
      category: 'Tactics',
      unlocked: visionBest >= 15,
      progressLabel: `${Math.min(15, visionBest)} / 15`,
    },
  ];
}
