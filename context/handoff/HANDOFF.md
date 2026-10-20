# Meloy Judge Portal — Engineering Handoff

> **Last updated:** October 2026  
> **Stack:** Next.js 15 (App Router) · Express Lambda (TypeScript) · PostgreSQL on RDS · Auth0 · AWS Amplify · API Gateway

---

## 1. Project Overview

The **Meloy Judge Portal** is a web application that manages technical judging at Texas A&M engineering competitions — primarily **Aggies Invent** and **Problems Worth Solving (PWS)**. Judges score teams against rubrics, a moderator controls presentation order in real time, admins oversee everything, and a leaderboard tracks results.

---

## 2. Architecture

```
Browser (Next.js 15 on Amplify)
        │  HTTPS
        ▼
API Gateway  →  Lambda (Express monolith, meloy-judge-api)
                    │
                    ├── RDS PostgreSQL (meloyjudgeportal-db, private VPC)
                    ├── Secrets Manager (JWT secret, RDS credentials)
                    └── S3 (meloy-judge-uploads-271669412379) ← new
                              │
                        CloudFront (d3i2fdhibq1j3p.cloudfront.net) ← new
```

### AWS Resources

| Resource | Value |
|---|---|
| **Lambda function** | `meloy-judge-api` (us-east-1) |
| **API Gateway URL** | `https://o90rhtv5i4.execute-api.us-east-1.amazonaws.com/prod` |
| **Amplify app** | `https://main.dnwd5yr9u60pa.amplifyapp.com` |
| **RDS (judge portal)** | `meloyjudgeportal-db.cwlcycaiaeos.us-east-1.rds.amazonaws.com` (private) |
| **RDS (tracker)** | `meloy-tracker-db.cwlcycaiaeos.us-east-1.rds.amazonaws.com` |
| **RDS (FabLab)** | `fablab-tracker.cwlcycaiaeos.us-east-1.rds.amazonaws.com` |
| **S3 bucket (uploads)** | `meloy-judge-uploads-271669412379` |
| **CloudFront (uploads)** | `d3i2fdhibq1j3p.cloudfront.net` (OAC, private reads only) |
| **CloudFront (FabLab)** | `d1its93ex2b7gb.cloudfront.net` |
| **EC2 bastion** | `MeloyJudgePortal` · `98.82.22.16` · t2.micro (used only for DB admin — can be stopped when not in use) |
| **AWS Account** | `271669412379` |
| **Auth0 domain** | `dev-cesh2xao4dfcu5ha.us.auth0.com` |

### S3 Security (uploads bucket)

The uploads bucket is intentionally **private with no public access**:
- All 4 public access blocks enabled
- No anonymous access
- Bucket policy allows `GetObject` only from the CloudFront distribution via OAC (`StringEquals AWS:SourceArn`)
- Direct bucket access returns 403
- CloudFront access logging enabled
- Lambda role has `PutObject / GetObject / DeleteObject` via inline IAM policy `S3UploadsPolicy`

---

## 3. Repository Structure

