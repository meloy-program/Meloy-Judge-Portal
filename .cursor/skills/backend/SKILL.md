---
name: backend
description: Guide for working in the Meloy Judge Portal Express Lambda backend (lambda/). Use when adding API endpoints, middleware, database queries, auth checks, role guards, or new routes. Covers route patterns, auth middleware, DB connection, response conventions, and the full endpoint inventory.
---

# Meloy Judge Lambda Backend — Developer Guide

## Stack
- **Express 5** wrapped by `serverless-http` → AWS Lambda (nodejs18.x)
- **API Gateway:** HTTP API, stage `/prod`, catch-all `/{proxy+}`
- **DB:** PostgreSQL on RDS (private VPC), `pg` pool, credentials from Secrets Manager
- **Auth:** Auth0 JWKS via `jose` + legacy local JWT via `jsonwebtoken`
- **Build:** TypeScript → `dist/`, handler `dist/app.handler`

---

## Directory Structure

```
lambda/src/
├── app.ts                  # Express app, route mounts, Lambda export
├── routes/                 # ALL live endpoints live here
│   ├── index.ts            # Barrel re-export
│   ├── auth.routes.ts      # /auth/me, /auth/logout, /auth/cas-callback (stub)
│   ├── auth-sync.routes.ts # /auth/sync-user (Auth0 Action upsert)
│   ├── events.routes.ts    # Events + sub-resources (phase, leaderboard, awards…)
│   ├── teams.routes.ts     # Team CRUD + members + status
│   ├── scores.routes.ts    # Scores + rubric
│   ├── judging.routes.ts   # Heartbeat, judge profiles, session start
│   ├── users.routes.ts     # User list + role update
│   ├── admin.routes.ts     # Migrations, schema init, seed, activity
│   ├── sponsors.routes.ts
│   └── judge-profiles.routes.ts  # Mounted at `/` (not `/judge-profiles`)
├── middleware/
│   ├── auth.ts             # authenticate, requireRole, AuthRequest type
│   └── logging.ts          # Request logger
├── db/
│   └── connection.ts       # query, queryOne, transaction, getDbPool
├── utils/
│   └── secrets.ts          # getSecret() — Secrets Manager with in-memory cache
└── types/
    └── index.ts            # Domain types, DbCredentials
```

> **`handlers/` is dead code** — all live logic is in `routes/`. Ignore it.

---

## Route Mounts (`app.ts`)

```
GET  /health                 → inline (no auth)
     /auth                   → authRoutes, then authSyncRoutes
     /events                 → eventsRoutes
     /teams                  → teamsRoutes
     /scores                 → scoresRoutes
     /rubric                 → scoresRoutes (same router — rubric at /rubric/rubric)
     /judge                  → judgingRoutes
     /users                  → usersRoutes
     /admin                  → adminRoutes
     /sponsors               → sponsorsRoutes
     /                       → judgeProfilesRoutes (paths include /events/…)
```

---

## Adding a New Endpoint

### 1. Find or create the right route file

Pick the feature file in `src/routes/`. If none fits, create one and add it to `routes/index.ts` and mount it in `app.ts`.

### 2. Write the route

```ts
import { Router } from 'express';
import { authenticate, requireRole, AuthRequest } from '../middleware/auth';
import { query, transaction } from '../db/connection';

const router = Router();

// Public read
router.get('/things', async (_req, res) => {
  try {
    const things = await query('SELECT * FROM things ORDER BY created_at DESC');
    res.json({ things });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to fetch things', details: error.message });
  }
});

// Auth-only write
router.post('/things', authenticate, async (req: AuthRequest, res) => {
  try {
    const { name } = req.body;
    const [thing] = await query(
      'INSERT INTO things (name, created_by) VALUES ($1, $2) RETURNING *',
      [name, req.user!.id]
    );
    res.status(201).json({ thing });
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to create thing', details: error.message });
  }
});

// Role-guarded
router.delete('/things/:id', authenticate, requireRole(['admin']), async (req: AuthRequest, res) => {
  try {
    await query('DELETE FROM things WHERE id = $1', [req.params.id]);
    res.status(204).send();
  } catch (error: any) {
    res.status(500).json({ error: 'Failed to delete thing', details: error.message });
  }
});

export default router;
```

### 3. Auth middleware options

| Middleware | When to use |
|---|---|
| *(none)* | Intentionally public (read-only, webhook) |
| `authenticate` | Any logged-in user |
| `authenticate, requireRole(['admin'])` | Admin only |
| `authenticate, requireRole(['admin', 'moderator'])` | Admin or moderator |

### 4. Response shape conventions

| Situation | Shape |
|---|---|
| Single entity | `res.json({ event })` |
| Collection | `res.json({ events, total? })` |
| Created | `res.status(201).json({ thing })` |
| Deleted | `res.status(204).send()` |
| Updated | `res.json({ thing })` |
| Error | `res.status(4xx).json({ error: 'message', details?: string })` |

---

## Database (`db/connection.ts`)

```ts
import { query, queryOne, transaction } from '../db/connection';

// Simple query — returns T[]
const rows = await query<YourType>(
  'SELECT * FROM table WHERE id = $1',
  [id]
);

// Single row — returns T | null
const row = await queryOne<YourType>(
  'SELECT * FROM table WHERE id = $1',
  [id]
);

// Transaction
await transaction(async (client) => {
  await client.query('INSERT INTO a ...', [...]);
  await client.query('INSERT INTO b ...', [...]);
});
```

