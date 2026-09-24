# Auth0 Implementation Guide

> **Purpose:** This document teaches another agent working in a similar tech stack (Next.js 15 App Router + Express Lambda + AWS Amplify + PostgreSQL) how to implement Auth0 from scratch using the exact patterns used in this project.

---

## Table of Contents

1. [Tech Stack & Architecture Overview](#1-tech-stack--architecture-overview)
2. [How Auth0 Fits In — The Big Picture](#2-how-auth0-fits-in--the-big-picture)
3. [Dependencies](#3-dependencies)
4. [Environment Variables](#4-environment-variables)
5. [Frontend: Auth0 Client Configuration](#5-frontend-auth0-client-configuration)
6. [Frontend: Next.js Middleware](#6-frontend-nextjs-middleware)
7. [Frontend: Navigation & Route Protection](#7-frontend-navigation--route-protection)
8. [Frontend: Token Validity Context](#8-frontend-token-validity-context)
9. [Frontend: The BFF Proxy — Session to Bearer Token](#9-frontend-the-bff-proxy--session-to-bearer-token)
10. [Frontend: API Client](#10-frontend-api-client)
11. [Frontend: Login & Logout Flows](#11-frontend-login--logout-flows)
12. [Backend: JWT Verification with JWKS](#12-backend-jwt-verification-with-jwks)
13. [Backend: Express `authenticate` Middleware](#13-backend-express-authenticate-middleware)
14. [Backend: Role-Based Authorization](#14-backend-role-based-authorization)
15. [Backend: Auth Routes (`/auth/me`, `/auth/logout`)](#15-backend-auth-routes-authme-authlogout)
16. [Database: Multi-Provider User Schema](#16-database-multi-provider-user-schema)
17. [Infrastructure: AWS Amplify Build Integration](#17-infrastructure-aws-amplify-build-integration)
18. [Infrastructure: Lambda / SAM Configuration](#18-infrastructure-lambda--sam-configuration)
19. [End-to-End Flow: Login → Protected API Call](#19-end-to-end-flow-login--protected-api-call)
20. [Key Design Decisions & Gotchas](#20-key-design-decisions--gotchas)

---

## 1. Tech Stack & Architecture Overview

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React, TypeScript |
| Auth SDK (frontend) | `@auth0/nextjs-auth0` v4 |
| Hosting | AWS Amplify Hosting (SSR mode) |
| Backend | Express.js running inside AWS Lambda (SAM) |
| API Gateway | AWS HTTP API Gateway (catch-all `/{proxy+}`) |
| Auth verification (backend) | `jose` library — manual JWKS verification |
| Database | PostgreSQL on AWS RDS |

**No Cognito. No Amplify Auth.** Auth0 is the sole identity provider. Amplify Hosting is only used as a build/deployment platform for the Next.js app — Auth0 env vars are injected at build time via Amplify's environment variable console and written to `.env.production` during the preBuild phase.

---

## 2. How Auth0 Fits In — The Big Picture

```
┌──────────────┐      1. /api/auth/login      ┌─────────────────┐
│   Browser    │ ──────────────────────────►  │   Auth0 (IdP)   │
│  (Next.js)   │ ◄────── redirect + code ───  │                 │
└──────┬───────┘                              └────────┬────────┘
       │                                               │
       │  2. /api/auth/callback                        │
       ▼                                               │
┌──────────────────────────┐   ◄── exchanges code ─────┘
│  Next.js Middleware      │
│  (auth0.middleware())    │
│  Stores session cookie   │
└──────┬───────────────────┘
       │  3. returnTo=/dashboard
       ▼
┌──────────────────────────┐
│  /(protected)/layout.tsx │
│  • useUser() — session?  │
│  • GET /api/proxy/auth/me│  ← validates session + token against backend
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  /api/proxy/[...path]    │  ← BFF: reads idToken from session cookie
│  Authorization: Bearer   │
│  <Auth0 ID Token>        │
└──────┬───────────────────┘
       │  HTTPS
       ▼
┌──────────────────────────┐
│  API Gateway → Lambda    │
│  authenticate middleware │  ← jose + JWKS verify
│  Auto-creates DB user    │
│  requireRole if needed   │
└──────┬───────────────────┘
       │
       ▼
┌──────────────────────────┐
│  PostgreSQL users table  │
│  auth_provider = 'auth0' │
└──────────────────────────┘
```

**Key architectural pattern — the BFF (Backend For Frontend) Proxy:**
The browser never sends tokens directly to the Lambda. Instead, the Next.js server acts as a proxy: it reads the Auth0 session cookie (which is HttpOnly and never accessible to JavaScript), extracts the ID token, and injects it as a `Bearer` header before forwarding to the Lambda. This is the most important security design decision in this architecture.

---

## 3. Dependencies

### Frontend (`meloy-judge-app/package.json`)

```bash
pnpm add @auth0/nextjs-auth0@^4
```

`@auth0/nextjs-auth0` v4 introduces a new API called `Auth0Client` — it is meaningfully different from v3. Do not use the v3 docs. In v4:
- You instantiate `Auth0Client` directly (no `handleAuth` route handler).
- Login/logout/callback are handled automatically by calling `auth0.middleware(request)` in `middleware.ts`.
- The `useUser()` client hook works without wrapping the app in `<UserProvider>` — the middleware exposes session data via internal API routes.

### Backend (`lambda/package.json`)

```bash
npm install jose@^5
```

`jose` is used for JWKS-based JWT verification. No Auth0 SDK is needed on the backend — just `jose`. `jsonwebtoken` is only used for the legacy local JWT path and is not part of the Auth0 flow.

---

## 4. Environment Variables

### Frontend Variables

These must be available at **both build time and runtime**. On Amplify, they are written to `.env.production` during the preBuild phase (see [Section 17](#17-infrastructure-aws-amplify-build-integration)).

| Variable | Description |
|---|---|
| `AUTH0_DOMAIN` | Your Auth0 tenant domain, e.g. `dev-xxxx.us.auth0.com` |
| `AUTH0_CLIENT_ID` | Auth0 application Client ID |
| `AUTH0_CLIENT_SECRET` | Auth0 application Client Secret (**server-side only, never expose to browser**) |
| `AUTH0_BASE_URL` | The full URL of your app, e.g. `https://your-amplify-app.amplifyapp.com` |
| `AUTH0_SECRET` | A long random string (32+ chars) used to encrypt the session cookie |
| `AUTH0_ISSUER_BASE_URL` | `https://${AUTH0_DOMAIN}` — written by Amplify for compatibility |
| `AUTH0_SCOPE` | Scopes, e.g. `openid profile email` |
| `API_URL` | Internal URL for the Lambda (used server-side by the proxy) |
| `NEXT_PUBLIC_API_URL` | Same as `API_URL` — can be used as a fallback |

> **Local development:** Create `.env.local` in `meloy-judge-app/` with all the above. Never commit it.

### Backend Variables (Lambda / SAM)

| Variable | Description |
|---|---|
| `AUTH0_DOMAIN` | Same tenant domain |
| `AUTH0_CLIENT_ID` | Used as the expected audience for **ID tokens** |
| `AUTH0_AUDIENCE` | Used as the expected audience for **access tokens** (optional first try) |
| `DEV_MODE` | Set to `'false'` in production; `'true'` bypasses auth entirely for local dev |

---

## 5. Frontend: Auth0 Client Configuration

**File:** `meloy-judge-app/lib/auth0.ts`

```typescript
import { Auth0Client } from '@auth0/nextjs-auth0/server';

export const auth0 = new Auth0Client({
  domain: process.env.AUTH0_DOMAIN!,
  clientId: process.env.AUTH0_CLIENT_ID!,
  clientSecret: process.env.AUTH0_CLIENT_SECRET!,
  appBaseUrl: process.env.AUTH0_BASE_URL!,
  secret: process.env.AUTH0_SECRET!,
  routes: {
    login: '/api/auth/login',
    logout: '/api/auth/logout',
    callback: '/api/auth/callback',
  },
});
```

**Why this works:**
- `Auth0Client` is imported from `@auth0/nextjs-auth0/server` — this is a **server-side-only** singleton. Never import it in client components.
- `secret` encrypts the session cookie at rest. Treat it like a password.
- The `routes` block tells the SDK which paths to handle. When `auth0.middleware(request)` receives a request to `/api/auth/login`, it initiates the PKCE flow. On `/api/auth/callback`, it exchanges the code for tokens and sets the session cookie. On `/api/auth/logout`, it clears the cookie and redirects to Auth0's logout endpoint.
- You do **not** need to create separate API route handlers for these paths — the middleware handles them automatically.

---

## 6. Frontend: Next.js Middleware

**File:** `meloy-judge-app/middleware.ts`

```typescript
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { auth0 } from "./lib/auth0";

export async function middleware(request: NextRequest) {
  // Intercept Auth0 callback errors and redirect to custom error page
  if (request.nextUrl.pathname === '/api/auth/callback') {
    const error = request.nextUrl.searchParams.get('error');
    if (error) {
      const errorDescription = request.nextUrl.searchParams.get('error_description');
      const redirectUrl = new URL('/error-auth', request.url);
      redirectUrl.searchParams.set('error', error);
      if (errorDescription) {
        redirectUrl.searchParams.set('error_description', errorDescription);
      }
      return NextResponse.redirect(redirectUrl);
    }
  }

  return await auth0.middleware(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
```

**How it works step by step:**

1. **`matcher`:** The middleware runs on every route except static assets. This is required — Auth0 middleware needs to intercept `/api/auth/*` paths to handle login/callback/logout.

2. **Error interception:** Auth0 can return an `?error=` query param to the callback URL (e.g., if the user denies consent, or a configuration error occurs). We intercept this *before* passing to `auth0.middleware()` and redirect to a custom `/error-auth` page with the error details. Without this, the SDK would throw an unhandled error.

3. **`auth0.middleware(request)`:** For every other request, this handles:
   - Session cookie refresh (silently renews tokens if expired)
   - Handling `/api/auth/login`, `/api/auth/logout`, `/api/auth/callback` routes
   - Exposing a `/auth/me` endpoint internally for `useUser()` to consume

4. **Important:** This middleware does **not** block unauthenticated access to `/(protected)/*` routes at the server level. Route protection is handled client-side in the protected layout (see Section 7). The API is still protected because the proxy requires a valid session and the Lambda requires a valid JWT.

---

## 7. Frontend: Navigation & Route Protection

### Public Home Page (`app/page.tsx`)

```typescript
'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { LoginScreen } from '@/components/authentication/login-screen';

export default function Home() {
  const { user, isLoading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && user) {
      router.push('/dashboard');
    }
  }, [user, isLoading, router]);

  if (isLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-lg">Loading...</div></div>;
  }

  if (user) return null; // Will redirect

  const handleLogin = () => {
    window.location.href = '/api/auth/login?returnTo=/dashboard';
  };

  return <LoginScreen onLogin={handleLogin} />;
}
```

- `useUser()` is imported from `@auth0/nextjs-auth0/client` — the client-side hook.
- If already logged in, redirect to `/dashboard`.
- If not logged in, show the `LoginScreen` component which triggers `/api/auth/login`.
- `?returnTo=/dashboard` tells Auth0 where to redirect the user after successful login. The SDK reads this and uses it as the post-callback redirect.

### Protected Route Group Layout (`app/(protected)/layout.tsx`)

All authenticated pages live under the `(protected)` route group. The layout file gates the entire group:

```typescript
'use client';

import { useUser } from '@auth0/nextjs-auth0/client';
import { useRouter, usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AuthTokenProvider } from '@/lib/auth-context';

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useUser();
  const router = useRouter();
  const pathname = usePathname();
  const [isValidatingToken, setIsValidatingToken] = useState(true);

  // Gate 1: Auth0 session check
  useEffect(() => {
    if (!isLoading && !user) {
      router.push(`/api/auth/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [user, isLoading, router, pathname]);

  // Gate 2: Backend token validation
  useEffect(() => {
    async function validateToken() {
      if (!user || isLoading) {
        setIsValidatingToken(false);
        return;
      }
      try {
        const response = await fetch('/api/proxy/auth/me', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(pathname)}`;
          return;
        }
        setIsValidatingToken(false);
      } catch (error) {
        window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(pathname)}`;
      }
    }
    validateToken();
  }, [user, isLoading, pathname]);

  if (isLoading || isValidatingToken) {
    return <div className="min-h-screen flex items-center justify-center"><div className="text-lg">Loading...</div></div>;
  }

  if (!user) return null;

  return (
    <AuthTokenProvider>
      {children}
    </AuthTokenProvider>
  );
}
```

**Two-gate protection pattern:**

| Gate | What it checks | What happens on failure |
|---|---|---|
| Gate 1 | `useUser()` — is there an Auth0 session cookie? | `router.push('/api/auth/login?returnTo=...')` |
| Gate 2 | `GET /api/proxy/auth/me` — is the token valid against the backend? | `window.location.href = '/api/auth/login?returnTo=...'` (hard nav to avoid stale state) |

Gate 2 is critical because it validates the **backend user record** exists and the token hasn't been invalidated. It goes through the BFF proxy so no token handling happens in the browser.

**Why `window.location.href` instead of `router.push` in Gate 2?**
`router.push` does a client-side navigation and may not clear all React state. `window.location.href` forces a full page reload + redirect, which is safer when you need to completely reset the auth state.

### Protected Route Structure

```
app/
└── (protected)/          ← Route group (parentheses = no URL segment)
    ├── layout.tsx         ← Auth gates + AuthTokenProvider
    ├── dashboard/
    │   └── page.tsx
    ├── admin/
    │   └── page.tsx
    ├── admin/events/
    │   └── create/page.tsx
    └── events/
        └── [eventId]/
            ├── page.tsx
            ├── moderator/page.tsx
            ├── leaderboard/page.tsx
            └── teams/[teamId]/page.tsx
```

All routes under `(protected)/` automatically inherit the auth gates from `layout.tsx`. To add a new protected route, simply create it under this directory.

---

## 8. Frontend: Token Validity Context

**File:** `meloy-judge-app/lib/auth-context.tsx`

```typescript
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

interface AuthContextType {
  isTokenValid: boolean;
  isValidating: boolean;
}

const AuthContext = createContext<AuthContextType>({
  isTokenValid: false,
  isValidating: true,
});

export function useAuthToken() {
  return useContext(AuthContext);
}

export function AuthTokenProvider({ children }: { children: ReactNode }) {
  const [isTokenValid, setIsTokenValid] = useState(false);
  const [isValidating, setIsValidating] = useState(true);
  const pathname = usePathname();

  useEffect(() => {
    async function validateToken() {
      setIsValidating(true);
      try {
        const response = await fetch('/api/proxy/auth/me', {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!response.ok) {
          window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(pathname)}`;
          return;
        }
        setIsTokenValid(true);
      } catch (error) {
        window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(pathname)}`;
      } finally {
        setIsValidating(false);
      }
    }
    validateToken();
  }, [pathname]); // Re-validates on every route change within the protected group

  return (
    <AuthContext.Provider value={{ isTokenValid, isValidating }}>
      {children}
    </AuthContext.Provider>
  );
}
```

**Purpose:** `AuthTokenProvider` wraps all protected page children and exposes `{ isTokenValid, isValidating }` via `useAuthToken()`. Individual page components (dashboard, admin, event pages) call `useAuthToken()` to defer their own API calls until `isTokenValid === true` and `isValidating === false`. This prevents pages from firing API requests with a potentially stale or missing token, especially on page transitions.

**Usage in a page component:**
```typescript
const { isTokenValid, isValidating } = useAuthToken();

useEffect(() => {
  if (!isTokenValid || isValidating) return; // Wait for token validation
  // Safe to make API calls here
  fetchMyData();
}, [isTokenValid, isValidating]);
```

---

## 9. Frontend: The BFF Proxy — Session to Bearer Token

**File:** `meloy-judge-app/app/api/proxy/[...path]/route.ts`

This is the most architecturally important file. It is a Next.js catch-all API route that proxies all backend requests, injecting the Auth0 ID token from the server-side session.

```typescript
import { auth0 } from '@/lib/auth0';
import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

async function handleProxy(req: NextRequest, path: string[], method: string) {
  try {
    // Step 1: Get Auth0 session (server-side — accesses HttpOnly cookie)
    const cookieStore = await cookies();
    const session = await auth0.getSession(req);

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized - Not authenticated' }, { status: 401 });
    }

    // Step 2: Extract ID token from session
    const idToken = session.tokenSet?.idToken;
    if (!idToken) {
      return NextResponse.json({ error: 'Unauthorized - No ID token' }, { status: 401 });
    }

    // Step 3: Build the backend URL
    const backendPath = path.join('/');
    const searchParams = req.nextUrl.searchParams.toString();
    const apiUrl = process.env.API_URL || process.env.NEXT_PUBLIC_API_URL;
    const backendUrl = `${apiUrl}/${backendPath}${searchParams ? `?${searchParams}` : ''}`;

    // Step 4: Forward the request with the Bearer token
    let body = undefined;
    if (method !== 'GET' && method !== 'DELETE') {
      const text = await req.text();
      body = text || undefined;
    }

    const response = await fetch(backendUrl, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${idToken}`,
      },
      body,
    });

    // Step 5: Handle response types
    if (response.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    // Handle binary responses (Excel, CSV)
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('spreadsheet') || contentType?.includes('octet-stream') || contentType?.includes('text/csv')) {
      const buffer = await response.arrayBuffer();
      return new NextResponse(buffer, {
        status: response.status,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': response.headers.get('content-disposition') || '',
        },
      });
    }

    const data = await response.json().catch(() => ({}));
    return NextResponse.json(data, { status: response.status });

  } catch (error: any) {
    console.error('[Backend Proxy] Error:', error.message);
    return NextResponse.json({ error: 'Proxy error', details: error.message }, { status: 500 });
  }
}

// Export all HTTP methods
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return handleProxy(req, path, 'GET');
}
export async function POST(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return handleProxy(req, path, 'POST');
}
export async function PUT(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return handleProxy(req, path, 'PUT');
}
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return handleProxy(req, path, 'PATCH');
}
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  return handleProxy(req, path, 'DELETE');
}
```

**Why this pattern:**
1. **Security:** The Auth0 session cookie is `HttpOnly` — JavaScript in the browser cannot read it. Only the Next.js server can call `auth0.getSession()` to extract the token. This is the correct way to handle tokens in a Next.js App Router application.
2. **CORS:** Without a proxy, the browser would need to call the Lambda API Gateway directly, requiring complex CORS configuration and exposing the API URL to the browser. With the proxy, only the Next.js origin communicates with the backend.
3. **Single responsibility:** All token attachment logic lives in one file. Individual page components call `/api/proxy/...` and never think about tokens.

**`export const dynamic = 'force-dynamic'`** — Required. This prevents Next.js from statically caching these routes. Every request must go through the live handler to get a fresh session read.

**Binary file support:** The proxy handles both JSON and binary (Excel/CSV) responses by checking the `Content-Type` header of the Lambda response and using `arrayBuffer()` instead of `json()` when appropriate.

---

## 10. Frontend: API Client

**File:** `meloy-judge-app/lib/api/client.ts`

```typescript
const API_URL: string = '/api/proxy';

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public response?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiCall<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const url = `${API_URL}${endpoint}`;  // e.g. /api/proxy/events/123

  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options?.headers,
      },
    });

    if (response.status === 204) return {} as T;

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new ApiError(
        data.error || `API request failed with status ${response.status}`,
        response.status,
        data
      );
    }

    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(error instanceof Error ? error.message : 'Network error occurred');
  }
}

// Convenience helpers
export const get = <T>(endpoint: string) => apiCall<T>(endpoint, { method: 'GET' });
export const post = <T>(endpoint: string, data?: any) => apiCall<T>(endpoint, { method: 'POST', body: data ? JSON.stringify(data) : undefined });
export const put = <T>(endpoint: string, data?: any) => apiCall<T>(endpoint, { method: 'PUT', body: data ? JSON.stringify(data) : undefined });
export const patch = <T>(endpoint: string, data?: any) => apiCall<T>(endpoint, { method: 'PATCH', body: data ? JSON.stringify(data) : undefined });
export const del = <T>(endpoint: string, data?: any) => apiCall<T>(endpoint, { method: 'DELETE', body: data ? JSON.stringify(data) : undefined });
```

Every API call in the frontend goes through `apiCall()`, which always uses `/api/proxy` as the base URL. No component ever directly calls the Lambda URL. No component ever handles tokens. Usage:

```typescript
import { get, post } from '@/lib/api/client';

// In a page component (after token is validated):
const events = await get<Event[]>('/events');
const newEvent = await post<Event>('/events', { name: 'Hackathon 2026' });
```

---

## 11. Frontend: Login & Logout Flows

### Login

Two ways login is triggered:

**1. Login button click (public `/` page or `LoginScreen` component):**
```typescript
window.location.href = '/api/auth/login?returnTo=/dashboard';
```
This triggers a full page navigation to the Auth0 middleware-handled route. The middleware initiates the PKCE flow with Auth0. After the user authenticates, Auth0 redirects to `/api/auth/callback` with a code, the middleware exchanges it for tokens, sets the session cookie, and redirects to `?returnTo` (i.e., `/dashboard`).

**2. Automatic redirect from protected layout (session expired or no session):**
```typescript
router.push(`/api/auth/login?returnTo=${encodeURIComponent(pathname)}`);
// or
window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(pathname)}`;
```
Always URL-encode the `returnTo` value. The current pathname is used so the user returns to the exact page they were trying to access.

### Logout

```typescript
window.location.href = '/api/auth/logout';
```

This hits the Auth0 middleware's logout handler which:
1. Clears the session cookie
2. Redirects to Auth0's `/v2/logout` endpoint (which clears Auth0's SSO session)
3. Auth0 then redirects back to the app's base URL

There is also a backend `POST /auth/logout` endpoint (for ending judge sessions in the database), but the UI logout path only calls `/api/auth/logout` — the SDK handles the rest.

---

## 12. Backend: JWT Verification with JWKS

**File:** `lambda/src/middleware/auth.ts`

The backend uses `jose` to verify Auth0 JWT tokens. There is no Auth0 SDK on the backend — verification is done manually using Auth0's public JWKS endpoint.

```typescript
import * as jose from 'jose';

async function verifyAuth0Token(token: string): Promise<any> {
  const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
  const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;    // For access tokens
  const AUTH0_CLIENT_ID = process.env.AUTH0_CLIENT_ID;  // For ID tokens

  if (!AUTH0_DOMAIN) throw new Error('AUTH0_DOMAIN not configured');

  // Load Auth0's public keys from the JWKS endpoint
  const JWKS = jose.createRemoteJWKSet(
    new URL(`https://${AUTH0_DOMAIN}/.well-known/jwks.json`)
  );

  // Try 1: Verify as access token (audience = API audience)
  if (AUTH0_AUDIENCE) {
    try {
      const { payload } = await jose.jwtVerify(token, JWKS, {
        issuer: `https://${AUTH0_DOMAIN}/`,
        audience: AUTH0_AUDIENCE,
      });
      return payload;
    } catch (error: any) {
      console.log('[auth] Access token verification failed, trying ID token:', error.message);
    }
  }

  // Try 2: Verify as ID token (audience = client ID)
  if (AUTH0_CLIENT_ID) {
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: `https://${AUTH0_DOMAIN}/`,
      audience: AUTH0_CLIENT_ID,
    });
    return payload;
  }

  // Fallback: Verify signature and issuer only
  const { payload } = await jose.jwtVerify(token, JWKS, {
    issuer: `https://${AUTH0_DOMAIN}/`,
  });
  return payload;
}
```

**ID token vs Access token — a critical detail:**

The BFF proxy sends the **ID token** (not an access token). ID tokens have `audience = AUTH0_CLIENT_ID` (the application's client ID). Access tokens have `audience = AUTH0_AUDIENCE` (the API identifier, which is typically the API Gateway URL).

The verification function tries access token verification first, which will fail for ID tokens (wrong audience), then falls back to ID token verification. This dual-try pattern supports both token types.

**How `jose.createRemoteJWKSet` works:**
Auth0 publishes its public signing keys at `https://<domain>/.well-known/jwks.json`. `jose` fetches and caches these keys automatically. When you call `jwtVerify`, it:
1. Decodes the JWT header to find the `kid` (key ID)
2. Fetches the matching public key from JWKS (cached)
3. Verifies the signature, `iss`, `aud`, and `exp` claims
4. Returns the payload if valid, throws if invalid

---

## 13. Backend: Express `authenticate` Middleware

**File:** `lambda/src/middleware/auth.ts`

```typescript
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  // DEV MODE bypass — never enable in production
  if (process.env.DEV_MODE === 'true') {
    req.user = { id: '...', netId: 'testuser', role: 'admin', auth_provider: 'local' };
    next();
    return;
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      res.status(401).json({ error: 'Unauthorized - No token provided' });
      return;
    }

    // Decode without verifying to check the issuer
    const unverifiedPayload = jose.decodeJwt(token);
    const isAuth0Token = typeof unverifiedPayload.iss === 'string' 
                         && unverifiedPayload.iss.includes('auth0.com');

    if (isAuth0Token) {
      // Auth0 path: verify with JWKS, auto-provision user
      const auth0Payload = await verifyAuth0Token(token);
      const user = await getUserFromDatabase('auth0', auth0Payload.sub as string, auth0Payload);
      
      if (!user) {
        res.status(500).json({ error: 'Failed to create or retrieve user' });
        return;
      }

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        auth_provider: 'auth0',
      };
    } else {
      // Legacy local JWT path (not used by Auth0 frontend)
      const payload = await verifyJwt(token) as any;
      req.user = { id: payload.id, netId: payload.netId, role: payload.role, auth_provider: 'local' };
    }

    next();
  } catch (error: any) {
    console.error('[auth-middleware] Token verification failed:', error.message);
    res.status(401).json({ error: 'Unauthorized - Invalid token', details: error.message });
  }
};
```

**Auto-provisioning new users:**

```typescript
async function getUserFromDatabase(
  auth_provider: string,
  auth_provider_id: string,
  userPayload?: any
): Promise<any> {
  let users = await query(
    `SELECT id, email, name, role, is_active, auth_provider 
     FROM users 
     WHERE auth_provider = $1 AND auth_provider_id = $2 AND is_active = true`,
    [auth_provider, auth_provider_id]
  );

  // If user doesn't exist, create them with default role 'judge'
  if ((!users || users.length === 0) && userPayload) {
    const newUsers = await query(
      `INSERT INTO users (email, name, role, auth_provider, auth_provider_id, auth_metadata, is_active)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, email, name, role, is_active, auth_provider`,
      [
        userPayload.email,
        userPayload.name || userPayload.email?.split('@')[0] || 'User',
        'judge',              // Default role — admin can upgrade later
        auth_provider,        // 'auth0'
        auth_provider_id,     // Auth0 sub (e.g., 'auth0|6612abc...')
        JSON.stringify(userPayload),  // Full token payload stored in auth_metadata
        true
      ]
    );
    return newUsers?.[0] ?? null;
  }

  return users?.[0] ?? null;
}
```

**The flow for a first-time Auth0 user:**
1. User authenticates with Auth0 for the first time.
2. Request arrives at Lambda with `Authorization: Bearer <idToken>`.
3. `authenticate` decodes the JWT, sees `iss` contains `auth0.com`.
4. `verifyAuth0Token` verifies signature and claims via JWKS.
5. `getUserFromDatabase` queries `WHERE auth_provider = 'auth0' AND auth_provider_id = '<sub>'` — not found.
6. New user row is inserted with `role = 'judge'` and the full JWT payload in `auth_metadata`.
7. `req.user` is set. Request continues.

**For returning users:** Steps 1–4 are the same, step 5 finds the existing row, steps 6–7 are skipped.

---

## 14. Backend: Role-Based Authorization

```typescript
export const requireRole = (roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Forbidden - Insufficient permissions' });
      return;
    }
    next();
  };
};
```

Used as a middleware chain on routes that require specific roles:

```typescript
// Only admins can create events
router.post('/events', authenticate, requireRole(['admin']), async (req, res) => { ... });

// Admins and moderators can view event management
router.get('/events/:id/manage', authenticate, requireRole(['admin', 'moderator']), async (req, res) => { ... });

// Any authenticated user can access this
router.get('/events/:id', authenticate, async (req, res) => { ... });
```

**Role values in the database:**
- `judge` — Default for new Auth0 users. Can score teams.
- `moderator` — Controls event flow (which team is active, judging phases).
- `admin` — Full access: create events, manage judges, view all scores, admin panel.

The frontend does role-based UI gating (e.g., only show the admin panel link to admins), but this is **display-only** — the real enforcement is on the Lambda via `requireRole`. Never rely on frontend-only role checks for security.

---

## 15. Backend: Auth Routes (`/auth/me`, `/auth/logout`)

**File:** `lambda/src/routes/auth.routes.ts`

```typescript
import { Router } from 'express';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// Get current authenticated user
router.get('/me', authenticate, async (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

// End judge session
router.post('/logout', authenticate, async (req: AuthRequest, res) => {
  try {
    const { eventId, judgeId } = req.body;
    if (eventId && judgeId) {
      await query(
        'UPDATE judge_sessions SET logged_out_at = NOW() WHERE judge_id = $1 AND event_id = $2 AND logged_out_at IS NULL',
        [judgeId, eventId]
      );
    }
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Logout failed' });
  }
});

export default router;
```

**`GET /auth/me`** is the most important route. The protected layout calls `GET /api/proxy/auth/me` to validate the token against the backend. If this returns 200, the token is valid and the user exists in the database. If it returns 401 or 403, the token is invalid and the frontend redirects to login. It requires `authenticate`, so it exercises the full JWKS verification + DB lookup path.

---

## 16. Database: Multi-Provider User Schema

**File:** `database/schema.sql`

```sql
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255),  -- NULL for OAuth users (Auth0)
    name VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'member' 
        CHECK (role IN ('member', 'judge', 'admin')),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    
    -- Multi-provider authentication columns
    auth_provider VARCHAR(20) DEFAULT 'local' 
        CHECK (auth_provider IN ('local', 'auth0', 'netid')),
    auth_provider_id VARCHAR(255),  -- Auth0 sub, e.g. 'auth0|6612abc123'
    auth_metadata JSONB,            -- Full token payload from Auth0
    
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Fast lookup by provider
CREATE INDEX idx_users_auth_provider ON users(auth_provider, auth_provider_id);

-- Prevent duplicate accounts from same provider
CREATE UNIQUE INDEX idx_users_auth_provider_unique 
    ON users(auth_provider, auth_provider_id) 
    WHERE auth_provider_id IS NOT NULL;
```

**Key design decisions:**

1. **`password_hash` is nullable** — Auth0 users never have a password in the database. The `NULL` is intentional.
2. **`auth_provider_id` stores the Auth0 `sub`** — The `sub` claim is Auth0's stable, unique identifier for a user (e.g., `auth0|6612abc123def`). It never changes even if the user updates their email.
3. **`auth_metadata JSONB`** — The full decoded JWT payload is stored. This preserves everything Auth0 sends (email, name, picture, org info, etc.) for auditing and future use.
4. **Composite unique index** — `(auth_provider, auth_provider_id)` with a `WHERE auth_provider_id IS NOT NULL` partial index prevents the same Auth0 user from having duplicate accounts.
5. **`role` defaults to `'judge'`** — New Auth0 users are auto-provisioned with the lowest privilege role. An admin must manually upgrade a user to `moderator` or `admin`.

**Migration for existing databases:** If adding Auth0 to a database that already has local users, run an `ALTER TABLE` to add the three new columns:

```sql
ALTER TABLE users 
    ADD COLUMN auth_provider VARCHAR(20) DEFAULT 'local' 
        CHECK (auth_provider IN ('local', 'auth0', 'netid')),
    ADD COLUMN auth_provider_id VARCHAR(255),
    ADD COLUMN auth_metadata JSONB;

-- Update existing users
UPDATE users SET auth_provider = 'local' WHERE auth_provider IS NULL;

-- Add indexes
CREATE INDEX idx_users_auth_provider ON users(auth_provider, auth_provider_id);
CREATE UNIQUE INDEX idx_users_auth_provider_unique 
    ON users(auth_provider, auth_provider_id) 
    WHERE auth_provider_id IS NOT NULL;
```

---

## 17. Infrastructure: AWS Amplify Build Integration

**File:** `amplify.yml`

```yaml
version: 1
applications:
  - appRoot: meloy-judge-app
    framework: nextjs
    frontend:
      phases:
        preBuild:
          commands:
            - corepack enable
            - corepack prepare pnpm@latest --activate
            # Write Amplify env vars to .env.production BEFORE install/build
            - echo "AUTH0_DOMAIN=$AUTH0_DOMAIN" >> .env.production
            - echo "AUTH0_CLIENT_ID=$AUTH0_CLIENT_ID" >> .env.production
            - echo "AUTH0_CLIENT_SECRET=$AUTH0_CLIENT_SECRET" >> .env.production
            - echo "AUTH0_BASE_URL=$AUTH0_BASE_URL" >> .env.production
            - echo "AUTH0_SECRET=$AUTH0_SECRET" >> .env.production
            - echo "AUTH0_ISSUER_BASE_URL=$AUTH0_ISSUER_BASE_URL" >> .env.production
            - echo "AUTH0_SCOPE=$AUTH0_SCOPE" >> .env.production
            - echo "APP_BASE_URL=$APP_BASE_URL" >> .env.production
            - echo "NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL" >> .env.production
            - echo "API_URL=$NEXT_PUBLIC_API_URL" >> .env.production
            - pnpm install --frozen-lockfile
        build:
          commands:
            - pnpm run build
      artifacts:
        baseDirectory: .next
        files:
          - '**/*'
      cache:
        paths:
          - node_modules/**/*
          - .next/cache/**/*
```

**Why env vars are written to `.env.production` manually:**

Amplify Hosting supports injecting environment variables via its console. However, for Next.js SSR with App Router, `process.env` values need to be present at build time (for static analysis) **and** runtime (for server components and API routes). The `echo "VAR=$VAR" >> .env.production` pattern ensures the variables are materialized in a file before `pnpm install` and `pnpm run build` run, so Next.js picks them up correctly.

**Setting env vars in Amplify Console:**
1. Go to AWS Amplify Console → Your App → Environment variables
2. Add all the Auth0 variables listed above
3. Amplify makes them available as shell env vars during the build, and the `preBuild` commands write them to `.env.production`

**Important:** `AUTH0_CLIENT_SECRET` and `AUTH0_SECRET` are sensitive. They must be stored in Amplify's environment variable store (not in the `amplify.yml` file itself, which is committed to version control).

---

## 18. Infrastructure: Lambda / SAM Configuration

**File:** `lambda/template.yaml` (relevant section)

```yaml
Globals:
  Function:
    Environment:
      Variables:
        AUTH0_DOMAIN: dev-xxxx.us.auth0.com
        AUTH0_CLIENT_ID: <your-client-id>
        AUTH0_AUDIENCE: https://<api-gateway-url>/prod
        DEV_MODE: 'false'
```

**API Gateway setup:** An HTTP API with a catch-all route `/{proxy+}` pointing to the Express Lambda. CORS is configured to allow the Amplify origin and `localhost` origins, and to allow the `Authorization` header (required for Bearer tokens).

```yaml
# Approximate SAM CORS config
HttpApi:
  CorsConfiguration:
    AllowOrigins:
      - "https://your-app.amplifyapp.com"
      - "http://localhost:3000"
    AllowHeaders:
      - "Authorization"
      - "Content-Type"
    AllowMethods:
      - "GET"
      - "POST"
      - "PUT"
      - "PATCH"
      - "DELETE"
      - "OPTIONS"
```

**No API Gateway JWT Authorizer:** Auth0 JWT verification is handled entirely in the Express `authenticate` middleware inside Lambda, not at the API Gateway layer. This gives more flexibility (e.g., reading the `iss` claim to decide which verification path to use) at the cost of one extra function invocation even for unauthorized requests.

---

## 19. End-to-End Flow: Login → Protected API Call

### Step 1: User clicks "Sign In"
```
Browser: window.location.href = '/api/auth/login?returnTo=/dashboard'
```

### Step 2: Next.js Middleware handles `/api/auth/login`
```
auth0.middleware() redirects → https://dev-xxxx.us.auth0.com/authorize?
  response_type=code&
  client_id=<CLIENT_ID>&
  redirect_uri=https://your-app.amplifyapp.com/api/auth/callback&
  scope=openid profile email&
  state=<random>&
  code_challenge=<PKCE>
```

### Step 3: User authenticates on Auth0's hosted login page
Auth0 redirects back to: `https://your-app.amplifyapp.com/api/auth/callback?code=<code>&state=<state>`

### Step 4: Next.js Middleware handles `/api/auth/callback`
```
auth0.middleware() exchanges code → Auth0 /oauth/token
Auth0 returns: { id_token, access_token, refresh_token }
Middleware sets encrypted session cookie
Redirects to /dashboard (from returnTo)
```

### Step 5: Protected Layout Renders
```
useUser() → reads session from /auth/profile endpoint (managed by middleware)
  → user is present ✓
Gate 2: fetch('/api/proxy/auth/me')
  → proxy reads session, extracts idToken
  → calls Lambda: GET /auth/me
  → Lambda: verifyAuth0Token → getUserFromDatabase → returns user
  → 200 OK ✓
isValidatingToken = false → render children
```

### Step 6: Page makes API call
```typescript
// In dashboard page:
const data = await get<EventsResponse>('/events');
// → GET /api/proxy/events
// → proxy: session.tokenSet.idToken → Authorization: Bearer <idToken>
// → Lambda: GET /events
// → authenticate middleware: verifies token, loads req.user
// → returns data
```

### Logout Flow
```
window.location.href = '/api/auth/logout'
→ auth0.middleware() clears session cookie
→ redirects to https://dev-xxxx.us.auth0.com/v2/logout?client_id=...&returnTo=https://your-app.amplifyapp.com
→ Auth0 clears SSO session
→ redirects to app base URL (/)
→ useUser() returns null
→ LoginScreen renders
```

---

## 20. Key Design Decisions & Gotchas

### ✅ DO: Use the BFF Proxy pattern
Never let the browser call the Lambda directly with a token. Always use the Next.js server as an intermediary that reads the HttpOnly session cookie and injects the token server-side.

### ✅ DO: Use `@auth0/nextjs-auth0` v4 API
The v4 API uses `Auth0Client` + `auth0.middleware()`. The v3 API used `handleAuth()` route handlers. These are completely different. Make sure documentation you reference matches the version you're using (`^4.x`).

### ✅ DO: Use `jose` for backend verification
`jose` is a lightweight, well-maintained library that handles JWKS fetching and caching. You do not need the full Auth0 SDK on the backend.

### ✅ DO: Store `auth_provider_id` (the `sub` claim) as the primary identifier
The `sub` claim is stable and unique. The user's email can change; the `sub` never does.

### ✅ DO: Default new Auth0 users to the lowest role
Auto-provisioning users with `role = 'judge'` ensures no one accidentally gets admin access. Admins manually grant elevated roles.

### ⚠️ GOTCHA: ID token vs Access token audience
The proxy sends the **ID token**. ID tokens have `audience = AUTH0_CLIENT_ID`. The Lambda's `verifyAuth0Token` tries access token verification first (which fails) then falls back to ID token verification. This is by design but means the first verification attempt always logs an error — that's expected behavior, not a bug.

### ⚠️ GOTCHA: `export const dynamic = 'force-dynamic'`
The proxy route (`/api/proxy/[...path]/route.ts`) and token route (`/api/token/route.ts`) must have `export const dynamic = 'force-dynamic'`. Without this, Next.js may try to statically cache these routes during build, which breaks session reading.

### ⚠️ GOTCHA: Middleware must match ALL routes (except static)
The `matcher` in `middleware.ts` must match `/api/auth/*` routes for the SDK to intercept login/callback/logout. If you exclude `/api/*` from the matcher, Auth0 routes won't work.

### ⚠️ GOTCHA: `AUTH0_BASE_URL` must exactly match your app URL
Auth0 uses `appBaseUrl` to set allowed callback URLs and to construct the redirect after logout. It must exactly match what you've registered in your Auth0 Application settings under "Allowed Callback URLs" and "Allowed Logout URLs":
```
Allowed Callback URLs: https://your-app.amplifyapp.com/api/auth/callback
Allowed Logout URLs:   https://your-app.amplifyapp.com
Allowed Web Origins:   https://your-app.amplifyapp.com
```

### ⚠️ GOTCHA: No `<UserProvider>` wrapper needed in v4
In `@auth0/nextjs-auth0` v3, you had to wrap the app in `<UserProvider>`. In v4, this is not needed — `useUser()` works via the middleware's internal session endpoint. Do not add `<UserProvider>` to your `app/layout.tsx`.

### ⚠️ GOTCHA: `pnpm install` must run AFTER env vars are written
In `amplify.yml`, the `echo ... >> .env.production` commands must come **before** `pnpm install`. Some Next.js plugins and `next.config.mjs` code runs during install, and they may need the env vars to be present.

### ⚠️ GOTCHA: Auth0 callback error handling
Auth0 can return `?error=access_denied` to the callback URL (e.g., when an org policy blocks the user). Without the middleware error intercept in `middleware.ts`, the SDK throws an unhandled error. Always handle this case and redirect to a friendly error page.

### ℹ️ NOTE: Client-only route protection
The `/(protected)/layout.tsx` protection is client-side. A server-rendered response for a protected route is returned to the browser before the client-side auth check runs. This is acceptable because:
1. No sensitive data is embedded in the initial HTML (data is fetched client-side after auth check)
2. All real data APIs are protected at the Lambda level regardless
3. The UX briefly shows a loading state while the check runs

If you need server-side route protection (e.g., for SEO or to prevent even the HTML from loading), use `auth0.getSession()` in a Server Component or `generateMetadata` function to redirect before rendering.

---

## Quick Implementation Checklist

For a new agent implementing Auth0 in the same stack:

- [ ] Install `@auth0/nextjs-auth0@^4` in the Next.js app
- [ ] Install `jose@^5` in the Lambda
- [ ] Create `lib/auth0.ts` with `Auth0Client` config
- [ ] Create `middleware.ts` with `auth0.middleware()` and error handling
- [ ] Create `app/api/proxy/[...path]/route.ts` BFF proxy
- [ ] Create `app/(protected)/layout.tsx` with two-gate auth check
- [ ] Create `lib/auth-context.tsx` with `AuthTokenProvider` and `useAuthToken`
- [ ] Create `lib/api/client.ts` with `apiCall` using `/api/proxy` base URL
- [ ] Add `authenticate` middleware in Express using `jose` JWKS verification
- [ ] Add `requireRole` middleware for role-based route protection
- [ ] Add `auth_provider`, `auth_provider_id`, `auth_metadata` columns to `users` table
- [ ] Add Auth0 env vars to Amplify Console
- [ ] Update `amplify.yml` preBuild to echo env vars to `.env.production`
- [ ] Set Lambda env vars: `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_AUDIENCE`
- [ ] Register callback/logout/origin URLs in Auth0 Application settings
- [ ] Set `DEV_MODE=false` in Lambda production environment
