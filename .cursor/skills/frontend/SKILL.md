---
name: frontend
description: Guide for working in the Meloy Judge Portal Next.js 15 frontend (meloy-judge-app). Use when adding pages, components, API calls, routes, auth-aware UI, or styling. Covers App Router structure, component patterns, auth flow, API client, judge profile context, and shadcn/Tailwind conventions.
---

# Meloy Judge App — Frontend Guide

## Stack
- **Next.js 15** App Router, TypeScript, React 18
- **Auth:** `@auth0/nextjs-auth0` v4 (middleware + `useUser()`)
- **Styling:** Tailwind v4 CSS-first (no `tailwind.config`), shadcn/ui new-york, TAMU maroon theme in `app/globals.css`
- **Icons:** `lucide-react`
- **Charts:** `recharts` (leaderboard analytics)
- **Path alias:** `@/*` → project root

---

## Directory Structure

```
meloy-judge-app/
├── app/
│   ├── layout.tsx                      # Root: Geist fonts, globals.css
│   ├── page.tsx                        # `/` public login page
│   ├── error-auth/page.tsx             # `/error-auth` Auth0 error display
│   ├── globals.css                     # Tailwind v4 + TAMU theme tokens (ACTIVE)
│   ├── api/
│   │   ├── token/route.ts              # GET /api/token → { token: idToken }
│   │   └── proxy/[...path]/route.ts   # BFF proxy: session → Bearer → Lambda
│   └── (protected)/                    # Auth-gated route group (not in URL)
│       ├── layout.tsx                  # Auth gates + AuthTokenProvider
│       ├── dashboard/page.tsx
│       ├── admin/page.tsx
│       ├── admin/events/create/page.tsx
│       ├── admin/events/[eventId]/manage/page.tsx
│       └── events/[eventId]/
│           ├── page.tsx
│           ├── leaderboard/page.tsx
│           ├── moderator/page.tsx
│           └── teams/[teamId]/page.tsx
├── components/
│   ├── authentication/                 # LoginScreen, AuthErrorScreen
│   ├── dashboard/                      # DashboardScreen
│   ├── events/                         # EventDetailScreen, Leaderboard screens
│   ├── judging/                        # JudgeSelectionScreen, TeamDetailScreen
│   ├── management/                     # AdminScreen, EventCreation, EventManager, ModeratorScreen
│   └── ui/                             # shadcn primitives (do not edit)
├── hooks/
│   ├── use-toast.ts                    # toast(), useToast()
│   └── use-mobile.ts                   # useIsMobile()
└── lib/
    ├── auth0.ts                        # Auth0Client singleton (server-only)
    ├── auth-context.tsx                # AuthTokenProvider, useAuthToken()
    ├── judge-context.ts                # localStorage judge profile helpers
    ├── utils.ts                        # cn() helper
    ├── types/api.ts                    # All shared TypeScript types
    └── api/                            # Typed API functions
        ├── client.ts                   # apiCall, get, post, put, patch, del, ApiError
        ├── auth.ts, events.ts, teams.ts, scores.ts
        ├── admin.ts, sponsors.ts, judges.ts, users.ts
        └── index.ts                    # Re-exports everything
```

---

## Adding a New Page

### Protected page (requires login)
1. Create `app/(protected)/your-route/page.tsx`
2. Mark `'use client'` if using hooks/state
3. Import your screen component; pass data/callbacks

```tsx
// app/(protected)/your-route/page.tsx
'use client';
import { YourScreen } from '@/components/your-feature/your-screen';

export default function YourPage() {
  return <YourScreen />;
}
```

The `(protected)/layout.tsx` handles auth automatically — no auth code needed in individual pages.

### Public page
Create directly under `app/` (not inside `(protected)/`).

---

## Adding a New Screen Component

Convention: **thin pages, fat screens**. All UI + data fetching lives in `components/`.

```
components/your-feature/your-screen.tsx   ← main screen
components/your-feature/index.ts          ← barrel export (optional)
```

Pattern:

```tsx
'use client';

import { useState, useEffect } from 'react';
import { useAuthToken } from '@/lib/auth-context';
import { getSomething } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

export function YourScreen() {
  const { isTokenValid, isValidating } = useAuthToken();
  const { toast } = useToast();
  const [data, setData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!isTokenValid || isValidating) return; // Wait for auth
    fetchData();
  }, [isTokenValid, isValidating]);

  async function fetchData() {
    try {
      const result = await getSomething();
      setData(result);
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to load', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }

  if (isLoading) return <div>Loading...</div>;
  return <div>{/* UI */}</div>;
}
```