```
Meloy-Judge-Portal/
├── lambda/                          # Express API (deployed to AWS Lambda)
│   ├── src/
│   │   ├── app.ts                   # Express app + route mounts
│   │   ├── middleware/
│   │   │   └── auth.ts              # JWT auth, role guards, DEV_MODE bypass
│   │   ├── db/
│   │   │   └── connection.ts        # pg Pool, query(), queryOne(), transaction()
│   │   └── routes/
│   │       ├── auth.routes.ts       # /auth/login, /auth/me, CAS
│   │       ├── auth-sync.routes.ts  # Auth0 → DB user sync
│   │       ├── events.routes.ts     # /events CRUD + leaderboard
│   │       ├── teams.routes.ts      # /teams CRUD + presentation-order swap
│   │       ├── scores.routes.ts     # /scores + /rubric
│   │       ├── judging.routes.ts    # /judge/*
│   │       ├── users.routes.ts      # /users/*
│   │       ├── admin.routes.ts      # /admin/* (migration endpoints live here temporarily)
│   │       ├── judge-profiles.routes.ts
│   │       ├── sponsors.routes.ts
│   │       └── uploads.routes.ts    # /uploads/* — presign, comment-clips  ← new
│   └── package.json
│
├── meloy-judge-app/                 # Next.js 15 frontend
│   ├── app/
│   │   └── (protected)/            # Auth-gated routes
│   │       ├── dashboard/page.tsx
│   │       ├── events/[eventId]/
│   │       │   ├── page.tsx                         # Event detail + judge selection
│   │       │   ├── moderator/page.tsx
│   │       │   ├── leaderboard/page.tsx
│   │       │   ├── teams/[teamId]/page.tsx
│   │       │   ├── comment-sheets/page.tsx           # Print sheets
│   │       │   └── comment-sheets/upload/page.tsx    # Upload sheets  ← new
│   │       └── admin/
│   │           ├── page.tsx
│   │           └── events/[eventId]/manage/page.tsx
│   ├── components/
│   │   ├── comment-sheets/
│   │   │   ├── pws-comment-sheet.tsx        # Printable sheet (pixel-precise)
│   │   │   ├── comment-sheets-screen.tsx    # Print UI (one sheet per team)
│   │   │   └── upload-sheets-screen.tsx     # Upload + preview UI  ← new
│   │   ├── dashboard/dashboard-screen.tsx
│   │   ├── events/event-detail-screen.tsx
│   │   ├── judging/
│   │   │   ├── team-detail-screen.tsx       # Scoring UI + written comments display
│   │   │   └── judge-selection-screen.tsx
│   │   └── management/
│   │       ├── moderator-screen.tsx         # Presentation order + live control
│   │       └── event-creation/
│   └── lib/
│       ├── api/
│       │   ├── client.ts            # Fetch wrapper + token injection
│       │   ├── auth.ts              # getCurrentUser()
│       │   ├── events.ts
│       │   ├── teams.ts
│       │   ├── scores.ts
│       │   ├── admin.ts             # updateTeamPresentationOrder()
│       │   └── uploads.ts           # presign, upload, clips  ← new
│       ├── comment-sheets/
│       │   ├── pws-sheet-layout.ts  # Single source of truth for all geometry
│       │   └── sheet-processor.ts   # QR decode → corner detection → warp → crop  ← new
│       └── types/api.ts
│
├── database/
│   ├── schema.sql                   # Canonical schema (keep in sync with live DB)
│   └── migrations/
│       └── add_pws_rubric.sql
│
└── HANDOFF.md                       # This file
```

---

## 4. User Roles

| Role | What they can do |
|---|---|
| `judge` | View assigned event, score teams (sliders), view leaderboard |
| `moderator` | Everything a judge can + reorder presentation queue, mark teams as presented |
| `admin` | Everything + create events, manage teams/profiles, print/upload comment sheets, view all scores read-only |

Role is stored in `users.role` in the DB and injected into the JWT at login. The frontend's `app-shell` starts with `isAdmin = false` and fetches identity asynchronously — **never trust prop timing**; call `getCurrentUser()` inside component data-fetches directly.

---

## 5. Database Schema (key tables)

| Table | Purpose |
|---|---|
| `users` | All accounts (judge / moderator / admin). Auth via Auth0 (`auth_provider = 'auth0'`). |
| `events` | Competitions. `event_type` ∈ `{aggies-invent, problems-worth-solving}`. |
| `teams` | Teams per event. `presentation_order` (nullable int, unique per event) drives the moderator queue. |
| `event_judges` | Junction: which judge profile is active for which event. |
| `judge_profiles` | Named judging slots per event (e.g., "Judge A", "Judge B"). Judges claim one at login. |
| `rubric_criteria` | Scoring dimensions per `event_type`. `display_order` controls rendering order. |
| `scores` | One row per (team, judge_profile, rubric_criterion). Unique constraint on that triple. |
| `judge_comment_clips` | S3 keys for cropped handwritten comment photos, one row per (team, criterion). ← new |

