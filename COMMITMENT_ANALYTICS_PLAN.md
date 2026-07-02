# Commitment Analytics Dashboard — Implementation Plan

**Goal:** A manager/admin-restricted dashboard giving headline metrics on team commitments
plus rich, per-member detail — including *when* commitments are set vs. closed (to surface
"set near the deadline and instantly ticked off" behaviour) and an AI summary of the *kinds*
of work each member is committing to.

**Status:** Spec for review. No code written yet.

---

## 0. Key finding that drives the design

A `Commitment` (`types.ts:67`) currently stores only `createdAt`. Status changes run through
`StorageService.cycleCommitmentStatus` (`services/storage.ts:368`), which writes an `updatedAt`
that is **overwritten on every status cycle** (completed → partial → incomplete). There is no
durable record of *when a commitment was first completed*.

**Consequence:** completion-timing and "gaming" analysis is impossible on existing data and
requires a small, backward-compatible schema addition (Phase 0). Counts and completion rates
work on historical data regardless; timing analysis only works for commitments created/closed
*after* Phase 0 ships — so it should ship first so data starts accumulating.

---

## Phase 0 — Schema & write-path changes (prerequisite)

### `types.ts` — extend `Commitment`
```ts
export interface CommitmentStatusEvent {
  status: CommitmentStatus;   // 'completed' | 'partial' | 'incomplete'
  at: number;                 // Unix ms
}

export interface Commitment {
  // ...existing fields...
  createdAt: number;
  completedAt?: number;            // set the FIRST time status becomes 'completed'; never overwritten
  statusHistory?: CommitmentStatusEvent[];  // append-only audit trail of every transition
}
```

### `services/storage.ts`
- **`addCommitment`** — seed `statusHistory: [{ status: 'incomplete', at: Date.now() }]`.
- **`cycleCommitmentStatus`** — on every transition, `arrayUnion` a `{ status, at }` event.
  When `nextStatus === 'completed'` and `completedAt` is not yet set, also set `completedAt`.
  (Leave `completedAt` in place if the member later cycles away and back — first close is the
  signal we care about; the full `statusHistory` preserves the nuance.)

### `firestore.rules`
- No change required for reads — managers already read all commitments.
- The update rule allows owner-or-manager writes; the new fields are written by the same paths,
  so no rule change. (Optional hardening below.)

### Backfill
None possible for `completedAt` on old data (timestamp is genuinely lost). Dashboard must treat
`completedAt == null` on a completed commitment as "legacy / unknown close time" and exclude it
from timing stats rather than counting it as zero.

---

## Phase 1 — Gated view + headline KPIs + per-member table (core value)

### Routing / access
- Add `AppView.COMMITMENT_ANALYTICS` to the `AppView` enum (`types.ts:190`).
- Render a new `<CommitmentAnalytics />` component from `App.tsx`'s view switch.
- Gate with the existing pattern: `if (role !== 'MANAGER' && role !== 'ADMIN') return <AccessDenied/>`.
- Add a nav entry alongside the existing Manager Dashboard link (same place
  `AppView.MANAGER_DASHBOARD` is wired into the sidebar/nav).

### Data
- Subscribe via the existing `StorageService.subscribeToCommitments()` + `subscribeToMembers()`.
- All computation is client-side over the in-memory arrays (dataset is small).
- **Period selector:** This week / Last 4 weeks / Last 12 weeks / All time, filtering on `weekId`.

### Headline KPI cards (period-scoped)
| KPI | Definition |
|-----|-----------|
| Total set | count of commitments created in period |
| Total closed | count with `status === 'completed'` |
| Completion rate | closed / set |
| Avg per member | total set / active members |
| Avg time-to-close | mean(`completedAt − createdAt`) over commitments with both timestamps |
| Buzzer-beater rate | % set OR closed within the buzzer window of WIG meeting day (see §Heuristics) |

