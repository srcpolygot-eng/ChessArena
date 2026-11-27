import React from 'react';
import { formatWhiteEval } from '../lib/stockfishAnalyzer';

interface EvalBarProps {
  evalCpWhite: number;
  mateWhite?: number | null;
  orientation: 'w' | 'b';
  className?: string;
}

/**
 * Vertical Chess.com-style advantage bar showing White vs Black positional balance.
 * Uses GPU-composited scaleY transitions for zero-jank updates.
 */
export const EvalBar: React.FC<EvalBarProps> = ({
  evalCpWhite,
  mateWhite = null,
  orientation,
  className = '',
}) => {
  // Map centipawns to [4%, 96%] white share with logistic curve (mate clamps to 98% / 2%)
  let whitePct = 50;
  if (mateWhite !== null) {
    whitePct = mateWhite > 0 ? 98 : mateWhite < 0 ? 2 : 50;
  } else {
    const clamped = Math.max(-1200, Math.min(1200, evalCpWhite));
    const logistic = 50 + 50 * (2 / (1 + Math.exp(-0.0042 * clamped)) - 1);
    whitePct = Math.max(4, Math.min(96, logistic));
  }

  const label = formatWhiteEval(evalCpWhite, mateWhite);
  const whiteAdvantaged = mateWhite !== null ? mateWhite >= 0 : evalCpWhite >= 0;

  // When orientation is 'w', White is at bottom; when 'b', White is at top
  const topIsWhite = orientation === 'b';
  const topLabelVisible = (topIsWhite && whiteAdvantaged) || (!topIsWhite && !whiteAdvantaged);

  return (
    <div
      className={`relative w-6 sm:w-7 rounded-lg overflow-hidden bg-[#262B34] border border-slate-300 dark:border-[#2F3643] select-none shrink-0 ${className}`}
      title={`Position Evaluation: ${label}`}
      aria-label={`Position evaluation ${label}`}
    >
      {/* White portion */}
      <div
        className={`absolute left-0 right-0 bg-[#F2F3F5] transition-transform duration-300 ease-out ${
          topIsWhite ? 'top-0 origin-top' : 'bottom-0 origin-bottom'
        }`}
        style={{
          height: '100%',
          transform: `scaleY(${(whitePct / 100).toFixed(4)})`,
        }}
      />

      {/* Center 0.0 tick mark */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-px h-[2px] bg-emerald-500/50 pointer-events-none z-10" />

      {/* Readout at top or bottom depending on who is ahead */}
      {topLabelVisible ? (
        <span
          className={`absolute top-1.5 inset-x-0 text-center font-mono text-[9px] font-bold leading-none tabular-nums z-20 ${
            topIsWhite ? 'text-slate-900' : 'text-slate-100'
          }`}
        >
          {label.replace('+', '')}
        </span>
      ) : (
        <span
          className={`absolute bottom-1.5 inset-x-0 text-center font-mono text-[9px] font-bold leading-none tabular-nums z-20 ${
            topIsWhite ? 'text-slate-100' : 'text-slate-900'
          }`}
        >
          {label.replace('+', '')}
        </span>
      )}
    </div>
  );
};
