import React, { useMemo } from 'react';
import {
  Swords,
  Users,
  Cpu,
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
  HERO_CHESS_IMAGE,
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

  const getMatchOutcomeLabel = (m: ChessMatch) => {
    if (m.result === '1/2-1/2') return { text: 'Draw', color: 'text-amber-600 dark:text-amber-400' };
    if (m.winnerId === user.uid) return { text: 'Win', color: 'text-emerald-600 dark:text-emerald-400' };
    return { text: 'Loss', color: 'text-red-600 dark:text-red-400' };
  };

  return (
    <div className="space-y-6 pb-8">
      {/* Incoming Match Invitations Strip */}
      {incomingInvitations.length > 0 && (
        <div className="bg-emerald-600/10 border border-emerald-500/30 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            Incoming Match Challenges ({incomingInvitations.length})
          </p>
          <div className="divide-y divide-emerald-500/20">
            {incomingInvitations.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <PlayerAvatar src={inv.senderPhotoURL} name={inv.senderDisplayName} size="sm" />
                  <div>
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                      {inv.senderUsername}{' '}
                      <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        ({inv.senderRating})
                      </span>
                    </p>
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Challenged you to an untimed match
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onAcceptInvitation(inv)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                  >
                    Accept & Play
                  </button>
                  <button
                    type="button"
                    onClick={() => onRejectInvitation(inv.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-200 dark:bg-[#222833] hover:bg-slate-300 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-300 text-xs font-medium transition-colors cursor-pointer"
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Hero Greeting & Primary Play Banner */}
      <section className="relative rounded-xl overflow-hidden bg-[#161A21] border border-slate-200 dark:border-[#2A313D]">
        <img
          src={HERO_CHESS_IMAGE}
          alt="Tournament chess board"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#12151A] via-[#12151A]/85 to-[#12151A]/50" />

        <div className="relative z-10 p-6 sm:p-8 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div className="flex items-center gap-4">
            <PlayerAvatar
              src={user.photoURL}
              name={user.displayName}
              size="lg"
              status={user.onlineStatus}
              showStatusDot
            />
            <div>
              <p className="text-xs font-medium text-emerald-400 mb-1">
                {greeting} · Untimed Classical Arena
              </p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">
                {user.displayName}
              </h1>
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-300 mt-1.5 font-mono tabular-nums">
                <span>@{user.username}</span>
                <span aria-hidden="true">·</span>
                <span className="text-amber-400 font-semibold">{user.rating} Elo</span>
                <span aria-hidden="true">·</span>
                <span>{user.gamesPlayed} games</span>
                <span aria-hidden="true">·</span>
                <span>{winRate}% win rate</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => onNavigate('play')}
              className="px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-display font-bold text-sm inline-flex items-center gap-2.5 shadow-lg shadow-emerald-950/40 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Swords className="w-4 h-4" />
              Play Chess
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </section>

      {/* Daily Rewards, Streaks & Today's Daily Puzzle Strip */}
      <section className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-500/12 text-amber-500 flex items-center justify-center shrink-0">
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
                <p className="text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
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
                className={`px-4 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  rewardReady
                    ? 'bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold'
                    : 'bg-slate-100 dark:bg-[#222833] text-slate-500 dark:text-slate-400 cursor-default'
                }`}
              >
                {rewardReady ? (
                  <>
                    <Sparkles className="w-3.5 h-3.5" />
                    {claimingReward ? 'Claiming...' : `Claim Day ${nextClaimDay}`}
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
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
                      ? 'border-emerald-500/35 bg-emerald-500/8'
                      : 'border-slate-200 dark:border-[#242A35] bg-slate-50 dark:bg-[#14181F]'
                  }`}
                >
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">D{item.day}</p>
                  <p className="font-mono text-xs font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                    +{item.coins}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">
                    {claimed ? '✓' : `${item.xp}xp`}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Today's Daily Puzzle Card */}
        <div className="xl:col-span-4 bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5 flex flex-col justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Today’s Daily Puzzle
              </span>
              <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                {todayPuzzle.rating} Elo
              </span>
            </div>
            <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
              {todayPuzzle.title}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {todayPuzzle.difficulty} · {todayPuzzle.theme} · Streak: {progression?.dailyPuzzleStreak ?? 0}d
            </p>
          </div>
          <button
            type="button"
            onClick={() => (onOpenDailyPuzzle ? onOpenDailyPuzzle() : onNavigate('puzzles'))}
            className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
          >
            {dailyPuzzleDone ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                Solved Today · Review Puzzle
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

      {/* Active Ongoing Matches (Reconnect Immediately) */}
      {activeMatches.length > 0 && (
        <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Active Matches ({activeMatches.length})
            </h2>
            <span className="text-xs text-slate-500 dark:text-slate-400">Untimed · Reconnect anytime</span>
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
                  className="flex items-center justify-between gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-[#14181F] border border-slate-200 dark:border-[#2A313D]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar src={oppAvatar} name={oppName} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        vs {oppName}{' '}
                        <span className="font-mono text-xs text-slate-500 tabular-nums">({oppRating})</span>
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {m.status === 'waiting'
                          ? `Waiting in room ${m.roomCode}`
                          : isYourTurn
                          ? 'Your turn to move'
                          : 'Waiting for opponent'}
                        {' · '}
                        <span className="font-mono tabular-nums">{m.moveCount} plies</span>
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenMatch(m.matchId)}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Resume
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Quick Launch Modes Grid */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <button
          type="button"
          onClick={() => onOpenPlayTab('online')}
          className="text-left p-5 rounded-xl bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] hover:border-emerald-500/60 transition-colors group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3.5">
            <Globe className="w-5 h-5" />
          </div>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            Find an Opponent
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Auto-match online in Standard or Chess960.
          </p>
        </button>

        <button
          type="button"
          onClick={onStartPassAndPlay}
          className="text-left p-5 rounded-xl bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] hover:border-emerald-500/60 transition-colors group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-teal-500/12 text-teal-600 dark:text-teal-400 flex items-center justify-center mb-3.5">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            2 Players (Pass &amp; Play)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Play White &amp; Black on the same device.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onOpenPlayTab('friend')}
          className="text-left p-5 rounded-xl bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] hover:border-emerald-500/60 transition-colors group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3.5">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            Play with a Friend
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Challenge by username or private room code.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onOpenPlayTab('computer')}
          className="text-left p-5 rounded-xl bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] hover:border-emerald-500/60 transition-colors group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-sky-500/12 text-sky-600 dark:text-sky-400 flex items-center justify-center mb-3.5">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            Play Computer
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Face MiniMax H1 Flash or MiniMax H1 Pro.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('coach')}
          className="text-left p-5 rounded-xl bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] hover:border-emerald-500/60 transition-colors group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mb-3.5">
            <GraduationCap className="w-5 h-5" />
          </div>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            Coach &amp; Analysis
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            Guided play, Analysis Board, Openings &amp; Vision.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('puzzles')}
          className="text-left p-5 rounded-xl bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] hover:border-emerald-500/60 transition-colors group cursor-pointer"
        >
          <div className="w-10 h-10 rounded-lg bg-violet-500/12 text-violet-600 dark:text-violet-400 flex items-center justify-center mb-3.5">
            <Puzzle className="w-5 h-5" />
          </div>
          <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
            Puzzles &amp; Rush
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
            {user.puzzlesSolved} solved · Elo{' '}
            <span className="font-mono tabular-nums">{user.puzzleRating}</span>
          </p>
        </button>
      </section>

      {/* 4-Column Stat Summary Strip */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Classical Rating</p>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {user.rating}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Untimed Elo</p>
        </div>
        <div className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Games Played</p>
          <p className="font-mono text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-1">
            {user.gamesPlayed}
          </p>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums mt-1">
            {user.wins}W · {user.losses}L · {user.draws}D
          </p>
        </div>
        <div className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Win Percentage</p>
          <p className="font-mono text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
            {winRate}%
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Across all finished games</p>
        </div>
        <div className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-4">
          <p className="text-xs text-slate-500 dark:text-slate-400">Puzzles Solved</p>
          <p className="font-mono text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums mt-1">
            {user.puzzlesSolved}
          </p>
          <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums mt-1">
            {user.puzzleRating} Tactical Elo
          </p>
        </div>
      </section>

      {/* Main Content Grid: Left (Recent Games + Daily Activity) | Right (Online Friends + Leaderboard Preview) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 space-y-6">
          {/* Recent Match History */}
          <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-slate-400" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Recent Games
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('history')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer"
              >
                View all
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {completedMatches.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No completed matches yet</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
                  Your finished online, friend, private, and computer matches will appear here for full PGN replay.
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('play')}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  Start Your First Match
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-[#2A313D] text-xs text-slate-500 dark:text-slate-400">
                      <th className="py-2.5 font-medium">Opponent</th>
                      <th className="py-2.5 font-medium">Result</th>
                      <th className="py-2.5 font-medium hidden sm:table-cell">Mode</th>
                      <th className="py-2.5 font-medium text-right">Moves</th>
                      <th className="py-2.5 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#242A35] text-sm">
                    {completedMatches.slice(0, 6).map((m) => {
                      const userIsWhite = m.whiteId === user.uid;
                      const oppName = userIsWhite ? m.blackUsername : m.whiteUsername;
                      const oppRating = userIsWhite ? m.blackRating : m.whiteRating;
                      const oppAvatar = userIsWhite ? m.blackPhotoURL : m.whitePhotoURL;
                      const delta = userIsWhite ? m.whiteRatingDelta : m.blackRatingDelta;
                      const outcome = getMatchOutcomeLabel(m);

                      return (
                        <tr
                          key={m.matchId}
                          className="hover:bg-slate-50 dark:hover:bg-[#1F242E] transition-colors"
                        >
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-2.5">
                              <PlayerAvatar src={oppAvatar} name={oppName} size="xs" />
                              <div className="min-w-0">
                                <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                                  {oppName}
                                </p>
                                <p className="text-xs font-mono text-slate-500 tabular-nums">
                                  {oppRating} · {userIsWhite ? 'White' : 'Black'}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 pr-3">
                            <span className={`font-semibold ${outcome.color}`}>{outcome.text}</span>
                            <span className="block text-xs text-slate-500 dark:text-slate-400">
                              {formatResultReason(m.resultReason)}
                              {delta !== 0 && (
                                <span className="font-mono ml-1.5 tabular-nums">
                                  ({delta > 0 ? `+${delta}` : delta})
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="py-3 pr-3 hidden sm:table-cell text-xs text-slate-500 dark:text-slate-400 capitalize">
                            {m.mode}
                          </td>
                          <td className="py-3 pr-3 text-right font-mono text-xs text-slate-600 dark:text-slate-300 tabular-nums">
                            {Math.ceil(m.moveCount / 2)}
                          </td>
                          <td className="py-3 text-right">
                            <button
                              type="button"
                              onClick={() => onReplayMatch(m)}
                              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                            >
                              Replay
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

          {/* Daily Chess Activity (7-Day Real Activity) */}
          <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-slate-400" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Daily Chess Activity
                </h2>
              </div>
              <span className="text-xs text-slate-500 dark:text-slate-400">Last 7 days</span>
            </div>

            <div className="grid grid-cols-7 gap-3 items-end h-32 pt-4">
              {dailyActivity.days.map((day) => {
                const heightPct = day.count > 0 ? Math.max(18, Math.round((day.count / dailyActivity.maxCount) * 100)) : 8;
                return (
                  <div key={day.key} className="flex flex-col items-center gap-2 h-full justify-end">
                    <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {day.count > 0 ? day.count : '—'}
                    </span>
                    <div className="w-full max-w-[34px] flex-1 flex items-end">
                      <div
                        style={{ height: `${heightPct}%` }}
                        className={`w-full rounded-t-md transition-all ${
                          day.count > 0
                            ? 'bg-emerald-600 dark:bg-emerald-500'
                            : 'bg-slate-200 dark:bg-[#252B36]'
                        }`}
                        title={`${day.label}: ${day.count} games (${day.wins} wins)`}
                      />
                    </div>
                    <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
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
          {/* Online Friends */}
          <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Online Friends
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('friends')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Manage
              </button>
            </div>

            {onlineFriends.length === 0 ? (
              <div className="py-6 text-center">
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">
                  {friends.length === 0
                    ? 'Add friends by username to challenge them anytime.'
                    : 'None of your friends are online right now.'}
                </p>
                <button
                  type="button"
                  onClick={() => onNavigate('friends')}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
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
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-emerald-500">
                          {friend.username}
                        </p>
                        <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                          {friend.rating} · {friend.onlineStatus === 'in_game' ? 'In Game' : 'Online'}
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onQuickChallengeFriend(friend)}
                      className="px-2.5 py-1.5 rounded-md bg-emerald-600/12 hover:bg-emerald-600 text-emerald-700 dark:text-emerald-400 hover:text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
                    >
                      Challenge
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Leaderboard Preview */}
          <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-500" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Top Players
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigate('leaderboard')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Full board
              </button>
            </div>

            {leaderboardPreview.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                No ranked players yet.
              </p>
            ) : (
              <div className="space-y-3">
                {leaderboardPreview.slice(0, 5).map((player, idx) => (
                  <button
                    key={player.uid}
                    type="button"
                    onClick={() => onViewProfile(player.uid)}
                    className="w-full flex items-center justify-between gap-2.5 text-left hover:bg-slate-50 dark:hover:bg-[#1F242E] p-1.5 -mx-1.5 rounded-lg transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className={`w-5 text-center font-mono text-xs font-bold tabular-nums ${
                          idx === 0
                            ? 'text-amber-500'
                            : idx === 1
                            ? 'text-slate-400'
                            : idx === 2
                            ? 'text-amber-700 dark:text-amber-600'
                            : 'text-slate-500'
                        }`}
                      >
                        {idx + 1}
                      </span>
                      <PlayerAvatar src={player.photoURL} name={player.displayName} size="xs" />
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                        {player.username}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums shrink-0">
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