**Key rule:** Always gate API calls on `isTokenValid && !isValidating`. This prevents 401s on page load.

---

## Adding a New API Function

All API calls go through the BFF proxy — never call the Lambda URL directly.

1. Add a function to the relevant file in `lib/api/`
2. Export it from `lib/api/index.ts`

```ts
// lib/api/events.ts
import { get, post, ApiError } from './client';
import type { YourType } from '@/lib/types/api';

export async function getYourThing(id: string): Promise<YourType> {
  return get<YourType>(`/events/${id}/your-thing`);
}

export async function createYourThing(data: { name: string }): Promise<YourType> {
  return post<YourType>('/your-thing', data);
}
```

Base URL is `/api/proxy` — the function path becomes `/api/proxy/events/123/your-thing`.

---

## Auth Patterns

### Check if user is logged in (client component)
```tsx
import { useUser } from '@auth0/nextjs-auth0/client';
const { user, isLoading } = useUser();
```

### Check role
```tsx
import { getCurrentUser } from '@/lib/api/auth';
const { user } = await getCurrentUser(); // returns from backend
// user.role: 'admin' | 'moderator' | 'judge'
const isAdmin = user.role === 'admin';
```

### Auth0 login / logout
```tsx
window.location.href = '/api/auth/login?returnTo=/dashboard';
window.location.href = '/api/auth/logout';
```

### Wait for token before fetching (inside AuthTokenProvider)
```tsx
const { isTokenValid, isValidating } = useAuthToken();
```

---

## Judge Profile Context (localStorage)

Judges pick a named profile per event. Stored in localStorage — not React state.

```ts
import {
  getJudgeProfile,     // { judgeId, judgeName } | null
  setJudgeProfile,     // (judgeId, judgeName) => void
  clearJudgeProfile,   // () => void
  hasJudgeProfile,     // () => boolean
  getJudgeId,          // () => string | null
  getJudgeName,        // () => string | null
  getCurrentEventId,   // () => string | null
} from '@/lib/judge-context';
```

---

## Styling Conventions

- Use `cn()` from `@/lib/utils` to merge class names
- Theme tokens: `bg-primary` (TAMU maroon), `bg-secondary` (cream), `text-primary-foreground`
- shadcn components live in `components/ui/` — import from there, never modify them
- Body is tablet-oriented: `text-lg` base size in `globals.css`
- Dark mode tokens defined but not toggled in UI currently

```tsx
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardContent } from '@/components/ui/card';

<Card className={cn('p-4', isActive && 'border-primary')}>
  <Button variant="default">Save</Button>
</Card>
```

---

## Key Types (`lib/types/api.ts`)

```ts
Event, Team, TeamMember, User, JudgeProfile, Sponsor,
RubricCriteria, ScoreSubmission,
LeaderboardResponse, EventInsightsResponse, ActivityLogItem
```

User roles: `'admin' | 'moderator' | 'judge'`

---

## Route Map (quick reference)

| URL | Component |
|-----|-----------|
| `/` | LoginScreen |
| `/dashboard` | DashboardScreen |
| `/events/:eventId` | EventDetailScreen + JudgeSelectionScreen |
| `/events/:eventId/teams/:teamId` | TeamDetailScreen |
| `/events/:eventId/leaderboard` | LeaderboardScreen |
| `/events/:eventId/moderator` | ModeratorScreen |
| `/admin` | AdminScreen |
| `/admin/events/create` | EventCreationScreen |
| `/admin/events/:eventId/manage` | EventManagerScreen |

---

## Common Gotchas

- `app/globals.css` is the active stylesheet — not `styles/globals.css`
- `hooks/use-toast.ts` is canonical — not `components/ui/use-toast.ts`
- No `<Auth0Provider>` in root layout — SDK v4 handles this via middleware
- `images.unoptimized: true` in `next.config.mjs` — no `<Image>` optimization
- TypeScript build errors are ignored (`typescript.ignoreBuildErrors: true`) — fix them anyway
- The `/settings` route referenced in dashboard UI **does not exist yet**
