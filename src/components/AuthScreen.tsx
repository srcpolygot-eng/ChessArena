import React, { useState } from 'react';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import { Crown, Mail, Lock, ArrowRight, CheckCircle2, AlertCircle, RefreshCw, LogOut, UserCheck, ArrowLeftRight } from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import {
  createUserProfileAtomic,
  isUsernameAvailable,
  validateUsernameFormat,
} from '../lib/firestoreService';
import {
  BOT_ULTRA_IMAGE,
  CHESS_ARENA_UI_IMAGE,
  PRESET_AVATARS,
} from '../types/chess';
import { PlayerAvatar } from './PlayerAvatar';

interface AuthScreenProps {
  mode: 'auth' | 'verify_email' | 'onboarding';
  firebaseUser: User | null;
  onEmailVerifiedRefresh: () => Promise<void>;
  onOnboardingComplete: () => Promise<void>;
  onStartPassAndPlay?: () => void;
  onStartGuestBot?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  mode,
  firebaseUser,
  onEmailVerifiedRefresh,
  onOnboardingComplete,
  onStartPassAndPlay,
  onStartGuestBot,
}) => {
  const [authTab, setAuthTab] = useState<'login' | 'register' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Onboarding fields
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState(firebaseUser?.displayName || '');
  const [selectedAvatar, setSelectedAvatar] = useState(firebaseUser?.photoURL || '');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameHint, setUsernameHint] = useState<string | null>(null);

  const mapAuthError = (err: unknown): string => {
    const code = (err as { code?: string })?.code || '';
    switch (code) {
      case 'auth/operation-not-allowed':
        return 'Email/Password sign-in is not yet enabled in your Firebase project. Enable it in Firebase Console → Authentication → Sign-in method → Email/Password, or continue with Google below.';
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Invalid email address or password. Please check your credentials and try again.';
      case 'auth/email-already-in-use':
        return 'An account with this email already exists. Try signing in instead.';
      case 'auth/weak-password':
        return 'Password must be at least 6 characters long.';
      case 'auth/invalid-email':
        return 'Please enter a valid email address.';
      case 'auth/popup-closed-by-user':
        return 'Google sign-in popup was closed before completing authentication.';
      case 'auth/too-many-requests':
        return 'Too many attempts. Please wait a moment and try again.';
      default:
        return err instanceof Error ? err.message : 'Authentication failed. Please try again.';
    }
  };

  const handleGoogleSignIn = async () => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);

    if (!email.trim()) {
      setError('Please enter your email address.');
      return;
    }

    setBusy(true);
    try {
      if (authTab === 'reset') {
        await sendPasswordResetEmail(auth, email.trim());
        setNotice('Password reset instructions have been sent to your email address.');
        setAuthTab('login');
      } else if (authTab === 'register') {
        if (password.length < 6) {
          setError('Password must be at least 6 characters.');
          setBusy(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setBusy(false);
          return;
        }
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(cred.user);
        setNotice('Account created. Please verify your email address to continue.');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckUsername = async (value: string) => {
    setUsername(value);
    const trimmed = value.trim();
    if (!trimmed) {
      setUsernameStatus('idle');
      setUsernameHint(null);
      return;
    }
    const formatErr = validateUsernameFormat(trimmed);
    if (formatErr) {
      setUsernameStatus('invalid');
      setUsernameHint(formatErr);
      return;
    }
    setUsernameStatus('checking');
    setUsernameHint('Checking availability...');
    try {
      const available = await isUsernameAvailable(trimmed);
      setUsernameStatus(available ? 'available' : 'taken');
      setUsernameHint(available ? 'Username is available.' : 'That username is already taken.');
    } catch {
      setUsernameStatus('idle');
      setUsernameHint(null);
    }
  };

  const handleCompleteOnboarding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!firebaseUser) return;
    setError(null);

    const formatErr = validateUsernameFormat(username);
    if (formatErr) {
      setError(formatErr);
      return;
    }

    setBusy(true);
    try {
      await createUserProfileAtomic({
        uid: firebaseUser.uid,
        username: username.trim(),
        displayName: displayName.trim() || username.trim(),
        email: firebaseUser.email || '',
        photoURL: selectedAvatar || firebaseUser.photoURL || '',
      });
      await onOnboardingComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to finish account setup.');
    } finally {
      setBusy(false);
    }
  };

  const handleResendVerification = async () => {
    if (!firebaseUser) return;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await sendEmailVerification(firebaseUser);
      setNotice('Verification link sent. Check your inbox and spam folder.');
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleCheckVerified = async () => {
    setBusy(true);
    setError(null);
    try {
      await onEmailVerifiedRefresh();
      if (!auth.currentUser?.emailVerified) {
        setError('Your email is not verified yet. Click the verification link in your inbox, then try again.');
      }
    } catch (err) {
      setError(mapAuthError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-12 bg-[#EDECE9] dark:bg-[#302E2B]">
      {/* Left Chess.com-Inspired Hero Showcase */}
      <div className="relative hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-between p-12 overflow-hidden bg-[#1F1E1B] border-r border-[#3C3A37]">
        <img
          src={CHESS_ARENA_UI_IMAGE}
          alt="Chess Arena Tournament Interface against MiniMax H1 Ultra"
          className="absolute inset-0 w-full h-full object-cover opacity-35"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1B1917] via-[#1B1917]/80 to-[#1B1917]/55" />

        <div className="relative z-10 flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-lg bg-[#81B64C] shadow-[0_3px_0_#537133] flex items-center justify-center text-white">
            <Crown className="w-5 h-5 fill-current" />
          </div>
          <span className="font-display text-2xl font-extrabold tracking-tight text-white">
            Chess<span className="text-[#81B64C]">Arena</span>
          </span>
        </div>

        <div className="relative z-10 max-w-xl space-y-6">
          <div className="inline-flex items-center gap-3 p-2.5 pr-4 rounded-xl bg-[#262421]/95 border border-[#3C3A37] shadow-xl">
            <img
              src={BOT_ULTRA_IMAGE}
              alt="MiniMax H1 Ultra"
              className="w-11 h-11 rounded-lg object-cover ring-2 ring-amber-400"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="cc-title-badge cc-title-gm">GM</span>
                <span className="cc-title-badge cc-title-ultra">ULTRA</span>
                <span className="font-mono text-xs font-bold text-amber-300">2650 Elo</span>
              </div>
              <p className="text-xs font-bold text-white mt-0.5">
                MiniMax H1 Ultra Engine · Live in Chess Arena
              </p>
            </div>
          </div>

          <h1 className="font-display text-4xl xl:text-5xl font-extrabold tracking-tight text-white leading-[1.12]">
            Play Chess Online &amp; Challenge MiniMax H1 Ultra.
          </h1>
          <p className="text-base text-stone-300 leading-relaxed">
            Experience our tournament-green arena with real-time multiplayer, tactical puzzles, Coach game review,
            and the 2650-rated MiniMax H1 Ultra AI engine.
          </p>
          <div className="grid grid-cols-3 gap-6 pt-6 border-t border-white/15 text-sm">
            <div>
              <p className="font-display font-bold text-white">H1 Ultra (2650)</p>
              <p className="text-stone-400 text-xs mt-1">Depth-9 NMP &amp; PVS AI</p>
            </div>
            <div>
              <p className="font-display font-bold text-white">Live Multiplayer</p>
              <p className="text-stone-400 text-xs mt-1">Untimed &amp; Chess960</p>
            </div>
            <div>
              <p className="font-display font-bold text-white">Game Review</p>
              <p className="text-stone-400 text-xs mt-1">Eval Bar &amp; Coach tips</p>
            </div>
          </div>
        </div>
      </div>

      {/* Right Auth / Verification / Onboarding Column */}
      <div className="lg:col-span-6 xl:col-span-5 flex flex-col justify-center px-6 py-10 sm:px-12 lg:px-14">
        <div className="w-full max-w-md mx-auto">
          {/* Mobile Brand Header */}
          <div className="flex lg:hidden items-center gap-2.5 mb-8">
            <div className="w-9 h-9 rounded-lg bg-[#81B64C] shadow-[0_2px_0_#537133] flex items-center justify-center text-white">
              <Crown className="w-5 h-5 fill-current" />
            </div>
            <span className="font-display text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Chess<span className="text-[#81B64C]">Arena</span>
            </span>
          </div>

          {error && (
            <div className="mb-5 p-3.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-700 dark:text-red-300 text-sm flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {notice && (
            <div className="mb-5 p-3.5 rounded-lg bg-[#81B64C]/15 border border-[#81B64C]/40 text-slate-800 dark:text-[#D5E8C0] text-sm flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-[#81B64C]" />
              <span>{notice}</span>
            </div>
          )}

          {mode === 'auth' && (
            <div className="bg-white dark:bg-[#262421] border border-[#DFDDD8] dark:border-[#3C3A37] rounded-xl p-6 sm:p-8 shadow-xl">
              <h2 className="font-display text-2xl font-extrabold text-slate-900 dark:text-white mb-1.5">
                {authTab === 'login'
                  ? 'Sign in to Chess Arena'
                  : authTab === 'register'
                  ? 'Create your account'
                  : 'Reset your password'}
              </h2>
              <p className="text-sm text-stone-500 dark:text-[#9E9C98] mb-6">
                {authTab === 'login'
                  ? 'Welcome back. Pick up your matches or challenge MiniMax H1 Ultra.'
                  : authTab === 'register'
                  ? 'Join global players with a unique username and Elo rating.'
                  : 'Enter your account email and we will send a reset link.'}
              </p>

              {/* Auth Mode Switcher */}
              <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-stone-100 dark:bg-[#1F1E1B] mb-6">
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('login');
                    setError(null);
                    setNotice(null);
                  }}
                  className={`py-2 text-xs font-bold rounded-md transition-colors cursor-pointer ${
                    authTab === 'login'
                      ? 'bg-white dark:bg-[#312F2C] text-slate-900 dark:text-white shadow-sm'
                      : 'text-stone-600 dark:text-[#9E9C98] hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  Log In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthTab('register');
                    setError(null);
                    setNotice(null);
                  }}
                  className={`py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    authTab === 'register'
                      ? 'bg-white dark:bg-[#312F2C] text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Google OAuth Button */}
              <button
                type="button"
                disabled={busy}
                onClick={handleGoogleSignIn}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 font-semibold text-sm flex items-center justify-center gap-2.5 transition-colors disabled:opacity-60 cursor-pointer"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="currentColor"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="currentColor"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="currentColor"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                Continue with Google
              </button>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200 dark:border-[#3C3A37]" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="px-3 bg-white dark:bg-[#262421] text-slate-400">or use email</span>
                </div>
              </div>

              <form onSubmit={handleEmailAuth} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="player@example.com"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1F1E1B] border border-slate-200 dark:border-[#3C3A37] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                    />
                  </div>
                </div>

                {authTab !== 'reset' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Password
                      </label>
                      {authTab === 'login' && (
                        <button
                          type="button"
                          onClick={() => {
                            setAuthTab('reset');
                            setError(null);
                            setNotice(null);
                          }}
                          className="text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                        >
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1F1E1B] border border-slate-200 dark:border-[#3C3A37] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}

                {authTab === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Confirm password
                    </label>
                    <div className="relative">
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1F1E1B] border border-slate-200 dark:border-[#3C3A37] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={busy}
                  className="w-full py-3 px-4 rounded-lg btn-chess-primary text-sm flex items-center justify-center gap-2 cursor-pointer"
                >
                  {busy
                    ? 'Please wait...'
                    : authTab === 'login'
                    ? 'Log In'
                    : authTab === 'register'
                    ? 'Sign Up'
                    : 'Send Reset Link'}
                  <ArrowRight className="w-4 h-4" />
                </button>

                {authTab === 'reset' && (
                  <button
                    type="button"
                    onClick={() => setAuthTab('login')}
                    className="w-full py-2 text-xs font-semibold text-stone-500 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                  >
                    Back to Log In
                  </button>
                )}
              </form>

              {(onStartGuestBot || onStartPassAndPlay) && (
                <div className="mt-6 pt-5 border-t border-[#DFDDD8] dark:border-[#3C3A37] space-y-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-[#9E9C98] text-center">
                    Play Instantly as Guest
                  </p>
                  {onStartGuestBot && (
                    <button
                      type="button"
                      id="guest-play-h1-ultra"
                      onClick={onStartGuestBot}
                      className="w-full py-2.5 px-4 rounded-lg bg-stone-100 dark:bg-[#312F2C] hover:bg-stone-200 dark:hover:bg-[#3C3A37] border border-amber-500/40 text-slate-900 dark:text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2.5 transition-colors cursor-pointer"
                    >
                      <img
                        src={BOT_ULTRA_IMAGE}
                        alt="MiniMax H1 Ultra"
                        className="w-5 h-5 rounded object-cover ring-1 ring-amber-400"
                      />
                      <span>Play vs MiniMax H1 Ultra</span>
                      <span className="cc-title-badge cc-title-ultra">2650 GM</span>
                    </button>
                  )}
                  {onStartPassAndPlay && (
                    <button
                      type="button"
                      id="guest-play-pass-and-play"
                      onClick={onStartPassAndPlay}
                      className="w-full py-2.5 px-4 rounded-lg btn-chess-secondary text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <ArrowLeftRight className="w-4 h-4 text-[#81B64C]" />
                      Play 2 Players (Pass &amp; Play)
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {mode === 'verify_email' && (
            <div className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-6 sm:p-8">
              <div className="w-11 h-11 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center mb-4">
                <Mail className="w-5 h-5" />
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Verify your email
              </h2>
              <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-6">
                We sent a verification link to{' '}
                <span className="font-medium text-slate-900 dark:text-slate-200">{firebaseUser?.email}</span>. Verify
                your address to activate your Chess Arena account and secure multiplayer matches.
              </p>

              <div className="space-y-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleCheckVerified}
                  className="w-full py-2.5 px-4 rounded-lg btn-chess-primary font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60 cursor-pointer"
                >
                  <RefreshCw className="w-4 h-4" />
                  I’ve Verified — Continue
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={handleResendVerification}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-100 dark:bg-[#312F2C] hover:bg-slate-200 dark:hover:bg-[#3C3A37] text-slate-800 dark:text-slate-200 font-medium text-sm transition-colors disabled:opacity-60 cursor-pointer"
                >
                  Resend Verification Email
                </button>
                <button
                  type="button"
                  onClick={() => signOut(auth)}
                  className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out and use another account
                </button>
              </div>
            </div>
          )}

          {mode === 'onboarding' && (
            <div className="bg-white dark:bg-[#262421] border border-slate-200 dark:border-[#3C3A37] rounded-xl p-6 sm:p-8">
              <div className="w-11 h-11 rounded-lg bg-emerald-500/15 text-emerald-500 flex items-center justify-center mb-4">
                <UserCheck className="w-5 h-5" />
              </div>
              <h2 className="font-display text-2xl font-bold text-slate-900 dark:text-white mb-1.5">
                Choose your player handle
              </h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                Pick a unique username so friends can find and challenge you. Your email stays private.
              </p>

              <form onSubmit={handleCompleteOnboarding} className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Unique username
                  </label>
                  <div className="relative">
                    <span className="text-slate-400 text-sm font-mono absolute left-3.5 top-1/2 -translate-y-1/2">@</span>
                    <input
                      type="text"
                      required
                      maxLength={24}
                      value={username}
                      onChange={(e) => void handleCheckUsername(e.target.value)}
                      placeholder="grandmaster_alex"
                      className="w-full pl-8 pr-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1F1E1B] border border-slate-200 dark:border-[#3C3A37] text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                    />
                  </div>
                  {usernameHint && (
                    <p
                      className={`text-xs mt-1.5 ${
                        usernameStatus === 'available'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : usernameStatus === 'checking'
                          ? 'text-slate-400'
                          : 'text-red-500'
                      }`}
                    >
                      {usernameHint}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Display name
                  </label>
                  <input
                    type="text"
                    required
                    maxLength={40}
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Alex Carter"
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-[#1F1E1B] border border-slate-200 dark:border-[#3C3A37] text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                    Avatar
                  </label>
                  <div className="flex items-center gap-3">
                    <PlayerAvatar src={selectedAvatar} name={displayName || username || 'P'} size="md" />
                    <div className="flex items-center gap-2 flex-wrap">
                      {firebaseUser?.photoURL && (
                        <button
                          type="button"
                          onClick={() => setSelectedAvatar(firebaseUser.photoURL || '')}
                          className={`rounded-lg p-0.5 ring-2 transition-all cursor-pointer ${
                            selectedAvatar === firebaseUser.photoURL
                              ? 'ring-emerald-500'
                              : 'ring-transparent hover:ring-slate-400'
                          }`}
                          title="Use Google photo"
                        >
                          <PlayerAvatar src={firebaseUser.photoURL} name="Google" size="sm" />
                        </button>
                      )}
                      {PRESET_AVATARS.map((url, idx) => (
                        <button
                          key={url}
                          type="button"
                          onClick={() => setSelectedAvatar(url)}
                          className={`rounded-lg p-0.5 ring-2 transition-all cursor-pointer ${
                            selectedAvatar === url ? 'ring-emerald-500' : 'ring-transparent hover:ring-slate-400'
                          }`}
                          title={`Preset avatar ${idx + 1}`}
                        >
                          <PlayerAvatar src={url} name={`Preset ${idx + 1}`} size="sm" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={busy || usernameStatus === 'taken' || usernameStatus === 'invalid'}
                  className="w-full py-2.5 px-4 rounded-lg btn-chess-primary font-semibold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {busy ? 'Creating profile...' : 'Enter Chess Arena'}
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => signOut(auth)}
                  className="w-full py-1.5 text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 cursor-pointer"
                >
                  Sign out
                </button>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
