import React from 'react';
import { formatWhiteEval } from '../lib/stockfishAnalyzer';

interface EvalBarProps {
  evalCpWhite: number;
  mateWhite?: number | null;
  orientation: 'w' | 'b';
  className?: string;
}

/**
 * Vertical Chess.com-style advantage bar (#FFFFFF White vs #403D39 Dark Charcoal).
 * Uses GPU-composited scaleY transitions for zero-jank live evaluation updates.
 */
export const EvalBar: React.FC<EvalBarProps> = ({
  evalCpWhite,
  mateWhite = null,
  orientation,
  className = '',
}) => {
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
      className={`relative w-6 sm:w-7 rounded-[4px] overflow-hidden bg-[#403D39] ring-1 ring-black/30 select-none shrink-0 ${className}`}
      title={`Position Evaluation: ${label}`}
      aria-label={`Position evaluation ${label}`}
    >
      {/* White portion */}
      <div
        className={`absolute left-0 right-0 bg-[#FFFFFF] transition-transform duration-300 ease-out ${
          topIsWhite ? 'top-0 origin-top' : 'bottom-0 origin-bottom'
        }`}
        style={{
          height: '100%',
          transform: `scaleY(${(whitePct / 100).toFixed(4)})`,
        }}
      />

      {/* Subtle 0.0 equilibrium tick */}
      <div className="absolute left-0 right-0 top-1/2 -translate-y-px h-[1.5px] bg-black/25 pointer-events-none z-10" />

      {/* Chess.com numeric score readout anchored on winning side */}
      {topLabelVisible ? (
        <span
          className={`absolute top-1.5 inset-x-0 text-center font-mono text-[9px] font-extrabold leading-none tabular-nums z-20 ${
            topIsWhite ? 'text-[#403D39]' : 'text-[#FFFFFF]'
          }`}
        >
          {label.replace('+', '')}
        </span>
      ) : (
        <span
          className={`absolute bottom-1.5 inset-x-0 text-center font-mono text-[9px] font-extrabold leading-none tabular-nums z-20 ${
            topIsWhite ? 'text-[#FFFFFF]' : 'text-[#403D39]'
          }`}
        >
          {label.replace('+', '')}
        </span>
      )}
    </div>
  );
};
