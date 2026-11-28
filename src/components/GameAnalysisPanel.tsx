import React, { useMemo, useState } from 'react';
import { AlertTriangle, Award, GraduationCap, Loader2, Sparkles, TrendingUp, XCircle } from 'lucide-react';
import type { AnalyzedMove, GameAnalysisResult, AnalysisProgress } from '../lib/stockfishAnalyzer';

interface GameAnalysisPanelProps {
  whiteName: string;
  blackName: string;
  analyzing: boolean;
  progress: AnalysisProgress | null;
  analysis: GameAnalysisResult | null;
  error: string | null;
  currentPly: number;
  onSelectPly: (ply: number) => void;
  onRunAnalysis: () => void;
}

export const GameAnalysisPanel: React.FC<GameAnalysisPanelProps> = ({
  whiteName,
  blackName,
  analyzing,
  progress,
  analysis,
  error,
  currentPly,
  onSelectPly,
  onRunAnalysis,
}) => {
  const [tab, setTab] = useState<'blunders' | 'best' | 'all'>('blunders');

  // Build SVG evaluation graph path (clamped to [-700, 700] centipawns for readability)
  const evalGraph = useMemo(() => {
    if (!analysis || analysis.evalSeriesWhiteCp.length === 0) return null;
    const width = 420;
    const height = 88;
    const midY = height / 2;
    const cap = 700;
    const series = analysis.evalSeriesWhiteCp;
    const count = series.length;

    const coords = series.map((cp, idx) => {
      const clamped = Math.max(-cap, Math.min(cap, cp));
      const x = count <= 1 ? 0 : (idx / (count - 1)) * width;
      const y = midY - (clamped / cap) * (midY - 6);
      return { x, y, idx };
    });

    const linePath = coords.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
    const areaPath = `${linePath} L ${width} ${midY} L 0 ${midY} Z`;
    const activePt = coords[Math.min(Math.max(0, currentPly), coords.length - 1)];

    return { width, height, midY, coords, linePath, areaPath, activePt };
  }, [analysis, currentPly]);

  if (error) {
    return (
      <div className="bg-white dark:bg-[#262421] border border-red-500/30 rounded-xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 text-sm text-red-700 dark:text-red-300">
            <XCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={onRunAnalysis}
            className="px-3 py-1.5 rounded-lg btn-chess-primary text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
          >
            Retry Analysis
          </button>
        </div>
      </div>
    );
  }

  if (analyzing) {
    const pct =
      progress && progress.total > 0 ? Math.round((progress.completed / progress.total) * 100) : 0;
    return (
      <div className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 animate-spin text-emerald-500 shrink-0" />
            <div>
              <p className="font-display text-sm font-bold text-slate-900 dark:text-white">
                Coach is Reviewing Match
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {progress
                  ? `${progress.engineName} · Position ${progress.completed} of ${progress.total}`
                  : 'Preparing Coach game review...'}
              </p>
            </div>
          </div>
          <span className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {pct}%
          </span>
        </div>
        <div className="w-full h-2 rounded-full bg-slate-100 dark:bg-[#1F1E1B] overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  if (!analysis) {
    return null;
  }

  const displayedList: AnalyzedMove[] =
    tab === 'blunders'
      ? [...analysis.blunders, ...analysis.mistakes].sort((a, b) => a.ply - b.ply)
      : tab === 'best'
      ? analysis.bestMoves
      : analysis.moves;

  const activeMove = currentPly > 0 ? analysis.moves[currentPly - 1] : null;

  return (
    <section className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-5 space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-display text-sm font-bold text-slate-900 dark:text-white">
              Coach Game Review
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {analysis.engineName} · Depth {analysis.depth} · {analysis.moves.length} plies evaluated
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onRunAnalysis}
          className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
          Re-analyze
        </button>
      </div>

      {/* White vs Black Accuracy & Move Quality Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[
          { label: whiteName, side: 'White', stats: analysis.white, isWhite: true },
          { label: blackName, side: 'Black', stats: analysis.black, isWhite: false },
        ].map((item) => (
          <div
            key={item.side}
            className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#1F1E1B] border border-slate-200/80 dark:border-[#353330] space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className={`w-3 h-3 rounded-sm border shrink-0 ${
                    item.isWhite
                      ? 'bg-white border-slate-300'
                      : 'bg-slate-800 border-slate-600'
                  }`}
                />
                <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                  {item.label}
                </span>
              </div>
              <span className="font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                {item.stats.accuracy.toFixed(1)}%
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 text-center pt-1 border-t border-slate-200/70 dark:border-[#353330]">
              <div>
                <span className="block font-mono text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  {item.stats.bestCount}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">Best</span>
              </div>
              <div>
                <span className="block font-mono text-sm font-bold text-sky-600 dark:text-sky-400 tabular-nums">
                  {item.stats.inaccuracyCount}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">Inacc.</span>
              </div>
              <div>
                <span className="block font-mono text-sm font-bold text-amber-600 dark:text-amber-400 tabular-nums">
                  {item.stats.mistakeCount}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">Mistake</span>
              </div>
              <div>
                <span className="block font-mono text-sm font-bold text-red-600 dark:text-red-400 tabular-nums">
                  {item.stats.blunderCount}
                </span>
                <span className="block text-[11px] text-slate-500 dark:text-slate-400">Blunder</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Advantage Curve */}
      {evalGraph && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-medium">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
              Advantage Timeline (click to jump)
            </span>
            <span className="font-mono tabular-nums text-slate-700 dark:text-slate-200">
              {activeMove
                ? `Ply ${activeMove.ply}: ${activeMove.evalLabel}`
                : 'Start (0.0)'}
            </span>
          </div>
          <div className="rounded-lg bg-slate-100 dark:bg-[#1F1E1B] border border-slate-200 dark:border-[#353330] p-2">
            <svg
              viewBox={`0 0 ${evalGraph.width} ${evalGraph.height}`}
              className="w-full h-20 overflow-visible cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
                const targetPly = Math.round(ratio * (evalGraph.coords.length - 1));
                onSelectPly(targetPly);
              }}
            >
              <line
                x1={0}
                y1={evalGraph.midY}
                x2={evalGraph.width}
                y2={evalGraph.midY}
                stroke="currentColor"
                className="text-slate-300 dark:text-slate-700"
                strokeDasharray="3 3"
                strokeWidth="1"
              />
              <path d={evalGraph.areaPath} className="fill-emerald-500/20" />
              <path
                d={evalGraph.linePath}
                fill="none"
                className="stroke-emerald-500"
                strokeWidth="2"
                strokeLinejoin="round"
              />
              {analysis.blunders.map((b) => {
                const pt = evalGraph.coords[b.ply];
                if (!pt) return null;
                return (
                  <circle
                    key={b.ply}
                    cx={pt.x}
                    cy={pt.y}
                    r={3.5}
                    className="fill-red-500 stroke-white dark:stroke-[#1F1E1B]"
                    strokeWidth="1.2"
                  />
                );
              })}
              {evalGraph.activePt && (
                <>
                  <line
                    x1={evalGraph.activePt.x}
                    y1={0}
                    x2={evalGraph.activePt.x}
                    y2={evalGraph.height}
                    className="stroke-amber-500"
                    strokeWidth="1.5"
                  />
                  <circle
                    cx={evalGraph.activePt.x}
                    cy={evalGraph.activePt.y}
                    r={4}
                    className="fill-amber-500 stroke-white dark:stroke-[#1F1E1B]"
                    strokeWidth="1.5"
                  />
                </>
              )}
            </svg>
          </div>
        </div>
      )}

      {/* Selected Move Diagnostic Banner */}
      {activeMove && (
        <div
          className={`p-3.5 rounded-lg border text-xs space-y-1.5 ${
            activeMove.classification === 'blunder'
              ? 'bg-red-500/10 border-red-500/30 text-red-700 dark:text-red-300'
              : activeMove.classification === 'mistake'
              ? 'bg-amber-500/10 border-amber-500/30 text-amber-700 dark:text-amber-300'
              : activeMove.classification === 'best'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-slate-50 dark:bg-[#1F1E1B] border-slate-200 dark:border-[#353330] text-slate-700 dark:text-slate-300'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <span className="font-mono font-bold mr-2">
                {activeMove.moveNumber}
                {activeMove.color === 'w' ? '.' : '...'} {activeMove.san}
              </span>
              <span className="capitalize font-semibold">{activeMove.classification}</span>
              {activeMove.centipawnLoss > 0 && (
                <span className="font-mono ml-2 opacity-80 tabular-nums">
                  (-{(activeMove.centipawnLoss / 100).toFixed(2)} eval)
                </span>
              )}
            </div>
            {activeMove.bestMoveSan && activeMove.bestMoveSan !== activeMove.san && (
              <span className="font-mono font-semibold">
                Coach suggests: {activeMove.bestMoveSan}
              </span>
            )}
          </div>
          {activeMove.coachComment && (
            <p className="text-xs opacity-90 leading-relaxed">{activeMove.coachComment}</p>
          )}
        </div>
      )}

      {/* Key Moments Tabs: Blunders & Mistakes / Best Moves / All */}
      <div className="space-y-3">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-[#1F1E1B]">
          <button
            type="button"
            onClick={() => setTab('blunders')}
            className={`flex-1 py-1.5 px-2.5 rounded-md text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
              tab === 'blunders'
                ? 'bg-white dark:bg-[#312F2C] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
            Blunders & Mistakes ({analysis.blunders.length + analysis.mistakes.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('best')}
            className={`flex-1 py-1.5 px-2.5 rounded-md text-xs font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
              tab === 'best'
                ? 'bg-white dark:bg-[#312F2C] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Award className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            Best Moves ({analysis.bestMoves.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('all')}
            className={`py-1.5 px-3 rounded-md text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors ${
              tab === 'all'
                ? 'bg-white dark:bg-[#312F2C] text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            All ({analysis.moves.length})
          </button>
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1.5 pr-1">
          {displayedList.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">
              {tab === 'blunders'
                ? 'Clean game! No blunders or major mistakes detected.'
                : 'No moves in this category.'}
            </p>
          ) : (
            displayedList.map((m) => {
              const isSelected = currentPly === m.ply;
              const badgeColor =
                m.classification === 'blunder'
                  ? 'text-red-600 dark:text-red-400'
                  : m.classification === 'mistake'
                  ? 'text-amber-600 dark:text-amber-400'
                  : m.classification === 'inaccuracy'
                  ? 'text-sky-600 dark:text-sky-400'
                  : m.classification === 'best'
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-slate-500 dark:text-slate-400';

              return (
                <button
                  key={m.ply}
                  type="button"
                  onClick={() => onSelectPly(m.ply)}
                  className={`w-full text-left px-3 py-2 rounded-lg border flex items-center justify-between gap-3 text-xs transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-emerald-600/12 border-emerald-500/40'
                      : 'bg-slate-50 dark:bg-[#1F1E1B] border-transparent hover:border-slate-200 dark:hover:border-[#3C3A37]'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono text-slate-400 tabular-nums shrink-0">
                      {m.moveNumber}
                      {m.color === 'w' ? '.' : '...'}
                    </span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      {m.san}
                      {m.classification === 'blunder'
                        ? '??'
                        : m.classification === 'mistake'
                        ? '?'
                        : m.classification === 'best'
                        ? '!'
                        : ''}
                    </span>
                    <span className={`font-semibold capitalize ${badgeColor}`}>
                      {m.classification}
                    </span>
                    {m.classification !== 'best' && m.bestMoveSan && m.bestMoveSan !== m.san && (
                      <span className="text-slate-500 dark:text-slate-400 truncate font-mono">
                        · Best: {m.bestMoveSan}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                    {m.evalLabel}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
};