### `judge_comment_clips` schema
```sql
CREATE TABLE judge_comment_clips (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id            UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    team_id             UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    rubric_criteria_id  UUID NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
    sheet_image_key     TEXT,               -- S3 key for the full-page photo
    clip_image_key      TEXT NOT NULL,      -- S3 key for the cropped comment cell
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 6. Key Architectural Decisions & Gotchas

### 6.1 Admin identity race condition (FIXED)

The app-shell fetches the user role asynchronously after render, so `isAdmin` prop can arrive as `false` while the component mounts. The fix: **`TeamDetailScreen` calls `getCurrentUser()` itself** inside its own loading spinner — it never trusts the prop:

```ts
const [teamData, eventData, userData] = await Promise.all([
  getTeam(teamId), getEvent(eventId), getCurrentUser(),
])
const apiIsAdmin = userData.user.role === 'admin' || userData.user.role === 'moderator'
setViewerIsAdmin(apiIsAdmin)   // authoritative
```

### 6.2 Presentation-order swap (3-step SQL)

`teams.presentation_order` has a unique constraint per event. A naive swap will violate it. The endpoint uses a NULL-intermediary pattern:

```sql
-- Step 1: Free up the target slot
UPDATE teams SET presentation_order = NULL WHERE id = $movedTeam;
-- Step 2: Give displaced team the old slot (now free)
UPDATE teams SET presentation_order = $oldOrder WHERE id = $displacedTeam;
-- Step 3: Assign new slot to moved team
UPDATE teams SET presentation_order = $newOrder WHERE id = $movedTeam;
```

All three run inside a single `transaction()` call.

### 6.3 PWS Comment Sheet geometry

`lib/comment-sheets/pws-sheet-layout.ts` is the **single source of truth** for all sheet geometry (US Letter landscape, 11 × 8.5 inches). Both the print renderer (`pws-comment-sheet.tsx`) and the upload cropper (`sheet-processor.ts`) import from it. **Do not hardcode pixel values elsewhere** — change the layout file and both sides stay in sync.

### 6.4 Carlito font (Calibri substitute)

The PWS template uses Calibri (Windows-only). Carlito is an open-source metric-compatible replacement served via `next/font/google`. Text wraps identically across OS.

### 6.5 pnpm lockfile

Amplify builds with `pnpm install --frozen-lockfile`. After any `npm install` in `meloy-judge-app/`, regenerate the pnpm lockfile:
```bash
cd meloy-judge-app && pnpm install --lockfile-only
```
Both `package-lock.json` and `pnpm-lock.yaml` must stay committed and in sync.

### 6.6 Admin score access (403 bypass)

Admins/moderators viewing a team's scores don't have a `judge_profile_id`. The backend skips the `event_judges` ownership check for them:

```ts
// scores.routes.ts — GET /:teamId/:judgeId
const isAdminUser = req.user?.role === 'admin' || req.user?.role === 'moderator';
if (!isAdminUser) {
  // validate judge profile ownership
}
```

Admins are also blocked from **posting** scores:
```ts
// POST /scores
if (req.user?.role === 'admin' || req.user?.role === 'moderator') {
  return res.status(403).json({ error: 'Only judges can submit scores' });
}
```

---

## 7. Features by Area

### 7.1 Dashboard
- Event cards with consistent height (`min-h-[3.75rem]` on `CardTitle`)
- Shows active events; admins see all events

### 7.2 Event Detail
- Team list with scoring status per judge
- Admin dropdown menu (☰): Moderator Screen · Print Comment Sheets · Upload Comment Sheets · Event Settings
- PWS logo rendered at reduced size when `isPWSEvent` to avoid dominating the header

### 7.3 Moderator Screen
- Live presentation queue, sortable by drag or dropdown
- For PWS events: each team card shows a "Presentation Order" selector with swap hints ("Position 2 ↔ swap with Team X")
- Order changes go via `PATCH /teams/:teamId/presentation-order` with the 3-step SQL swap

### 7.4 Team Detail / Scoring
- Rubric cards: solid maroon icon square (top-left), score pill (top-right), centered criterion title (`min-h-[5rem]`)
- Sliders disabled (view-only) for admins
- Admins see amber banner; submit/cancel buttons hidden; only "Back to Event" shown
- **Written Comments section** (below scoring cards): shows uploaded handwritten clips fetched from `judge_comment_clips` via CloudFront URLs — visible to both judges and admins

### 7.5 PWS Comment Sheets — Print

Route: `/events/[eventId]/comment-sheets`

One US Letter landscape sheet per team printed via `@page { size: letter landscape; margin: 0; }`. Each sheet includes:
- Maroon header with white PWS logo (`public/pws-logo-white.png`), team name, judge name
- Rubric table: criteria column (left) + wide comments column (right). **Score column removed** — judges write comments only, scores are digital
- QR code (top-right): encodes `PWS1:{teamId}` — used by the upload flow to identify the team
- Four solid black corner alignment markers (for perspective correction during upload)

### 7.6 PWS Comment Sheets — Upload

Route: `/events/[eventId]/comment-sheets/upload`

Full pipeline (browser-side, no server round-trip for image processing):

1. **Photo capture**: file input with `capture="environment"` (opens rear camera on mobile)
2. **QR decode**: `jsqr` library reads the `PWS1:{teamId}` code
3. **Corner detection**: finds the 4 black alignment squares by centroid of darkest pixels in each corner region
4. **Perspective warp**: 8-parameter homography (Gaussian elimination) maps detected corners → standard letter page
5. **Cell crop**: 6 crops from `getCommentCellRect(rowIndex)` — one per rubric criterion
6. **Preview**: admin sees all 6 crops before committing
7. **Upload**: each image gets a 5-min presigned S3 PUT URL from Lambda; browser uploads directly to S3
8. **Metadata save**: `POST /uploads/comment-clips` stores S3 keys in `judge_comment_clips`

Re-uploading a team's sheet replaces all prior clips for that team.

---

## 8. API Endpoints (Lambda)

### Auth
| Method | Path | Notes |
|---|---|---|
| `POST` | `/auth/login` | Local login (legacy) |
| `GET` | `/auth/me` | Current user from JWT |
| `POST` | `/auth/sync` | Auth0 → DB user sync (called on first login) |

### Events
| Method | Path | Notes |
|---|---|---|
| `GET` | `/events` | List all (admins see all; judges see active only) |
| `GET` | `/events/:id` | Single event |
| `POST` | `/events` | Create (admin) |
| `PATCH` | `/events/:id` | Update (admin) |
| `GET` | `/events/:id/leaderboard` | Aggregated scores |

### Teams
| Method | Path | Notes |
|---|---|---|
| `GET` | `/events/:eventId/teams` | All teams for event |
| `POST` | `/teams` | Create team (admin) |
| `GET` | `/teams/:id` | Single team |
| `PATCH` | `/teams/:id` | Update team |
| `PATCH` | `/teams/:id/presentation-order` | 3-step swap |

### Scores / Rubric
| Method | Path | Notes |
|---|---|---|
| `GET` | `/rubric/rubric?event_type=…` | Criteria for event type |
| `GET` | `/scores/:teamId/:judgeId` | Existing scores (admin bypasses ownership check) |
| `POST` | `/scores` | Submit scores (judges only — admins get 403) |

### Uploads ← new
| Method | Path | Notes |
|---|---|---|
| `POST` | `/uploads/presign` | Returns presigned S3 PUT URL (5 min TTL) |
| `POST` | `/uploads/comment-clips` | Save clip metadata post-upload |
| `GET` | `/uploads/comment-clips/:teamId` | Fetch clips with CloudFront URLs |
| `DELETE` | `/uploads/comment-clips/:teamId` | Remove all clips for a team |

### Admin / Judge Profiles
| Method | Path | Notes |
|---|---|---|
| `GET` | `/events/:eventId/judge-profiles` | Available profiles |
| `POST` | `/admin/…` | Various admin management routes |

---

## 9. Deployment

### Backend (Lambda)
```bash
cd lambda
npm install
npm run build          # tsc → dist/
zip -r /tmp/lambda-update.zip dist/ node_modules/ package.json
aws lambda update-function-code \
  --function-name meloy-judge-api \
  --zip-file fileb:///tmp/lambda-update.zip \
  --region us-east-1
