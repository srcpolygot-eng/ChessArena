import React from 'react';
import {
  Crown,
  Home,
  Swords,
  Puzzle,
  Users,
  Trophy,
  History,
  UserCircle,
  Settings,
  LogOut,
  Play,
  GraduationCap,
} from 'lucide-react';
import type { NavSection, UserPrivateProfile, UserProgression } from '../types/chess';
import { PlayerAvatar } from './PlayerAvatar';

interface SidebarProps {
  user: UserPrivateProfile;
  progression?: UserProgression | null;
  activeNav: NavSection;
  onSelectNav: (nav: NavSection) => void;
  activeMatchId: string | null;
  onResumeActiveMatch: () => void;
  pendingFriendRequestsCount: number;
  pendingInvitesCount: number;
  onLogout: () => void;
}

const NAV_ITEMS: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'home', label: 'Home', icon: Home },
  { id: 'play', label: 'Play', icon: Swords },
  { id: 'puzzles', label: 'Puzzles', icon: Puzzle },
  { id: 'coach', label: 'Coach', icon: GraduationCap },
  { id: 'friends', label: 'Friends', icon: Users },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy },
  { id: 'history', label: 'Matches', icon: History },
  { id: 'profile', label: 'Profile', icon: UserCircle },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export const Sidebar: React.FC<SidebarProps> = ({
  user,
  progression = null,
  activeNav,
  onSelectNav,
  activeMatchId,
  onResumeActiveMatch,
  pendingFriendRequestsCount,
  pendingInvitesCount,
  onLogout,
}) => {
  return (
    <>
      {/* Desktop Left Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-white dark:bg-[#1A1E26] border-r border-slate-200 dark:border-[#2A313D] z-30">
        {/* Brand */}
        <div className="h-16 px-5 flex items-center gap-3 border-b border-slate-200 dark:border-[#2A313D]">
          <button
            type="button"
            onClick={() => onSelectNav('home')}
            className="flex items-center gap-2.5 text-left cursor-pointer focus:outline-none"
          >
            <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white">
              <Crown className="w-4 h-4" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
              Chess Arena
            </span>
          </button>
        </div>

        {/* Resume Live Match Banner */}
        {activeMatchId && (
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={onResumeActiveMatch}
              className="w-full px-3.5 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Play className="w-3.5 h-3.5 fill-current" />
                Return to Live Game
              </span>
              <span className="font-mono opacity-90">LIVE</span>
            </button>
          </div>
        )}

        {/* Nav List */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main navigation">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            const count =
              item.id === 'friends'
                ? pendingFriendRequestsCount
                : item.id === 'play'
                ? pendingInvitesCount
                : 0;

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectNav(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-400 font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#222833] hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  <span>{item.label}</span>
                </span>
                {count > 0 && (
                  <span className="font-mono text-xs font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Account Strip */}
        <div className="p-3 border-t border-slate-200 dark:border-[#2A313D]">
          <div className="flex items-center justify-between gap-2 px-2 py-1.5">
            <button
              type="button"
              onClick={() => onSelectNav('profile')}
              className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
            >
              <PlayerAvatar src={user.photoURL} name={user.displayName} size="sm" status={user.onlineStatus} showStatusDot />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  {user.username}
                </p>
                <p className="text-xs font-mono text-slate-500 dark:text-slate-400 tabular-nums truncate">
                  {user.rating} Elo
                  {progression && progression.currentStreak > 0 ? ` · ${progression.currentStreak}d streak` : ''}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Log out"
              aria-label="Log out"
              className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-slate-100 dark:hover:bg-[#222833] transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Compact Bottom Navigation Bar (Strictly <= 64px / < 10% viewport height) */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 h-15 bg-white dark:bg-[#1A1E26] border-t border-slate-200 dark:border-[#2A313D] z-40 px-1 flex items-center justify-around"
        aria-label="Mobile navigation"
      >
        {NAV_ITEMS.filter((i) => ['home', 'play', 'puzzles', 'coach', 'friends', 'profile', 'settings'].includes(i.id)).map(
          (item) => {
            const Icon = item.icon;
            const isActive = activeNav === item.id;
            const count = item.id === 'friends' ? pendingFriendRequestsCount : item.id === 'play' ? pendingInvitesCount : 0;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectNav(item.id)}
                className={`relative flex flex-col items-center justify-center min-w-[44px] min-h-[44px] px-1.5 rounded-lg transition-colors cursor-pointer ${
                  isActive
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-500 dark:text-slate-400'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-[10px] font-medium mt-0.5 leading-none">{item.label}</span>
                {count > 0 && (
                  <span className="absolute top-1 right-1 font-mono text-[10px] font-bold text-amber-500">
                    {count}
                  </span>
                )}
              </button>
            );
          }
        )}
      </nav>
    </>
  );
};
