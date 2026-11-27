import React, { useState } from 'react';
import {
  Search,
  UserPlus,
  UserMinus,
  Swords,
  Check,
  X,
  AlertCircle,
  Users,
} from 'lucide-react';
import {
  acceptFriendRequest,
  cancelFriendRequest,
  rejectFriendRequest,
  removeFriend,
  searchUsersByUsername,
  sendFriendRequest,
} from '../lib/firestoreService';
import type { FriendRequest, PublicProfile, UserPrivateProfile } from '../types/chess';
import { PlayerAvatar } from './PlayerAvatar';

interface FriendsViewProps {
  user: UserPrivateProfile;
  friends: PublicProfile[];
  incomingRequests: FriendRequest[];
  outgoingRequests: FriendRequest[];
  onViewProfile: (uid: string) => void;
  onChallengeFriend: (friend: PublicProfile) => void;
}

export const FriendsView: React.FC<FriendsViewProps> = ({
  user,
  friends,
  incomingRequests,
  outgoingRequests,
  onViewProfile,
  onChallengeFriend,
}) => {
  const [tab, setTab] = useState<'friends' | 'requests' | 'find'>('friends');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState<PublicProfile[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmRemoveUid, setConfirmRemoveUid] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const friendUidSet = new Set(friends.map((f) => f.uid));
  const outgoingUidSet = new Set(outgoingRequests.map((r) => r.receiverId));
  const incomingUidSet = new Set(incomingRequests.map((r) => r.senderId));

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;
    setSearching(true);
    setHasSearched(true);
    setError(null);
    setNotice(null);
    try {
      const results = await searchUsersByUsername(searchTerm, user.uid);
      setSearchResults(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to search players.');
    } finally {
      setSearching(false);
    }
  };

  const handleSendRequest = async (target: PublicProfile) => {
    setBusyId(target.uid);
    setError(null);
    setNotice(null);
    try {
      await sendFriendRequest(user, target);
      setNotice(`Friend request sent to @${target.username}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send friend request.');
    } finally {
      setBusyId(null);
    }
  };

  const handleAccept = async (req: FriendRequest) => {
    setBusyId(req.id);
    setError(null);
    try {
      await acceptFriendRequest(req.id, req.senderId, req.receiverId);
      setNotice(`You are now friends with @${req.senderUsername}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept request.');
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (reqId: string) => {
    setBusyId(reqId);
    setError(null);
    try {
      await rejectFriendRequest(reqId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject request.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCancel = async (reqId: string) => {
    setBusyId(reqId);
    setError(null);
    try {
      await cancelFriendRequest(reqId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to cancel request.');
    } finally {
      setBusyId(null);
    }
  };

  const handleRemoveFriend = async (targetUid: string) => {
    setBusyId(targetUid);
    setError(null);
    try {
      await removeFriend(user.uid, targetUid);
      setConfirmRemoveUid(null);
      setNotice('Friend removed from your list.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove friend.');
    } finally {
      setBusyId(null);
    }
  };

  const onlineCount = friends.filter((f) => f.onlineStatus !== 'offline').length;

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Friends
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {friends.length} friends · {onlineCount} online now
          </p>
        </div>

        {/* Section Tabs */}
        <div className="flex items-center gap-1 p-1 rounded-lg bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D]">
          <button
            type="button"
            onClick={() => setTab('friends')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'friends'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Friends ({friends.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('requests')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'requests'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Requests ({incomingRequests.length + outgoingRequests.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('find')}
            className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
              tab === 'find'
                ? 'bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Find Players
          </button>
        </div>
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

      {/* FRIENDS LIST TAB */}
      {tab === 'friends' && (
        <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5">
          {friends.length === 0 ? (
            <div className="py-12 text-center">
              <Users className="w-8 h-8 text-slate-400 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">No friends yet</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-4">
                Search for any player by username to send a friend request and play untimed matches together.
              </p>
              <button
                type="button"
                onClick={() => setTab('find')}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
              >
                Find Players by Username
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-[#242A35]">
              {friends.map((friend) => (
                <div
                  key={friend.uid}
                  className="py-3.5 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3"
                >
                  <button
                    type="button"
                    onClick={() => onViewProfile(friend.uid)}
                    className="flex items-center gap-3 min-w-0 text-left group cursor-pointer"
                  >
                    <PlayerAvatar
                      src={friend.photoURL}
                      name={friend.displayName}
                      size="md"
                      status={friend.onlineStatus}
                      showStatusDot
                    />
                    <div className="min-w-0">
                      <p className="font-display font-bold text-sm text-slate-900 dark:text-white group-hover:text-emerald-500 transition-colors truncate">
                        {friend.displayName}
                      </p>
                      <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums">
                        @{friend.username} · {friend.rating} Elo ·{' '}
                        {friend.onlineStatus === 'online'
                          ? 'Online'
                          : friend.onlineStatus === 'in_game'
                          ? 'In Game'
                          : 'Offline'}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onChallengeFriend(friend)}
                      className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Swords className="w-3.5 h-3.5" />
                      Challenge
                    </button>

                    {confirmRemoveUid === friend.uid ? (
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={busyId === friend.uid}
                          onClick={() => handleRemoveFriend(friend.uid)}
                          className="px-2.5 py-2 rounded-lg bg-red-600 text-white text-xs font-semibold cursor-pointer"
                        >
                          Remove
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmRemoveUid(null)}
                          className="px-2 py-2 rounded-lg bg-slate-200 dark:bg-[#222833] text-slate-700 dark:text-slate-300 text-xs cursor-pointer"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveUid(friend.uid)}
                        title="Remove friend"
                        className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-[#222833] transition-colors cursor-pointer"
                      >
                        <UserMinus className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* FRIEND REQUESTS TAB */}
      {tab === 'requests' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Incoming Requests ({incomingRequests.length})
            </h2>
            {incomingRequests.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                No pending incoming friend requests.
              </p>
            ) : (
              <div className="space-y-3">
                {incomingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#14181F] border border-slate-200 dark:border-[#2A313D] flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onViewProfile(req.senderId)}
                      className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                    >
                      <PlayerAvatar src={req.senderPhotoURL} name={req.senderDisplayName} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {req.senderUsername}
                        </p>
                        <p className="text-xs font-mono text-slate-500 tabular-nums">{req.senderRating} Elo</p>
                      </div>
                    </button>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={() => handleAccept(req)}
                        className="px-3 py-1.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busyId === req.id}
                        onClick={() => handleReject(req.id)}
                        className="px-2.5 py-1.5 rounded-md bg-slate-200 dark:bg-[#222833] text-slate-700 dark:text-slate-300 text-xs font-medium cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-5 space-y-4">
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Sent Requests ({outgoingRequests.length})
            </h2>
            {outgoingRequests.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
                You have no outgoing pending requests.
              </p>
            ) : (
              <div className="space-y-3">
                {outgoingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-3.5 rounded-lg bg-slate-50 dark:bg-[#14181F] border border-slate-200 dark:border-[#2A313D] flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onViewProfile(req.receiverId)}
                      className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
                    >
                      <PlayerAvatar src={req.receiverPhotoURL} name={req.receiverDisplayName} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {req.receiverUsername}
                        </p>
                        <p className="text-xs font-mono text-slate-500 tabular-nums">
                          {req.receiverRating} Elo · Pending
                        </p>
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={busyId === req.id}
                      onClick={() => handleCancel(req.id)}
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-500 hover:bg-slate-200 dark:hover:bg-[#222833] cursor-pointer"
                      title="Cancel request"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* FIND PLAYERS TAB */}
      {tab === 'find' && (
        <section className="bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 space-y-5">
          <div>
            <h2 className="font-display text-base font-bold text-slate-900 dark:text-white">
              Search Players by Username
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Connect with any Chess Arena player regardless of sign-in provider.
            </p>
          </div>

          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Enter username or display name..."
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-slate-50 dark:bg-[#12151A] border border-slate-200 dark:border-[#2A313D] text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
              />
            </div>
            <button
              type="submit"
              disabled={searching}
              className="px-5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {searching ? 'Searching...' : 'Search'}
            </button>
          </form>

          {hasSearched && searchResults.length === 0 && !searching && (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-6 text-center">
              No players found matching "{searchTerm}".
            </p>
          )}

          {searchResults.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-[#242A35]">
              {searchResults.map((player) => {
                const isFriend = friendUidSet.has(player.uid);
                const isSent = outgoingUidSet.has(player.uid);
                const isIncoming = incomingUidSet.has(player.uid);

                return (
                  <div
                    key={player.uid}
                    className="py-3.5 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onViewProfile(player.uid)}
                      className="flex items-center gap-3 min-w-0 text-left cursor-pointer group"
                    >
                      <PlayerAvatar
                        src={player.photoURL}
                        name={player.displayName}
                        size="sm"
                        status={player.onlineStatus}
                        showStatusDot
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white group-hover:text-emerald-500 truncate">
                          {player.displayName}
                        </p>
                        <p className="text-xs font-mono text-slate-500 tabular-nums">
                          @{player.username} · {player.rating} Elo · {player.gamesPlayed} games
                        </p>
                      </div>
                    </button>

                    <div className="shrink-0">
                      {isFriend ? (
                        <button
                          type="button"
                          onClick={() => onChallengeFriend(player)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600/12 text-emerald-700 dark:text-emerald-400 text-xs font-semibold cursor-pointer"
                        >
                          Friends · Challenge
                        </button>
                      ) : isSent ? (
                        <span className="text-xs font-medium text-slate-500">Request Sent</span>
                      ) : isIncoming ? (
                        <button
                          type="button"
                          onClick={() => setTab('requests')}
                          className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-pointer"
                        >
                          Respond in Requests
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busyId === player.uid}
                          onClick={() => handleSendRequest(player)}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          {busyId === player.uid ? 'Sending...' : 'Add Friend'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
