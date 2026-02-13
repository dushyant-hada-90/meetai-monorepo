# MeetAI

AI-powered meeting intelligence: LiveKit-backed video rooms, autonomous agents that attend calls, searchable transcripts, and AI summaries generated automatically after each session.

## Table of contents
- Overview
- Features
- Architecture
- Prerequisites
- Setup
- Running the app
- Key scripts
- Data model (high level)
- How the flow works
- Deployment notes

## Overview
MeetAI lets teams run LiveKit video calls, invite collaborators, and have AI agents capture transcripts, decisions, and action items. Summaries are produced via an Inngest background function using Google Gemini and stored alongside the transcript for replay and search.

## Features
- Live video meetings on LiveKit with lobby, mic/camera toggles, and secure token gating per participant.
- AI agents with custom instructions per user; limits enforced on the free tier (3 agents, 3 meetings).
- One workspace for transcripts, summaries, decisions, and action items; meeting invites with role-aware links (host/co-host/attendee/viewer).
- Post-call summarization pipeline: LiveKit webhooks → Inngest function → Gemini summary with timestamped notes.
- Authentication via Better Auth (email/password + Google/GitHub OAuth); billing and paywalling via Polar checkout/portal.
- Drizzle ORM + Neon Postgres schema for users, agents, meetings, participants, invites, and transcripts.

## Architecture
- Frontend: Next.js App Router (React 19), Tailwind CSS, Radix UI, Framer Motion.
- Realtime calls: LiveKit (client + server SDK) with server-side token generation and room metadata priming.
- API: tRPC with protected procedures; premium guardrails using Polar customer state.
- Data: Drizzle ORM on Neon Postgres.
- Background jobs: Inngest function for post-room summaries (Gemini 2.5 flash) triggered by LiveKit webhooks.
- Auth/Billing: Better Auth with GitHub/Google providers and Polar checkout/portal.

## Screenshots

![Landing](./public/screenshots/01-landing.png)
![Dashboard](./public/screenshots/02-dashboard.png)
![Live call](./public/screenshots/03-call.png)
![Summary](./public/screenshots/04-summary.png)

## Prerequisites
- Node.js 20+
- Postgres (Neon recommended)
- LiveKit Cloud or self-hosted LiveKit server
- Inngest CLI for local background worker (`npm i -g inngest-cli` or `npx inngest-cli dev`)

## Setup
1) Install dependencies
```
npm install
```

2) Create `.env.local` in the project root with:
```
DATABASE_URL=postgresql://...
NEXT_PUBLIC_APP_URL=http://localhost:3000

LIVEKIT_URL=wss://your-livekit-host
LIVEKIT_API_KEY=lk_api_key
LIVEKIT_API_SECRET=lk_api_secret
NEXT_PUBLIC_LIVEKIT_URL=wss://your-livekit-host

GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...

POLAR_ACCESS_TOKEN=...
GOOGLE_API_KEY=...               # Gemini key for summaries
```

3) Apply database schema
```
npm run db:push
```

## Running the app
- Start web app: `npm run dev`
- Start Inngest worker (for summaries): `npx inngest-cli@latest dev`
- Optional: LiveKit webhook endpoint is exposed at `/api/webhooks` (ensure your LiveKit instance can reach it).

## Key scripts
- `npm run dev` — start Next.js
- `npm run build` / `npm start` — production build and serve
- `npm run lint` — linting
- `npm run db:push` — apply Drizzle schema
- `npm run db:studio` — Drizzle Studio UI
- `npm run inngest` — run Inngest locally (alias of `npx inngest-cli dev`)
- `npm run lk-agent` — run LiveKit agent kit locally with the configured instructions

## Data model (high level)
- `user`, `session`, `account`, `verification` — Better Auth tables.
- `agents` — per-user AI agents with custom instructions.
- `meetings` — meeting metadata, status, transcript JSONB, summary, timing fields.
- `meeting_participants` — participants with role, join state; composite PK on meeting/user.
- `meeting_invites` — reusable invite links with role + expiry.

## How the flow works
1) User creates an agent and a meeting (free tier limited to 3 each).
2) Participants receive a role-aware invite link; joining triggers LiveKit token generation gated by participant membership.
3) LiveKit webhooks mark meetings active/finished; `room_finished` webhook sends an Inngest event.
4) Inngest function merges transcript fragments, resolves speaker names, and asks Gemini for a structured summary; result is saved back to the meeting.

## Deployment notes
- Set `NEXT_PUBLIC_APP_URL` to your deployed URL so tRPC batching resolves correctly server-side.
- Expose `/api/webhooks` publicly to LiveKit; secure with the LiveKit signing key/secret in env.
- Background processing requires the Inngest worker to be running in your hosting environment.
