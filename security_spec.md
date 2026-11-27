# Chess Arena — Firestore Security Specification (Phase 0 TDD)

## 1. Core Data Invariants
1. **PII Isolation**: Private user fields (`email`, `settings`) live strictly in `/users/{uid}` and are readable/writable ONLY by `request.auth.uid == uid`. Public profiles in `/publicProfiles/{uid}` contain zero PII.
2. **Verified Identity**: All writes require `request.auth != null && request.auth.token.email_verified == true`.
3. **Username Uniqueness**: `/usernames/{usernameLower}` cannot be overwritten or stolen; only the owner can delete their old reservation.
4. **Strict Turn & Move Integrity**: In `/matches/{matchId}`, only the player whose turn it is (`whiteId` on `'w'`, `blackId` on `'b'`) may submit a move, and `moveCount` MUST increment by exactly 1.
5. **Terminal State Locking**: Once a match reaches `status == 'completed'`, no field affecting board state, PGN, result, or rating deltas can ever be modified again. Only a player's own `whiteStatsApplied`/`blackStatsApplied` flag can flip `false -> true`.
6. **Honest Resignation & Draw Agreement**: A player may only resign for themselves (assigning victory to the opponent), and a player may never accept their own draw offer.
7. **Temporal Integrity**: `createdAt` on create and `updatedAt` on create/update must equal `request.time`. `createdAt` is immutable on update.
8. **Query Enforcement**: Every `allow list` rule validates `resource.data` directly without `get()`/`exists()` calls.

## 2. The "Dirty Dozen" Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **PII Snooping**: User B calls `get(/users/userA)` -> DENIED (owner-only).
2. **Shadow Field Injection**: User A creates `/users/userA` with extra ghost field `{"isAdmin": true}` -> DENIED (`hasOnly` check).
3. **Unverified Email Write**: Newly signed-up user with `email_verified: false` tries to create `/users/uid` -> DENIED.
4. **Username Hijacking**: User B tries to overwrite or delete `/usernames/grandmaster_a` owned by User A -> DENIED.
5. **Rating Inflation**: User A updates `/users/userA` setting `rating: 3000` from `1200` (delta > 64) -> DENIED.
6. **Out-of-Turn Move Spoofing**: Black submits a move on `/matches/m1` when `existing().turn == 'w'` -> DENIED.
7. **Forced Opponent Resignation**: White updates `/matches/m1` with `resultReason: 'resignation', result: '1-0', winnerId: whiteId` -> DENIED (resigning player must lose).
8. **Self-Accepted Draw**: White offers draw (`drawOfferBy: whiteId`) and immediately accepts their own draw -> DENIED (`existing().drawOfferBy != request.auth.uid`).
9. **Completed Match Tampering**: Loser edits `winnerId` or `result` on a `completed` match -> DENIED (terminal state lock).
10. **Friend Request Forgery**: User A creates a `friendRequests` doc with `senderId: userB` -> DENIED (identity integrity).
11. **Backdated Timestamp**: User A creates a match with `createdAt` set to a past client timestamp instead of `request.time` -> DENIED.
12. **Resource Exhaustion / ID Poisoning**: User A submits a 2KB document ID or a 50KB `fen` string -> DENIED (`isValidId` and `.size()` limits).
