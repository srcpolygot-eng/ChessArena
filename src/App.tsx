import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, type User } from 'firebase/auth';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { Loader2, Crown } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  acceptMatchInvitation,
  applyMatchStatsForUser,
  claimDailyReward,
  ensureUserProgression,
  fetchLeaderboardProfiles,
  fetchPublicProfile,
  joinPrivateMatchByCode,
  rejectMatchInvitation,
  sendMatchInvitation,
  updateOnlinePresence,
  updateUserSettings,
} from './lib/firestoreService';
import { loadLocalPlayPreferences, saveLocalPlayPreferences } from './lib/localPreferences';
import {
  DEFAULT_USER_SETTINGS,
  type ChessMatch,
  type FriendRequest,
  type Friendship,
  type LocalPlayPreferences,
  type MatchInvitation,
  type NavSection,
  type PublicProfile,
  type UserPrivateProfile,
  type UserProgression,
  type UserSettings,
} from './types/chess';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthScreen } from './components/AuthScreen';
import { Sidebar } from './components/Sidebar';
import { HomeDashboard } from './components/HomeDashboard';
import { PlayHub, type PlayHubTab } from './components/PlayHub';
import { MatchArena } from './components/MatchArena';
import { PassAndPlayArena, type PassAndPlayOptions } from './components/PassAndPlayArena';
import { PuzzlesView, type PuzzleMode } from './components/PuzzlesView';
import { CoachView } from './components/CoachView';
import { FriendsView } from './components/FriendsView';
import { LeaderboardView } from './components/LeaderboardView';
import { MatchHistoryView } from './components/MatchHistoryView';
import { ProfileView } from './components/ProfileView';
import { SettingsView } from './components/SettingsView';
import { ChessAudioProvider } from './contexts/ChessAudioContext';
import { playChessSound } from './lib/sound';

