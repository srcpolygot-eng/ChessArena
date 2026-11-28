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

const NAV_ITEMS: {
  id: NavSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  iconColor: string;
}[] = [
  { id: 'home', label: 'Home', icon: Home, iconColor: 'text-[#81B64C]' },
  { id: 'play', label: 'Play', icon: Swords, iconColor: 'text-[#81B64C]' },
  { id: 'puzzles', label: 'Puzzles', icon: Puzzle, iconColor: 'text-amber-500' },
  { id: 'coach', label: 'Learn / Coach', icon: GraduationCap, iconColor: 'text-sky-400' },
  { id: 'leaderboard', label: 'Leaderboard', icon: Trophy, iconColor: 'text-yellow-500' },
  { id: 'friends', label: 'Social / Friends', icon: Users, iconColor: 'text-teal-400' },
  { id: 'history', label: 'Archive', icon: History, iconColor: 'text-stone-400' },
  { id: 'profile', label: 'Profile', icon: UserCircle, iconColor: 'text-stone-400' },
  { id: 'settings', label: 'Settings', icon: Settings, iconColor: 'text-stone-400' },
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
      {/* Desktop Chess.com-Inspired Left Navigation Rail */}
      <aside className="hidden lg:flex lg:flex-col lg:w-56 lg:fixed lg:inset-y-0 bg-white dark:bg-[#262421] border-r border-[#DFDDD8] dark:border-[#3C3A37] z-30 select-none">
        {/* Brand Header */}
        <div className="h-15 px-4 flex items-center gap-2.5 border-b border-[#DFDDD8] dark:border-[#353330]">
          <button
            type="button"
            onClick={() => onSelectNav('home')}
            id="sidebar-brand-home"
            className="flex items-center gap-2.5 text-left cursor-pointer focus:outline-none group"
          >
            <div className="w-8 h-8 rounded-md bg-[#81B64C] shadow-[0_2px_0_#537133] flex items-center justify-center text-white shrink-0 group-hover:bg-[#95BB4A] transition-colors">
              <Crown className="w-4 h-4 fill-current" />
            </div>
            <div className="leading-none">
              <span className="font-display text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                Chess<span className="text-[#81B64C]">Arena</span>
              </span>
            </div>
          </button>
        </div>

        {/* Resume Live Match or Signature Chess.com 3D Green Quick Play CTA */}
        <div className="px-3 pt-3 pb-1">
          {activeMatchId ? (
            <button
              type="button"
              id="sidebar-resume-match"
              onClick={onResumeActiveMatch}
              className="w-full px-3.5 py-2.5 rounded-lg btn-chess-primary text-xs flex items-center justify-between cursor-pointer"
            >
              <span className="flex items-center gap-2">
                <Play className="w-3.5 h-3.5 fill-current" />
                Resume Game
              </span>
              <span className="px-1.5 py-0.5 rounded bg-black/25 font-mono text-[10px]">LIVE</span>
            </button>
          ) : (
            <button
              type="button"
              id="sidebar-quick-play"
              onClick={() => onSelectNav('play')}
              className="w-full py-2.5 px-4 rounded-lg btn-chess-primary text-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Swords className="w-4 h-4" />
              Play
            </button>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-2.5 py-3 space-y-0.5 overflow-y-auto" aria-label="Main navigation">
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
                id={`nav-item-${item.id}`}
                onClick={() => onSelectNav(item.id)}
                className={`relative w-full flex items-center justify-between px-3 py-2.5 rounded-md text-[13px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  isActive
                    ? 'bg-[#81B64C]/14 dark:bg-[#383531] text-slate-900 dark:text-white font-bold'
                    : 'text-stone-600 dark:text-[#C3C2C0] hover:bg-stone-100 dark:hover:bg-[#312F2C] hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {isActive && (
                  <span className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[#81B64C]" />
                )}
                <span className="flex items-center gap-3">
                  <Icon className={`w-[18px] h-[18px] shrink-0 ${item.iconColor}`} />
                  <span>{item.label}</span>
                </span>
                {count > 0 && (
                  <span className="px-1.5 py-0.5 rounded bg-[#B33430] text-white font-mono text-[10px] font-bold tabular-nums">
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Bottom Player Account Strip */}
        <div className="p-3 border-t border-[#DFDDD8] dark:border-[#353330] bg-stone-50/70 dark:bg-[#211F1C]">
          <div className="flex items-center justify-between gap-2 px-1 py-1">
            <button
              type="button"
              onClick={() => onSelectNav('profile')}
              className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer group"
            >
              <PlayerAvatar
                src={user.photoURL}
                name={user.displayName}
                size="sm"
                status={user.onlineStatus}
                showStatusDot
              />
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 dark:text-white truncate group-hover:text-[#81B64C] transition-colors">
                  {user.username}
                </p>
                <p className="text-[11px] font-mono text-stone-500 dark:text-[#9E9C98] tabular-nums truncate">
                  ({user.rating})
                  {progression && progression.currentStreak > 0
                    ? ` · ${progression.currentStreak}d`
                    : ''}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Log out"
              aria-label="Log out"
              className="p-1.5 rounded-md text-stone-400 hover:text-red-500 hover:bg-stone-200/70 dark:hover:bg-[#312F2C] transition-colors cursor-pointer shrink-0"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Compact Bottom Navigation Bar */}
      <nav
        className="lg:hidden fixed bottom-0 inset-x-0 h-15 bg-white dark:bg-[#262421] border-t border-[#DFDDD8] dark:border-[#3C3A37] z-40 px-1 flex items-center justify-around"
        aria-label="Mobile navigation"
      >
        {NAV_ITEMS.filter((i) =>
          ['home', 'play', 'puzzles', 'coach', 'friends', 'profile', 'settings'].includes(i.id)
        ).map((item) => {
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
              className={`relative flex flex-col items-center justify-center min-w-[44px] min-h-[44px] px-1.5 rounded-lg transition-colors cursor-pointer ${
                isActive ? 'text-[#81B64C]' : 'text-stone-500 dark:text-[#9E9C98]'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold mt-0.5 leading-none">
                {item.id === 'coach' ? 'Coach' : item.id === 'friends' ? 'Friends' : item.label}
              </span>
              {count > 0 && (
                <span className="absolute top-1 right-1 font-mono text-[10px] font-bold text-amber-500">
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </>
  );
};
