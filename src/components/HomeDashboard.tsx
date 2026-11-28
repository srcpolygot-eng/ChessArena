import React, { useMemo } from 'react';
import {
  Swords,
  Users,
  Puzzle,
  ArrowRight,
  Trophy,
  Play,
  History,
  ChevronRight,
  Clock,
  Globe,
  ArrowLeftRight,
  Flame,
  Gift,
  Coins,
  GraduationCap,
  Calendar,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import {
  BOT_ULTRA_IMAGE,
  CHESS_ARENA_UI_IMAGE,
  type ChessMatch,
  type MatchInvitation,
  type NavSection,
  type PublicProfile,
  type UserPrivateProfile,
  type UserProgression,
} from '../types/chess';
import { formatResultReason } from '../lib/chessEngine';
import {
  DAILY_REWARD_SCHEDULE,
  getLocalDateKey,
  getPlayerLevel,
  isDailyRewardClaimable,
} from '../lib/rewardsAndStreaks';
import { getDailyPuzzle } from '../lib/puzzlesData';
import { PlayerAvatar } from './PlayerAvatar';

interface HomeDashboardProps {
  user: UserPrivateProfile;
  progression?: UserProgression | null;
  claimingReward?: boolean;
  onClaimDailyReward?: () => Promise<void>;
  onOpenDailyPuzzle?: () => void;
  activeMatches: ChessMatch[];
  completedMatches: ChessMatch[];
  friends: PublicProfile[];
  leaderboardPreview: PublicProfile[];
  incomingInvitations: MatchInvitation[];
  onNavigate: (nav: NavSection) => void;
  onOpenPlayTab: (tab: 'online' | 'friend' | 'computer' | 'pass_and_play' | 'private') => void;
  onStartPassAndPlay: () => void;
  onOpenMatch: (matchId: string) => void;
  onReplayMatch: (match: ChessMatch) => void;
  onViewProfile: (uid: string) => void;
  onQuickChallengeFriend: (friend: PublicProfile) => void;
  onAcceptInvitation: (inv: MatchInvitation) => void;
  onRejectInvitation: (invId: string) => void;
}

export const HomeDashboard: React.FC<HomeDashboardProps> = ({
  user,
  progression = null,
  claimingReward = false,
  onClaimDailyReward,
  onOpenDailyPuzzle,
  activeMatches,
  completedMatches,
  friends,
  leaderboardPreview,
  incomingInvitations,
  onNavigate,
  onOpenPlayTab,
  onStartPassAndPlay,
  onOpenMatch,
  onReplayMatch,
  onViewProfile,
  onQuickChallengeFriend,
  onAcceptInvitation,
  onRejectInvitation,
}) => {
  const todayKey = useMemo(() => getLocalDateKey(), []);
  const todayPuzzle = useMemo(() => getDailyPuzzle(todayKey), [todayKey]);
  const rewardReady = isDailyRewardClaimable(progression, todayKey);
  const dailyPuzzleDone = progression?.lastDailyPuzzleDate === todayKey;
  const levelInfo = getPlayerLevel(progression?.xp ?? 0);
  const nextClaimDay = progression
    ? rewardReady
      ? (progression.lastRewardDay % 7) + 1
      : progression.lastRewardDay || 1
    : 1;
  const winRate =
    user.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : 0;

  const onlineFriends = useMemo(
    () => friends.filter((f) => f.onlineStatus === 'online' || f.onlineStatus === 'in_game'),
    [friends]
  );

  // Real 7-day daily match activity calculated strictly from actual completedMatches
  const dailyActivity = useMemo(() => {
    const days: { label: string; key: string; count: number; wins: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const label = d.toLocaleDateString(undefined, { weekday: 'short' });
      days.push({ label, key, count: 0, wins: 0 });
    }

    for (const m of completedMatches) {
      const ts = m.completedAt?.toDate() || m.createdAt?.toDate();
      if (!ts) continue;
      const key = `${ts.getFullYear()}-${ts.getMonth()}-${ts.getDate()}`;
      const bucket = days.find((d) => d.key === key);
      if (bucket) {
        bucket.count += 1;
        if (m.winnerId === user.uid) bucket.wins += 1;
      }
    }
    const maxCount = Math.max(1, ...days.map((d) => d.count));
    return { days, maxCount };
  }, [completedMatches, user.uid]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const getMatchOutcomeBadge = (m: ChessMatch) => {
    if (m.result === '1/2-1/2') {
      return { symbol: '=', text: 'Draw', pill: 'bg-stone-500 text-white' };
    }
    if (m.winnerId === user.uid) {
      return { symbol: '+', text: 'Win', pill: 'bg-[#81B64C] text-white' };
    }
    return { symbol: '−', text: 'Loss', pill: 'bg-[#E05347] text-white' };
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Incoming Match Invitations Strip */}
      {incomingInvitations.length > 0 && (
        <div className="bg-[#81B64C]/12 border border-[#81B64C]/40 rounded-xl p-4 space-y-3">
          <p className="text-xs font-bold text-[#81B64C]">
            Incoming Match Challenges ({incomingInvitations.length})
          </p>
          <div className="divide-y divide-[#81B64C]/20">
            {incomingInvitations.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <PlayerAvatar src={inv.senderPhotoURL} name={inv.senderDisplayName} size="sm" />
                  <div>
                    <p className="text-sm font-bold text-slate-900 dark:text-white">
                      {inv.senderUsername}{' '}
                      <span className="font-mono text-xs text-stone-500 dark:text-[#9E9C98] tabular-nums">
                        ({inv.senderRating})
                      </span>
                    </p>
                    <p className="text-xs text-stone-600 dark:text-[#C3C2C0]">
                      Challenged you to an untimed match
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onAcceptInvitation(inv)}
                    className="px-3.5 py-1.5 rounded-lg btn-chess-primary text-xs cursor-pointer"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => onRejectInvitation(inv.id)}
                    className="px-3 py-1.5 rounded-lg btn-chess-secondary text-xs cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chess.com-Inspired Split Top Stage: Live Board/UI Preview (Left) + Stacked Play Actions (Right) */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Left: Player Header + Arena Board Showcase */}
        <div className="lg:col-span-7 bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl overflow-hidden flex flex-col justify-between">
          <div className="p-5 sm:p-6 flex items-center justify-between gap-4 border-b border-[#DFDDD8] dark:border-[#353330]">
            <div className="flex items-center gap-3.5 min-w-0">
              <PlayerAvatar
                src={user.photoURL}
                name={user.displayName}
                size="md"
                status={user.onlineStatus}
                showStatusDot
              />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-[#81B64C]">{greeting}</p>
                <h1 className="font-display text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white truncate">
                  {user.displayName}
                </h1>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-stone-500 dark:text-[#9E9C98] font-mono tabular-nums mt-0.5">
                  <span>@{user.username}</span>
                  <span>·</span>
                  <span className="text-amber-600 dark:text-amber-400 font-bold">{user.rating} Elo</span>
                  <span>·</span>
                  <span>{winRate}% wins</span>
                </div>
              </div>
            </div>

            <div className="hidden sm:flex items-center gap-3 text-right shrink-0">
              <div className="px-3 py-1.5 rounded-lg bg-stone-100 dark:bg-[#1F1E1B] border border-[#DFDDD8] dark:border-[#353330]">
                <p className="text-[10px] uppercase tracking-wider font-bold text-stone-500 dark:text-[#9E9C98]">
                  Puzzles
                </p>
                <p className="font-mono text-sm font-extrabold text-amber-600 dark:text-amber-400 tabular-nums">
                  {user.puzzleRating}
                </p>
              </div>
            </div>
          </div>

          {/* Featured MiniMax H1 Ultra Arena Showcase Card */}
          <div className="relative flex-1 min-h-[240px] bg-[#1F1E1B] overflow-hidden group">
            <img
              src={CHESS_ARENA_UI_IMAGE}
              alt="Chess Arena Tournament Board against MiniMax H1 Ultra"
              className="w-full h-full object-cover object-center opacity-85 group-hover:scale-[1.015] transition-transform duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-[#1B1917] via-[#1B1917]/55 to-transparent" />

            <div className="absolute inset-x-0 bottom-0 p-5 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <img
                  src={BOT_ULTRA_IMAGE}
                  alt="MiniMax H1 Ultra"
                  className="w-13 h-13 rounded-xl object-cover ring-2 ring-amber-400 shadow-lg shrink-0"
                />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="cc-title-badge cc-title-gm">GM</span>
                    <span className="cc-title-badge cc-title-ultra">NEW · ULTRA</span>
                    <span className="font-mono text-xs font-bold text-amber-300">2650 Elo</span>
                  </div>
                  <h2 className="font-display text-lg font-extrabold text-white mt-0.5">
                    MiniMax H1 Ultra Is Live
                  </h2>
                  <p className="text-xs text-stone-300 max-w-md">
                    Depth-9 Aspiration Windows, Null-Move Pruning &amp; Grandmaster endgame precision.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onOpenPlayTab('computer')}
                className="px-4 py-2.5 rounded-lg btn-chess-primary text-xs inline-flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
              >
                Challenge H1 Ultra
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Right: Chess.com Iconic Stacked Play Menu */}
        <div className="lg:col-span-5 bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-5 flex flex-col justify-between gap-3">
          <button
            type="button"
            id="home-cta-play-online"
            onClick={() => onOpenPlayTab('online')}
            className="w-full p-4 rounded-xl btn-chess-primary text-left flex items-center gap-4 cursor-pointer"
          >
            <div className="w-11 h-11 rounded-lg bg-black/15 flex items-center justify-center shrink-0">
              <Globe className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block font-display text-lg font-extrabold text-white leading-tight">
                Play Online
              </span>
              <span className="block text-xs text-white/90 font-medium mt-0.5">
                Play an untimed rated game vs a live player
              </span>
            </div>
            <ChevronRight className="w-5 h-5 text-white/90 shrink-0" />
          </button>

          <button
            type="button"
            id="home-cta-play-bots"
            onClick={() => onOpenPlayTab('computer')}
            className="w-full p-3.5 rounded-xl bg-stone-100 dark:bg-[#312F2C] hover:bg-stone-200/80 dark:hover:bg-[#3A3834] border border-[#DFDDD8] dark:border-[#42403C] text-left flex items-center gap-3.5 transition-colors cursor-pointer"
          >
            <img
              src={BOT_ULTRA_IMAGE}
              alt="MiniMax H1 Ultra"
              className="w-11 h-11 rounded-lg object-cover ring-1 ring-amber-400/70 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-display text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Play Bots
                <span className="cc-title-badge cc-title-ultra">H1 ULTRA</span>
              </span>
              <span className="block text-xs text-stone-500 dark:text-[#9E9C98] truncate">
                Face H1 Flash (2050), Pro (2350) &amp; Ultra (2650)
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('puzzles')}
            className="w-full p-3.5 rounded-xl bg-stone-100 dark:bg-[#312F2C] hover:bg-stone-200/80 dark:hover:bg-[#3A3834] border border-[#DFDDD8] dark:border-[#42403C] text-left flex items-center gap-3.5 transition-colors cursor-pointer"
          >
            <div className="w-11 h-11 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
              <Puzzle className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block font-display text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Puzzles
              </span>
              <span className="block text-xs text-stone-500 dark:text-[#9E9C98] truncate">
                {user.puzzlesSolved} solved · Puzzle Rush &amp; Daily Tactics
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
          </button>

          <button
            type="button"
            onClick={() => onNavigate('coach')}
            className="w-full p-3.5 rounded-xl bg-stone-100 dark:bg-[#312F2C] hover:bg-stone-200/80 dark:hover:bg-[#3A3834] border border-[#DFDDD8] dark:border-[#42403C] text-left flex items-center gap-3.5 transition-colors cursor-pointer"
          >
            <div className="w-11 h-11 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <span className="block font-display text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Play Coach &amp; Analysis
              </span>
              <span className="block text-xs text-stone-500 dark:text-[#9E9C98] truncate">
                Guided lessons, Analysis Board &amp; Openings
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
          </button>

          <div className="grid grid-cols-2 gap-2.5 pt-0.5">
            <button
              type="button"
              onClick={() => onOpenPlayTab('friend')}
              className="py-2.5 px-3 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-teal-400" />
              Play a Friend
            </button>
            <button
              type="button"
              onClick={onStartPassAndPlay}
              className="py-2.5 px-3 rounded-lg btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[#81B64C]" />
              2 Players
            </button>
          </div>
        </div>
      </section>

      {/* Daily Rewards, Streaks & Today's Daily Puzzle Strip */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                <Gift className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-display text-sm sm:text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Daily Check-In Rewards
                  <span className="font-mono text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 tabular-nums">
                    <Flame className="w-3.5 h-3.5" />
                    {progression?.currentStreak ?? 0}d streak
                  </span>
                </h2>
                <p className="text-xs text-stone-500 dark:text-[#9E9C98] font-mono tabular-nums">
                  Lv.{levelInfo.level} {levelInfo.title} · {progression?.xp ?? 0} XP ·{' '}
                  <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-semibold">
                    <Coins className="w-3 h-3" /> {progression?.coins ?? 0}
                  </span>
                </p>
              </div>
            </div>

            {onClaimDailyReward && (
              <button
                type="button"
                disabled={!rewardReady || claimingReward}
                onClick={() => void onClaimDailyReward()}
                className={`px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  rewardReady
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-[0_3px_0_#B45309]'
                    : 'bg-stone-100 dark:bg-[#1F1E1B] text-stone-500 dark:text-[#9E9C98] cursor-default'
                }`}
              >
                {rewardReady ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    {claimingReward ? 'Claiming...' : `Claim Day ${nextClaimDay}`}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#81B64C]" />
                    Claimed Today
                  </>
                )}
              </button>
            )}
          </div>

          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {DAILY_REWARD_SCHEDULE.map((item) => {
              const claimed =
                progression && progression.lastRewardDay >= item.day && (!rewardReady || progression.lastRewardDay < 7);
              const isTodayTarget = rewardReady && item.day === nextClaimDay;
              return (
                <div
                  key={item.day}
                  className={`p-2 rounded-lg border text-center transition-colors ${
                    isTodayTarget
                      ? 'border-amber-500 bg-amber-500/12'
                      : claimed
                      ? 'border-[#81B64C]/45 bg-[#81B64C]/10'
                      : 'border-[#DFDDD8] dark:border-[#353330] bg-stone-50 dark:bg-[#1F1E1B]'
                  }`}
                >
                  <p className="text-[10px] font-mono text-stone-500 dark:text-[#9E9C98]">D{item.day}</p>
                  <p className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                    +{item.coins}
                  </p>
                  <p className="text-[10px] text-stone-500 dark:text-[#9E9C98] truncate">
                    {claimed ? '✓' : `${item.xp}xp`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Today's Daily Puzzle Card */}
        <div className="xl:col-span-4 bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-[#81B64C] inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Daily Puzzle
              </span>
              <span className="font-mono text-xs text-stone-500 dark:text-[#9E9C98] tabular-nums">
                {todayPuzzle.rating} Elo
              </span>
            </div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              {todayPuzzle.title}
            </h3>
            <p className="text-xs text-stone-500 dark:text-[#9E9C98]">
              {todayPuzzle.difficulty} · {todayPuzzle.theme} · Streak: {progression?.dailyPuzzleStreak ?? 0}d
            </p>
          </div>
          <button
            type="button"
            onClick={() => (onOpenDailyPuzzle ? onOpenDailyPuzzle() : onNavigate('puzzles'))}
            className="w-full py-2.5 rounded-lg btn-chess-primary text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {dailyPuzzleDone ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Solved · Review Puzzle
              </>
            ) : (
              <>
                <Puzzle className="w-3.5 h-3.5" />
                Solve Daily Puzzle (+100 XP)
              </>
            )}
          </button>
        </div>
      </section>

      {/* Active Ongoing Matches */}
      {activeMatches.length > 0 && (
        <section className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Daily / Active Games ({activeMatches.length})
            </h2>
            <span className="text-xs text-stone-500 dark:text-[#9E9C98]">Untimed · Reconnect anytime</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeMatches.map((m) => {
              const userIsWhite = m.whiteId === user.uid;
              const oppName = userIsWhite ? m.blackUsername : m.whiteUsername;
              const oppAvatar = userIsWhite ? m.blackPhotoURL : m.whitePhotoURL;
              const oppRating = userIsWhite ? m.blackRating : m.whiteRating;
              const isYourTurn =
                m.status === 'active' && ((m.turn === 'w' && userIsWhite) || (m.turn === 'b' && !userIsWhite));

              return (
                <div
                  key={m.matchId}
                  className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-stone-50 dark:bg-[#1F1E1B] border border-[#DFDDD8] dark:border-[#353330]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar src={oppAvatar} name={oppName} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                        {oppName}{' '}
                        <span className="font-mono text-xs text-stone-500 tabular-nums">({oppRating})</span>
                      </p>
                      <p className="text-xs text-stone-500 dark:text-[#9E9C98]">
                        {m.status === 'waiting'
                          ? `Room ${m.roomCode}`
                          : isYourTurn
                          ? 'Your turn to move'
                          : 'Waiting for opponent'}
                        {' · '}
                        <span className="font-mono tabular-nums">{Math.ceil(m.moveCount / 2)} moves</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenMatch(m.matchId)}
                    className="px-3.5 py-2 rounded-lg btn-chess-primary text-xs inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Play
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Main Content Grid: Completed Games Archive (Left) + Friends & Leaderboard (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Chess.com Style Completed Games Table */}
          <section className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-[#81B64C]" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Completed Games
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('history')}
                className="text-xs font-bold text-[#81B64C] hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                Archive ({completedMatches.length})
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {completedMatches.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">No completed games yet</p>
                <p className="text-xs text-stone-500 dark:text-[#9E9C98] mt-1 mb-4">
                  Play online or challenge MiniMax H1 Ultra to populate your PGN game archive.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('play')}
                  className="px-5 py-2.5 rounded-lg btn-chess-primary text-xs inline-flex items-center gap-2 cursor-pointer"
                >
                  <Swords className="w-3.5 h-3.5" />
                  Play Now
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#DFDDD8] dark:border-[#353330] text-xs text-stone-500 dark:text-[#9E9C98]">
                      <th className="py-2.5 font-semibold">Players</th>
                      <th className="py-2.5 font-semibold">Result</th>
                      <th className="py-2.5 font-semibold text-right">Moves</th>
                      <th className="py-2.5 font-semibold text-right">Review</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100 dark:divide-[#312F2C] text-sm">
                    {completedMatches.slice(0, 6).map((m) => {
                      const userIsWhite = m.whiteId === user.uid;
                      const oppName = userIsWhite ? m.blackUsername : m.whiteUsername;
                      const oppRating = userIsWhite ? m.blackRating : m.whiteRating;
                      const oppAvatar = userIsWhite ? m.blackPhotoURL : m.whitePhotoURL;
                      const delta = userIsWhite ? m.whiteRatingDelta : m.blackRatingDelta;
                      const badge = getMatchOutcomeBadge(m);

                      return (
                        <tr
                          key={m.matchId}
                          className="hover:bg-stone-50 dark:hover:bg-[#2E2C28] transition-colors"
                        >
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2.5">
                              <PlayerAvatar src={oppAvatar} name={oppName} size="xs" />
                              <div className="min-w-0">
                                <p className="font-semibold text-slate-900 dark:text-white truncate">
                                  {oppName}{' '}
                                  <span className="font-mono text-xs text-stone-500 dark:text-[#9E9C98]">
                                    ({oppRating})
                                  </span>
                                </p>
                                <p className="text-[11px] text-stone-500 dark:text-[#9E9C98] capitalize">
                                  {m.mode} · Played as {userIsWhite ? 'White' : 'Black'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2">
                              <span
                                className={`w-5 h-5 rounded-[4px] font-mono text-xs font-extrabold inline-flex items-center justify-center shrink-0 ${badge.pill}`}
                              >
                                {badge.symbol}
                              </span>
                              <div>
                                <span className="font-semibold text-xs text-slate-800 dark:text-[#E7E6E4]">
                                  {badge.text}
                                </span>
                                <span className="block text-[11px] text-stone-500 dark:text-[#9E9C98]">
                                  {formatResultReason(m.resultReason)}
                                  {delta !== 0 && (
                                    <span className="font-mono ml-1 tabular-nums">
                                      ({delta > 0 ? `+${delta}` : delta})
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-3 text-right font-mono text-xs text-stone-600 dark:text-[#C3C2C0] tabular-nums">
                            {Math.ceil(m.moveCount / 2)}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              onClick={() => onReplayMatch(m)}
                              className="px-2.5 py-1 rounded bg-stone-100 dark:bg-[#312F2C] hover:bg-[#81B64C] hover:text-white text-xs font-bold text-slate-700 dark:text-[#E7E6E4] transition-colors cursor-pointer"
                            >
                              Review
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Daily Chess Activity */}
          <section className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-[#81B64C]" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  7-Day Activity
                </h2>
              </div>
              <span className="text-xs font-mono text-stone-500 dark:text-[#9E9C98] tabular-nums">
                {user.gamesPlayed} total · {user.wins}W / {user.losses}L / {user.draws}D
              </span>
            </div>

            <div className="grid grid-cols-7 gap-3 items-end h-28 pt-2">
              {dailyActivity.days.map((day) => {
                const heightPct =
                  day.count > 0 ? Math.max(18, Math.round((day.count / dailyActivity.maxCount) * 100)) : 8;
                return (
                  <div key={day.key} className="flex flex-col items-center gap-2 h-full justify-end">
                    <span className="font-mono text-[11px] text-stone-500 dark:text-[#9E9C98] tabular-nums">
                      {day.count > 0 ? day.count : '—'}
                    </span>
                    <div className="w-full max-w-[34px] flex-1 flex items-end">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full rounded-t-md transition-all ${
                          day.count > 0 ? 'bg-[#81B64C]' : 'bg-stone-200 dark:bg-[#312F2C]'
                        }`}
                        title={`${day.label}: ${day.count} games (${day.wins} wins)`}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-stone-500 dark:text-[#9E9C98]">
                      {day.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        {/* Right Column: Online Friends & Leaderboard Preview */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Friends Online
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('friends')}
                className="text-xs font-bold text-[#81B64C] hover:underline cursor-pointer"
              >
                All Friends
              </button>
            </div>

            {onlineFriends.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-stone-500 dark:text-[#9E9C98] mb-3">
                  {friends.length === 0
                    ? 'Connect with friends by username to play anytime.'
                    : 'No friends online right now.'}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('friends')}
                  className="px-3.5 py-1.5 rounded-lg btn-chess-secondary text-xs cursor-pointer"
                >
                  Find Friends
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {onlineFriends.slice(0, 5).map((friend) => (
                  <div key={friend.uid} className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => onViewProfile(friend.uid)}
                      className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
                    >
                      <PlayerAvatar
                        src={friend.photoURL}
                        name={friend.displayName}
                        size="sm"
                        status={friend.onlineStatus}
                        showStatusDot
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate group-hover:text-[#81B64C]">
                          {friend.username}
                        </p>
                        <p className="text-xs font-mono text-stone-500 dark:text-[#9E9C98] tabular-nums">
                          ({friend.rating}) · {friend.onlineStatus === 'in_game' ? 'Playing' : 'Online'}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onQuickChallengeFriend(friend)}
                      className="px-2.5 py-1.5 rounded-md btn-chess-primary text-xs cursor-pointer shrink-0"
                    >
                      Play
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Leaderboard
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('leaderboard')}
                className="text-xs font-bold text-[#81B64C] hover:underline cursor-pointer"
              >
                Full Standings
              </button>
            </div>

            {leaderboardPreview.length === 0 ? (
              <p className="text-xs text-stone-500 dark:text-[#9E9C98] py-4 text-center">
                No ranked players yet.
              </p>
            ) : (
              <div className="space-y-2.5">
                {leaderboardPreview.slice(0, 5).map((player, idx) => (
                  <button
                    key={player.uid}
                    type="button"
                    onClick={() => onViewProfile(player.uid)}
                    className="w-full flex items-center justify-between gap-2.5 text-left hover:bg-stone-50 dark:hover:bg-[#312F2C] p-1.5 -mx-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-5 text-center font-mono text-xs font-extrabold tabular-nums ${
                          idx === 0
                            ? 'text-amber-500'
                            : idx === 1
                            ? 'text-stone-400'
                            : idx === 2
                            ? 'text-amber-700 dark:text-amber-600'
                            : 'text-stone-500'
                        }`}
                      >
                        #{idx + 1}
                      </span>
                      <PlayerAvatar src={player.photoURL} name={player.displayName} size="xs" />
                      <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {player.username}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold text-stone-700 dark:text-[#E7E6E4] tabular-nums shrink-0">
                      {player.rating}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
