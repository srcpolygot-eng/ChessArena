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
  Crown,
} from 'lucide-react';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  COMPUTER_BOTS,
  MINIMAX_H1_PRO,
  MINIMAX_H1_ULTRA,
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
import { ChessPieceSvg } from './ChessPieces';
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

const ColorPickerBoxes: React.FC<{
  value: 'white' | 'random' | 'black';
  onChange: (next: 'white' | 'black' | 'random') => void;
  label?: string;
}> = ({ value, onChange, label = 'I play as' }) => (
  <div className="flex items-center gap-3">
    <span className="text-xs font-semibold text-stone-600 dark:text-[#C3C2C0]">{label}:</span>
    <div className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => onChange('white')}
        title="Play as White"
        aria-label="Play as White"
        className={`w-11 h-11 rounded-lg flex items-center justify-center border-2 transition-all cursor-pointer ${
          value === 'white'
            ? 'border-[#81B64C] bg-[#F6F5F2] dark:bg-[#383531] ring-2 ring-[#81B64C]/35'
            : 'border-[#DFDDD8] dark:border-[#3C3A37] bg-stone-100 dark:bg-[#1F1E1B] hover:border-stone-400'
        }`}
      >
        <ChessPieceSvg type="k" color="w" className="w-7 h-7" />
      </button>
      <button
        type="button"
        onClick={() => onChange('random')}
        title="Random Color"
        aria-label="Play Random Color"
        className={`w-11 h-11 rounded-lg flex items-center justify-center border-2 transition-all cursor-pointer relative overflow-hidden ${
          value === 'random'
            ? 'border-[#81B64C] ring-2 ring-[#81B64C]/35'
            : 'border-[#DFDDD8] dark:border-[#3C3A37] hover:border-stone-400'
        }`}
      >
        <span className="absolute inset-y-0 left-0 w-1/2 bg-[#EEEED2]" />
        <span className="absolute inset-y-0 right-0 w-1/2 bg-[#4B4845]" />
        <span className="relative z-10 w-6 h-6 rounded-full bg-[#262421] text-white font-display font-extrabold text-xs flex items-center justify-center shadow">
          ?
        </span>
      </button>
      <button
        type="button"
        onClick={() => onChange('black')}
        title="Play as Black"
        aria-label="Play as Black"
        className={`w-11 h-11 rounded-lg flex items-center justify-center border-2 transition-all cursor-pointer ${
          value === 'black'
            ? 'border-[#81B64C] bg-[#F6F5F2] dark:bg-[#383531] ring-2 ring-[#81B64C]/35'
            : 'border-[#DFDDD8] dark:border-[#3C3A37] bg-stone-100 dark:bg-[#1F1E1B] hover:border-stone-400'
        }`}
      >
        <ChessPieceSvg type="k" color="b" className="w-7 h-7" />
      </button>
    </div>
  </div>
);

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

  // Play against Computer state — defaults to flagship MiniMax H1 Ultra!
  const [selectedBot, setSelectedBot] = useState<ComputerBot>(MINIMAX_H1_ULTRA);
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

  // 2 Players (Pass & Play) local state
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

  const getTitleBadgeClass = (tag?: string) => {
    if (tag === 'GM') return 'cc-title-badge cc-title-gm';
    if (tag === 'IM') return 'cc-title-badge cc-title-im';
    return 'cc-title-badge cc-title-fm';
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
            Play Chess
          </h1>
          <p className="text-sm text-stone-600 dark:text-[#9E9C98] mt-1">
            Untimed Classical &amp; Chess960 — zero clocks, deep calculation, and real-time sync.
          </p>
        </div>
      </div>

      {/* Chess.com Style Mode Tab Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-1.5 p-1.5 rounded-xl bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37]">
        {[
          { id: 'online' as const, label: 'Play Online', icon: Globe },
          { id: 'computer' as const, label: 'Play Bots', icon: Cpu, badge: 'ULTRA' },
          { id: 'pass_and_play' as const, label: '2 Players', icon: ArrowLeftRight },
          { id: 'friend' as const, label: 'Play a Friend', icon: Users },
          { id: 'private' as const, label: 'Custom Room', icon: KeyRound },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              id={`playhub-tab-${tab.id}`}
              onClick={() => {
                setActiveTab(tab.id);
                setError(null);
                setNotice(null);
              }}
              className={`flex items-center justify-center gap-2 py-2.5 px-3 rounded-lg text-xs sm:text-sm font-bold transition-colors cursor-pointer whitespace-nowrap ${
                active
                  ? 'bg-[#81B64C] text-white shadow-[0_2px_0_#537133]'
                  : 'text-stone-600 dark:text-[#C3C2C0] hover:bg-stone-100 dark:hover:bg-[#312F2C] hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{tab.label}</span>
              {tab.badge && !active && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-amber-500/20 text-amber-600 dark:text-amber-400">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Rules Variant Selector: Standard Chess vs Chess960 */}
      <div className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-stone-500 dark:text-[#9E9C98]">Variant:</span>
          <button
            type="button"
            onClick={() => setVariant('standard')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${
              variant === 'standard'
                ? 'bg-[#81B64C] text-white'
                : 'bg-stone-100 dark:bg-[#312F2C] text-stone-700 dark:text-[#C3C2C0]'
            }`}
          >
            Standard
          </button>
          <button
            type="button"
            onClick={() => setVariant('chess960')}
            className={`px-3 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
              variant === 'chess960'
                ? 'bg-[#81B64C] text-white'
                : 'bg-stone-100 dark:bg-[#312F2C] text-stone-700 dark:text-[#C3C2C0]'
            }`}
          >
            <Shuffle className="w-3.5 h-3.5" />
            Chess960
          </button>
        </div>

        {variant === 'chess960' && (
          <div className="flex flex-wrap items-center gap-2.5 text-xs">
            <span className="font-mono text-stone-500 dark:text-[#9E9C98] tabular-nums">
              SP #{chess960Pos.id}:{' '}
              <strong className="text-slate-900 dark:text-white tracking-widest">
                {chess960Pos.backRank.split('').join(' ')}
              </strong>
            </span>
            <button
              type="button"
              onClick={() => setChess960Id(randomChess960Id())}
              className="px-2.5 py-1 rounded-md bg-stone-100 dark:bg-[#312F2C] hover:bg-stone-200 dark:hover:bg-[#3C3A37] text-stone-700 dark:text-white font-semibold inline-flex items-center gap-1 cursor-pointer"
            >
              <Shuffle className="w-3 h-3 text-[#81B64C]" />
              Randomize
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
        <div className="p-3.5 rounded-lg bg-[#81B64C]/15 border border-[#81B64C]/40 text-slate-800 dark:text-[#D5E8C0] text-sm flex items-start gap-2.5">
          <Check className="w-4 h-4 shrink-0 mt-0.5 text-[#81B64C]" />
          <span>{notice}</span>
        </div>
      )}

      {/* A. PLAY ONLINE */}
      {activeTab === 'online' && (
        <section className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-6 sm:p-8">
          <div className="max-w-xl mx-auto text-center">
            <div className="w-14 h-14 rounded-xl bg-[#81B64C]/15 text-[#81B64C] flex items-center justify-center mx-auto mb-4">
              <Globe className="w-7 h-7" />
            </div>
            <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-white mb-2">
              Rated Online Matchmaking
            </h2>
            <p className="text-sm text-stone-600 dark:text-[#9E9C98] leading-relaxed mb-6">
              Pair automatically with another live player in the matchmaking pool. Colors are assigned fairly and
              your Elo rating updates automatically when the match concludes.
            </p>

            <div className="flex items-center justify-center gap-4 p-4 rounded-lg bg-stone-50 dark:bg-[#1F1E1B] border border-[#DFDDD8] dark:border-[#3C3A37] mb-6">
              <PlayerAvatar src={user.photoURL} name={user.displayName} size="md" status="online" showStatusDot />
              <div className="text-left">
                <p className="text-sm font-bold text-slate-900 dark:text-white">{user.username}</p>
                <p className="text-xs font-mono text-stone-500 dark:text-[#9E9C98] tabular-nums">
                  {user.rating} Elo · Untimed Classical
                </p>
              </div>
            </div>

            {isSearchingOnline ? (
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2.5 text-sm font-bold text-[#81B64C]">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Searching for a live opponent...
                </div>
                <p className="text-xs text-stone-500 dark:text-[#9E9C98]">
                  Your board opens automatically the moment another player enters the queue.
                </p>
                <div>
                  <button
                    type="button"
                    onClick={handleCancelOnlineSearch}
                    className="px-6 py-2.5 rounded-lg btn-chess-secondary text-sm cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                id="btn-find-online-match"
                onClick={handleFindOnlineMatch}
                className="w-full sm:w-auto min-w-[240px] px-8 py-3.5 rounded-lg btn-chess-primary text-base inline-flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <Swords className="w-5 h-5" />
                Play Online
              </button>
            )}
          </div>
        </section>
      )}

      {/* B. PLAY BOTS — CHESS.COM-INSPIRED BOT CONSOLE (FLASH 2050, PRO 2350, ULTRA 2650) */}
      {activeTab === 'computer' && (
        <section className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl overflow-hidden">
          {/* Top Bot Spotlight Stage with Chess.com Speech Bubble */}
          <div className="p-6 sm:p-7 bg-stone-50 dark:bg-[#1F1E1B] border-b border-[#DFDDD8] dark:border-[#3C3A37]">
            <div className="flex flex-col md:flex-row md:items-center gap-5">
              <div className="flex items-center gap-4 shrink-0">
                <div className="relative">
                  <img
                    src={selectedBot.avatar}
                    alt={selectedBot.name}
                    className={`w-20 h-20 rounded-xl object-cover shadow-lg ring-2 ${
                      selectedBot.difficulty === 'ultra'
                        ? 'ring-amber-400'
                        : selectedBot.difficulty === 'pro'
                        ? 'ring-amber-600/70'
                        : 'ring-[#81B64C]'
                    }`}
                  />
                  {selectedBot.difficulty === 'ultra' && (
                    <span className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 font-display text-[9px] font-extrabold uppercase tracking-wider shadow">
                      NEW
                    </span>
                  )}
                </div>

                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {selectedBot.titleTag && (
                      <span className={getTitleBadgeClass(selectedBot.titleTag)}>
                        {selectedBot.titleTag}
                      </span>
                    )}
                    {selectedBot.difficulty === 'ultra' && (
                      <span className="cc-title-badge cc-title-ultra">ULTRA</span>
                    )}
                    <h2 className="font-display text-xl font-extrabold text-slate-900 dark:text-white">
                      {selectedBot.name}
                    </h2>
                    <span className="font-mono text-sm font-bold text-stone-500 dark:text-[#9E9C98] tabular-nums">
                      ({selectedBot.rating})
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-[#81B64C] mt-1">
                    {selectedBot.styleLabel || selectedBot.badge} · Depth {selectedBot.depth} · ~
                    {selectedBot.timeBudgetMs}ms/move
                  </p>
                  <p className="text-xs text-stone-500 dark:text-[#9E9C98] mt-1 max-w-md leading-relaxed">
                    {selectedBot.tagline}
                  </p>
                </div>
              </div>

              {/* Chess.com Speech Bubble */}
              <div className="md:ml-auto max-w-sm w-full">
                <div className="cc-speech-bubble px-4 py-3 text-xs sm:text-[13px] font-medium leading-relaxed">
                  “{selectedBot.greeting || selectedBot.tagline}”
                </div>
              </div>
            </div>
          </div>

          {/* 3-Column H1 Engine Roster */}
          <div className="p-6 space-y-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-xs font-extrabold uppercase tracking-wider text-stone-500 dark:text-[#9E9C98]">
                  MiniMax H1 Engine Lineup ({COMPUTER_BOTS.length} Bots)
                </h3>
                <span className="text-xs font-mono text-stone-500 dark:text-[#9E9C98]">
                  Runs in Web Worker · 60fps UI
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                {COMPUTER_BOTS.map((bot) => {
                  const active = selectedBot.id === bot.id;
                  const isUltra = bot.difficulty === 'ultra';
                  const isPro = bot.id === MINIMAX_H1_PRO.id;

                  return (
                    <button
                      key={bot.id}
                      type="button"
                      id={`select-bot-${bot.difficulty}`}
                      onClick={() => setSelectedBot(bot)}
                      className={`relative text-left p-4 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                        active
                          ? isUltra
                            ? 'border-amber-400 bg-amber-500/8 dark:bg-[#312D25] shadow-md'
                            : 'border-[#81B64C] bg-[#81B64C]/8 dark:bg-[#2F3329] shadow-md'
                          : 'border-[#DFDDD8] dark:border-[#3C3A37] bg-stone-50/70 dark:bg-[#1F1E1B] hover:border-stone-400 dark:hover:border-[#57534E]'
                      }`}
                    >
                      <div className="space-y-2.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={bot.avatar}
                            alt={bot.name}
                            className="w-12 h-12 rounded-lg object-cover shrink-0 ring-1 ring-black/20"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              {bot.titleTag && (
                                <span className={getTitleBadgeClass(bot.titleTag)}>
                                  {bot.titleTag}
                                </span>
                              )}
                              <span className="font-display text-sm font-extrabold text-slate-900 dark:text-white truncate">
                                {bot.name}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                                {bot.rating} Elo
                              </span>
                              <span className="text-[11px] text-stone-400">·</span>
                              <span className="font-mono text-[11px] text-stone-500 dark:text-[#9E9C98]">
                                Depth {bot.depth}
                              </span>
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-stone-600 dark:text-[#C3C2C0] leading-relaxed line-clamp-3">
                          {bot.tagline}
                        </p>
                      </div>

                      <div className="pt-2 border-t border-stone-200/70 dark:border-[#353330] flex items-center justify-between text-[11px] font-bold">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            isUltra
                              ? 'text-amber-600 dark:text-amber-400'
                              : isPro
                              ? 'text-sky-600 dark:text-sky-400'
                              : 'text-[#81B64C]'
                          }`}
                        >
                          {isUltra ? (
                            <Crown className="w-3.5 h-3.5" />
                          ) : isPro ? (
                            <Sparkles className="w-3.5 h-3.5" />
                          ) : (
                            <Zap className="w-3.5 h-3.5" />
                          )}
                          {bot.badge || 'H1 Engine'}
                        </span>
                        {active && (
                          <span className="text-[#81B64C] font-extrabold">Selected ✓</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Chess.com Color Picker + 3D Green Choose/Play CTA */}
            <div className="p-4 rounded-xl bg-stone-50 dark:bg-[#1F1E1B] border border-[#DFDDD8] dark:border-[#3C3A37] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <ColorPickerBoxes value={botColor} onChange={setBotColor} label="Play as" />

              <button
                type="button"
                id="btn-start-bot-match"
                disabled={startingBot}
                onClick={handleStartComputerMatch}
                className="w-full sm:w-auto min-w-[230px] px-7 py-3.5 rounded-lg btn-chess-primary text-sm sm:text-base inline-flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
              >
                {startingBot
                  ? 'Launching Arena...'
                  : `Choose ${selectedBot.name}${variant === 'chess960' ? ' (960)' : ''}`}
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            {/* Upcoming H1 Models (only shown if any remain unreleased) */}
            {UPCOMING_H1_MODELS.length > 0 && (
              <div className="pt-4 border-t border-[#DFDDD8] dark:border-[#3C3A37] space-y-3">
                <p className="text-xs font-bold text-stone-500 dark:text-[#9E9C98] uppercase tracking-wider">
                  Next H1 Release
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {UPCOMING_H1_MODELS.map((model) => (
                    <div
                      key={model.id}
                      aria-disabled="true"
                      className="p-4 rounded-xl border border-dashed border-[#DFDDD8] dark:border-[#3C3A37] bg-stone-50/70 dark:bg-[#1F1E1B]/70 opacity-70 select-none"
                    >
                      <div className="flex items-center justify-between gap-3 mb-1.5">
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar src={model.avatar} name={model.name} size="sm" />
                          <div className="min-w-0">
                            <p className="font-display font-bold text-sm text-slate-800 dark:text-slate-200 truncate">
                              {model.name}
                            </p>
                            <p className="text-[11px] text-stone-500 dark:text-[#9E9C98]">{model.tier}</p>
                          </div>
                        </div>
                        <Lock className="w-4 h-4 text-stone-400 shrink-0" />
                      </div>
                      <p className="text-xs text-stone-500 dark:text-[#9E9C98] leading-relaxed">{model.tagline}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Upcoming Next-Generation H2 & G2 Models */}
            <div className="pt-4 border-t border-[#DFDDD8] dark:border-[#3C3A37] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-stone-500 dark:text-[#9E9C98] uppercase tracking-wider">
                  Upcoming H2 &amp; G2 Generation Roadmap
                </p>
                <span className="text-[11px] text-stone-400 dark:text-[#9E9C98]">In development</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {UPCOMING_H2_MODELS.map((model) => (
                  <div
                    key={model.id}
                    aria-disabled="true"
                    className="p-3.5 rounded-xl border border-dashed border-[#DFDDD8] dark:border-[#3C3A37] bg-stone-50/60 dark:bg-[#1F1E1B]/60 opacity-65 select-none"
                  >
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerAvatar src={model.avatar} name={model.name} size="xs" />
                        <div className="min-w-0">
                          <p className="font-display font-bold text-xs text-slate-800 dark:text-slate-200 truncate">
                            {model.name}
                          </p>
                          <p className="text-[10px] text-stone-500 dark:text-[#9E9C98] truncate">{model.tier}</p>
                        </div>
                      </div>
                      <Lock className="w-3.5 h-3.5 text-stone-400 shrink-0" />
                    </div>
                    <p className="text-[11px] text-stone-500 dark:text-[#9E9C98] leading-relaxed">{model.tagline}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* C. PLAY WITH A FRIEND */}
      {activeTab === 'friend' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-6 space-y-5">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Challenge a Friend or Player
              </h2>
              <p className="text-xs text-stone-500 dark:text-[#9E9C98] mt-1">
                Pick your preferred color and send an instant real-time match invitation.
              </p>
            </div>

            <ColorPickerBoxes value={inviteColor} onChange={setInviteColor} label="Play as" />

            {/* Search by username */}
            <form onSubmit={handleSearchPlayers} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-stone-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={friendSearch}
                  onChange={(e) => setFriendSearch(e.target.value)}
                  placeholder="Search player by username..."
                  className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-stone-50 dark:bg-[#1F1E1B] border border-[#DFDDD8] dark:border-[#3C3A37] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-[#81B64C]/45"
                />
              </div>
              <button
                type="submit"
                disabled={searchingUsers}
                className="px-4 py-2 rounded-lg btn-chess-secondary text-xs cursor-pointer"
              >
                {searchingUsers ? 'Searching...' : 'Search'}
              </button>
            </form>

            {/* Search Results */}
            {searchResults.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#DFDDD8] dark:border-[#3C3A37]">
                <p className="text-xs font-semibold text-stone-500 dark:text-[#9E9C98]">Search Results</p>
                {searchResults.map((p) => (
                  <div
                    key={p.uid}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-stone-50 dark:bg-[#1F1E1B]"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar src={p.photoURL} name={p.displayName} size="sm" status={p.onlineStatus} showStatusDot />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.username}</p>
                        <p className="text-xs font-mono text-stone-500 tabular-nums">{p.rating} Elo</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={sendingInviteTo === p.uid}
                      onClick={() => handleSendFriendChallenge(p)}
                      className="px-3.5 py-1.5 rounded-lg btn-chess-primary text-xs cursor-pointer shrink-0"
                    >
                      {sendingInviteTo === p.uid ? 'Inviting...' : 'Invite'}
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Friends Quick Challenge List */}
            <div className="space-y-2 pt-2 border-t border-[#DFDDD8] dark:border-[#3C3A37]">
              <p className="text-xs font-semibold text-stone-500 dark:text-[#9E9C98]">
                Your Friends ({friends.length})
              </p>
              {friends.length === 0 ? (
                <p className="text-xs text-stone-500 dark:text-[#9E9C98] py-3">
                  No friends added yet. Search by username above or visit the Social tab to connect.
                </p>
              ) : (
                <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                  {friends.map((friend) => (
                    <div
                      key={friend.uid}
                      className="flex items-center justify-between gap-3 p-2.5 rounded-lg hover:bg-stone-50 dark:hover:bg-[#312F2C] transition-colors"
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
                          <p className="text-xs font-mono text-stone-500 tabular-nums">
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
                        className="px-3.5 py-1.5 rounded-lg btn-chess-primary text-xs cursor-pointer shrink-0"
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
          <section className="lg:col-span-5 bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-6 space-y-5">
            <div>
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Incoming Invitations ({incomingInvitations.length})
              </h3>
              {incomingInvitations.length === 0 ? (
                <p className="text-xs text-stone-500 dark:text-[#9E9C98] mt-2">
                  No incoming match invitations right now.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {incomingInvitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="p-3 rounded-lg bg-stone-50 dark:bg-[#1F1E1B] border border-[#DFDDD8] dark:border-[#3C3A37] space-y-2.5"
                    >
                      <div className="flex items-center gap-2.5">
                        <PlayerAvatar src={inv.senderPhotoURL} name={inv.senderDisplayName} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {inv.senderUsername}
                          </p>
                          <p className="text-xs font-mono text-stone-500 tabular-nums">
                            {inv.senderRating} Elo · Untimed
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => onAcceptInvitation(inv)}
                          className="flex-1 py-1.5 rounded-md btn-chess-primary text-xs cursor-pointer"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => onRejectInvitation(inv.id)}
                          className="flex-1 py-1.5 rounded-md btn-chess-secondary text-xs cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-[#DFDDD8] dark:border-[#3C3A37]">
              <h3 className="font-display text-base font-bold text-slate-900 dark:text-white">
                Sent Invitations ({outgoingInvitations.length})
              </h3>
              {outgoingInvitations.length === 0 ? (
                <p className="text-xs text-stone-500 dark:text-[#9E9C98] mt-2">
                  No outgoing invitations waiting for a reply.
                </p>
              ) : (
                <div className="mt-3 space-y-2.5">
                  {outgoingInvitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex items-center justify-between gap-2 p-3 rounded-lg bg-stone-50 dark:bg-[#1F1E1B] border border-[#DFDDD8] dark:border-[#3C3A37]"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          @{inv.receiverUsername}
                        </p>
                        <p className="text-xs text-stone-500 dark:text-[#9E9C98]">Waiting for acceptance...</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => void cancelMatchInvitation(inv.id)}
                        className="p-1.5 rounded-md text-stone-400 hover:text-red-500 hover:bg-stone-200 dark:hover:bg-[#312F2C] cursor-pointer"
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

      {/* D. PASS & PLAY — 2 PLAYERS */}
      {activeTab === 'pass_and_play' && (
        <section className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-[#81B64C]/15 text-[#81B64C] flex items-center justify-center shrink-0">
                <ArrowLeftRight className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-display text-xl font-bold text-slate-900 dark:text-white">
                  2 Players — Pass &amp; Play
                </h2>
                <p className="text-sm text-stone-500 dark:text-[#9E9C98] mt-1 max-w-xl">
                  Play White and Black side-by-side on the same device with instant local moves, Takeback,
                  live Evaluation Bar, and post-game Coach Review.
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-semibold text-stone-600 dark:text-[#C3C2C0] mb-1.5">
                White Player Name <span className="text-stone-400">(optional)</span>
              </label>
              <input
                type="text"
                maxLength={28}
                value={pnpWhiteLabel}
                onChange={(e) => setPnpWhiteLabel(e.target.value)}
                placeholder="White"
                className="w-full px-3.5 py-2.5 rounded-lg bg-stone-50 dark:bg-[#1F1E1B] border border-[#DFDDD8] dark:border-[#3C3A37] text-sm text-slate-900 dark:text-white placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#81B64C]/45"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-600 dark:text-[#C3C2C0] mb-1.5">
                Black Player Name <span className="text-stone-400">(optional)</span>
              </label>
              <input
                type="text"
                maxLength={28}
                value={pnpBlackLabel}
                onChange={(e) => setPnpBlackLabel(e.target.value)}
                placeholder="Black"
                className="w-full px-3.5 py-2.5 rounded-lg bg-stone-50 dark:bg-[#1F1E1B] border border-[#DFDDD8] dark:border-[#3C3A37] text-sm text-slate-900 dark:text-white placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#81B64C]/45"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={() => setPnpAutoFlip((v) => !v)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 border transition-colors cursor-pointer ${
                pnpAutoFlip
                  ? 'bg-[#81B64C]/15 border-[#81B64C]/50 text-slate-900 dark:text-white'
                  : 'bg-stone-50 dark:bg-[#1F1E1B] border-[#DFDDD8] dark:border-[#3C3A37] text-stone-600 dark:text-[#9E9C98]'
              }`}
            >
              <ArrowLeftRight className="w-3.5 h-3.5 text-[#81B64C]" />
              Auto-Flip Board: {pnpAutoFlip ? 'On' : 'Off'}
            </button>

            <button
              type="button"
              onClick={() => setPnpShowEvalBar((v) => !v)}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 border transition-colors cursor-pointer ${
                pnpShowEvalBar
                  ? 'bg-[#81B64C]/15 border-[#81B64C]/50 text-slate-900 dark:text-white'
                  : 'bg-stone-50 dark:bg-[#1F1E1B] border-[#DFDDD8] dark:border-[#3C3A37] text-stone-600 dark:text-[#9E9C98]'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-[#81B64C]" />
              Eval Bar: {pnpShowEvalBar ? 'On' : 'Off'}
            </button>
          </div>

          <div className="pt-3 flex flex-wrap items-center justify-between gap-4 border-t border-[#DFDDD8] dark:border-[#3C3A37]">
            <p className="text-xs text-stone-500 dark:text-[#9E9C98]">
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
              className="px-7 py-3 rounded-lg btn-chess-primary text-sm inline-flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Swords className="w-4 h-4" />
              Play 2 Players{variant === 'chess960' ? ' (960)' : ''}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>
      )}

      {/* E. CREATE / JOIN PRIVATE MATCH */}
      {activeTab === 'private' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-6 flex flex-col justify-between space-y-5">
            <div className="space-y-4">
              <div>
                <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                  Create Private Room
                </h2>
                <p className="text-xs text-stone-500 dark:text-[#9E9C98] mt-1">
                  Generate a 6-character room code and invite link for any player to join.
                </p>
              </div>

              <ColorPickerBoxes value={privateColor} onChange={setPrivateColor} label="Host plays" />

              {createdRoom && (
                <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#1F1E1B] border border-[#DFDDD8] dark:border-[#3C3A37] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-stone-500">Room Code</span>
                    <span className="font-mono text-lg font-bold tracking-widest text-[#81B64C]">
                      {createdRoom.roomCode}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => void copyText(createdRoom.roomCode, 'code')}
                      className="flex-1 py-1.5 px-3 rounded-md btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5 text-[#81B64C]" /> : <Copy className="w-3.5 h-3.5" />}
                      Copy Code
                    </button>
                    <button
                      type="button"
                      onClick={() => void copyText(inviteUrl, 'link')}
                      className="flex-1 py-1.5 px-3 rounded-md btn-chess-secondary text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      {copiedLink ? <Check className="w-3.5 h-3.5 text-[#81B64C]" /> : <Copy className="w-3.5 h-3.5" />}
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
              className="w-full py-3 px-4 rounded-lg btn-chess-primary text-sm inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              {creatingRoom ? 'Creating Room...' : 'Create Private Match'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </section>

          <section className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-6 flex flex-col justify-between space-y-5">
            <div>
              <h2 className="font-display text-lg font-bold text-slate-900 dark:text-white">
                Join with Room Code
              </h2>
              <p className="text-xs text-stone-500 dark:text-[#9E9C98] mt-1">
                Enter the 6-character room code shared by your friend to join immediately.
              </p>
            </div>

            <form onSubmit={handleJoinPrivateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-600 dark:text-[#C3C2C0] mb-1.5">
                  Room code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="K7M9XP"
                  className="w-full px-4 py-3 rounded-lg bg-stone-50 dark:bg-[#1F1E1B] border border-[#DFDDD8] dark:border-[#3C3A37] font-mono text-lg font-bold tracking-widest text-center text-slate-900 dark:text-white uppercase focus:outline-none focus:ring-2 focus:ring-[#81B64C]/45"
                />
              </div>

              <button
                type="submit"
                disabled={joiningRoom || joinCode.trim().length !== 6}
                className="w-full py-3 px-4 rounded-lg btn-chess-secondary text-sm inline-flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
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