aws lambda wait function-updated --function-name meloy-judge-api --region us-east-1
```

### Frontend (Amplify)
Push to the connected git branch — Amplify builds automatically with:
```
pnpm install --frozen-lockfile
pnpm run build
```
**Important:** always run `pnpm install --lockfile-only` in `meloy-judge-app/` after any `npm install` to keep `pnpm-lock.yaml` in sync before pushing.

### One-time DB migrations
The RDS is in a private VPC — not directly reachable from your machine. Pattern:
1. Add a temporary `router.post('/admin/run-migration-<slug>', ...)` endpoint in `admin.routes.ts`
2. Deploy Lambda
3. `curl -X POST https://…/prod/admin/run-migration-<slug>`
4. Remove the endpoint, redeploy

---

## 10. Lambda Environment Variables

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DEV_MODE` | `false` — **never set true in prod** (bypasses all auth) |
| `AUTH0_DOMAIN` | `dev-cesh2xao4dfcu5ha.us.auth0.com` |
| `AUTH0_CLIENT_ID` | `eke2aRF6oZcSKk3iqZWWRnFffEOEpgvi` |
| `AUTH0_AUDIENCE` | `https://o90rhtv5i4.execute-api.us-east-1.amazonaws.com/prod` |
| `CAS_SERVICE_URL` | `https://main.dnwd5yr9u60pa.amplifyapp.com/auth/callback` |
| `RDS_SECRET_ARN` | Secrets Manager ARN (RDS credentials) |
| `JWT_SECRET_ARN` | Secrets Manager ARN (JWT signing secret) |
| `UPLOADS_BUCKET` | `meloy-judge-uploads-271669412379` |
| `CLOUDFRONT_UPLOADS_URL` | `https://d3i2fdhibq1j3p.cloudfront.net` |