function ChessArenaApp() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [userProfile, setUserProfile] = useState<UserPrivateProfile | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  // Navigation & view state
  const [activeNav, setActiveNav] = useState<NavSection>('home');
  const [playTab, setPlayTab] = useState<PlayHubTab>('online');
  const [puzzleInitialMode, setPuzzleInitialMode] = useState<PuzzleMode>('library');
  const [activeMatchId, setActiveMatchId] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('chess_arena_active_match');
    } catch {
      return null;
    }
  });
  const [passAndPlayOptions, setPassAndPlayOptions] = useState<PassAndPlayOptions | null>(null);
  const [guestSoundEnabled, setGuestSoundEnabled] = useState(true);
  const [viewingProfileUid, setViewingProfileUid] = useState<string | null>(null);
  const [replayMatchTarget, setReplayMatchTarget] = useState<ChessMatch | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [localPrefs, setLocalPrefs] = useState<LocalPlayPreferences>(() => loadLocalPlayPreferences());
  const [claimingReward, setClaimingReward] = useState(false);

  // Real-time collections
  const [progression, setProgression] = useState<UserProgression | null>(null);
  const [matches, setMatches] = useState<ChessMatch[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [friends, setFriends] = useState<PublicProfile[]>([]);
  const [incomingFriendReqs, setIncomingFriendReqs] = useState<FriendRequest[]>([]);
  const [outgoingFriendReqs, setOutgoingFriendReqs] = useState<FriendRequest[]>([]);
  const [incomingInvites, setIncomingInvites] = useState<MatchInvitation[]>([]);
  const [outgoingInvites, setOutgoingInvites] = useState<MatchInvitation[]>([]);
  const [leaderboardPreview, setLeaderboardPreview] = useState<PublicProfile[]>([]);

  const [emailVerifyVersion, setEmailVerifyVersion] = useState(0);

  const handledJoinCodeRef = useRef<boolean>(false);
  const acceptedInviteIdsRef = useRef<Set<string>>(new Set());
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
      toastTimerRef.current = null;
    }, 4000);
  }, []);

  // Persist activeMatchId across page refreshes so players seamlessly reconnect
  useEffect(() => {
    try {
      if (activeMatchId) sessionStorage.setItem('chess_arena_active_match', activeMatchId);
      else sessionStorage.removeItem('chess_arena_active_match');
    } catch {
      // ignore
    }
  }, [activeMatchId]);

  // Apply Dark/Light theme class to <html>
  const effectiveSettings: UserSettings = userProfile?.settings || DEFAULT_USER_SETTINGS;
  useEffect(() => {
    const root = document.documentElement;
    if (effectiveSettings.theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [effectiveSettings.theme]);

  // 1. Firebase Auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setFirebaseUser(u);
      setAuthReady(true);
      if (!u) {
        setUserProfile(null);
        setProgression(null);
        setNeedsOnboarding(false);
        setMatches([]);
        setFriendships([]);
        setFriends([]);
        setIncomingFriendReqs([]);
        setOutgoingFriendReqs([]);
        setIncomingInvites([]);
        setOutgoingInvites([]);
      }
    });
    return () => unsub();
  }, []);

  // 2. User private profile listener (only when authenticated & verified)
  useEffect(() => {
    if (!firebaseUser || !firebaseUser.emailVerified) {
      setUserProfile(null);
      setNeedsOnboarding(false);
      return;
    }

    setProfileLoading(true);
    const userRef = doc(db, 'users', firebaseUser.uid);
    const unsub = onSnapshot(
      userRef,
      (snap) => {
        if (snap.exists()) {
          setUserProfile(snap.data() as UserPrivateProfile);
          setNeedsOnboarding(false);
        } else {
          setUserProfile(null);
          setNeedsOnboarding(true);
        }
        setProfileLoading(false);
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, `users/${firebaseUser.uid}`, false);
        setProfileLoading(false);
      }
    );

    return () => unsub();
  }, [firebaseUser, firebaseUser?.emailVerified, emailVerifyVersion]);

  // 3. Presence management (online / in_game / offline)
  useEffect(() => {
    if (!userProfile) return;
    const status = activeMatchId ? 'in_game' : 'online';
    void updateOnlinePresence(userProfile.uid, status);

    const interval = window.setInterval(() => {
      void updateOnlinePresence(userProfile.uid, activeMatchId ? 'in_game' : 'online');
    }, 45000);

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void updateOnlinePresence(userProfile.uid, 'offline');
      } else {
        void updateOnlinePresence(userProfile.uid, activeMatchId ? 'in_game' : 'online');
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [userProfile?.uid, activeMatchId]);

  // 4. Real-time subscriptions for Progression, Matches, Friendships, Friend Requests, Match Invitations, Leaderboard Preview
  useEffect(() => {
    if (!userProfile) return;
    const uid = userProfile.uid;

    // Ensure & subscribe to userProgression (Daily Rewards, Streaks, Rush/Vision Bests)
    void ensureUserProgression(uid);
    const unsubProgression = onSnapshot(
      doc(db, 'userProgression', uid),
      (snap) => {
        if (snap.exists()) {
          setProgression(snap.data() as UserProgression);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `userProgression/${uid}`, false)
    );

    // Matches involving current user
    const matchesQ = query(
      collection(db, 'matches'),
      where('participants', 'array-contains', uid),
      limit(60)
    );
    const unsubMatches = onSnapshot(
      matchesQ,
      (snap) => {
        const list = snap.docs
          .map((d) => d.data() as ChessMatch)
          .sort((a, b) => (b.updatedAt?.toMillis() ?? 0) - (a.updatedAt?.toMillis() ?? 0));
        setMatches(list);

        // Apply any unapplied completed match stats automatically (e.g. if opponent finished while away)
        for (const m of list) {
          if (m.status === 'completed') {
            const isW = m.whiteId === uid && !m.whiteStatsApplied;
            const isB = m.blackId === uid && !m.blackStatsApplied;
            if (isW || isB) {
              void applyMatchStatsForUser(m, uid);
            }
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'matches', false)
    );

    // Friendships
    const friendshipsQ = query(
      collection(db, 'friendships'),
      where('userIds', 'array-contains', uid),
      limit(100)
    );
    const unsubFriendships = onSnapshot(
      friendshipsQ,
      (snap) => {
        setFriendships(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Friendship, 'id'>) })));
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendships', false)
    );

    // Incoming Friend Requests
    const inReqQ = query(
      collection(db, 'friendRequests'),
      where('receiverId', '==', uid),
      limit(50)
    );
    const unsubInReqs = onSnapshot(
      inReqQ,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequest, 'id'>) }))
          .filter((r) => r.status === 'pending');
        setIncomingFriendReqs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendRequests', false)
    );

    // Outgoing Friend Requests
    const outReqQ = query(
      collection(db, 'friendRequests'),
      where('senderId', '==', uid),
      limit(50)
    );
    const unsubOutReqs = onSnapshot(
      outReqQ,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<FriendRequest, 'id'>) }))
          .filter((r) => r.status === 'pending');
        setOutgoingFriendReqs(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendRequests', false)
    );

    // Incoming Match Invitations
    const inInvQ = query(
      collection(db, 'matchInvitations'),
      where('receiverId', '==', uid),
      limit(30)
    );
    const unsubInInv = onSnapshot(
      inInvQ,
      (snap) => {
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<MatchInvitation, 'id'>) }))
          .filter((inv) => inv.status === 'pending');
        setIncomingInvites(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'matchInvitations', false)
    );

    // Outgoing Match Invitations (auto-open match when friend accepts!)
    const outInvQ = query(
      collection(db, 'matchInvitations'),
      where('senderId', '==', uid),
      limit(30)
    );
    const unsubOutInv = onSnapshot(
      outInvQ,
      (snap) => {
        const all = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MatchInvitation, 'id'>) }));
        setOutgoingInvites(all.filter((inv) => inv.status === 'pending'));

        for (const inv of all) {
          if (inv.status === 'accepted' && inv.matchId && !acceptedInviteIdsRef.current.has(inv.id)) {
            acceptedInviteIdsRef.current.add(inv.id);
            const ageMs = Date.now() - (inv.updatedAt?.toMillis() ?? Date.now());
            if (ageMs < 60000) {
              playChessSound('notify', userProfile.settings?.soundEnabled ?? true);
              showToast(`@${inv.receiverUsername} accepted your challenge!`);
              setActiveMatchId(inv.matchId);
            }
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'matchInvitations', false)
    );

    // Leaderboard preview
    void fetchLeaderboardProfiles()
      .then((list) => {
        setLeaderboardPreview(list.sort((a, b) => b.rating - a.rating).slice(0, 5));
      })
      .catch(() => {});

    return () => {
      unsubProgression();
      unsubMatches();
      unsubFriendships();
      unsubInReqs();
      unsubOutReqs();
      unsubInInv();
      unsubOutInv();
    };
  }, [userProfile?.uid, showToast]);

  // 5. Fetch live PublicProfiles for all current friends
  useEffect(() => {
    if (!userProfile) return;
    if (friendships.length === 0) {
      setFriends([]);
      return;
    }

    const friendUids = friendships.map((f) => (f.userA === userProfile.uid ? f.userB : f.userA));
    let cancelled = false;
    Promise.all(friendUids.map((id) => fetchPublicProfile(id))).then((profiles) => {
      if (cancelled) return;
      setFriends(
        profiles
          .filter((p): p is PublicProfile => p !== null)
          .sort((a, b) => {
            const score = (s: string) => (s === 'online' ? 2 : s === 'in_game' ? 1 : 0);
            return score(b.onlineStatus) - score(a.onlineStatus) || b.rating - a.rating;
          })
      );
    });

    return () => {
      cancelled = true;
    };
  }, [friendships, userProfile?.uid]);

  // 6. Auto-join private room if ?join=ROOMCODE is present in URL
  useEffect(() => {
    if (!userProfile || handledJoinCodeRef.current) return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('join');
    if (!code) return;

    handledJoinCodeRef.current = true;
    window.history.replaceState({}, '', window.location.pathname);

    void joinPrivateMatchByCode(code, userProfile)
      .then((matchId) => {
        showToast(`Joined private room ${code.toUpperCase()}!`);
        setActiveMatchId(matchId);
      })
      .catch((err) => {
        showToast(err instanceof Error ? err.message : 'Unable to join private room.');
      });
  }, [userProfile, showToast]);

  const activeMatches = useMemo(
    () => matches.filter((m) => m.status === 'active' || m.status === 'waiting'),
    [matches]
  );

  const completedMatches = useMemo(
    () => matches.filter((m) => m.status === 'completed'),
    [matches]
  );

  const handleLogout = async () => {
    if (userProfile) {
      await updateOnlinePresence(userProfile.uid, 'offline');
    }
    setActiveMatchId(null);
    setPassAndPlayOptions(null);
    await signOut(auth);
  };

  const handleAcceptInvitation = async (inv: MatchInvitation) => {
    if (!userProfile) return;
    try {
      const matchId = await acceptMatchInvitation(
        inv.id,
        {
          uid: inv.senderId,
          username: inv.senderUsername,
          displayName: inv.senderDisplayName,
          photoURL: inv.senderPhotoURL,
          rating: inv.senderRating,
        },
        userProfile,
        inv.senderColor
      );
      setActiveMatchId(matchId);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to accept invitation.');
    }
  };

  const handleRejectInvitation = async (invId: string) => {
    await rejectMatchInvitation(invId);
  };

  const handleQuickChallengeFriend = async (friend: PublicProfile) => {
    if (!userProfile) return;
    try {
      await sendMatchInvitation(userProfile, friend, 'random');
      showToast(`Challenge sent to @${friend.username}!`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Could not send challenge.');
    }
  };

  const handleUpdateSettings = async (next: UserSettings) => {
    if (!userProfile) return;
    await updateUserSettings(userProfile.uid, next);
  };

  const handleUpdateLocalPrefs = useCallback((next: LocalPlayPreferences) => {
    setLocalPrefs(next);
    saveLocalPlayPreferences(next);
  }, []);

  const handleClaimDailyReward = useCallback(async () => {
    if (!userProfile || claimingReward) return;
    setClaimingReward(true);
    try {
      const res = await claimDailyReward(userProfile.uid);
      if (res) {
        playChessSound('victory', userProfile.settings?.soundEnabled ?? true);
        showToast(`Day ${res.day} Reward claimed! +${res.xpEarned} XP · +${res.coinsEarned} Coins`);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to claim daily reward.');
    } finally {
      setClaimingReward(false);
    }
  }, [userProfile, claimingReward, showToast]);

  const handleToggleSound = () => {
    if (!userProfile) return;
    void handleUpdateSettings({
      ...userProfile.settings,
      soundEnabled: !userProfile.settings.soundEnabled,
    });
  };

  const handleSelectNav = (nav: NavSection) => {
    setActiveMatchId(null);
    setPassAndPlayOptions(null);
    if (nav === 'puzzles') {
      setPuzzleInitialMode('library');
    }
    setActiveNav(nav);
    if (nav === 'profile' && userProfile) {
      setViewingProfileUid(userProfile.uid);
    }
  };

  const handleViewProfile = (uid: string) => {
    setActiveMatchId(null);
    setPassAndPlayOptions(null);
    setViewingProfileUid(uid);
    setActiveNav('profile');
  };

  const handleReplayMatch = (match: ChessMatch) => {
    setActiveMatchId(null);
    setPassAndPlayOptions(null);
    setReplayMatchTarget(match);
    setActiveNav('history');
  };

  // Loading splash while Firebase Auth initializes
  if (!authReady || profileLoading) {
    return (
      <div className="min-h-screen bg-[#F6F7F9] dark:bg-[#12151A] flex flex-col items-center justify-center gap-3">
        <div className="w-11 h-11 rounded-xl bg-emerald-600 flex items-center justify-center text-white">
          <Crown className="w-6 h-6" />
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 font-medium">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
          Loading Chess Arena...
        </div>
      </div>
    );
  }

  // Guest 2 Players (Pass & Play) — playable immediately without signing in or usernames
  if (passAndPlayOptions && !userProfile) {
    const guestSettings: UserSettings = {
      ...DEFAULT_USER_SETTINGS,
      soundEnabled: guestSoundEnabled,
    };
    return (
      <ChessAudioProvider enabled={guestSoundEnabled}>
        <div className="min-h-screen bg-[#F6F7F9] dark:bg-[#12151A] text-slate-900 dark:text-slate-100">
          <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
            <PassAndPlayArena
              settings={guestSettings}
              localPrefs={localPrefs}
              options={passAndPlayOptions}
              onToggleSound={() => setGuestSoundEnabled((v) => !v)}
              onExit={() => setPassAndPlayOptions(null)}
            />
          </div>
        </div>
      </ChessAudioProvider>
    );
  }

  // Gate 1: Not signed in
  if (!firebaseUser) {
    return (
      <AuthScreen
        mode="auth"
        firebaseUser={null}
        onEmailVerifiedRefresh={async () => {}}
        onOnboardingComplete={async () => {}}
        onStartPassAndPlay={() =>
          setPassAndPlayOptions({
            whiteLabel: 'White',
            blackLabel: 'Black',
            autoFlip: true,
            showEvalBar: false,
          })
        }
      />
    );
  }

  // Gate 2: Email/Password user must verify email (Google sign-in is verified automatically)
  if (!firebaseUser.emailVerified) {
    return (
      <AuthScreen
        mode="verify_email"
        firebaseUser={firebaseUser}
        onEmailVerifiedRefresh={async () => {
          const targetUser = auth.currentUser ?? firebaseUser;
          await targetUser.reload();
          setFirebaseUser(auth.currentUser ?? targetUser);
          setEmailVerifyVersion((v) => v + 1);
        }}
        onOnboardingComplete={async () => {}}
      />
    );
  }

  // Gate 3: Unique username onboarding
  if (needsOnboarding || !userProfile) {
    return (
      <AuthScreen
        mode="onboarding"
        firebaseUser={firebaseUser}
        onEmailVerifiedRefresh={async () => {}}
        onOnboardingComplete={async () => {
          setNeedsOnboarding(false);
        }}
      />
    );
  }

  const firstActiveMatchId = activeMatches[0]?.matchId || null;

  return (
    <ChessAudioProvider enabled={effectiveSettings.soundEnabled}>
      <div className="min-h-screen bg-[#F6F7F9] dark:bg-[#12151A] text-slate-900 dark:text-slate-100">
      <Sidebar
        user={userProfile}
        progression={progression}
        activeNav={activeNav}
        onSelectNav={handleSelectNav}
        activeMatchId={activeMatchId ? null : firstActiveMatchId}
        onResumeActiveMatch={() => firstActiveMatchId && setActiveMatchId(firstActiveMatchId)}
        pendingFriendRequestsCount={incomingFriendReqs.length}
        pendingInvitesCount={incomingInvites.length}
        onLogout={() => void handleLogout()}
      />

      {/* Main Content Workspace */}
      <main className="lg:pl-64 pb-20 lg:pb-0 min-h-screen">
        <div className="max-w-[1360px] mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Global Non-Blocking Toast Notification */}
          {toast && (
            <div className="fixed top-4 right-4 z-50 max-w-sm bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-3 rounded-lg shadow-xl text-xs font-semibold">
              {toast}
            </div>
          )}

          {passAndPlayOptions ? (
            <PassAndPlayArena
              settings={effectiveSettings}
              localPrefs={localPrefs}
              options={passAndPlayOptions}
              onToggleSound={handleToggleSound}
              onExit={() => setPassAndPlayOptions(null)}
            />
          ) : activeMatchId ? (
            <MatchArena
              matchId={activeMatchId}
              user={userProfile}
              settings={effectiveSettings}
              localPrefs={localPrefs}
              onToggleSound={handleToggleSound}
              onExitMatch={() => setActiveMatchId(null)}
              onPlayAgain={() => {
                setActiveMatchId(null);
                setActiveNav('play');
              }}
            />
          ) : (
            <>
              {activeNav === 'home' && (
                <HomeDashboard
                  user={userProfile}
                  progression={progression}
                  claimingReward={claimingReward}
                  onClaimDailyReward={handleClaimDailyReward}
                  onOpenDailyPuzzle={() => {
                    setPuzzleInitialMode('daily');
                    setActiveNav('puzzles');
                  }}
                  activeMatches={activeMatches}
                  completedMatches={completedMatches}
                  friends={friends}
                  leaderboardPreview={leaderboardPreview}
                  incomingInvitations={incomingInvites}
                  onNavigate={handleSelectNav}
                  onOpenPlayTab={(t) => {
                    setPlayTab(t);
                    setActiveNav('play');
                  }}
                  onStartPassAndPlay={() =>
                    setPassAndPlayOptions({
                      whiteLabel: 'White',
                      blackLabel: 'Black',
                      autoFlip: true,
                      showEvalBar: false,
                    })
                  }
                  onOpenMatch={(id) => setActiveMatchId(id)}
                  onReplayMatch={handleReplayMatch}
                  onViewProfile={handleViewProfile}
                  onQuickChallengeFriend={(f) => void handleQuickChallengeFriend(f)}
                  onAcceptInvitation={(inv) => void handleAcceptInvitation(inv)}
                  onRejectInvitation={(id) => void handleRejectInvitation(id)}
                />
              )}

              {activeNav === 'play' && (
                <PlayHub
                  user={userProfile}
                  initialTab={playTab}
                  friends={friends}
                  incomingInvitations={incomingInvites}
                  outgoingInvitations={outgoingInvites}
                  onMatchStarted={(id) => setActiveMatchId(id)}
                  onStartPassAndPlay={(opts) => setPassAndPlayOptions(opts)}
                  onAcceptInvitation={(inv) => void handleAcceptInvitation(inv)}
                  onRejectInvitation={(id) => void handleRejectInvitation(id)}
                />
              )}

              {activeNav === 'puzzles' && (
                <PuzzlesView
                  user={userProfile}
                  settings={effectiveSettings}
                  localPrefs={localPrefs}
                  progression={progression}
                  initialMode={puzzleInitialMode}
                />
              )}

              {activeNav === 'coach' && (
                <CoachView
                  user={userProfile}
                  settings={effectiveSettings}
                  localPrefs={localPrefs}
                  progression={progression}
                />
              )}

              {activeNav === 'friends' && (
                <FriendsView
                  user={userProfile}
                  friends={friends}
                  incomingRequests={incomingFriendReqs}
                  outgoingRequests={outgoingFriendReqs}
                  onViewProfile={handleViewProfile}
                  onChallengeFriend={(f) => void handleQuickChallengeFriend(f)}
                />
              )}

              {activeNav === 'leaderboard' && (
                <LeaderboardView currentUid={userProfile.uid} onViewProfile={handleViewProfile} />
              )}

              {activeNav === 'history' && (
                <MatchHistoryView
                  currentUid={userProfile.uid}
                  matches={completedMatches}
                  settings={effectiveSettings}
                  localPrefs={localPrefs}
                  initialReplayMatch={replayMatchTarget}
                  onClearInitialReplay={() => setReplayMatchTarget(null)}
                  onStartNewMatch={() => setActiveNav('play')}
                />
              )}

              {activeNav === 'profile' && (
                <ProfileView
                  currentUser={userProfile}
                  progression={progression}
                  viewingUid={viewingProfileUid || userProfile.uid}
                  myCompletedMatches={completedMatches}
                  isFriend={friends.some((f) => f.uid === (viewingProfileUid || userProfile.uid))}
                  onBackToMyProfile={() => setViewingProfileUid(userProfile.uid)}
                  onReplayMatch={handleReplayMatch}
                  onChallengePlayer={(p) => void handleQuickChallengeFriend(p)}
                  onOpenSettings={() => setActiveNav('settings')}
                />
              )}

              {activeNav === 'settings' && (
                <SettingsView
                  user={userProfile}
                  settings={effectiveSettings}
                  localPrefs={localPrefs}
                  onUpdateSettings={handleUpdateSettings}
                  onUpdateLocalPrefs={handleUpdateLocalPrefs}
                  onOpenProfile={() => {
                    setViewingProfileUid(userProfile.uid);
                    setActiveNav('profile');
                  }}
                  onLogout={() => void handleLogout()}
                />
              )}
            </>
          )}
        </div>
      </main>
    </div>
    </ChessAudioProvider>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ChessArenaApp />
    </ErrorBoundary>
  );
}
