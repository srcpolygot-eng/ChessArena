/**
 * Chess Arena — Firestore Security Rules Specification Test Suite
 * Verifies the "Dirty Dozen" adversarial payloads defined in security_spec.md.
 * Run against the Firebase Emulator Suite (`firebase emulators:exec "npx tsx firestore.rules.test.ts"`).
 */

export interface SecurityTestCase {
  id: string;
  name: string;
  collection: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  expected: 'PERMISSION_DENIED';
  payload: Record<string, unknown>;
}

export const DIRTY_DOZEN_PAYLOADS: SecurityTestCase[] = [
  {
    id: 'DD-01',
    name: 'PII Snooping: Non-owner reads /users/{uid}',
    collection: 'users/userA',
    operation: 'get',
    expected: 'PERMISSION_DENIED',
    payload: { actor: 'userB', target: 'users/userA' },
  },
  {
    id: 'DD-02',
    name: 'Shadow Field Injection: Extra isAdmin field on user create',
    collection: 'users/userA',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'userA', username: 'player1', isAdmin: true },
  },
  {
    id: 'DD-03',
    name: 'Unverified Email Write: email_verified=false creates profile',
    collection: 'users/userUnverified',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { uid: 'userUnverified', emailVerified: false },
  },
  {
    id: 'DD-04',
    name: 'Username Hijacking: User B deletes User A username lock',
    collection: 'usernames/magnus',
    operation: 'delete',
    expected: 'PERMISSION_DENIED',
    payload: { actor: 'userB', owner: 'userA' },
  },
  {
    id: 'DD-05',
    name: 'Rating Inflation: Delta exceeds 64 Elo points',
    collection: 'users/userA',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { rating: 2900, gamesPlayed: 1, wins: 1, losses: 0, draws: 0 },
  },
  {
    id: 'DD-06',
    name: 'Out-of-Turn Move Spoofing: Black submits move during White turn',
    collection: 'matches/match1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { actor: 'blackUid', existingTurn: 'w', moveCount: 1 },
  },
  {
    id: 'DD-07',
    name: 'Forced Opponent Resignation: White resigns claiming 1-0 victory',
    collection: 'matches/match1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { actor: 'whiteUid', status: 'completed', result: '1-0', winnerId: 'whiteUid', resultReason: 'resignation' },
  },
  {
    id: 'DD-08',
    name: 'Self-Accepted Draw: Offerer accepts own draw offer',
    collection: 'matches/match1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { actor: 'whiteUid', existingDrawOfferBy: 'whiteUid', status: 'completed', resultReason: 'draw_agreement' },
  },
  {
    id: 'DD-09',
    name: 'Completed Match Tampering: Overwriting winner on completed match',
    collection: 'matches/match1',
    operation: 'update',
    expected: 'PERMISSION_DENIED',
    payload: { existingStatus: 'completed', winnerId: 'attackerUid' },
  },
  {
    id: 'DD-10',
    name: 'Friend Request Forgery: Impersonating senderId',
    collection: 'friendRequests/userB_userC',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { actor: 'userA', senderId: 'userB', receiverId: 'userC', status: 'pending' },
  },
  {
    id: 'DD-11',
    name: 'Backdated Timestamp: Client-supplied createdAt != request.time',
    collection: 'matches/match2',
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { createdAt: '2020-01-01T00:00:00Z' },
  },
  {
    id: 'DD-12',
    name: 'ID Poisoning & Payload Exhaustion: 2KB ID / oversized FEN',
    collection: 'matches/' + 'a'.repeat(200),
    operation: 'create',
    expected: 'PERMISSION_DENIED',
    payload: { fen: 'r'.repeat(500) },
  },
];