---

## 11. Infrastructure Notes

### EC2 Bastion (`MeloyJudgePortal`, `98.82.22.16`)
This instance **does not run any application code**. It exists solely as a jump host for connecting to the private RDS. It can be stopped when not doing DB admin — the Lambda connects directly through the VPC. Costs ~$8–9/month running 24/7.

### S3 Buckets
| Bucket | Purpose | Access |
|---|---|---|
| `meloy-judge-uploads-271669412379` | Comment sheet photos | Private; CloudFront OAC reads + Lambda presigned PUT uploads |
| `meloy-tracker-bucket` | Meloy tracker app assets | Has a public-read policy (legacy — do not copy this pattern) |

### CloudFront Distributions
| Distribution | Domain | Origin |
|---|---|---|
| `E35L5N9JV0TEON` | `d3i2fdhibq1j3p.cloudfront.net` | `meloy-judge-uploads` S3 bucket via OAC |
| `E1VEIJDMXKEAOF` | `d1its93ex2b7gb.cloudfront.net` | `fablab-equipment-images` S3 bucket via OAC |

---

## 12. Known Gaps / Future Work

| Item | Notes |
|---|---|
| **Upload perspective correction** | Corner detection uses a centroid heuristic — works well for photos taken close to flat. If sheets are photographed at steep angles, markers may not be detected reliably. A future improvement could use contour detection or a CV library. |
| **Comment clips in team detail (judge view)** | Clips currently show to all viewers. If desired, restrict so only admins see them (clips represent the physical sheet, not the judge's digital score). |
| **`DetailedLeaderboardResponse` TS error** | Pre-existing type error in `lib/api/events.ts` unrelated to recent work — does not affect build or runtime but should be cleaned up. |
| **EC2 bastion cost** | Stop `MeloyJudgePortal` when not in use; consider replacing with AWS Systems Manager Session Manager for zero-cost RDS access. |
| **Moderator role in `users.role`** | Schema `CHECK` constraint only allows `member / judge / admin`; `moderator` is enforced at the application layer. Consider adding `moderator` to the DB constraint for consistency. |
| **`meloy-tracker-bucket` public policy** | That bucket still has `"Principal": "*"` allowing public reads. Consider locking it down with a CloudFront OAC the same way the uploads bucket is configured. |
