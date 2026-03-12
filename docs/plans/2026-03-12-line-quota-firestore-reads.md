# LINE Quota And Firestore Reads Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a reliable way to inspect LINE monthly quota usage and reduce unnecessary Firestore reads caused by broad realtime listeners.

**Architecture:** Keep the LINE quota checker as a small local script that calls the official Messaging API using the existing channel access token. Reduce Firestore reads by narrowing realtime subscriptions to only the routes that need them and replacing global collection listeners with page-scoped loading.

**Tech Stack:** Vite, React, TypeScript, Firebase Web SDK, Firebase Functions, Node.js

---

### Task 1: Add LINE quota checker

**Files:**
- Create: `scripts/check-line-quota.mjs`
- Modify: `package.json`

**Step 1: Write the script**

- Read `LINE_CHANNEL_ACCESS_TOKEN` from environment.
- Call `GET /v2/bot/message/quota`.
- Call `GET /v2/bot/message/quota/consumption`.
- Print a concise summary and raw JSON payloads.

**Step 2: Add npm script**

- Add `line:quota` to `package.json`.

**Step 3: Verify locally**

Run: `npm run line:quota`  
Expected: prints quota/consumption when token is present, exits with guidance when token is missing.

### Task 2: Reduce admin-side Firestore reads

**Files:**
- Modify: `contexts/DataContext.tsx`
- Modify: `services/firebaseService.ts`
- Modify: `pages/Dashboard.tsx`
- Modify: `pages/DataTable.tsx`
- Modify: `pages/TodayJobs.tsx`
- Modify: `App.tsx`

**Step 1: Remove broad global jobs listener**

- Stop subscribing to the full `jobs` collection inside the shared `DataContext`.

**Step 2: Keep lightweight shared data**

- Retain options loading in shared context for pages that need dropdown data.

**Step 3: Move jobs loading to pages that actually need jobs**

- Load jobs only in dashboard/data pages instead of every admin route.

**Step 4: Narrow today jobs listener**

- Subscribe to a bounded time window for `today_jobs` instead of the whole collection.

**Step 5: Verify pages still render**

Run: `npm run build`  
Expected: app builds successfully and admin/driver pages keep functioning.

### Task 3: Verification

**Files:**
- None

**Step 1: Build frontend**

Run: `npm run build`

**Step 2: Build functions**

Run: `npm --prefix functions run build`

**Step 3: Review changed files**

Run: `git diff --stat`