### Per-member table (sortable, the workhorse)
Columns: **Member · Set · Completed · Partial · Incomplete · Completion % · Avg lead time ·
Last-minute count · Streak** (streak already on `TeamMember`). Each row → Phase 2 drill-in.

---

## Phase 2 — Member drill-in + integrity flags

Clicking a member opens a detail panel: a chronological list of their commitments showing
description, lead measure, `createdAt`, `completedAt`, computed time-to-close, and status — each
tagged with any of these automatically-computed flags:

### Heuristics (sensible defaults — make constants, tune later)
- 🔴 **Instant close** — `completedAt − createdAt < 15 min`
- 🟠 **Buzzer-beater** — `createdAt` (or `completedAt`) within **24h** of the configured WIG
  meeting day. WIG day comes from the existing settings (configurable WIG meeting day, recent
  commit `053208d`); read it from the `settings` collection.
- 🟡 **Batch dump** — **3+** commitments by the same member with `createdAt` inside the same
  **5-minute** window.
- 🟢 **Healthy** — set early in the week and closed on a separate, later day.

Surface per-member rollups too: e.g. "4 of 6 commitments closed within 15 min of creation."
These are *signals for a conversation*, not accusations — label the section accordingly.

---

## Phase 3 — AI thematic summary (reuses existing Gemini integration)

### New method in `services/ai.ts` (`AIService` object, uses `withRetryAndFallback`)
```ts
summarizeCommitmentThemes: async (
  byMember: { memberName: string; descriptions: string[] }[]
): Promise<{
  overall: string;                                   // team-wide narrative
  perMember: { memberName: string; themes: string[]; summary: string }[];
  neglectedVsLeadMeasures?: string;                  // what LMs are under-served
}> => { /* prompt over grouped descriptions, JSON response, model fallback */ }
```

Prompt brief: classify each member's commitment descriptions into a few task categories
(e.g. admin/compliance, student-facing, planning, data, collaboration), give a one-line
per-member summary, and a team-wide paragraph noting over/under-represented categories
relative to the Lead Measures.

### Caching (cost control)
- Cache results in the existing `insights` collection (manager-write, auth-read).
- Key by period + a hash/count of the underlying commitments; only re-call the AI when the
  data changes or the manager clicks "Refresh". Mirrors the existing weekly-summary caching.
- Graceful no-key behaviour: if `VITE_GOOGLE_AI_API_KEY` is missing, hide the AI panel (same
  pattern as existing AI features returning null).

---

## File-change summary

| File | Change |
|------|--------|
| `types.ts` | Extend `Commitment`; add `CommitmentStatusEvent`; add `AppView.COMMITMENT_ANALYTICS` |
| `services/storage.ts` | `addCommitment` seeds history; `cycleCommitmentStatus` appends events + sets `completedAt` |
| `services/ai.ts` | Add `summarizeCommitmentThemes` |
| `components/CommitmentAnalytics.tsx` | **New** — KPIs, per-member table, drill-in, AI panel |
| `App.tsx` | Route + render new view |
| nav/sidebar (where `MANAGER_DASHBOARD` is linked) | Add gated nav entry |
| `firestore.rules` | No change required (optional hardening below) |

---

## Optional hardening (not required for v1)

- **Commitment read scope:** today *any* signed-in user can read *all* commitments
  (`firestore.rules:41`). The dashboard is gated client-side only. If commitment text should be
  manager-only, tighten the read rule to owner-or-manager — but verify no staff-facing view
  (e.g. leaderboard) depends on reading peers' commitments first.
- **Configurable thresholds:** move the heuristic constants into the `settings` collection so
  managers can tune them in-app (deferred; ship with defaults first).

---

## Suggested build order
1. **Phase 0** (schema + write paths) — ship immediately so timing data accrues.
2. **Phase 1** (gated view + KPIs + table).
3. **Phase 2** (drill-in + flags).
4. **Phase 3** (AI themes + caching).
