import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    let readable = error.message || 'An unexpected application error occurred.';
    try {
      const parsed = JSON.parse(error.message) as { error?: string; operationType?: string; path?: string };
      if (parsed && parsed.error) {
        readable = `Database ${parsed.operationType || 'operation'} error on ${parsed.path || 'resource'}: ${parsed.error}`;
      }
    } catch {
      // Plain error string
    }
    return { hasError: true, message: readable };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#F6F7F9] dark:bg-[#12151A] flex items-center justify-center p-6">
          <div className="max-w-md w-full bg-white dark:bg-[#1A1E26] border border-slate-200 dark:border-[#2A313D] rounded-xl p-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 text-red-500 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h1 className="font-display text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">
              Something went wrong
            </h1>
            <p className="text-sm text-slate-600 dark:text-slate-400 mb-6 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              Reload Chess Arena
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