**Important pool constraint:** `max: 1` connection per Lambda container. Never hold connections open across `await` calls outside of `transaction()`.

---

## Auth Flow (how `authenticate` works)

1. `DEV_MODE=true` → injects a mock admin user, skips all checks (only for local dev)
2. Requires `Authorization: Bearer <token>`
3. Decodes JWT without verifying to read `iss`
4. If `iss` contains `auth0.com`:
   - Verifies via Auth0 JWKS (`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
   - Tries audience = `AUTH0_AUDIENCE` (access token), falls back to `AUTH0_CLIENT_ID` (ID token)
   - Looks up user by `auth_provider='auth0'` + `auth_provider_id=sub`
   - **Auto-creates** user with `role='judge'` if not found
5. Else: verifies with local `jsonwebtoken` (legacy path)
6. Sets `req.user = { id, email, role, auth_provider }`

**`AuthRequest` type** — extend `Request` with optional `user`:
```ts
import { AuthRequest } from '../middleware/auth';
// req.user!.id, req.user!.role, req.user!.email
```

---

## Complete Endpoint Inventory

### Auth
| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/auth/me` | Auth | Returns `req.user` — used by frontend to validate token |
| POST | `/auth/logout` | Auth | Ends judge session `{ eventId, judgeId }` |
| POST | `/auth/sync-user` | Public | Auth0 Action upsert |

### Events
| Method | Path | Auth |
|---|---|---|
| GET | `/events` | Auth |
| POST | `/events` | Role(admin) |
| GET | `/events/:id` | Public |
| PUT | `/events/:eventId` | Role(admin,moderator) |
| DELETE | `/events/:eventId` | Role(admin) |
| GET | `/events/:eventId/teams` | Auth |
| POST | `/events/:eventId/teams` | Role(admin) |
| PATCH | `/events/:eventId/phase` | Role(moderator,admin) |
| GET | `/events/:eventId/leaderboard` | Public |
| GET | `/events/:eventId/leaderboard/detailed` | Public |
| GET | `/events/:eventId/insights` | Role(admin) |
| GET | `/events/:eventId/export-excel` | Role(admin) |
| GET | `/events/:eventId/judges/online` | Public |
| PUT | `/events/:eventId/team-active` | Role(moderator,admin) |
| GET | `/events/:eventId/moderator/status` | Role(moderator,admin) |
| GET | `/events/:eventId/my-progress` | Auth |
| GET | `/events/:eventId/awards` | Auth |
| POST | `/events/:eventId/awards` | Role(admin,moderator) |
| PUT | `/events/:eventId/judge-account` | Role(admin) |
| GET | `/events/:eventId/teams/scores` | Public |
| GET | `/events/recap` | Role(admin) |

### Teams
| Method | Path | Auth |
|---|---|---|
| GET | `/teams/:teamId` | Public |
| PUT | `/teams/:teamId` | Role(admin) |
| DELETE | `/teams/:teamId` | Role(admin) |
| POST | `/teams/:teamId/members` | Role(admin) |
| DELETE | `/teams/:teamId/members` | Role(admin) |
| PATCH | `/teams/:teamId/status` | Role(moderator,admin) |

### Scores
| Method | Path | Auth |
|---|---|---|
| POST | `/scores/` | Auth |
| GET | `/scores/rubric` | Public |
| GET | `/scores/:teamId/:judgeId` | Auth |

### Judging
| Method | Path | Auth |
|---|---|---|
| POST | `/judge/heartbeat` | Auth |
| GET | `/judge/profiles/:eventId` | Auth |
| POST | `/judge/session/start` | Auth |

### Judge Profiles (mounted at `/`)
| Method | Path | Auth |
|---|---|---|
| GET | `/events/:eventId/judge-profiles` | Role(admin) |
| POST | `/events/:eventId/judge-profiles` | Role(admin) |
| DELETE | `/judge-profiles/:profileId` | Role(admin) |

### Users
| Method | Path | Auth |
|---|---|---|
| GET | `/users` | Role(admin) |
| PUT | `/users/:userId/role` | Role(admin) |

### Sponsors
| Method | Path | Auth |
|---|---|---|
| POST | `/sponsors` | Role(admin) |
| PUT | `/sponsors/:sponsorId` | Role(admin) |
| DELETE | `/sponsors/:sponsorId` | Role(admin) |

### Admin (⚠️ mostly unauthenticated)
| Method | Path | Auth |
|---|---|---|
| GET | `/admin/activity` | Role(admin) |
| POST | `/admin/init-schema` | **Public** — drops all tables |
| POST | `/admin/seed-data` | **Public** |
| POST | `/admin/migrate-*` | **Public** |

---

## Common Gotchas

- **Route order matters** — in `events.routes.ts`, `/recap` must come before `/:id`, and `/teams/scores` before `/teams`
- **Judge profiles router** is mounted at `/` (not `/judge-profiles`) — paths like `GET /events/:eventId/judge-profiles` are from this router
- **Dual rubric mount** — scores router is mounted at both `/scores` and `/rubric`, so rubric is at `/scores/rubric` and `/rubric/rubric`
- **Export returns CSV**, not Excel — the route is named `export-excel` historically
- **User roles:** `admin | moderator | judge` (the DB check constraint also allows `member` but the app only creates `judge`)
- **5 MB body limit** — `express.json({ limit: '5mb' })` supports base64 image uploads
- **`basePath: '/prod'`** in `serverless(app, {...})` must stay in sync with the API Gateway stage name
