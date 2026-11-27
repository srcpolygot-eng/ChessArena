import React, { useEffect, useState } from 'react';
import type { OnlineStatus } from '../types/chess';

interface PlayerAvatarProps {
  src?: string | null;
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  status?: OnlineStatus;
  showStatusDot?: boolean;
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  xs: 'w-7 h-7 text-xs',
  sm: 'w-9 h-9 text-xs',
  md: 'w-11 h-11 text-sm',
  lg: 'w-14 h-14 text-base',
  xl: 'w-20 h-20 text-xl',
};

const DOT_CLASSES: Record<NonNullable<PlayerAvatarProps['size']>, string> = {
  xs: 'w-2 h-2',
  sm: 'w-2.5 h-2.5',
  md: 'w-3 h-3',
  lg: 'w-3.5 h-3.5',
  xl: 'w-4 h-4',
};

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  src,
  name,
  size = 'md',
  status,
  showStatusDot = false,
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [src]);

  const initials = (name || 'P')
    .trim()
    .split(/[\s_]+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  const statusColor =
    status === 'online'
      ? 'bg-emerald-500'
      : status === 'in_game'
      ? 'bg-amber-500'
      : 'bg-slate-400 dark:bg-slate-600';

  const statusLabel =
    status === 'online' ? 'Online' : status === 'in_game' ? 'In Game' : 'Offline';

  return (
    <div className={`relative inline-flex shrink-0 ${className}`}>
      {src && !imgError ? (
        <img
          src={src}
          alt={name}
          referrerPolicy="no-referrer"
          onError={() => setImgError(true)}
          className={`${SIZE_CLASSES[size]} rounded-lg object-cover bg-slate-200 dark:bg-[#222833] ring-1 ring-black/10 dark:ring-white/10`}
        />
      ) : (
        <div
          className={`${SIZE_CLASSES[size]} rounded-lg bg-gradient-to-br from-slate-700 to-slate-800 dark:from-[#262E3B] dark:to-[#1B2029] text-slate-100 font-display font-bold flex items-center justify-center ring-1 ring-black/10 dark:ring-white/10`}
          aria-label={name}
        >
          {initials || 'P'}
        </div>
      )}

      {showStatusDot && status && (
        <span
          title={statusLabel}
          aria-label={statusLabel}
          className={`absolute -bottom-0.5 -right-0.5 ${DOT_CLASSES[size]} rounded-full ${statusColor} ring-2 ring-white dark:ring-[#1A1E26]`}
        />
      )}
    </div>
  );
};
