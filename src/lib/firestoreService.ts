import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { Chess } from 'chess.js';
import { db, handleFirestoreError, OperationType } from './firebase';
import { calculateEloDeltas, validateMoveAuthoritatively } from './chessEngine';
import { getChess960Position, randomChess960Id, STANDARD_START_FEN } from './chess960';
import { computeNextRewardClaim, getLocalDateKey, getYesterdayDateKey } from './rewardsAndStreaks';
import {
  DEFAULT_USER_SETTINGS,
  type ChessMatch,
  type ComputerBot,
  type MatchMode,
  type MatchVariant,
  type PublicProfile,
  type UserPrivateProfile,
  type UserProgression,
  type UserSettings,
} from '../types/chess';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,24}$/;

export function validateUsernameFormat(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < 3) return 'Username must be at least 3 characters.';
  if (trimmed.length > 24) return 'Username must be at most 24 characters.';
  if (!USERNAME_REGEX.test(trimmed)) {
    return 'Use only letters, numbers, and underscores (no spaces or emails).';
  }
  return null;
}

export function sanitizeDisplayName(raw: string): string {
  const cleaned = raw.trim().slice(0, 40);
  return cleaned.length > 0 ? cleaned : 'Chess Player';
}

export function sanitizePhotoURL(raw: string): string {
  const trimmed = raw.trim().slice(0, 500);
  if (!trimmed) return '';
  if (
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/src/assets/')
  ) {
    return trimmed;
  }
  return '';
}

export async function isUsernameAvailable(username: string): Promise<boolean> {
  const lower = username.trim().toLowerCase();
  if (validateUsernameFormat(username)) return false;
  const path = `usernames/${lower}`;
  try {
    const snap = await getDoc(doc(db, 'usernames', lower));
    return !snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return false;
  }
}

