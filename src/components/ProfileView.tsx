import React, { useEffect, useState } from 'react';
import {
  Edit3,
  Check,
  X,
  Calendar,
  Swords,
  UserPlus,
  AlertCircle,
  ArrowLeft,
  History,
  Award,
  Flame,
  Coins,
  CheckCircle2,
} from 'lucide-react';
import {
  fetchPlayerCompletedMatches,
  fetchPublicProfile,
  isUsernameAvailable,
  sendFriendRequest,
  updateUserProfile,
  validateUsernameFormat,
} from '../lib/firestoreService';
import { formatResultReason } from '../lib/chessEngine';
import { computePlayerAchievements, getPlayerLevel } from '../lib/rewardsAndStreaks';
import {
  PRESET_AVATARS,
  type ChessMatch,
  type PublicProfile,
  type UserPrivateProfile,
  type UserProgression,
} from '../types/chess';
import { PlayerAvatar } from './PlayerAvatar';

interface ProfileViewProps {
  currentUser: UserPrivateProfile;
  progression?: UserProgression | null;
  viewingUid: string;
  myCompletedMatches: ChessMatch[];
  isFriend: boolean;
  onBackToMyProfile: () => void;
  onReplayMatch: (match: ChessMatch) => void;
  onChallengePlayer: (player: PublicProfile) => void;
  onOpenSettings: () => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  progression = null,
  viewingUid,
  myCompletedMatches,
  isFriend,
  onBackToMyProfile,
  onReplayMatch,
  onChallengePlayer,
  onOpenSettings,
}) => {
  const isOwnProfile = viewingUid === currentUser.uid;
  const [otherProfile, setOtherProfile] = useState<PublicProfile | null>(null);
  const [otherMatches, setOtherMatches] = useState<ChessMatch[]>([]);
  const [loadingOther, setLoadingOther] = useState(false);

  // Edit mode state (own profile only)
  const [editing, setEditing] = useState(false);
  const [editDisplayName, setEditDisplayName] = useState(currentUser.displayName);
  const [editUsername, setEditUsername] = useState(currentUser.username);
  const [editPhotoURL, setEditPhotoURL] = useState(currentUser.photoURL);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameHint, setUsernameHint] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [sendingFriendReq, setSendingFriendReq] = useState(false);

  useEffect(() => {
    setEditing(false);
    setError(null);
    setNotice(null);
    if (isOwnProfile) {
      setOtherProfile(null);
      setEditDisplayName(currentUser.displayName);
      setEditUsername(currentUser.username);
      setEditPhotoURL(currentUser.photoURL);
      return;
    }

    let cancelled = false;
    setLoadingOther(true);
    Promise.all([fetchPublicProfile(viewingUid), fetchPlayerCompletedMatches(viewingUid)])
      .then(([prof, hist]) => {
        if (cancelled) return;
        setOtherProfile(prof);
        setOtherMatches(hist);
      })
      .finally(() => {
        if (!cancelled) setLoadingOther(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewingUid, isOwnProfile, currentUser.displayName, currentUser.username, currentUser.photoURL]);

  const profile: PublicProfile | UserPrivateProfile | null = isOwnProfile ? currentUser : otherProfile;
  const matches = isOwnProfile ? myCompletedMatches : otherMatches;

  const handleUsernameChange = async (value: string) => {
    setEditUsername(value);
    const trimmed = value.trim();
    if (trimmed.toLowerCase() === currentUser.usernameLower) {
      setUsernameStatus('available');
      setUsernameHint('Current username');
      return;
    }
    const formatErr = validateUsernameFormat(trimmed);
    if (formatErr) {
      setUsernameStatus('invalid');
      setUsernameHint(formatErr);
      return;
    }
    setUsernameStatus('checking');
    setUsernameHint('Checking availability...');
    try {
      const available = await isUsernameAvailable(trimmed);
      setUsernameStatus(available ? 'available' : 'taken');
      setUsernameHint(available ? 'Available' : 'Username is already taken');
    } catch {
      setUsernameStatus('idle');
      setUsernameHint(null);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setSaving(true);
    try {
      await updateUserProfile({
        uid: currentUser.uid,
        currentUsernameLower: currentUser.usernameLower,
        newUsername: editUsername,
        displayName: editDisplayName,
        photoURL: editPhotoURL,
      });
      setEditing(false);
      setNotice('Profile updated successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save profile.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFriend = async () => {
    if (!otherProfile) return;
    setSendingFriendReq(true);
    setError(null);
    setNotice(null);
    try {
      await sendFriendRequest(currentUser, otherProfile);
      setNotice(`Friend request sent to @${otherProfile.username}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send friend request.');
    } finally {
      setSendingFriendReq(false);
    }
  };

  if (loadingOther) {
    return (
      <div className="max-w-5xl mx-auto py-12 space-y-4">
        <div className="h-36 rounded-xl bg-white dark:bg-[#1A1E26] animate-pulse" />
        <div className="h-48 rounded-xl bg-white dark:bg-[#1A1E26] animate-pulse" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="max-w-md mx-auto my-12 bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 text-center">
        <p className="text-sm font-semibold text-slate-900 dark:text-white mb-3">Player profile not found.</p>
        <button
          type="button"
          onClick={onBackToMyProfile}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
        >
          View My Profile
        </button>
      </div>
    );
  }

  const winRate =
    profile.gamesPlayed > 0 ? Math.round((profile.wins / profile.gamesPlayed) * 100) : 0;
  const joinedDate = profile.createdAt?.toDate().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      {!isOwnProfile && (
        <button
          type="button"
          onClick={onBackToMyProfile}
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to My Profile
        </button>
      )}

      {error && (
        <div className="p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-sm flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {notice && (
        <div className="p-3.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-300 text-sm flex items-start gap-2.5">
          <Check className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{notice}</span>
        </div>
      )}

      {/* Profile Header Card */}
      <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <PlayerAvatar
              src={profile.photoURL}
              name={profile.displayName}
              size="xl"
              status={profile.onlineStatus}
              showStatusDot
            />
            <div>
              <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
                {profile.displayName}
              </h1>
              <p className="font-mono text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                @{profile.username}
              </p>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-2">
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Joined {joinedDate || 'Recently'}
                </span>
                <span aria-hidden="true">·</span>
                <span className="capitalize">
                  {profile.onlineStatus === 'in_game' ? 'In Game' : profile.onlineStatus}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {isOwnProfile ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditing((v) => !v)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  {editing ? 'Close Editor' : 'Edit Profile'}
                </button>
                <button
                  type="button"
                  onClick={onOpenSettings}
                  className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
                >
                  Preferences
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => otherProfile && onChallengePlayer(otherProfile)}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Swords className="w-3.5 h-3.5" />
                  Challenge to Match
                </button>
                {!isFriend && (
                  <button
                    type="button"
                    disabled={sendingFriendReq}
                    onClick={handleAddFriend}
                    className="px-4 py-2 rounded-lg bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-800 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {sendingFriendReq ? 'Sending...' : 'Add Friend'}
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Inline Profile Editor */}
        {isOwnProfile && editing && (
          <form
            onSubmit={handleSaveProfile}
            className="mt-6 pt-6 border-t border-slate-200 dark:border-[#2A313D] grid grid-cols-1 md:grid-cols-2 gap-5"
          >
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Display Name
              </label>
              <input
                type="text"
                required
                maxLength={40}
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#12151A] border border-slate-200 dark:border-[#2A313D] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Unique Username
              </label>
              <input
                type="text"
                required
                maxLength={24}
                value={editUsername}
                onChange={(e) => void handleUsernameChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#12151A] border border-slate-200 dark:border-[#2A313D] font-mono text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              {usernameHint && (
                <p
                  className={`text-xs mt-1 ${
                    usernameStatus === 'available'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : usernameStatus === 'checking'
                      ? 'text-slate-400'
                      : 'text-red-500'
                  }`}
                >
                  {usernameHint}
                </p>
              )}
            </div>

            <div className="md:col-span-2 space-y-3">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                Profile Picture URL or Preset
              </label>
              <input
                type="text"
                maxLength={500}
                value={editPhotoURL}
                onChange={(e) => setEditPhotoURL(e.target.value)}
                placeholder="https://... or select a preset below"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#12151A] border border-slate-200 dark:border-[#2A313D] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
              <div className="flex items-center gap-2.5 flex-wrap">
                {PRESET_AVATARS.map((url, idx) => (
                  <button
                    key={url}
                    type="button"
                    onClick={() => setEditPhotoURL(url)}
                    className={`rounded-lg p-0.5 ring-2 transition-all cursor-pointer ${
                      editPhotoURL === url ? 'ring-emerald-500' : 'ring-transparent hover:ring-slate-400'
                    }`}
                  >
                    <PlayerAvatar src={url} name={`Avatar ${idx + 1}`} size="sm" />
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setEditPhotoURL('')}
                  className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 px-2 py-1 cursor-pointer"
                >
                  Use Initials
                </button>
              </div>
            </div>

            <div className="md:col-span-2 flex items-center gap-2.5">
              <button
                type="submit"
                disabled={saving || usernameStatus === 'taken' || usernameStatus === 'invalid'}
                className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                <Check className="w-4 h-4" />
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-4 py-2.5 rounded-lg bg-slate-100 dark:bg-[#222833] text-slate-700 dark:text-slate-300 text-xs font-medium inline-flex items-center gap-1.5 cursor-pointer"
              >
                <X className="w-4 h-4" />
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>

      {/* Statistics Grid */}
      <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
        {[
          { label: 'Rating', value: profile.rating, accent: 'text-amber-600 dark:text-amber-400' },
          { label: 'Games', value: profile.gamesPlayed, accent: 'text-slate-900 dark:text-white' },
          { label: 'Wins', value: profile.wins, accent: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'Losses', value: profile.losses, accent: 'text-red-600 dark:text-red-400' },
          { label: 'Draws', value: profile.draws, accent: 'text-slate-700 dark:text-slate-300' },
          { label: 'Win Rate', value: `${winRate}%`, accent: 'text-slate-900 dark:text-white' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-4"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">{stat.label}</p>
            <p className={`font-mono text-2xl font-bold tabular-nums mt-1 ${stat.accent}`}>{stat.value}</p>
          </div>
        ))}
      </section>

      {/* Streaks, Records & Achievements (Own Profile) */}
      {isOwnProfile && (() => {
        const level = getPlayerLevel(progression?.xp ?? 0);
        const achievements = computePlayerAchievements(currentUser, progression, myCompletedMatches);
        const unlockedCount = achievements.filter((a) => a.unlocked).length;
        return (
          <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
                  Progress &amp; Achievements ({unlockedCount}/{achievements.length})
                </h2>
              </div>
              <div className="flex flex-wrap items-center gap-3 text-xs font-mono tabular-nums text-slate-600 dark:text-slate-300">
                <span>Lv.{level.level} {level.title}</span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                  <Flame className="w-3.5 h-3.5" /> {progression?.currentStreak ?? 0}d streak
                </span>
                <span>·</span>
                <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                  <Coins className="w-3.5 h-3.5" /> {progression?.coins ?? 0}
                </span>
                <span>·</span>
                <span>Rush Best: {progression?.puzzleRushBest ?? 0}</span>
                <span>·</span>
                <span>Vision Best: {progression?.visionBest ?? 0}</span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {achievements.map((ach) => (
                <div
                  key={ach.id}
                  className={`p-3.5 rounded-xl border space-y-1.5 ${
                    ach.unlocked
                      ? 'border-emerald-500/40 bg-emerald-500/8'
                      : 'border-slate-200 dark:border-[#242A35] bg-slate-50/70 dark:bg-[#14181F] opacity-75'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-bold text-slate-900 dark:text-white">{ach.title}</p>
                    {ach.unlocked ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <span className="font-mono text-[10px] text-slate-500 tabular-nums">{ach.progressLabel}</span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    {ach.description}
                  </p>
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* Recent Match History */}
      <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-4">
          <History className="w-4 h-4 text-slate-400" />
          <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
            Recent Match History
          </h2>
        </div>

        {matches.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
            No completed matches recorded yet.
          </p>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-[#242A35]">
            {matches.slice(0, 10).map((m) => {
              const targetIsWhite = m.whiteId === profile.uid;
              const oppName = targetIsWhite ? m.blackUsername : m.whiteUsername;
              const oppRating = targetIsWhite ? m.blackRating : m.whiteRating;
              const isWin = m.winnerId === profile.uid;
              const isDraw = m.result === '1/2-1/2';

              return (
                <div key={m.matchId} className="py-3 flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white truncate">
                      vs {oppName}{' '}
                      <span className="font-mono text-xs text-slate-500 tabular-nums">({oppRating})</span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      <span
                        className={
                          isDraw
                            ? 'text-amber-600 dark:text-amber-400 font-semibold'
                            : isWin
                            ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                            : 'text-red-600 dark:text-red-400 font-semibold'
                        }
                      >
                        {isDraw ? 'Draw' : isWin ? 'Win' : 'Loss'}
                      </span>
                      {' · '}
                      {formatResultReason(m.resultReason)}
                      {' · '}
                      <span className="font-mono tabular-nums">{Math.ceil(m.moveCount / 2)} moves</span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onReplayMatch(m)}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0 cursor-pointer"
                  >
                    Replay
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
