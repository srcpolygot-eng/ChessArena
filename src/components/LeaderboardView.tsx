import React, { useEffect, useMemo, useState } from 'react';
import { Trophy, Search, ArrowUpDown, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { fetchLeaderboardProfiles } from '../lib/firestoreService';
import type { PublicProfile } from '../types/chess';
import { PlayerAvatar } from './PlayerAvatar';

interface LeaderboardViewProps {
  currentUid: string;
  onViewProfile: (uid: string) => void;
}

type SortKey = 'rating' | 'wins' | 'gamesPlayed' | 'winRate';

const PAGE_SIZE = 10;

export const LeaderboardView: React.FC<LeaderboardViewProps> = ({ currentUid, onViewProfile }) => {
  const [players, setPlayers] = useState<PublicProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('rating');
  const [sortAsc, setSortAsc] = useState(false);
  const [page, setPage] = useState(1);

  const loadPlayers = async () => {
    setLoading(true);
    try {
      const list = await fetchLeaderboardProfiles();
      setPlayers(list);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPlayers();
  }, []);

  const rankedList = useMemo(() => {
    const getWinRate = (p: PublicProfile) => (p.gamesPlayed > 0 ? p.wins / p.gamesPlayed : 0);

    const sorted = [...players].sort((a, b) => {
      let diff = 0;
      if (sortBy === 'rating') diff = b.rating - a.rating;
      else if (sortBy === 'wins') diff = b.wins - a.wins;
      else if (sortBy === 'gamesPlayed') diff = b.gamesPlayed - a.gamesPlayed;
      else diff = getWinRate(b) - getWinRate(a);

      if (diff === 0) diff = b.rating - a.rating;
      return sortAsc ? -diff : diff;
    });

    const clean = search.trim().toLowerCase();
    return sorted
      .map((p, index) => ({ ...p, rank: index + 1 }))
      .filter(
        (p) =>
          !clean ||
          p.usernameLower.includes(clean) ||
          p.displayName.toLowerCase().includes(clean)
      );
  }, [players, sortBy, sortAsc, search]);

  const totalPages = Math.max(1, Math.ceil(rankedList.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = rankedList.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const toggleSort = (key: SortKey) => {
    if (sortBy === key) {
      setSortAsc((prev) => !prev);
    } else {
      setSortBy(key);
      setSortAsc(false);
    }
    setPage(1);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-8">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-500 mb-1">
            <Trophy className="w-4 h-4" />
            <span className="text-xs font-semibold">Global Rankings</span>
          </div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white tracking-tight">
            Leaderboard
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Live Elo standings across all registered Chess Arena players.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Filter player..."
              className="pl-9 pr-3 py-2 rounded-lg bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] text-sm text-slate-900 dark:text-white w-52 focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
          </div>
          <button
            type="button"
            onClick={() => void loadPlayers()}
            className="p-2.5 rounded-lg bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] text-slate-600 dark:text-slate-300 hover:text-emerald-500 transition-colors cursor-pointer"
            title="Refresh standings"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      <section className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-11 rounded-lg bg-slate-100 dark:bg-[#312F2C] animate-pulse" />
            ))}
          </div>
        ) : pageItems.length === 0 ? (
          <div className="p-12 text-center text-sm text-slate-500 dark:text-slate-400">
            No players match your filter.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-[#3C3A37] bg-slate-50 dark:bg-[#1F1E1B] text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-3 pl-5 pr-3 font-semibold w-16">Rank</th>
                    <th className="py-3 px-3 font-semibold">Player</th>
                    <th className="py-3 px-3 font-semibold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort('rating')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        Rating
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-3 font-semibold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort('gamesPlayed')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        Games
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 px-3 font-semibold text-right">
                      <button
                        type="button"
                        onClick={() => toggleSort('wins')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        Wins
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                    <th className="py-3 pl-3 pr-5 font-semibold text-right hidden sm:table-cell">
                      <button
                        type="button"
                        onClick={() => toggleSort('winRate')}
                        className="inline-flex items-center gap-1 hover:text-slate-900 dark:hover:text-white cursor-pointer"
                      >
                        Win %
                        <ArrowUpDown className="w-3 h-3" />
                      </button>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#353330] text-sm">
                  {pageItems.map((player) => {
                    const isMe = player.uid === currentUid;
                    const winRate =
                      player.gamesPlayed > 0
                        ? Math.round((player.wins / player.gamesPlayed) * 100)
                        : 0;

                    return (
                      <tr
                        key={player.uid}
                        onClick={() => onViewProfile(player.uid)}
                        className={`cursor-pointer transition-colors ${
                          isMe
                            ? 'bg-emerald-500/8 hover:bg-emerald-500/12'
                            : 'hover:bg-slate-50 dark:hover:bg-[#312F2C]'
                        }`}
                      >
                        <td className="py-3.5 pl-5 pr-3 font-mono font-bold tabular-nums">
                          <span
                            className={
                              player.rank === 1
                                ? 'text-amber-500'
                                : player.rank === 2
                                ? 'text-slate-400'
                                : player.rank === 3
                                ? 'text-amber-700 dark:text-amber-600'
                                : 'text-slate-500'
                            }
                          >
                            #{player.rank}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-3">
                            <PlayerAvatar
                              src={player.photoURL}
                              name={player.displayName}
                              size="sm"
                              status={player.onlineStatus}
                              showStatusDot
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">
                                {player.username}
                                {isMe && (
                                  <span className="ml-2 text-xs font-normal text-emerald-600 dark:text-emerald-400">
                                    (You)
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                                {player.displayName}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                          {player.rating}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums">
                          {player.gamesPlayed}
                        </td>
                        <td className="py-3.5 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">
                          {player.wins}
                        </td>
                        <td className="py-3.5 pl-3 pr-5 text-right font-mono text-slate-600 dark:text-slate-300 tabular-nums hidden sm:table-cell">
                          {winRate}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-5 py-3 border-t border-slate-200 dark:border-[#3C3A37] flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span className="font-mono tabular-nums">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, rankedList.length)} of{' '}
                {rankedList.length} players
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-[#3C3A37] disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-[#312F2C] cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 font-mono font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                  {safePage} / {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-[#3C3A37] disabled:opacity-40 hover:bg-slate-100 dark:hover:bg-[#312F2C] cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  );
};
