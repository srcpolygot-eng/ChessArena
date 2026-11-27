# Chess Arena — Full-Scale Online Multiplayer Chess Platform

A complete, production-ready online chess platform built with **React, TypeScript, Vite, Tailwind CSS, Motion, Express, `chess.js`, Firebase Authentication, and Cloud Firestore**.

## Core Features

- **Untimed Classical Play**: Zero chess clocks, zero countdowns, and zero time-based forfeits — play at your own pace and reconnect anytime after refreshing or switching devices.
- **Firebase Authentication & Unique Accounts**:
  - Continue with Google (`signInWithPopup`)
  - Email & Password registration, login, verification, and password reset
  - Unique case-insensitive username registry (`/usernames/{usernameLower}`) enforced atomically via Firestore transactions
- **Real-Time Multiplayer Modes**:
  - **Play Online**: Automatic real-time matchmaking queue (`/matchmakingQueue`) pairing live authenticated players across devices
  - **Play with a Friend**: Search players by username, choose colors, send real-time match invitations (`/matchInvitations`), and launch immediately on acceptance
  - **Play Against Computer**: 4 chess engine difficulty levels (`Mina 800`, `Devon 1200`, `Henrik 1600`, `Viktor 2000`) powered by Minimax with Alpha-Beta Pruning and Piece-Square Tables
  - **Private Match Rooms**: Generate 6-character room codes and shareable `?join=CODE` invitation links (`/privateRooms`)
- **Complete Chess Rules & Server-Side Move Validation**:
  - Powered by `chess.js` with Express server-side move validation (`/api/chess/validate-move`) + Firestore `runTransaction` turn/moveCount guards
  - Castling, en passant, pawn promotion selector, check, checkmate, stalemate, draw by agreement, threefold repetition, fifty-move rule, insufficient material, and resignation
- **Social, Puzzles, History & Rankings**:
  - **Friends System**: Username search, incoming/outgoing friend requests, online/offline/in-game presence, direct challenges
  - **Tactical Puzzles**: 15 curated multi-move puzzles across Beginner, Intermediate, and Advanced categories with progressive hints and Firestore progress tracking
  - **Match History & PGN Replay**: Step-by-step interactive replay board with auto-play and PGN export
  - **Global Leaderboard**: Sortable, filterable, paginated Elo standings
  - **Customization Settings**: Dark & Light themes, 4 board palettes, 3 Staunton vector piece styles, Web Audio API sound effects, and animation preferences

## Firestore Collections Architecture

| Collection | Purpose | Access Policy |
| :--- | :--- | :--- |
| `/users/{uid}` | Private user profile (PII email, settings, puzzle progress, stats) | Owner-only `get`, verified owner `create`/`update` |
| `/publicProfiles/{uid}` | Public non-PII player card for search, friends, leaderboard | Signed-in read (`isPublic == true`), verified owner write |
| `/usernames/{usernameLower}` | Atomic uniqueness lock for usernames | Signed-in `get`, verified owner `create`/`delete` |
| `/friendRequests/{requestId}` | Pending/accepted/rejected friend requests | Scoped strictly to `senderId` and `receiverId` |
| `/friendships/{friendshipId}` | Confirmed bidirectional friendships | Scoped strictly to participating `userIds` |
| `/matchmakingQueue/{uid}` | Real-time online matchmaking pool | Waiting entries listable; atomic pairing transaction |
| `/privateRooms/{roomCode}` | Maps 6-char room code to waiting private match | Lookup by exact code only (no `list`) |
| `/matchInvitations/{invitationId}` | Direct friend match challenges | Scoped strictly to `senderId` and `receiverId` |
| `/matches/{matchId}` | Live untimed multiplayer games & completed archive | Turn-locked moves, terminal-locked completed results |

## Installation & Running Locally

```bash
npm install
npm run dev
```

The Express + Vite server listens on `http://localhost:3000`.

To build for production:

```bash
npm run build
npm start
```

## Firebase Configuration & Enabling Email/Password

This workspace is pre-configured with `firebase-applet-config.json` and deployed `firestore.rules`.

1. **Google Authentication** is enabled automatically via Firebase provisioning.
2. **To enable Email/Password Sign-In & Registration**:
   - Open the [Firebase Console](https://console.firebase.google.com/) and select your project (`projectId` in `firebase-applet-config.json`).
   - Go to **Authentication → Sign-in method**.
   - Click **Add new provider → Email/Password**, toggle **Enable**, and click **Save**.
3. **Security Rules**:
   - Rules live in `/firestore.rules`, schema blueprint in `/firebase-blueprint.json`, and security audit specs in `/security_spec.md` and `/firestore.rules.test.ts`.
   - Lint rules anytime with `npx eslint firestore.rules`.
