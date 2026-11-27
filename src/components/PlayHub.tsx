import React, { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import {
  Globe,
  Users,
  Cpu,
  KeyRound,
  Search,
  Copy,
  Check,
  Loader2,
  Swords,
  X,
  ArrowRight,
  AlertCircle,
  Zap,
  Lock,
  ArrowLeftRight,
  BarChart3,
  Shuffle,
  Sparkles,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  COMPUTER_BOTS,
  MINIMAX_H1_FLASH,
  MINIMAX_H1_PRO,
  UPCOMING_H1_MODELS,
  UPCOMING_H2_MODELS,
} from '../lib/chessEngine';
import { getChess960Position, randomChess960Id } from '../lib/chess960';
import {
  cancelMatchInvitation,
  createComputerMatch,
  createPrivateMatch,
  enterMatchmakingQueue,
  joinPrivateMatchByCode,
  leaveMatchmakingQueue,
  searchUsersByUsername,
  sendMatchInvitation,
} from '../lib/firestoreService';
import type {
  ComputerBot,
  MatchInvitation,
  MatchVariant,
  PublicProfile,
  UserPrivateProfile,
} from '../types/chess';
import { PlayerAvatar } from './PlayerAvatar';
import type { PassAndPlayOptions } from './PassAndPlayArena';

export type PlayHubTab = 'online' | 'friend' | 'computer' | 'pass_and_play' | 'private';

interface PlayHubProps {
  user: UserPrivateProfile;
  initialTab?: PlayHubTab;
  friends: PublicProfile[];
  incomingInvitations: MatchInvitation[];
  outgoingInvitations: MatchInvitation[];
  onMatchStarted: (matchId: string) => void;
  onStartPassAndPlay: (options: PassAndPlayOptions) => void;
  onAcceptInvitation: (inv: MatchInvitation) => void;
  onRejectInvitation: (invId: string) => void;
}

export const PlayHub: React.FC<PlayHubProps> = ({
  user,
  initialTab = 'online',
  friends,
  incomingInvitations,
  outgoingInvitations,
  onMatchStarted,
  onStartPassAndPlay,
  onAcceptInvitation,
  onRejectInvitation,
}) => {
  const [activeTab, setActiveTab] = useState<PlayHubTab>(initialTab);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Online Matchmaking state
  const [isSearchingOnline, setIsSearchingOnline] = useState(false);

  // Play with Friend state
  const [friendSearch, setFriendSearch] = useState('');
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [searchingUsers, setSearchingUsers] = useState(false);
  const [inviteColor, setInviteColor] = useState<'white' | 'black' | 'random'>('random');
  const [sendingInviteTo, setSendingInviteTo] = useState<string | null>(null);

  // Variant state (Standard Chess vs Chess960)
  const [variant, setVariant] = useState<MatchVariant>('standard');
  const [chess960Id, setChess960Id] = useState<number>(() => randomChess960Id());
  const chess960Pos = getChess960Position(chess960Id);

  // Play against Computer state (MiniMax H1 Flash & MiniMax H1 Pro)
  const [selectedBot, setSelectedBot] = useState<ComputerBot>(MINIMAX_H1_PRO);
  const [botColor, setBotColor] = useState<'white' | 'black' | 'random'>('white');
  const [startingBot, setStartingBot] = useState(false);

  // Private Match state
  const [privateColor, setPrivateColor] = useState<'white' | 'black' | 'random'>('random');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createdRoom, setCreatedRoom] = useState<{ matchId: string; roomCode: string } | null>(null);
  const [joinCode, setJoinCode] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // 2 Players (Pass & Play) local state — no usernames required
  const [pnpWhiteLabel, setPnpWhiteLabel] = useState('');
  const [pnpBlackLabel, setPnpBlackLabel] = useState('');
  const [pnpAutoFlip, setPnpAutoFlip] = useState(true);
  const [pnpShowEvalBar, setPnpShowEvalBar] = useState(false);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Listen to real-time matchmakingQueue/{uid} while searching online
  useEffect(() => {
    if (!isSearchingOnline) return;
    const queueRef = doc(db, 'matchmakingQueue', user.uid);
    const unsub = onSnapshot(
      queueRef,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() as { status: string; matchId: string };
        if (data.status === 'matched' && data.matchId) {
          setIsSearchingOnline(false);
          void leaveMatchmakingQueue(user.uid);
          onMatchStarted(data.matchId);
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `matchmakingQueue/${user.uid}`, false);
      }
    );

    return () => {
      unsub();
    };
  }, [isSearchingOnline, user.uid, onMatchStarted]);

  // Cleanup queue if component unmounts while waiting
  useEffect(() => {
    return () => {
      if (isSearchingOnline) {
        void leaveMatchmakingQueue(user.uid);
      }
    };
  }, [isSearchingOnline, user.uid]);

  const handleFindOnlineMatch = async () => {
    setError(null);
    setNotice(null);
    setIsSearchingOnline(true);
    try {
      const variantOpts =
        variant === 'chess960' ? { variant: 'chess960' as const, initialFen: chess960Pos.fen } : undefined;
      const { matchedMatchId } = await enterMatchmakingQueue(user, variantOpts);
      if (matchedMatchId) {
        setIsSearchingOnline(false);
        onMatchStarted(matchedMatchId);
      }
    } catch (err) {
      setIsSearchingOnline(false);
      setError(err instanceof Error ? err.message : 'Unable to enter matchmaking queue.');
    }
  };

  const handleCancelOnlineSearch = async () => {
    setIsSearchingOnline(false);
    await leaveMatchmakingQueue(user.uid);
  };

  const handleSearchPlayers = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendSearch.trim()) {
      setSearchResults([]);
      return;
    }
    setSearchingUsers(true);
    setError(null);
    try {
      const results = await searchUsersByUsername(friendSearch, user.uid);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed.');
    } finally {
      setSearchingUsers(false);
    }
  };

  const handleSendFriendChallenge = async (target: PublicProfile) => {
    setSendingInviteTo(target.uid);
    setError(null);
    setNotice(null);
    try {
      await sendMatchInvitation(user, target, inviteColor);
      setNotice(`Match invitation sent to @${target.username}. The board will open as soon as they accept.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send match invitation.');
    } finally {
      setSendingInviteTo(null);
    }
  };

  const handleStartComputerMatch = async () => {
    setStartingBot(true);
    setError(null);
    try {
      const variantOpts =
        variant === 'chess960' ? { variant: 'chess960' as const, initialFen: chess960Pos.fen } : undefined;
      const matchId = await createComputerMatch(user, selectedBot, botColor, variantOpts);
      onMatchStarted(matchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start computer match.');
    } finally {
      setStartingBot(false);
    }
  };

  const handleCreatePrivateRoom = async () => {
    setCreatingRoom(true);
    setError(null);
    try {
      const variantOpts =
        variant === 'chess960' ? { variant: 'chess960' as const, initialFen: chess960Pos.fen } : undefined;
      const room = await createPrivateMatch(user, privateColor, variantOpts);
      setCreatedRoom(room);
      onMatchStarted(room.matchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create private match.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoinPrivateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!joinCode.trim()) return;
    setJoiningRoom(true);
    setError(null);
    try {
      const matchId = await joinPrivateMatchByCode(joinCode, user);
      onMatchStarted(matchId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to join private room.');
    } finally {
      setJoiningRoom(false);
    }
  };

  const inviteUrl = createdRoom
    ? `${window.location.origin}${window.location.pathname}?join=${createdRoom.roomCode}`
    : '';

  const copyText = async (text: string, type: 'code' | 'link') => {
    try {
      await navigator.clipboard.writeText(text);
      if (type === 'code') {
        setCopiedCode(true);
        setTimeout(() => setCopiedCode(false), 2000);
      } else {
        setCopiedLink(true);
        setTimeout(() => setCopiedLink(false), 2000);
      }
    } catch {
      // Clipboard fallback ignored
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Play Chess
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            All matches are untimed — think freely with zero clocks or time forfeits.
          </p>
        </div>
      </div>

      {/* Mode Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 p-1.5 rounded-xl bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D]">
        {[
          { id: 'online' as const, label: 'Play Online', icon: Globe },
          { id: 'pass_and_play' as const, label: '2 Players', icon: ArrowLeftRight },
          { id: 'computer' as const, label: 'Play Computer', icon: Cpu },
          { id: 'friend' as const, label: 'Play Friend', icon: Users },
          { id: 'private' as const, label: 'Private Match', icon: KeyRound },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setError(null);
                setNotice(null);
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#222833] hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Rules Variant Selector: Standard Chess vs Chess960 (Fischer Random) */}
      <div className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Rules Variant:</span>
          <button
            type="button"
            onClick={() => setVariant('standard')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              variant === 'standard'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-[#222833] text-slate-700 dark:text-slate-300'
            }`}
          >
            Standard Chess
          </button>
          <button
            type="button"
            onClick={() => setVariant('chess960')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              variant === 'chess960'
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-100 dark:bg-[#222833] text-slate-700 dark:text-slate-300'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
            Chess960 (Fischer Random)
          </button>
        </div>

        {variant === 'chess960' && (
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">
              Pos #{chess960Pos.id}:{' '}
              <strong className="text-slate-900 dark:text-white tracking-widest">
                {chess960Pos.backRank.split('').join(' ')}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setChess960Id(randomChess960Id())}
              className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-[#222833] hover:bg-slate-200 dark:hover:bg-[#2A313D] text-slate-700 dark:text-slate-200 font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Shuffle className="w-3 h-3 text-emerald-500" />
              Shuffle
            </button>
          </div>
        )}
      </div>

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

      {/* A. PLAY ONLINE */}
      {activeTab === 'online' && (
        <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 sm:p-8">
          <div className="max-w-xl mx-auto text-center">
            <div className="w-14 h-14 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-5">
              <Globe className="w-7 h-7" />
            </div>
            <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-2">
              Rated Online Matchmaking
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
              Pair automatically with another authenticated player searching online. Colors are assigned fairly and
              your Elo rating updates automatically when the match concludes.
            </p>

            <div className="flex items-center justify-center gap-4 p-4 rounded-lg bg-slate-50 dark:bg-[#12151A] border border-slate-200 dark:border-[#2A313D] mb-6">
              <PlayerAvatar src={user.photoURL} name={user.displayName} size="md" status="online" showStatusDot />
              <div className="text-left">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{user.username}</p>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                  {user.rating} Elo · Untimed Classical
                </p>
              </div>
            </div>

            {isSearchingOnline ? (
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2.5 text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching for a live opponent in the matchmaking pool...
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  The match launches immediately as soon as another player joins the queue.
                </p>
                <div>
                  <button
                    type="button"
                    onClick={handleCancelOnlineSearch}
                    className="px-5 py-2.5 rounded-lg bg-slate-200 dark:bg-[#222833] hover:bg-slate-300 dark:hover:bg-[#2A313D] text-slate-800 dark:text-slate-200 text-sm font-semibold transition-colors cursor-pointer"
                  >
                    Cancel Search
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleFindOnlineMatch}
                className="px-7 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-display font-bold text-sm inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                <Swords className="w-4 h-4" />
                Find Online Opponent
              </button>
            )}
          </div>
        </section>
      )}

      {/* B. PLAY WITH A FRIEND */}
      {activeTab === 'friend' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 space-y-5">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Challenge a Friend or Player
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Pick your preferred color and send an instant real-time match invitation.
              </p>
            </div>

            {/* Color Selection */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400 mr-1">Play as:</span>
              {(['white', 'random', 'black'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setInviteColor(c)}
                  className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors cursor-pointer ${
                    inviteColor === c
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-[#222833] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#2A313D]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            {/* Search by username */}
            <form onSubmit={handleSearchPlayers} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder="Search player by username..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-[#12151A] border border-slate-200 dark:border-[#2A313D] text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>
              <button
                type="submit"
                disabled={searchingUsers}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              >
                {searchingUsers ? 'Searching...' : 'Search'}
              </button>
            </form>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#2A313D]">
                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Search Results</p>
                {searchResults.map((p) => (
                  <div
                    key={p.uid}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-50 dark:bg-[#14181F]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar src={p.photoURL} name={p.displayName} size="sm" status={p.onlineStatus} showStatusDot />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.username}</p>
                        <p className="text-xs font-mono text-slate-500 tabular-nums">{p.rating} Elo</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={sendingInviteTo === p.uid}
                      onClick={() => handleSendFriendChallenge(p)}
                      className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                    >
                      {sendingInviteTo === p.uid ? 'Inviting...' : 'Invite'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Friends Quick Challenge List */}
            <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-[#2A313D]">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                Your Friends ({friends.length})
              </p>
              {friends.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                  No friends added yet. Search by username above or visit the Friends tab to connect.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {friends.map((friend) => (
                    <div
                      key={friend.uid}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-slate-50 dark:hover:bg-[#1F242E] transition-colors"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerAvatar
                          src={friend.photoURL}
                          name={friend.displayName}
                          size="sm"
                          status={friend.onlineStatus}
                          showStatusDot
                        />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {friend.username}
                          </p>
                          <p className="text-xs font-mono text-slate-500 tabular-nums">
                            {friend.rating} Elo ·{' '}
                            {friend.onlineStatus === 'online'
                              ? 'Online'
                              : friend.onlineStatus === 'in_game'
                              ? 'In Game'
                              : 'Offline'}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={sendingInviteTo === friend.uid}
                        onClick={() => handleSendFriendChallenge(friend)}
                        className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {sendingInviteTo === friend.uid ? 'Sending...' : 'Challenge'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Pending Incoming & Outgoing Invitations */}
          <section className="lg:col-span-5 bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 space-y-5">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Incoming Invitations ({incomingInvitations.length})
              </h3>
              {incomingInvitations.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  No incoming match invitations right now.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {incomingInvitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3 rounded-lg bg-slate-50 dark:bg-[#14181F] border border-slate-200 dark:border-[#2A313D] space-y-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar src={inv.senderPhotoURL} name={inv.senderDisplayName} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {inv.senderUsername}
                          </p>
                          <p className="text-xs font-mono text-slate-500 tabular-nums">
                            {inv.senderRating} Elo · Untimed
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onAcceptInvitation(inv)}
                          className="flex-1 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => onRejectInvitation(inv.id)}
                          className="flex-1 py-1.5 rounded-md bg-slate-200 dark:bg-[#222833] text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer"
                        >
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-[#2A313D]">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Sent Invitations ({outgoingInvitations.length})
              </h3>
              {outgoingInvitations.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">
                  No outgoing invitations waiting for a reply.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {outgoingInvitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-lg bg-slate-50 dark:bg-[#14181F] border border-slate-200 dark:border-[#2A313D]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          @{inv.receiverUsername}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">Waiting for acceptance...</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void cancelMatchInvitation(inv.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-[#222833] cursor-pointer"
                        title="Cancel invitation"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* C. PLAY AGAINST COMPUTER — MINIMAX H1 FLASH & MINIMAX H1 PRO */}
      {activeTab === 'computer' && (
        <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 space-y-6">
          <div>
            <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
              Play Against MiniMax H1 Engines
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Choose between fast tier-one MiniMax H1 Flash or the stronger MiniMax H1 Pro engine engineered to defeat H1 Flash.
            </p>
          </div>

          {/* Selectable Active Engines: MiniMax H1 Flash & MiniMax H1 Pro */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {COMPUTER_BOTS.map((bot) => {
              const active = selectedBot.id === bot.id;
              const isPro = bot.id === MINIMAX_H1_PRO.id;
              return (
                <button
                  key={bot.id}
                  type="button"
                  onClick={() => setSelectedBot(bot)}
                  className={`text-left p-5 rounded-xl border transition-all cursor-pointer ${
                    active
                      ? 'border-emerald-500 bg-emerald-500/8 ring-1 ring-emerald-500/60'
                      : 'border-slate-200 dark:border-[#2A313D] bg-slate-50/50 dark:bg-[#14181F] hover:border-slate-400'
                  }`}
                >
                  <div className="flex items-start gap-3.5">
                    <PlayerAvatar src={bot.avatar} name={bot.name} size="md" />
                    <div className="min-w-0 space-y-1.5 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                          {bot.name}
                        </h3>
                        <span
                          className={`text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap ${
                            isPro
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {isPro ? <Sparkles className="w-3 h-3" /> : <Zap className="w-3 h-3" />}
                          {isPro ? 'Pro Tier · H1' : 'Fast Tier · H1'}
                        </span>
                      </div>
                      <p className="font-mono text-xs text-amber-600 dark:text-amber-400 tabular-nums">
                        {bot.rating} Elo · Depth {bot.depth} · ~{bot.timeBudgetMs}ms
                      </p>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                        {bot.tagline}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Color Selection & Launch */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600 dark:text-slate-400 mr-1">Your color:</span>
              {(['white', 'random', 'black'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setBotColor(c)}
                  className={`px-3.5 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors cursor-pointer ${
                    botColor === c
                      ? 'bg-emerald-600 text-white'
                      : 'bg-slate-100 dark:bg-[#222833] text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#2A313D]'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>

            <button
              type="button"
              disabled={startingBot}
              onClick={handleStartComputerMatch}
              className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-display font-bold text-sm inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {startingBot
                ? 'Setting up board...'
                : `Play vs ${selectedBot.name}${variant === 'chess960' ? ' (960)' : ''}`}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {/* Upcoming H1 Model (Next Release) */}
          <div className="pt-5 border-t border-slate-200 dark:border-[#2A313D] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Next H1 Release
              </p>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">Coming next</span>
            </div>
            <div className="grid grid-cols-1 gap-3">
              {UPCOMING_H1_MODELS.map((model) => (
                <div
                  key={model.id}
                  aria-disabled="true"
                  className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-[#2A313D] bg-slate-50/70 dark:bg-[#14181F]/70 opacity-70 select-none"
                >
                  <div className="flex items-center justify-between gap-3 mb-1.5">
                    <div className="flex items-center gap-3 min-w-0">
                      <PlayerAvatar src={model.avatar} name={model.name} size="sm" />
                      <div className="min-w-0">
                        <p className="font-display font-bold text-sm text-slate-800 dark:text-slate-200 truncate">
                          {model.name}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">{model.tier}</p>
                      </div>
                    </div>
                    <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{model.tagline}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Upcoming Next-Generation H2 & G2 Models (After H1 Ultra) */}
          <div className="pt-4 border-t border-slate-200 dark:border-[#2A313D] space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                Upcoming H2 &amp; G2 Models (After H1 Ultra)
              </p>
              <span className="text-[11px] text-slate-400 dark:text-slate-500">Future roadmap</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {UPCOMING_H2_MODELS.map((model) => (
                <div
                  key={model.id}
                  aria-disabled="true"
                  className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-[#2A313D] bg-slate-50/60 dark:bg-[#14181F]/60 opacity-65 select-none"
                >
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar src={model.avatar} name={model.name} size="xs" />
                      <div className="min-w-0">
                        <p className="font-display font-bold text-xs text-slate-800 dark:text-slate-200 truncate">
                          {model.name}
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 truncate">{model.tier}</p>
                      </div>
                    </div>
                    <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{model.tagline}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* PASS & PLAY — 2 PLAYERS (SAME DEVICE, NO USERNAMES NEEDED) */}
      {activeTab === 'pass_and_play' && (
        <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  2 Players — Pass &amp; Play
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-xl">
                  Sitting next to each other? Play White and Black right on the same device with instant local moves,
                  full chess rules (Checkmate, Stalemate, Threefold, 50-Move, Insufficient Material), Takeback, and
                  post-game Coach Review — no usernames required.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                White Player Name <span className="text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                maxLength={28}
                value={pnpWhiteLabel}
                onChange={(e) => setPnpWhiteLabel(e.target.value)}
                placeholder="White"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#12151A] border border-slate-200 dark:border-[#2A313D] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Black Player Name <span className="text-slate-400">(optional)</span>
              </label>
              <input
                type="text"
                maxLength={28}
                value={pnpBlackLabel}
                onChange={(e) => setPnpBlackLabel(e.target.value)}
                placeholder="Black"
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#12151A] border border-slate-200 dark:border-[#2A313D] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setPnpAutoFlip((v) => !v)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 border transition-colors cursor-pointer ${
                pnpAutoFlip
                  ? 'bg-emerald-500/12 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-50 dark:bg-[#14181F] border-slate-200 dark:border-[#2A313D] text-slate-600 dark:text-slate-400'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5" />
              Auto-Flip Board After Each Move: {pnpAutoFlip ? 'On' : 'Off'}
            </button>

            <button
              type="button"
              onClick={() => setPnpShowEvalBar((v) => !v)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 border transition-colors cursor-pointer ${
                pnpShowEvalBar
                  ? 'bg-emerald-500/12 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                  : 'bg-slate-50 dark:bg-[#14181F] border-slate-200 dark:border-[#2A313D] text-slate-600 dark:text-slate-400'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              Live Evaluation Bar: {pnpShowEvalBar ? 'On' : 'Off'}
            </button>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-slate-200 dark:border-[#2A313D]">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Instant local play · Zero latency · Untimed Classical rules
            </p>
            <button
              type="button"
              onClick={() =>
                onStartPassAndPlay({
                  whiteLabel: pnpWhiteLabel.trim() || 'White',
                  blackLabel: pnpBlackLabel.trim() || 'Black',
                  autoFlip: pnpAutoFlip,
                  showEvalBar: pnpShowEvalBar,
                  variant,
                  initialFen: variant === 'chess960' ? chess960Pos.fen : undefined,
                  chess960Id: variant === 'chess960' ? chess960Pos.id : undefined,
                })
              }
              className="px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-display font-bold text-sm inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-colors cursor-pointer"
            >
              <Swords className="w-4 h-4" />
              Start 2 Players{variant === 'chess960' ? ' (960)' : ''} Match
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* D. CREATE / JOIN PRIVATE MATCH */}
      {activeTab === 'private' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Private Room */}
          <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Create Private Room
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Generate a unique 6-character room code and invitation link for any player to join.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-slate-600 dark:text-slate-400 mr-1">Host plays:</span>
                {(['white', 'random', 'black'] as const).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setPrivateColor(c)}
                    className={`px-3 py-1.5 rounded-md text-xs font-semibold capitalize transition-colors cursor-pointer ${
                      privateColor === c
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-100 dark:bg-[#222833] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {createdRoom && (
                <div className="p-4 rounded-lg bg-slate-50 dark:bg-[#12151A] border border-slate-200 dark:border-[#2A313D] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-500">Room Code</span>
                    <span className="font-mono text-lg font-bold tracking-widest text-emerald-600 dark:text-emerald-400">
                      {createdRoom.roomCode}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(createdRoom.roomCode, 'code')}
                      className="flex-1 py-1.5 px-3 rounded-md bg-slate-200 dark:bg-[#222833] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy Code
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText(inviteUrl, 'link')}
                      className="flex-1 py-1.5 px-3 rounded-md bg-slate-200 dark:bg-[#222833] text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy Link
                    </button>
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={creatingRoom}
              onClick={handleCreatePrivateRoom}
              className="w-full py-2.5 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-sm inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
            >
              {creatingRoom ? 'Creating Room...' : 'Create Private Match & Open Board'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </section>

          {/* Join Private Room */}
          <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 flex flex-col justify-between space-y-5">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Join with Room Code
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                Enter the 6-character code shared by your friend to join their private board immediately.
              </p>
            </div>

            <form onSubmit={handleJoinPrivateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Room code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="K7M9XP"
                  className="w-full px-4 py-3 rounded-lg bg-slate-50 dark:bg-[#12151A] border border-slate-200 dark:border-[#2A313D] font-mono text-lg font-bold tracking-widest text-center text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
                />
              </div>

              <button
                type="submit"
                disabled={joiningRoom || joinCode.trim().length !== 6}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-semibold text-sm inline-flex items-center justify-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-40 cursor-pointer"
              >
                {joiningRoom ? 'Joining room...' : 'Join Private Match'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
};