export async function createUserProfileAtomic(params: {
  uid: string;
  username: string;
  displayName: string;
  email: string;
  photoURL: string;
}): Promise<void> {
  const username = params.username.trim();
  const usernameLower = username.toLowerCase();
  const formatErr = validateUsernameFormat(username);
  if (formatErr) throw new Error(formatErr);

  const displayName = sanitizeDisplayName(params.displayName);
  const photoURL = sanitizePhotoURL(params.photoURL);
  const email = params.email.trim().slice(0, 254);

  const usernameRef = doc(db, 'usernames', usernameLower);
  const userRef = doc(db, 'users', params.uid);
  const publicRef = doc(db, 'publicProfiles', params.uid);

  try {
    await runTransaction(db, async (tx) => {
      const existingUsername = await tx.get(usernameRef);
      if (existingUsername.exists()) {
        throw new Error('That username is already taken. Please choose another.');
      }
      const existingUser = await tx.get(userRef);
      if (existingUser.exists()) {
        throw new Error('Profile already exists for this account.');
      }

      const now = serverTimestamp();

      tx.set(usernameRef, {
        uid: params.uid,
        username,
        createdAt: now,
      });

      tx.set(userRef, {
        uid: params.uid,
        username,
        usernameLower,
        displayName,
        email,
        photoURL,
        rating: 1200,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        puzzlesSolved: 0,
        puzzleRating: 1000,
        solvedPuzzleIds: [],
        settings: DEFAULT_USER_SETTINGS,
        onlineStatus: 'online',
        lastSeen: now,
        createdAt: now,
        updatedAt: now,
      });

      tx.set(publicRef, {
        uid: params.uid,
        username,
        usernameLower,
        displayName,
        photoURL,
        rating: 1200,
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        puzzlesSolved: 0,
        onlineStatus: 'online',
        isPublic: true,
        lastSeen: now,
        createdAt: now,
        updatedAt: now,
      });
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('already taken') || error.message.includes('already exists'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `users/${params.uid}`);
  }
}

export async function updateUserProfile(params: {
  uid: string;
  currentUsernameLower: string;
  newUsername: string;
  displayName: string;
  photoURL: string;
}): Promise<void> {
  const username = params.newUsername.trim();
  const usernameLower = username.toLowerCase();
  const formatErr = validateUsernameFormat(username);
  if (formatErr) throw new Error(formatErr);

  const displayName = sanitizeDisplayName(params.displayName);
  const photoURL = sanitizePhotoURL(params.photoURL);
  const usernameChanged = usernameLower !== params.currentUsernameLower;

  const userRef = doc(db, 'users', params.uid);
  const publicRef = doc(db, 'publicProfiles', params.uid);

  try {
    await runTransaction(db, async (tx) => {
      if (usernameChanged) {
        const newUsernameRef = doc(db, 'usernames', usernameLower);
        const existing = await tx.get(newUsernameRef);
        if (existing.exists()) {
          throw new Error('That username is already taken.');
        }
        const oldUsernameRef = doc(db, 'usernames', params.currentUsernameLower);
        tx.delete(oldUsernameRef);
        tx.set(newUsernameRef, {
          uid: params.uid,
          username,
          createdAt: serverTimestamp(),
        });
      }

      const now = serverTimestamp();
      const patch = {
        username,
        usernameLower,
        displayName,
        photoURL,
        updatedAt: now,
      };
      tx.update(userRef, patch);
      tx.update(publicRef, patch);
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('already taken')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `users/${params.uid}`);
  }
}

export async function updateUserSettings(uid: string, settings: UserSettings): Promise<void> {
  const path = `users/${uid}`;
  try {
    await updateDoc(doc(db, 'users', uid), {
      settings,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function updateOnlinePresence(
  uid: string,
  onlineStatus: 'online' | 'offline' | 'in_game'
): Promise<void> {
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    batch.update(doc(db, 'users', uid), {
      onlineStatus,
      lastSeen: now,
      updatedAt: now,
    });
    batch.update(doc(db, 'publicProfiles', uid), {
      onlineStatus,
      lastSeen: now,
      updatedAt: now,
    });
    await batch.commit();
  } catch (error) {
    // Presence updates are non-fatal if user signed out mid-flight
    handleFirestoreError(error, OperationType.UPDATE, `publicProfiles/${uid}`, false);
  }
}

export async function searchUsersByUsername(term: string, currentUid: string): Promise<PublicProfile[]> {
  const clean = term.trim().toLowerCase();
  if (!clean) return [];
  const path = 'publicProfiles';
  try {
    const q = query(
      collection(db, 'publicProfiles'),
      where('isPublic', '==', true),
      limit(100)
    );
    const snap = await getDocs(q);
    const results: PublicProfile[] = [];
    snap.forEach((d) => {
      const profile = d.data() as PublicProfile;
      if (
        profile.uid !== currentUid &&
        (profile.usernameLower.includes(clean) || profile.displayName.toLowerCase().includes(clean))
      ) {
        results.push(profile);
      }
    });
    return results.sort((a, b) => b.rating - a.rating).slice(0, 20);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

export async function fetchPublicProfile(uid: string): Promise<PublicProfile | null> {
  const path = `publicProfiles/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'publicProfiles', uid));
    return snap.exists() ? (snap.data() as PublicProfile) : null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, path);
    return null;
  }
}

export async function fetchLeaderboardProfiles(): Promise<PublicProfile[]> {
  const path = 'publicProfiles';
  try {
    const q = query(
      collection(db, 'publicProfiles'),
      where('isPublic', '==', true),
      limit(200)
    );
    const snap = await getDocs(q);
    const list: PublicProfile[] = [];
    snap.forEach((d) => list.push(d.data() as PublicProfile));
    return list;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

// ============================================================================
// FRIENDS SYSTEM
// ============================================================================
export function makeFriendshipId(uidA: string, uidB: string): { id: string; userA: string; userB: string } {
  const [userA, userB] = [uidA, uidB].sort();
  return { id: `${userA}_${userB}`, userA, userB };
}

export async function sendFriendRequest(sender: UserPrivateProfile, receiver: PublicProfile): Promise<void> {
  const reqId = `${sender.uid}_${receiver.uid}`;
  const reverseReqId = `${receiver.uid}_${sender.uid}`;
  const friendship = makeFriendshipId(sender.uid, receiver.uid);

  const path = `friendRequests/${reqId}`;
  try {
    const [existingFriend, existingReq, existingReverse] = await Promise.all([
      getDoc(doc(db, 'friendships', friendship.id)),
      getDoc(doc(db, 'friendRequests', reqId)),
      getDoc(doc(db, 'friendRequests', reverseReqId)),
    ]);

    if (existingFriend.exists()) {
      throw new Error(`You are already friends with ${receiver.username}.`);
    }
    if (existingReq.exists() && existingReq.data().status === 'pending') {
      throw new Error('Friend request already sent.');
    }
    if (existingReverse.exists() && existingReverse.data().status === 'pending') {
      throw new Error(`${receiver.username} has already sent you a friend request — check Incoming Requests.`);
    }

    const now = serverTimestamp();
    await setDoc(doc(db, 'friendRequests', reqId), {
      senderId: sender.uid,
      senderUsername: sender.username,
      senderDisplayName: sender.displayName,
      senderPhotoURL: sender.photoURL,
      senderRating: sender.rating,
      receiverId: receiver.uid,
      receiverUsername: receiver.username,
      receiverDisplayName: receiver.displayName,
      receiverPhotoURL: receiver.photoURL,
      receiverRating: receiver.rating,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    if (error instanceof Error && (error.message.includes('already') || error.message.includes('Incoming'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function acceptFriendRequest(requestId: string, senderId: string, receiverId: string): Promise<void> {
  const { id: friendshipId, userA, userB } = makeFriendshipId(senderId, receiverId);
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    batch.update(doc(db, 'friendRequests', requestId), {
      status: 'accepted',
      updatedAt: now,
    });
    batch.set(doc(db, 'friendships', friendshipId), {
      userIds: [userA, userB],
      userA,
      userB,
      createdAt: now,
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `friendships/${friendshipId}`);
  }
}

export async function rejectFriendRequest(requestId: string): Promise<void> {
  const path = `friendRequests/${requestId}`;
  try {
    await updateDoc(doc(db, 'friendRequests', requestId), {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cancelFriendRequest(requestId: string): Promise<void> {
  const path = `friendRequests/${requestId}`;
  try {
    await deleteDoc(doc(db, 'friendRequests', requestId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function removeFriend(uidA: string, uidB: string): Promise<void> {
  const { id: friendshipId } = makeFriendshipId(uidA, uidB);
  const path = `friendships/${friendshipId}`;
  try {
    await deleteDoc(doc(db, 'friendships', friendshipId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

// ============================================================================
// MATCHES, MATCHMAKING, INVITATIONS, PRIVATE ROOMS & REAL-TIME MOVES
// ============================================================================
function generateMatchId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let suffix = '';
  for (let i = 0; i < 10; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `m_${Date.now()}_${suffix}`;
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const INITIAL_FEN = STANDARD_START_FEN;

function resolveVariantStart(variant?: MatchVariant, explicitFen?: string): { variant: MatchVariant; initialFen: string } {
  if (variant === 'chess960') {
    const fen = explicitFen && explicitFen.trim() ? explicitFen.trim() : getChess960Position(randomChess960Id()).fen;
    return { variant: 'chess960', initialFen: fen };
  }
  return { variant: 'standard', initialFen: INITIAL_FEN };
}

function buildInitialMatchDoc(params: {
  matchId: string;
  mode: MatchMode;
  variant?: MatchVariant;
  initialFen?: string;
  roomCode?: string;
  white: { id: string; username: string; displayName: string; photoURL: string; rating: number };
  black: { id: string; username: string; displayName: string; photoURL: string; rating: number };
  participants: string[];
  status: 'waiting' | 'active';
}) {
  const now = serverTimestamp();
  const { variant, initialFen } = resolveVariantStart(params.variant, params.initialFen);
  return {
    matchId: params.matchId,
    mode: params.mode,
    variant,
    initialFen,
    roomCode: params.roomCode || '',
    whiteId: params.white.id,
    whiteUsername: params.white.username,
    whiteDisplayName: params.white.displayName,
    whitePhotoURL: params.white.photoURL,
    whiteRating: params.white.rating,
    blackId: params.black.id,
    blackUsername: params.black.username,
    blackDisplayName: params.black.displayName,
    blackPhotoURL: params.black.photoURL,
    blackRating: params.black.rating,
    participants: params.participants,
    fen: initialFen,
    pgn: '',
    moves: [],
    lastMoveFrom: '',
    lastMoveTo: '',
    turn: 'w',
    moveCount: 0,
    status: params.status,
    result: '',
    winnerId: '',
    resultReason: '',
    drawOfferBy: '',
    whiteRatingDelta: 0,
    blackRatingDelta: 0,
    whiteStatsApplied: false,
    blackStatsApplied: false,
    whiteLastSeen: now,
    blackLastSeen: now,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export async function enterMatchmakingQueue(
  user: UserPrivateProfile,
  options?: { variant?: MatchVariant; initialFen?: string }
): Promise<{ matchedMatchId: string | null }> {
  const path = 'matchmakingQueue';
  try {
    // 1. Check for an existing waiting real opponent
    const q = query(
      collection(db, 'matchmakingQueue'),
      where('isOpen', '==', true),
      where('status', '==', 'waiting'),
      limit(15)
    );
    const snap = await getDocs(q);
    const candidates = snap.docs
      .map((d) => d.data() as { uid: string; username: string; displayName: string; photoURL: string; rating: number })
      .filter((c) => c.uid !== user.uid)
      .sort((a, b) => Math.abs(a.rating - user.rating) - Math.abs(b.rating - user.rating));

    for (const opponent of candidates) {
      const oppQueueRef = doc(db, 'matchmakingQueue', opponent.uid);
      const matchId = generateMatchId();
      const matchRef = doc(db, 'matches', matchId);

      const paired = await runTransaction(db, async (tx) => {
        const oppSnap = await tx.get(oppQueueRef);
        if (!oppSnap.exists()) return false;
        const oppData = oppSnap.data();
        if (oppData.status !== 'waiting' || oppData.isOpen !== true) return false;

        const now = serverTimestamp();
        const assignUserWhite = Math.random() < 0.5;
        const white = assignUserWhite
          ? { id: user.uid, username: user.username, displayName: user.displayName, photoURL: user.photoURL, rating: user.rating }
          : { id: opponent.uid, username: opponent.username, displayName: opponent.displayName, photoURL: opponent.photoURL, rating: opponent.rating };
        const black = assignUserWhite
          ? { id: opponent.uid, username: opponent.username, displayName: opponent.displayName, photoURL: opponent.photoURL, rating: opponent.rating }
          : { id: user.uid, username: user.username, displayName: user.displayName, photoURL: user.photoURL, rating: user.rating };

        tx.set(
          matchRef,
          buildInitialMatchDoc({
            matchId,
            mode: 'online',
            variant: options?.variant,
            initialFen: options?.initialFen,
            white,
            black,
            participants: [user.uid, opponent.uid],
            status: 'active',
          })
        );

        tx.update(oppQueueRef, {
          status: 'matched',
          isOpen: false,
          matchId,
          updatedAt: now,
        });

        return true;
      });

      if (paired) {
        return { matchedMatchId: matchId };
      }
    }

    // 2. No waiting opponent found — add current user to real-time queue
    const now = serverTimestamp();
    await setDoc(doc(db, 'matchmakingQueue', user.uid), {
      uid: user.uid,
      username: user.username,
      displayName: user.displayName,
      photoURL: user.photoURL,
      rating: user.rating,
      status: 'waiting',
      isOpen: true,
      matchId: '',
      createdAt: now,
      updatedAt: now,
    });

    return { matchedMatchId: null };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
    return { matchedMatchId: null };
  }
}

export async function leaveMatchmakingQueue(uid: string): Promise<void> {
  const path = `matchmakingQueue/${uid}`;
  try {
    await deleteDoc(doc(db, 'matchmakingQueue', uid));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path, false);
  }
}

export async function createPrivateMatch(
  host: UserPrivateProfile,
  hostColor: 'white' | 'black' | 'random',
  options?: { variant?: MatchVariant; initialFen?: string }
): Promise<{ matchId: string; roomCode: string }> {
  const matchId = generateMatchId();
  const roomCode = generateRoomCode();
  const resolvedColor = hostColor === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : hostColor;
  const hostInfo = {
    id: host.uid,
    username: host.username,
    displayName: host.displayName,
    photoURL: host.photoURL,
    rating: host.rating,
  };
  const emptySeat = {
    id: '',
    username: 'Waiting...',
    displayName: 'Waiting for opponent',
    photoURL: '',
    rating: 1200,
  };

  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.set(
      doc(db, 'matches', matchId),
      buildInitialMatchDoc({
        matchId,
        mode: 'private',
        variant: options?.variant,
        initialFen: options?.initialFen,
        roomCode,
        white: resolvedColor === 'white' ? hostInfo : emptySeat,
        black: resolvedColor === 'black' ? hostInfo : emptySeat,
        participants: [host.uid],
        status: 'waiting',
      })
    );

    batch.set(doc(db, 'privateRooms', roomCode), {
      roomCode,
      matchId,
      hostId: host.uid,
      hostUsername: host.username,
      status: 'open',
      createdAt: now,
      updatedAt: now,
    });

    await batch.commit();
    return { matchId, roomCode };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `privateRooms/${roomCode}`);
    throw error;
  }
}

export async function joinPrivateMatchByCode(rawCode: string, guest: UserPrivateProfile): Promise<string> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new Error('Room code must be 6 letters or digits.');
  }

  const roomRef = doc(db, 'privateRooms', code);
  try {
    const roomSnap = await getDoc(roomRef);
    if (!roomSnap.exists()) {
      throw new Error('Private room not found. Check the code and try again.');
    }
    const roomData = roomSnap.data() as { matchId: string; hostId: string; status: string };
    if (roomData.hostId === guest.uid) {
      return roomData.matchId;
    }
    if (roomData.status !== 'open') {
      throw new Error('This private room has already started or been cancelled.');
    }

    const matchRef = doc(db, 'matches', roomData.matchId);
    await runTransaction(db, async (tx) => {
      const mSnap = await tx.get(matchRef);
      const rSnap = await tx.get(roomRef);
      if (!mSnap.exists() || !rSnap.exists()) {
        throw new Error('Match room no longer exists.');
      }
      const mData = mSnap.data() as ChessMatch;
      if (mData.status !== 'waiting') {
        throw new Error('This match is no longer waiting for a player.');
      }

      const now = serverTimestamp();
      const fillWhite = mData.whiteId === '';

      tx.update(matchRef, {
        ...(fillWhite
          ? {
              whiteId: guest.uid,
              whiteUsername: guest.username,
              whiteDisplayName: guest.displayName,
              whitePhotoURL: guest.photoURL,
              whiteRating: guest.rating,
              whiteLastSeen: now,
            }
          : {
              blackId: guest.uid,
              blackUsername: guest.username,
              blackDisplayName: guest.displayName,
              blackPhotoURL: guest.photoURL,
              blackRating: guest.rating,
              blackLastSeen: now,
            }),
        participants: [...mData.participants, guest.uid],
        status: 'active',
        updatedAt: now,
      });

      tx.update(roomRef, {
        status: 'joined',
        updatedAt: now,
      });
    });

    return roomData.matchId;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Room code') ||
        error.message.includes('not found') ||
        error.message.includes('already started') ||
        error.message.includes('no longer'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `privateRooms/${code}`);
    throw error;
  }
}

export async function cancelPrivateMatch(matchId: string, roomCode: string): Promise<void> {
  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    batch.update(doc(db, 'matches', matchId), {
      status: 'abandoned',
      updatedAt: now,
    });
    if (roomCode && /^[A-Z0-9]{6}$/.test(roomCode)) {
      batch.update(doc(db, 'privateRooms', roomCode), {
        status: 'cancelled',
        updatedAt: now,
      });
    }
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`);
  }
}

export async function sendMatchInvitation(
  sender: UserPrivateProfile,
  receiver: PublicProfile,
  senderColor: 'white' | 'black' | 'random'
): Promise<string> {
  const invId = `inv_${Date.now()}_${sender.uid.slice(0, 6)}`;
  const path = `matchInvitations/${invId}`;
  try {
    const now = serverTimestamp();
    await setDoc(doc(db, 'matchInvitations', invId), {
      senderId: sender.uid,
      senderUsername: sender.username,
      senderDisplayName: sender.displayName,
      senderPhotoURL: sender.photoURL,
      senderRating: sender.rating,
      receiverId: receiver.uid,
      receiverUsername: receiver.username,
      receiverDisplayName: receiver.displayName,
      matchId: '',
      senderColor,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    });
    return invId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export async function acceptMatchInvitation(
  invitationId: string,
  sender: { uid: string; username: string; displayName: string; photoURL: string; rating: number },
  receiver: UserPrivateProfile,
  senderColor: 'white' | 'black' | 'random',
  options?: { variant?: MatchVariant; initialFen?: string }
): Promise<string> {
  const matchId = generateMatchId();
  const senderPlaysWhite = senderColor === 'white' ? true : senderColor === 'black' ? false : Math.random() < 0.5;
  const senderInfo = {
    id: sender.uid,
    username: sender.username,
    displayName: sender.displayName,
    photoURL: sender.photoURL,
    rating: sender.rating,
  };
  const receiverInfo = {
    id: receiver.uid,
    username: receiver.username,
    displayName: receiver.displayName,
    photoURL: receiver.photoURL,
    rating: receiver.rating,
  };

  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();

    batch.set(
      doc(db, 'matches', matchId),
      buildInitialMatchDoc({
        matchId,
        mode: 'friend',
        variant: options?.variant,
        initialFen: options?.initialFen,
        white: senderPlaysWhite ? senderInfo : receiverInfo,
        black: senderPlaysWhite ? receiverInfo : senderInfo,
        participants: [sender.uid, receiver.uid],
        status: 'active',
      })
    );

    batch.update(doc(db, 'matchInvitations', invitationId), {
      status: 'accepted',
      matchId,
      updatedAt: now,
    });

    await batch.commit();
    return matchId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `matchInvitations/${invitationId}`);
    throw error;
  }
}

export async function rejectMatchInvitation(invitationId: string): Promise<void> {
  const path = `matchInvitations/${invitationId}`;
  try {
    await updateDoc(doc(db, 'matchInvitations', invitationId), {
      status: 'rejected',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function cancelMatchInvitation(invitationId: string): Promise<void> {
  const path = `matchInvitations/${invitationId}`;
  try {
    await updateDoc(doc(db, 'matchInvitations', invitationId), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function createComputerMatch(
  player: UserPrivateProfile,
  bot: ComputerBot,
  playerColor: 'white' | 'black' | 'random',
  options?: { variant?: MatchVariant; initialFen?: string }
): Promise<string> {
  const matchId = generateMatchId();
  const playWhite = playerColor === 'white' ? true : playerColor === 'black' ? false : Math.random() < 0.5;
  const playerInfo = {
    id: player.uid,
    username: player.username,
    displayName: player.displayName,
    photoURL: player.photoURL,
    rating: player.rating,
  };
  const botInfo = {
    id: bot.id,
    username: bot.username,
    displayName: `${bot.name} (Bot)`,
    photoURL: bot.avatar,
    rating: bot.rating,
  };

  const path = `matches/${matchId}`;
  try {
    await setDoc(
      doc(db, 'matches', matchId),
      buildInitialMatchDoc({
        matchId,
        mode: 'computer',
        variant: options?.variant,
        initialFen: options?.initialFen,
        white: playWhite ? playerInfo : botInfo,
        black: playWhite ? botInfo : playerInfo,
        participants: [player.uid],
        status: 'active',
      })
    );
    return matchId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export async function submitValidatedMove(params: {
  match: ChessMatch;
  actorUid: string;
  from: string;
  to: string;
  promotion?: string;
}): Promise<{ san: string; inCheck: boolean; isGameOver: boolean }> {
  const { match, actorUid, from, to, promotion } = params;
  const isRated = match.mode !== 'computer';

  const validated = await validateMoveAuthoritatively({
    fen: match.fen,
    initialFen: match.initialFen,
    moves: match.moves,
    from,
    to,
    promotion,
    whiteRating: match.whiteRating,
    blackRating: match.blackRating,
    isRated,
  });

  if (!validated.valid) {
    throw new Error(validated.error || 'Illegal chess move.');
  }

  const matchRef = doc(db, 'matches', match.matchId);
  try {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(matchRef);
      if (!snap.exists()) throw new Error('Match not found.');
      const current = snap.data() as ChessMatch;

      if (current.status !== 'active') {
        throw new Error('This match is no longer active.');
      }
      if (current.moveCount !== match.moveCount) {
        throw new Error('Board state updated concurrently. Syncing latest move.');
      }
      if (current.mode !== 'computer') {
        if (current.turn === 'w' && current.whiteId !== actorUid) {
          throw new Error('It is White’s turn.');
        }
        if (current.turn === 'b' && current.blackId !== actorUid) {
          throw new Error('It is Black’s turn.');
        }
      }

      const now = serverTimestamp();
      const winnerId =
        validated.result === '1-0' ? current.whiteId : validated.result === '0-1' ? current.blackId : '';

      tx.update(matchRef, {
        fen: validated.fen,
        pgn: validated.pgn.slice(0, 20000),
        moves: validated.moves.slice(0, 500),
        lastMoveFrom: validated.from,
        lastMoveTo: validated.to,
        turn: validated.turn,
        moveCount: current.moveCount + 1,
        status: validated.isGameOver ? 'completed' : 'active',
        result: validated.result,
        winnerId,
        resultReason: validated.resultReason,
        drawOfferBy: '',
        whiteRatingDelta: validated.whiteRatingDelta,
        blackRatingDelta: validated.blackRatingDelta,
        completedAt: validated.isGameOver ? now : null,
        whiteLastSeen: actorUid === current.whiteId ? now : current.whiteLastSeen,
        blackLastSeen: actorUid === current.blackId ? now : current.blackLastSeen,
        updatedAt: now,
      });
    });

    return { san: validated.san, inCheck: validated.inCheck, isGameOver: validated.isGameOver };
  } catch (error) {
    if (error instanceof Error && (error.message.includes('turn') || error.message.includes('concurrently'))) {
      throw error;
    }
    handleFirestoreError(error, OperationType.UPDATE, `matches/${match.matchId}`);
    throw error;
  }
}

export async function offerDraw(matchId: string, uid: string): Promise<void> {
  const path = `matches/${matchId}`;
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      drawOfferBy: uid,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function declineDraw(matchId: string): Promise<void> {
  const path = `matches/${matchId}`;
  try {
    await updateDoc(doc(db, 'matches', matchId), {
      drawOfferBy: '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function acceptDraw(match: ChessMatch): Promise<void> {
  const path = `matches/${match.matchId}`;
  const isRated = match.mode !== 'computer';
  const deltas = isRated
    ? calculateEloDeltas(match.whiteRating, match.blackRating, '1/2-1/2')
    : { whiteRatingDelta: 0, blackRatingDelta: 0 };

  try {
    const now = serverTimestamp();
    await updateDoc(doc(db, 'matches', match.matchId), {
      status: 'completed',
      result: '1/2-1/2',
      winnerId: '',
      resultReason: 'draw_agreement',
      drawOfferBy: '',
      whiteRatingDelta: deltas.whiteRatingDelta,
      blackRatingDelta: deltas.blackRatingDelta,
      completedAt: now,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function resignMatch(match: ChessMatch, resigningUid: string): Promise<void> {
  const path = `matches/${match.matchId}`;
  const resigningIsWhite = match.whiteId === resigningUid;
  const result: '1-0' | '0-1' = resigningIsWhite ? '0-1' : '1-0';
  const winnerId = resigningIsWhite ? match.blackId : match.whiteId;
  const isRated = match.mode !== 'computer';
  const deltas = isRated
    ? calculateEloDeltas(match.whiteRating, match.blackRating, result)
    : { whiteRatingDelta: 0, blackRatingDelta: 0 };

  try {
    const now = serverTimestamp();
    await updateDoc(doc(db, 'matches', match.matchId), {
      status: 'completed',
      result,
      winnerId,
      resultReason: 'resignation',
      drawOfferBy: '',
      whiteRatingDelta: deltas.whiteRatingDelta,
      blackRatingDelta: deltas.blackRatingDelta,
      completedAt: now,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function sendMatchHeartbeat(matchId: string, side: 'white' | 'black'): Promise<void> {
  try {
    const now = serverTimestamp();
    await updateDoc(doc(db, 'matches', matchId), {
      ...(side === 'white' ? { whiteLastSeen: now } : { blackLastSeen: now }),
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${matchId}`, false);
  }
}

export async function applyMatchStatsForUser(match: ChessMatch, uid: string): Promise<void> {
  if (match.status !== 'completed') return;
  const isWhite = match.whiteId === uid;
  const isBlack = match.blackId === uid;
  if (!isWhite && !isBlack) return;
  if ((isWhite && match.whiteStatsApplied) || (isBlack && match.blackStatsApplied)) return;

  const matchRef = doc(db, 'matches', match.matchId);
  const userRef = doc(db, 'users', uid);
  const publicRef = doc(db, 'publicProfiles', uid);

  try {
    await runTransaction(db, async (tx) => {
      const [mSnap, uSnap, pSnap] = await Promise.all([tx.get(matchRef), tx.get(userRef), tx.get(publicRef)]);
      if (!mSnap.exists() || !uSnap.exists() || !pSnap.exists()) return;

      const m = mSnap.data() as ChessMatch;
      if (m.status !== 'completed') return;
      if ((isWhite && m.whiteStatsApplied) || (isBlack && m.blackStatsApplied)) return;

      const u = uSnap.data() as UserPrivateProfile;
      const delta = isWhite ? m.whiteRatingDelta : m.blackRatingDelta;
      const newRating = Math.min(3500, Math.max(100, u.rating + delta));

      const isWin = m.winnerId === uid;
      const isDraw = m.result === '1/2-1/2';
      const isLoss = !isWin && !isDraw;

      const nextStats = {
        rating: newRating,
        gamesPlayed: u.gamesPlayed + 1,
        wins: u.wins + (isWin ? 1 : 0),
        losses: u.losses + (isLoss ? 1 : 0),
        draws: u.draws + (isDraw ? 1 : 0),
        updatedAt: serverTimestamp(),
      };

      tx.update(matchRef, {
        ...(isWhite ? { whiteStatsApplied: true } : { blackStatsApplied: true }),
        updatedAt: serverTimestamp(),
      });
      tx.update(userRef, nextStats);
      tx.update(publicRef, nextStats);
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `matches/${match.matchId}`, false);
  }
}

export async function recordPuzzleSolved(
  user: UserPrivateProfile,
  puzzleId: string,
  puzzleRating: number
): Promise<boolean> {
  if (user.solvedPuzzleIds.includes(puzzleId)) {
    return false;
  }
  const nextSolvedIds = [...user.solvedPuzzleIds, puzzleId].slice(0, 200);
  const ratingGain = puzzleRating >= user.puzzleRating ? 18 : 10;
  const nextPuzzleRating = Math.min(3500, user.puzzleRating + ratingGain);

  try {
    const batch = writeBatch(db);
    const now = serverTimestamp();
    batch.update(doc(db, 'users', user.uid), {
      puzzlesSolved: user.puzzlesSolved + 1,
      puzzleRating: nextPuzzleRating,
      solvedPuzzleIds: nextSolvedIds,
      updatedAt: now,
    });
    batch.update(doc(db, 'publicProfiles', user.uid), {
      puzzlesSolved: user.puzzlesSolved + 1,
      updatedAt: now,
    });
    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `users/${user.uid}`);
    return false;
  }
}

// ============================================================================
// USER PROGRESSION (DAILY REWARDS, STREAKS, DAILY PUZZLE, RUSH & VISION)
// ============================================================================
export async function ensureUserProgression(uid: string): Promise<void> {
  const ref = doc(db, 'userProgression', uid);
  try {
    const snap = await getDoc(ref);
    if (snap.exists()) return;
    const now = serverTimestamp();
    await setDoc(ref, {
      uid,
      xp: 0,
      coins: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastRewardDate: '',
      lastRewardDay: 0,
      dailyPuzzleStreak: 0,
      lastDailyPuzzleDate: '',
      dailyPuzzlesCompleted: 0,
      puzzleRushBest: 0,
      visionBest: 0,
      createdAt: now,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `userProgression/${uid}`, false);
  }
}

export async function claimDailyReward(uid: string): Promise<{ xpEarned: number; coinsEarned: number; day: number; streak: number } | null> {
  await ensureUserProgression(uid);
  const ref = doc(db, 'userProgression', uid);
  const today = getLocalDateKey();
  try {
    let result: { xpEarned: number; coinsEarned: number; day: number; streak: number } | null = null;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data() as UserProgression;
      if (data.lastRewardDate === today) {
        return;
      }
      const next = computeNextRewardClaim(data, today);
      tx.update(ref, {
        xp: data.xp + next.reward.xp,
        coins: data.coins + next.reward.coins,
        currentStreak: next.nextStreak,
        longestStreak: next.nextLongestStreak,
        lastRewardDate: today,
        lastRewardDay: next.nextRewardDay,
        updatedAt: serverTimestamp(),
      });
      result = {
        xpEarned: next.reward.xp,
        coinsEarned: next.reward.coins,
        day: next.nextRewardDay,
        streak: next.nextStreak,
      };
    });
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `userProgression/${uid}`);
    return null;
  }
}

export async function recordDailyPuzzleCompleted(uid: string, dateKey?: string): Promise<{ xpEarned: number; coinsEarned: number; streak: number } | null> {
  await ensureUserProgression(uid);
  const ref = doc(db, 'userProgression', uid);
  const today = dateKey || getLocalDateKey();
  const yesterday = getYesterdayDateKey();
  try {
    let result: { xpEarned: number; coinsEarned: number; streak: number } | null = null;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data() as UserProgression;
      if (data.lastDailyPuzzleDate === today) return;
      const continued = data.lastDailyPuzzleDate === yesterday;
      const nextStreak = continued ? data.dailyPuzzleStreak + 1 : 1;
      const xpEarned = 100;
      const coinsEarned = 60;
      tx.update(ref, {
        xp: data.xp + xpEarned,
        coins: data.coins + coinsEarned,
        dailyPuzzleStreak: nextStreak,
        lastDailyPuzzleDate: today,
        dailyPuzzlesCompleted: data.dailyPuzzlesCompleted + 1,
        updatedAt: serverTimestamp(),
      });
      result = { xpEarned, coinsEarned, streak: nextStreak };
    });
    return result;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `userProgression/${uid}`, false);
    return null;
  }
}

export async function recordPuzzleRushScore(uid: string, score: number): Promise<boolean> {
  if (score <= 0) return false;
  await ensureUserProgression(uid);
  const ref = doc(db, 'userProgression', uid);
  try {
    let improved = false;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data() as UserProgression;
      const clamped = Math.min(200, Math.floor(score));
      if (clamped <= data.puzzleRushBest) return;
      tx.update(ref, {
        puzzleRushBest: clamped,
        xp: data.xp + Math.min(200, clamped * 10),
        updatedAt: serverTimestamp(),
      });
      improved = true;
    });
    return improved;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `userProgression/${uid}`, false);
    return false;
  }
}

export async function recordVisionScore(uid: string, score: number): Promise<boolean> {
  if (score <= 0) return false;
  await ensureUserProgression(uid);
  const ref = doc(db, 'userProgression', uid);
  try {
    let improved = false;
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return;
      const data = snap.data() as UserProgression;
      const clamped = Math.min(200, Math.floor(score));
      if (clamped <= data.visionBest) return;
      tx.update(ref, {
        visionBest: clamped,
        xp: data.xp + Math.min(200, clamped * 5),
        updatedAt: serverTimestamp(),
      });
      improved = true;
    });
    return improved;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `userProgression/${uid}`, false);
    return false;
  }
}

export async function fetchPlayerCompletedMatches(uid: string): Promise<ChessMatch[]> {
  const path = 'matches';
  try {
    const q = query(
      collection(db, 'matches'),
      where('participants', 'array-contains', uid),
      where('status', '==', 'completed'),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ChessMatch);
  } catch {
    // Fallback without composite index if index is still building
    try {
      const fallbackQ = query(
        collection(db, 'matches'),
        where('participants', 'array-contains', uid),
        limit(100)
      );
      const snap = await getDocs(fallbackQ);
      return snap.docs
        .map((d) => d.data() as ChessMatch)
        .filter((m) => m.status === 'completed')
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
    } catch (innerErr) {
      handleFirestoreError(innerErr, OperationType.LIST, path);
      return [];
    }
  }
}
