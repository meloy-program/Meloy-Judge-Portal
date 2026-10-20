# Technical Review of the Meloy Judge Portal

This report is based only on the repository evidence available in [README.md](README.md), [BACKEND_OVERVIEW.md](BACKEND_OVERVIEW.md), [database/schema.sql](database/schema.sql), [lambda/template.yaml](lambda/template.yaml), and the application code under [meloy-judge-app](meloy-judge-app) and [lambda/src](lambda/src). It intentionally avoids assumptions about production usage not visible in code.

---

# 1. Project Overview & Problem

## What this application is

This project is a web application for running competitive judging workflows for Meloy Program events, specifically competition events of two types:
- Aggies Invent
- Problems Worth Solving

The product scope is visible in the schema, routes, and UI:
- Event management: [meloy-judge-app/components/management/event-creation-screen.tsx](meloy-judge-app/components/management/event-creation-screen.tsx)
- Team and scoring flows: [lambda/src/routes/events.routes.ts](lambda/src/routes/events.routes.ts) and [lambda/src/routes/scores.routes.ts](lambda/src/routes/scores.routes.ts)
- Event detail and judging interfaces: [meloy-judge-app/components/events/event-detail-screen.tsx](meloy-judge-app/components/events/event-detail-screen.tsx), [meloy-judge-app/components/judging/team-detail-screen.tsx](meloy-judge-app/components/judging/team-detail-screen.tsx), [meloy-judge-app/components/management/moderator-screen.tsx](meloy-judge-app/components/management/moderator-screen.tsx)

This is not a generic app; it is structured around competition operations:
- creating events
- assigning judges
- managing teams and members
- controlling presentation order
- collecting rubric-based evaluations
- calculating rankings and awards
- showing online judge status and moderator dashboards

## Actual users

The code indicates three main user classes:

- Admins
- Moderators
- Judges

Evidence:
- role constraints in [database/schema.sql](database/schema.sql)
- role checks in [lambda/src/middleware/auth.ts](lambda/src/middleware/auth.ts)
- UI flows in [meloy-judge-app/components/dashboard/dashboard-screen.tsx](meloy-judge-app/components/dashboard/dashboard-screen.tsx) and [meloy-judge-app/components/management/event-manager-screen.tsx](meloy-judge-app/components/management/event-manager-screen.tsx)

There is also a role migration record in [database/migrations/update_user_roles.sql](database/migrations/update_user_roles.sql) showing the system evolved from older role names toward a simplified model. The live code still contains some legacy references to “moderator” and a “member” default role in the schema, so the repository reflects a partially evolved role model rather than a single static identity design.

## Real-world workflow the app is designed to solve

The app appears to replace the operational coordination required for a live judging event:
- event staff creating and configuring competitions
- judges selecting a profile for an event
- moderators moving through the judging queue
- judges submitting rubric scores and comments
- administrators assigning awards and final rankings
- exporting results for recap or presentation

The strongest evidence is the combination of:
- event creation and judge account assignment in [meloy-judge-app/components/management/event-creation-screen.tsx](meloy-judge-app/components/management/event-creation-screen.tsx)
- score submission and upsert logic in [lambda/src/routes/scores.routes.ts](lambda/src/routes/scores.routes.ts)
- team status and moderator orchestration in [lambda/src/routes/events.routes.ts](lambda/src/routes/events.routes.ts)
- final leaderboard and award logic in the same route file and [meloy-judge-app/components/events/final-leaderboard-screen.tsx](meloy-judge-app/components/events/final-leaderboard-screen.tsx)

## What likely existed before the app

The repository does not document a specific legacy toolchain, so this is not directly provable. However, several signals suggest the app replaced a manual or semi-manual judging process:

- Score data is heavily normalized into relational tables rather than ad hoc spreadsheets.
- There is an export-to-Excel capability in [lambda/src/routes/events.routes.ts](lambda/src/routes/events.routes.ts), implying a need to package results outside the app.
- There are award tables and a recap workflow, which implies a formal event-closeout process rather than informal discussion.
- The schema includes “moderator control fields” such as `judging_phase` and `current_active_team_id`, which are operational workflow controls typically absent in manual scheduling.

The exact pre-app tooling remains undocumented; the code supports the conclusion that this replaced a more manual scheduling/scoring process, but not the precise predecessor.

## Major workflows the software supports

From the codebase, the app supports at least these major workflows:

1. Event creation and branding
   - admin creates event
   - chooses event type
   - sets dates/location
   - attaches sponsor branding and logo
   - assigns a dedicated judge account

2. Judge onboarding and profile selection
   - shared judge account
   - multiple event-specific judge profiles
   - profile selection before scoring

3. Moderator event orchestration
   - start/end judging phases
   - activate current team
   - track online judges
   - drive status transitions

4. Scoring
   - rubric criteria scoring with reflections
   - overall team comments
   - per-judge and per-team progress tracking

5. Leaderboard and awards
   - aggregate scoring
   - rank teams
   - assign top-three and special awards
   - final recap dashboards

6. Results/export
   - Excel export of event results
   - recap endpoints for completed events
   - sponsor/event presentation

## Why it matters operationally to the Meloy Program / Texas A&M

This app matters because it is handling actual competitive-event operations rather than a generic scheduling tool. It coordinates:
- multiple stakeholders (admins, moderators, judges)
- live event status
- real-time scoring and time-sensitive progression
- official award adjudication
- event branding and recap artifacts

The code and schema strongly suggest it exists in the context of institutional competition logistics at Texas A&M, with `@tamu.edu` data patterns and Meloy branding. This is operationally significant because the app is managing live event decision-making, not just record storage.

---

# 2. End-to-End System Architecture

## High-level runtime architecture

User
  ↓
Next.js frontend
  ↓
Next.js auth layer / API proxy
  ↓
AWS API Gateway HTTP API
  ↓
AWS Lambda (Express app)
  ↓
RDS PostgreSQL
  ↓
Secrets Manager / Auth0 / environment configuration

This is supported by:
- [meloy-judge-app/app/api/proxy/[...path]/route.ts](meloy-judge-app/app/api/proxy/[...path]/route.ts)
- [lambda/src/app.ts](lambda/src/app.ts)
- [lambda/template.yaml](lambda/template.yaml)
- [amplify.yml](amplify.yml)

## Frontend framework and architecture

The frontend is a Next.js app, evidenced by:
- [meloy-judge-app/package.json](meloy-judge-app/package.json)
- [meloy-judge-app/app/layout.tsx](meloy-judge-app/app/layout.tsx)
- [meloy-judge-app/middleware.ts](meloy-judge-app/middleware.ts)

Key architectural traits:
- App Router pattern (`app/`)
- protected routes under [meloy-judge-app/app/(protected)](meloy-judge-app/app/(protected))
- server-side Auth0 integration via `@auth0/nextjs-auth0`
- a proxy route to avoid direct browser-to-Lambda exposure and CORS issues

The frontend is primarily a client-driven UI with server-side session/identity management via Auth0 sessions. Most state is held in component-local `useState`/`useEffect` patterns rather than a global store.

## Backend/API architecture

The backend is a serverless Express monolith running in AWS Lambda:
- [lambda/src/app.ts](lambda/src/app.ts)
- [lambda/template.yaml](lambda/template.yaml)
- [lambda/package.json](lambda/package.json)

Key shape:
- single API function
- Express app mounted under a catch-all route
- route modules organize logic by domain
- authorization middleware runs at route level
- database access is via a shared connection layer

This is effectively a “serverless monolith” rather than microservices.

## Database(s)

The database is PostgreSQL on AWS RDS. Evidence:
- [database/schema.sql](database/schema.sql)
- [lambda/src/db/connection.ts](lambda/src/db/connection.ts)
- [lambda/template.yaml](lambda/template.yaml)

It is the system of record for:
- users
- events
- teams
- score submissions
- judge profiles
- awards
- activity log

## Authentication and authorization

The app uses Auth0 for the browser-facing identity layer, and then verifies JWTs in the Lambda API.
Evidence:
- [meloy-judge-app/lib/auth0.ts](meloy-judge-app/lib/auth0.ts)
- [meloy-judge-app/app/api/token/route.ts](meloy-judge-app/app/api/token/route.ts)
- [lambda/src/middleware/auth.ts](lambda/src/middleware/auth.ts)

Important nuance:
- The code also contains explicit CAS/TAMU auth references and JWT secret support in [lambda/template.yaml](lambda/template.yaml), plus an old CAS callback implementation in [lambda/src/app.old.ts](lambda/src/app.old.ts).
- The active frontend is clearly on Auth0, but the repo preserves both old and new auth patterns, which looks like a migration story rather than a fully single-auth system.

## Cloud infrastructure

Infrastructure components visible in repo:
- AWS Lambda
- API Gateway HTTP API
- RDS PostgreSQL
- Secrets Manager
- IAM role
- VPC with private subnets
- AWS Amplify hosting for Next.js app
- Auth0 as external identity provider

Evidence:
- [lambda/template.yaml](lambda/template.yaml)
- [amplify.yml](amplify.yml)
- [lambda/src/utils/secrets.ts](lambda/src/utils/secrets.ts)

## Storage

The repository shows:
- PostgreSQL as the primary state store
- static assets stored in the frontend app under [meloy-judge-app/public](meloy-judge-app/public)
- sponsor logos can be base64-encoded or URL-based per schema comments in [database/schema.sql](database/schema.sql)

There is no evidence of S3 being actively used in the UI or backend code. The schema allows `logo_url` to point to S3 or embedded data, but the implementation does not clearly show an S3 integration. This is not a confirmed AWS S3 deployment.

## External services / integrations

Confirmed:
- Auth0
- AWS Secrets Manager
- RDS Postgres
- Browser-based Next.js auth flow
- Possibly App Router hosting on AWS Amplify

Legacy/partial:
- CAS/TAMU callback references and a JWT-based local auth path

## Deployment / hosting architecture

The repository clearly points to:
- Amplify hosting for the Next.js frontend via [amplify.yml](amplify.yml)
- SAM deployment for the Lambda API via [lambda/template.yaml](lambda/template.yaml)

This is a split deployment model rather than a single monorepo deployment.

## Networking / security architecture

The Lambda is placed into a VPC with private subnets and a security group:
- [lambda/template.yaml](lambda/template.yaml)

This is a strong signal that the database is private and only reachable from the backend path. It is a common pattern for production serverless apps with private RDS.

The app uses:
- private database connectivity
- role-based API enforcement
- signed JWT verification
- environment-based secrets
- API Gateway CORS configuration

## CI/CD or automation

The strongest evidence is:
- [amplify.yml](amplify.yml) for frontend build/deploy automation
- AWS SAM template for API deployment
- migration endpoints and schema repair endpoints in [lambda/src/routes/admin.routes.ts](lambda/src/routes/admin.routes.ts)

There is no evidence of GitHub Actions or other CI pipelines in the repo itself. The project uses AWS Amplify and SAM, but the file set does not confirm a GitHub Actions workflow.

## Background/serverless processing

There is no clear event-driven queue or background worker in the repo. The app does have:
- polling refresh loops on the frontend (every 5s)
- heartbeat updates for online judge status
- database-backed status tracking
- serverless request handling only

Nothing in the available code suggests a queue-driven async pipeline or worker Lambda.

---

# 3. Frontend Engineering

## Major pages and screens

The frontend is organized around a competition workflow:
- landing/auth home: [meloy-judge-app/app/page.tsx](meloy-judge-app/app/page.tsx)
- dashboard: [meloy-judge-app/app/(protected)/dashboard/page.tsx](meloy-judge-app/app/(protected)/dashboard/page.tsx)
- event detail: [meloy-judge-app/app/(protected)/events/[eventId]/page.tsx](meloy-judge-app/app/(protected)/events/[eventId]/page.tsx)
- judge selection: [meloy-judge-app/components/judging/judge-selection-screen.tsx](meloy-judge-app/components/judging/judge-selection-screen.tsx)
- team detail and scoring: [meloy-judge-app/components/judging/team-detail-screen.tsx](meloy-judge-app/components/judging/team-detail-screen.tsx)
- moderator dashboard: [meloy-judge-app/components/management/moderator-screen.tsx](meloy-judge-app/components/management/moderator-screen.tsx)
- leaderboard: [meloy-judge-app/components/events/leaderboard-screen.tsx](meloy-judge-app/components/events/leaderboard-screen.tsx)
- event management: [meloy-judge-app/components/management/event-manager-screen.tsx](meloy-judge-app/components/management/event-manager-screen.tsx)
- event creation: [meloy-judge-app/components/management/event-creation-screen.tsx](meloy-judge-app/components/management/event-creation-screen.tsx)

## Important user workflows

The frontend is clearly designed for:
- role-aware navigation
- judge selection before scoring
- event-specific score entry
- live team status changes
- admin-driven event configuration
- final recap and award assignment

The event detail screen explicitly filters teams based on status and role, which is a meaningful product decision, not just presentation:
- [meloy-judge-app/components/events/event-detail-screen.tsx](meloy-judge-app/components/events/event-detail-screen.tsx)

## State management

Most state is React local state:
- `useState`
- `useEffect`
- `sessionStorage` for judge profile persistence
- a lightweight auth token context for validation

Evidence:
- [meloy-judge-app/app/(protected)/events/[eventId]/page.tsx](meloy-judge-app/app/(protected)/events/[eventId]/page.tsx)
- [meloy-judge-app/lib/auth-context.tsx](meloy-judge-app/lib/auth-context.tsx)

This is a pragmatic approach for a product of this scope, with more emphasis on reliable event flows than on a centralized store.

## Forms and validation

There are several visible form-heavy flows:
- event creation
- sponsor configuration
- judge profile creation
- team/member editing
- event detail updates

The package includes `react-hook-form`, `zod`, and `@hookform/resolvers` already in [meloy-judge-app/package.json](meloy-judge-app/package.json), which indicates the project anticipated structured form validation. The UI also includes obvious required-field checks in event creation and admin flows.

## Role-specific interfaces

The UI changes behavior based on `userRole` and event context:
- judge sees event detail + team scoring
- moderator sees moderation controls and live scoring matrix
- admin creates/edits events and manages sponsors/judges
- general users are filtered to assigned events only

This is visible in the conditional logic and route checks across [meloy-judge-app/app/(protected)](meloy-judge-app/app/(protected)).

## Admin functionality

The app includes a serious admin layer:
- event creation and editing
- sponsor branding
- judge account assignment
- team `status` management
- award assignment
- recap flow

See:
- [meloy-judge-app/components/management/event-manager-screen.tsx](meloy-judge-app/components/management/event-manager-screen.tsx)
- [meloy-judge-app/components/management/moderator-screen.tsx](meloy-judge-app/components/management/moderator-screen.tsx)

## Responsive/mobile behavior

The app is clearly designed for mobile and desktop event operations:
- responsive headers
- mobile-specific event title sections
- adaptive layouts and `sm:`/`md:` classes
- card layouts and large action buttons

This is visible throughout the screen components.

## Reusable components

The project heavily uses a shared design system:
- shadcn/ui-style components under [meloy-judge-app/components/ui](meloy-judge-app/components/ui)
- Radix primitives in [meloy-judge-app/package.json](meloy-judge-app/package.json)

This matters because it reflects a productized UI rather than a one-off prototype.

## Real-time / dynamic functionality

The most concrete live behavior:
- 5s automatic refresh of event and moderator data
- online judge status based on last activity
- active team transitions
- dynamic leaderboards
- update of status based on scoring completion

Evidence:
- [meloy-judge-app/components/events/event-detail-screen.tsx](meloy-judge-app/components/events/event-detail-screen.tsx)
- [meloy-judge-app/components/management/moderator-screen.tsx](meloy-judge-app/components/management/moderator-screen.tsx)
- [lambda/src/routes/judging.routes.ts](lambda/src/routes/judging.routes.ts)

## Performance optimizations

The repo does not present an advanced performance optimization story, but there are some real product-minded choices:
- background refresh without full page reload
- `Promise.all` used for parallel API calls in event fetches
- selective team filtering based on role and status
- reused sponsor branding logic

This is practical, not a performance-engineering trophy, but it shows attention to responsiveness in a live event setting.

## Technically interesting UI decisions

Notable decisions:
- same event can be viewed with different role-specific interfaces
- judge profile selection is persisted in browser session storage to avoid repeated selection
- moderator dashboard is essentially an operational control panel, not a generic admin screen
- event branding is configured per event with sponsor colors and logo support

---

# 4. Backend Engineering

## APIs and endpoints

The backend routes are split by domain:
- auth: [lambda/src/routes/auth.routes.ts](lambda/src/routes/auth.routes.ts)
- auth sync: [lambda/src/routes/auth-sync.routes.ts](lambda/src/routes/auth-sync.routes.ts)
- events: [lambda/src/routes/events.routes.ts](lambda/src/routes/events.routes.ts)
- teams: [lambda/src/routes/teams.routes.ts](lambda/src/routes/teams.routes.ts)
- scoring: [lambda/src/routes/scores.routes.ts](lambda/src/routes/scores.routes.ts)
- judging: [lambda/src/routes/judging.routes.ts](lambda/src/routes/judging.routes.ts)
- users: [lambda/src/routes/users.routes.ts](lambda/src/routes/users.routes.ts)
- admin/migrations: [lambda/src/routes/admin.routes.ts](lambda/src/routes/admin.routes.ts)
- sponsors: [lambda/src/routes/sponsors.routes.ts](lambda/src/routes/sponsors.routes.ts)

This is a domain-oriented Express API, not a CRUD-only backend. It organizes business logic by concern.

## Serverless function structure

The runtime is a single Lambda function bound to the API Gateway:
- [lambda/template.yaml](lambda/template.yaml)
- [lambda/src/app.ts](lambda/src/app.ts)

That means the app is a serverless API monolith, but the internal codebase is modular and route-oriented.

## Business logic

Core business logic appears in the route files and database queries:
- event filtering and role-aware access
- score submission upserts and validation
- judge session tracking
- leaderboard aggregation
- award assignment
- admin migration scripts

This is materially more than a thin wrapper; it includes real event-domain logic.

## Data validation

Validation in the repo is mixed:
- some websites enforce required fields in UI
- backend routes check required IDs and user ownership
- database constraints enforce allowed values and uniqueness

Examples:
- `CHECK` constraints on event type and role
- `UNIQUE` constraints on judge/team pairs
- route guards for missing IDs and invalid judge profiles

There is support for `joi` in [lambda/package.json](lambda/package.json), but the key routes do not appear to use a single centralized validation framework. So validation is partly declarative and partly manual.

## Authentication and authorization

This is a core engineering area:
- Auth0 token verification with JWKS
- DB lookup and auto-create user if absent
- role-based middleware (`requireRole`)
- route-specific permissions

See [lambda/src/middleware/auth.ts](lambda/src/middleware/auth.ts).

This is a real security boundary and likely a major design issue the team had to solve while integrating with institutional identity.

## Error handling

The app has:
- global Express error middleware in [lambda/src/app.ts](lambda/src/app.ts)
- per-route error responses
- error messages for invalid permissions, bad `judgeId`, missing IDs, and DB failures

There is no evidence of a fully standardized error taxonomy, but the backend is not careless about failures.

## Database access patterns

The DB is accessed through a reusable connection layer and SQL queries:
- [lambda/src/db/connection.ts](lambda/src/db/connection.ts)
- query strings embedded in route files

Patterns:
- query on the main executor
- `transaction` for multi-step writes
- `ON CONFLICT` for idempotent updates
- aggregate SQL for leaderboard/recap

This is production-oriented for a serverless app.

## Transactions

The clearest transactional logic is in score submission:
- create or update score submission
- delete previous scores
- insert/update new scores
- insert or update overall comments

This is a multi-step atomic write sequence and should be treated as a meaningful backend robustness choice. See [lambda/src/routes/scores.routes.ts](lambda/src/routes/scores.routes.ts).

## Concurrency considerations

The repository does not show heavy concurrency patterns or queue processing, but it does show:
- online status updates via last activity timestamps
- multiple judges scoring same team independently
- one unique score per judge+team+rubric criterion
- real-time refreshes on the frontend

The data model is designed for concurrent, multi-judge scoring without overwriting each other’s records.

## Background processing

Not much evidence of asynchronous jobs. The closest approximation is:
- heartbeat writes for online status
- polling frontends
- no queue or scheduled job in the repo

## Security controls

The backend contains meaningful security patterns:
- JWT verification on incoming requests
- role checks
- user lookup and authorization by DB record
- private database networking via VPC
- secret values externalized via environment variables/Secrets Manager

There is also an explicit dev bypass:
- `DEV_MODE` and `MOCK_USER` in [lambda/src/middleware/auth.ts](lambda/src/middleware/auth.ts)

This is a real engineering tradeoff and should be treated as a cautionary dev-only flag rather than production security.

## API design

The design is straightforward:
- Express serverless API
- role-protected endpoints
- resource-oriented routes (`/events`, `/teams`, `/scores`)
- database-backed read/write operations
- JSON API responses

It is not a formal API framework with OpenAPI generation, but it is coherent and practical.

## Technically difficult backend problems

The backend appears to solve several substantively difficult problems:
- shared judge accounts across multiple event-specific judge profiles
- real-time score aggregation with per-judge and per-team logic
- moderator-controlled active team state
- handling multiple identities in a university environment
- migration of schema over time without losing event data

---

# 5. Database & Data Model

## Database technology

The project uses PostgreSQL on AWS RDS, with Postgres extensions:
- `uuid-ossp`
- `pgcrypto`

Evidence:
- [database/schema.sql](database/schema.sql)

## Major tables and entities

From the schema:
- `users`
- `events`
- `sponsors`
- `judge_sessions`
- `event_judges`
- `teams`
- `team_members`
- `rubric_criteria`
- `score_submissions`
- `scores`
- `judge_comments`
- `activity_log`
- `password_reset_tokens`
- `schema_version`

In addition, the migration in [database/migrations/add_mentor_and_awards.sql](database/migrations/add_mentor_and_awards.sql) adds:
- `team_awards`

That gives roughly 13 core tables and 1 migration-added table in the current model.

## Relationships

The relationships are coherent and designed around competition-event workflows:
- one user can be assigned roles and can appear as event admin/owner
- many events can have many judge profiles
- many communities of event judges can share one user login account
- teams belong to an event
- team members belong to a team
- score submissions belong to a judge profile + team + event
- scores belong to a rubric criterion + submission
- awards belong to event and team
- activity log tracks event-related changes

## Schema design

It is a purposely event-centric model. The design is not generic “admin app” schema; it is explicitly built around competition semantics:
- `judging_phase`
- `current_active_team_id`
- `presentation_order`
- `project_url`
- `status` values like `waiting`, `active`, `completed`
- rubric criteria and score records

This is a strong sign the database was designed around operational judging logic, not just CRUD.

## Constraints

Examples:
- user role check constraint
- event type check constraint
- one `score` between 0 and 25
- `UNIQUE(event_id, judgeId, teamId)` behavior for submissions and comments
- `UNIQUE(event_id, name)` for judge profiles
- `UNIQUE(event_id, presentation_order)` for team order
- `UNIQUE(event_id, award_type)` for awards

These are real integrity controls.

## Indexes

The schema defines a substantial set of indexes, including:
- auth provider lookup
- active judge session lookup
- team/event lookup
- score submission completion status
- event activity log ordering

This indicates a database designed to work with live operational queries and event dashboards.

## Migrations

The repository includes multiple migration files:
- [database/migrations/add_auth_provider_support.sql](database/migrations/add_auth_provider_support.sql)
- [database/migrations/add_event_judge_account.sql](database/migrations/add_event_judge_account.sql)
- [database/migrations/add_mentor_and_awards.sql](database/migrations/add_mentor_and_awards.sql)
- [database/migrations/add_sponsor_id_to_events.sql](database/migrations/add_sponsor_id_to_events.sql)
- [database/migrations/update_user_roles.sql](database/migrations/update_user_roles.sql)

And admin migration endpoints in [lambda/src/routes/admin.routes.ts](lambda/src/routes/admin.routes.ts).

This suggests a real evolving production schema rather than a single static design.

## Transactions and data integrity

The most important integrity mechanism is atomic writes around scoring:
- add or update `score_submissions`
- replace the set of per-criterion scores
- ensure `judge_comments` stays consistent

The schema also uses triggers for:
- `updated_at`
- time spent calculation based on submitted time

This is a more mature DB design than a simple application table model.

## Query patterns

The queries are heavily aggregate-based:
- leaderboard aggregation
- judge online status
- scoring progress
- team completion counts
- award summary

This indicates a product that is not just storing data but computing operational metrics live.

---

# 6. Cloud / Infrastructure / Deployment

## Meaningful infrastructure technologies directly evidenced

- AWS Lambda
- API Gateway
- PostgreSQL on RDS
- IAM
- Secrets Manager
- VPC + private subnets
- Amplify frontend hosting
- Auth0
- Node.js/TypeScript
- AWS SAM
- environment variables

Evidence:
- [lambda/template.yaml](lambda/template.yaml)
- [lambda/package.json](lambda/package.json)
- [amplify.yml](amplify.yml)

## Roles of each major component

### Frontend host
Amplify runs the Next.js app. Evidence in [amplify.yml](amplify.yml).

### Backend runtime
Lambda hosts the Express API and all route logic.

### API layer
API Gateway exposes the Lambda as a public HTTP API.

### Data layer
RDS PostgreSQL stores all persistent state.

### Secrets
Secrets Manager holds database credentials and JWT secret references, configured in the SAM template.

### Identity
Auth0 handles browser identity; the Lambda verifies JWTs against the provider’s JWKS.

### Network
Private subnets and VPC configuration isolate the DB from direct public traffic.

## Security boundaries

The clear security model is:
- public browser -> Auth0/login flow
- authenticated browser session -> Next.js app
- Next.js proxy -> API Gateway -> Lambda
- Lambda -> private RDS in VPC

This is a good example of public interface + private data boundary.

## Private/public resources

Public:
- Amplify frontend
- API Gateway endpoint
- auth callback route

Private:
- RDS instance
- Lambda in VPC subnet
- DB credentials in Secrets Manager

## Secrets management

The repo names secrets explicitly:
- `RDSSecretArn`
- `JWTSecretArn`

It also includes environment variables in Amplify front-end config. This is an evidence-backed good practice for production-ish cloud deployment.

## Scalability decisions

The repo does not show autoscaling or queue architecture. It shows:
- Lambda with fixed memory and timeout
- VPC-bound backend
- stateless request processing
- database-backed state
- background polling instead of long-lived sockets

This is a simple serverless design tuned to event-driven operations, not high-volume transactional SaaS.

## Deployment architecture

The architecture is split:
- frontend under Amplify
- API under AWS SAM / Lambda
- database under RDS

This is a standard cloud deployment pattern for a small but operationally important SaaS-style internal portal.

---

# 7. Authentication & Security

## Authentication system

The active path is Auth0:
- Next.js Auth0 SDK
- browser user session
- ID token passed via proxy to backend
- JWT verified by `jose` + JWKS
- DB user lookup by `auth_provider` and `auth_provider_id`

Evidence:
- [meloy-judge-app/lib/auth0.ts](meloy-judge-app/lib/auth0.ts)
- [meloy-judge-app/app/api/proxy/[...path]/route.ts](meloy-judge-app/app/api/proxy/[...path]/route.ts)
- [lambda/src/middleware/auth.ts](lambda/src/middleware/auth.ts)

## Texas A&M CAS / SSO integration

There are multiple signals of an institutional auth migration:
- `CAS_SERVICE_URL` in [lambda/template.yaml](lambda/template.yaml)
- a CAS callback route in [lambda/src/routes/auth.routes.ts](lambda/src/routes/auth.routes.ts)
- a CAS auth handler in [lambda/src/handlers/auth/cas-callback.ts](lambda/src/handlers/auth/cas-callback.ts)
- legacy JWT-based auth functions in [lambda/src/utils/jwt.ts](lambda/src/utils/jwt.ts)

But the active application flow is overwhelmingly Auth0-based. The clearest factual statement is:
- the repository contains a CAS/TAMU direction and a migration path, but the implemented front-end and current runtime security path is Auth0-centric.

This is a meaningful “real-world” integration challenge and a likely example of evolving institutional identity constraints.

## User roles

Current schema:
- `member`
- `judge`
- `admin`

Legacy references still include `moderator`. This indicates a migration or compatibility layer. The role checks in the middleware clearly enforce permission sets.

## Authorization patterns

The API uses:
- `authenticate`
- `requireRole`

This means:
- normal route access is not enough
- permission is explicit and enforced server-side
- the frontend is treated as untrusted for security decisions

That’s a sound design.

## Session / token handling

The session flow is:
- Auth0 session attached to Next request
- Next.js route obtains ID token
- proxy forwards the bearer token to Lambda
- Lambda verifies token from Auth0
- DB user record is created or matched

This is a serious full-stack auth implementation, not a mock auth layer.

## Database security

The DB is private, the app uses secrets, and the Lambda is VPC-bound. This helps avoid direct public access. The schema also stores auth metadata in JSONB and uses unique indexes by auth provider.

## API security

The backend enforces:
- 401 on invalid / absent tokens
- 403 on insufficient role
- validation for required IDs
- no direct database access from the client
- CORS configuration in API Gateway

## Input validation

Validation is partially centralized:
- route checks for required fields
- DB constraints for ranges and uniqueness
- manual checking of `judgeId`s and event ownership

It is not a complete schema-validation architecture but it is not ad hoc either.

## Secrets

Secrets are not stored in code. They are referenced as ARNs and environment variable values:
- [lambda/template.yaml](lambda/template.yaml)

This is a real operational security control.

## Network isolation

The VPC/private subnet design is a strong signal of a production-minded backend deployment:
- public frontend
- private data plane
- only the Lambda can reach RDS

This pattern protects the DB from direct public access.

---

# 8. Full-Stack Workflows

## Workflow 1: Event creation and judge assignment

User path:
- Admin opens event creation screen
- fills required event fields
- chooses judge email account
- creates event
- associates sponsor branding
- sets the event-level judge account for future judge profiles

Flow:
- UI validated in [meloy-judge-app/components/management/event-creation-screen.tsx](meloy-judge-app/components/management/event-creation-screen.tsx)
- API creates event via `POST /events`
- API updates `judge_user_id` via `PUT /events/:eventId/judge-account`
- sponsor record created via `POST /sponsors`
- event updated with sponsor via `PUT /events/:eventId`

This demonstrates full-stack ownership across frontend, API, DB, identity, and event admin logic.

## Workflow 2: Judge selects profile and scores a team

User path:
- Judge logs in
- app loads event page
- if no valid judge session, judge selects a profile
- session saved in browser storage
- judge opens a team
- team score form is filled
- submission writes to DB as atomic transaction

Flow:
- judge profile selection in [meloy-judge-app/components/judging/judge-selection-screen.tsx](meloy-judge-app/components/judging/judge-selection-screen.tsx)
- session/check logic in [meloy-judge-app/app/(protected)/events/[eventId]/page.tsx](meloy-judge-app/app/(protected)/events/[eventId]/page.tsx)
- auth and judge ownership checks in [lambda/src/middleware/auth.ts](lambda/src/middleware/auth.ts)
- score write in [lambda/src/routes/scores.routes.ts](lambda/src/routes/scores.routes.ts)

This is a genuinely end-to-end judging workflow.

## Workflow 3: Moderator controls live event progression and judge status

User path:
- moderator sees team list, judge online status, and scoring completion
- status transitions move team from waiting -> active -> completed
- event phase can be ended

Flow:
- moderator dashboard loads aggregate team/judge status
- event routes provide live status endpoints
- judge sessions heartbeat updates last activity
- UI polls every 5 seconds

This is full operational control over event flow, not just scoring.

## Workflow 4: Leaderboard and final awards

User path:
- event ends
- moderator or admin reviews final totals
- top awards assigned
- leaderboard is loaded

Flow:
- score aggregation in SQL
- final ranking in route layer
- awards persisted in `team_awards`
- UI renders final leaderboard and award tabs

This is a concrete full-stack output with strong data synthesis.

## Workflow 5: Auth and app access

User path:
- user signs in via Auth0
- protected route validates session
- backend proxy obtains ID token
- API verifies against Auth0 JWKS
- user record is mapped to DB and authorized for event and role

This is the systems-level workflow tying identity, database, and app authorization together.

---

# 9. Engineering Challenges & Design Decisions

## 1. Multi-provider identity and role transition

Problem:
- The repo contains Auth0, CAS, local JWT, and legacy `moderator` semantics.

Constraint:
- The institution likely needed a stable identity flow while changing auth infrastructure.

Solution:
- `auth_provider` and `auth_provider_id` columns
- auth sync routes
- role-aware middleware
- migration scripts

Result:
- multiple identity sources can coexist in the same user model

## 2. Shared judge accounts with multiple event-specific profiles

Problem:
- One user account can represent many judges within a single event.

Constraint:
- judge identities are event-specific and can be selected independently.

Solution:
- `event_judges` table
- user_id shared per event
- unique judge profile names within an event
- session storage to keep the selected judge profile per event

Result:
- a single account can scale across many named judges without losing individual scoring attribution

## 3. Real-time operational monitoring

Problem:
- moderators need to see who is online and how far along scoring is.

Constraint:
- no heavy backend queue or event bus is present.

Solution:
- heartbeat writes
- `last_activity` timestamps
- 5-second client polling
- SQL views for online status and scoring progress

Result:
- responsive though not fully real-time at scale

## 4. Event scoring integrity under concurrent judge activity

Problem:
- multiple judges score one team and the display must remain consistent.

Constraint:
- each judge may score the same team separately; no overwriting.

Solution:
- unique constraints on submissions and score rows
- transaction-based write pattern
- team-judge mapping in `score_submissions`

Result:
- robust per-judge scoring data model

## 5. Schema evolution without full downtime

Problem:
- production data model needed to evolve after initial design.

Constraint:
- must allow adding columns and tables without tearing down data.

Solution:
- migration files
- admin routes to add columns and repair schema
- schema version checks and compatibility paths

This is a real operational software engineering pattern.

## 6. Private database access in serverless

Problem:
- Lambda and RDS need to talk securely.

Constraint:
- no public database exposure.

Solution:
- VPC + private subnets
- IAM role
- Secrets Manager
- explicit lambda environment variables

Result:
- production-aware backend architecture

---

# 10. Quantifiable Scale & Impact

## Verified Metrics

These are explicitly supported by the repo:

- 2 event types in schema: `aggies-invent`, `problems-worth-solving`
- 4 default rubric criteria in [database/schema.sql](database/schema.sql)
- 3 active role types in current schema: `member`, `judge`, `admin`
- 13 core tables in the schema, plus 1 migration-added `team_awards` table
- 1 API Gateway HTTP API and 1 Lambda function defined in [lambda/template.yaml](lambda/template.yaml)
- 1 RDS PostgreSQL database instance is the system of record
- 5-minute online activity threshold in the DB view
- 5-second refresh interval on the frontend for live event updates

## Technically Derivable Metrics

These can be counted from code:

- 10 route modules are mounted from [lambda/src/routes/index.ts](lambda/src/routes/index.ts)
- the frontend relies on a large shadcn/Radix component library, indicating a serious UI productization effort
- there are multiple “admin migration” endpoints for evolving schema over time
- sample test data includes multiple events, judge profiles, and team records
- award types include at least 7 categories in [database/migrations/add_mentor_and_awards.sql](database/migrations/add_mentor_and_awards.sql)

## Impact Metrics Not Available

The repo does not give reliable numbers for:
- number of real users in production
- number of events run per semester
- number of actually scored submissions
- number of judges active in a cycle
- approval or adoption metrics
- downtime or latency under real usage
- total dollars or institutional impact

These would need direct program records or production telemetry to verify.

---

# 11. Ownership / FDE Signals

This project provides strong evidence for “Forward Deployed Engineer”-style ownership, but only within the boundaries of the repo.

## Evidence of translating real user/program needs into software

Strong evidence:
- event-based competition operations in the app
- role-specific operations for admins/moderators/judges
- event creation and sponsor branding
- moderator status controls
- live scoring and results export

This is not a generic CRUD system; it is built around a specific operational problem.

## Evidence of design contribution, not just implementation

Strong evidence:
- domain model in [database/schema.sql](database/schema.sql)
- route-level architecture in [lambda/src/app.ts](lambda/src/app.ts)
- API Gateway + Lambda + RDS design in [lambda/template.yaml](lambda/template.yaml)
- migrations for evolving schema over time

This indicates design decisions rather than merely implementing tickets.

## Evidence of ownership across multiple layers

Strong evidence:
- front-end screens and UI logic
- Express backend routes
- SQL schema and queries
- AWS deployment architecture
- secrets and network design
- Auth0 and role enforcement

This is multi-layer ownership.

## Evidence of integration with institution-specific infrastructure

Strong evidence:
- University email patterns in data and migrations
- CAS/TAMU auth references
- Meloy Program branding and event naming
- event operations aligned with competition logistics

This is more than a toy app.

## Evidence of operational problem solving

Strong evidence:
- moderator and judge live status tracking
- award finalization
- score aggregation
- event flow control
- spreadsheet-like export + event recap

## What the repo cannot prove

The repo cannot prove:
- production uptime
- long-term maintenance history
- stakeholder satisfaction
- release cadence
- real adoption numbers
- specific incidents solved in production

It shows a strong operational design but not the full post-deploy story.

---

# 12. Strongest Technical Accomplishments

## 1. Event-scoped judging platform with role-aware workflows
Problem: a competition needed admins, judges, and moderators to operate in a shared but different workflow.  
Technologies: Next.js, Express/Lambda, PostgreSQL, Auth0, AWS.  
Depth: high.  
Result: a coherent operational app around judging events, not just score storage.  
Why notable: it coordinates the full event lifecycle.

## 2. Multi-judge scoring model with integrity guarantees
Problem: many judges score the same team and must not overwrite each other.  
Technologies: PostgreSQL constraints, transactions, `ON CONFLICT`, unique indexes.  
Depth: high.  
Result: per-judge, per-team, per-rubric scoring records with consistent updates.  
Why notable: this is core domain correctness.

## 3. Shared judge-account architecture with named event profiles
Problem: multiple named judges may share one login identity.  
Technologies: `event_judges`, user role mapping, session storage, backend validation.  
Depth: medium-high.  
Result: a practical production pattern for multi-judge competition administration.  
Why notable: it’s a thoughtful solution to institutional staffing constraints.

## 4. Real-time moderator/judge visibility
Problem: event staff need live job status and online presence.  
Technologies: `judge_sessions`, `last_activity`, frontend polling, SQL views.  
Depth: moderate-high.  
Result: moderators can see who is active and how scoring is progressing.  
Why notable: this is real operational orchestration.

## 5. Serverless architecture with private RDS access
Problem: secure, scalable backend with private data access.  
Technologies: Lambda, API Gateway, VPC, Secrets Manager, IAM.  
Depth: high.  
Result: a clean public/private split.  
Why notable: this is production-aware architecture.

## 6. Database migration system for evolving schema
Problem: the product evolved over time and needed schema-safe changes.  
Technologies: SQL migration files, admin endpoint migration tools, schema version records.  
Depth: strong.  
Result: schema changes are trackable and repairable.  
Why notable: good operational hygiene.

## 7. Full event lifecycle, including awards and recap
Problem: event results needed to be not only scored but also formally ranked and exported.  
Technologies: PostgreSQL aggregation, leaderboard queries, Excel export, award tables.  
Depth: high.  
Result: end-to-end result generation.  
Why notable: this is beyond basic data capture.

## 8. Identity integration strategy with institutional constraints
Problem: university identity and auth patterns are not trivial.  
Technologies: Auth0, JWT verification, CAS references, DB auth provider mapping.  
Depth: high.  
Result: a hybrid identity abstraction suitable for real institutional workflows.  
Why notable: this is very characteristic of FDE/embedded engineering.

## 9. Role-aware event UX
Problem: different personas need different views and permissions.  
Technologies: frontend role checks, backend middleware, route protection.  
Depth: moderate-high.  
Result: one app covers multiple stakeholder types without leaking access.  
Why notable: meaningful app design.

## 10. Sponsor/event branding configuration
Problem: events need branded presentation and self-contained look-and-feel.  
Technologies: sponsor table, theme colors, logos, event-level branding.  
Depth: moderate.  
Result: polished event presentation.  
Why notable: small but meaningful operational detail.

---

# 13. Technology Inventory

## Languages
- TypeScript
- SQL
- JavaScript (in the event of older code paths)
- HTML/CSS via Next.js and Tailwind

## Frontend
- Next.js 15
- React 18
- Tailwind CSS
- Radix UI primitives
- shadcn-style components
- Lucide React icons
- Recharts (visible in package file)
- `react-hook-form`
- `zod`
- `@hookform/resolvers`

## Backend
- Node.js 18
- Express
- serverless-http
- AWS Lambda
- TypeScript
- custom JWT utilities
- `jose`
- `jsonwebtoken`
- `pg`
- `bcryptjs`

## Databases
- PostgreSQL / RDS PostgreSQL
- JSONB metadata fields
- SQL views and triggers

## Cloud
- AWS Lambda
- AWS API Gateway
- Amazon RDS
- AWS IAM
- AWS Secrets Manager
- Amazon VPC
- AWS Amplify

## Infrastructure
- AWS SAM
- environment variables
- private subnets / security groups
- deployment via Amplify and SAM

## Authentication
- Auth0
- Auth0 Next.js SDK
- JWT verification with JWKS
- legacy CAS support references

## DevOps
- AWS Amplify build pipeline
- SAM deployment
- SQL migration files
- local SAM testing (`sam local start-api`)

## Testing
- Jest is in the backend package, but the repo does not show a meaningful active test suite for the full app.
- There are no confirmed end-to-end or unit tests in the codebase as evidence.

## Other
- Excel export via `exceljs`
- XML parsing library (`fast-xml-parser`)
- CORS middleware
- logging middleware
- session storage in browser
- static assets under `public`

---

# 14. Potential Resume Evidence

These are the strongest repository-backed evidence points to use later in a resume or technical review.

## 1. Serverless full-stack system with production-style cloud separation
Why it is strong:
- This demonstrates actual architecture design beyond a local app.
- It shows the candidate handled frontend, backend, database, networking, secrets, and deployment.

## 2. Multi-role operational judging platform
Why it is strong:
- The app supports multiple stakeholder personas and workflows in one product.
- That is a strong signal of building a real operational system rather than a toy demo.

## 3. Event scoring system with transactional integrity
Why it is strong:
- The scoring logic is not trivial.
- The code implements per-judge, per-team, per-rubric scoring with reliable writes and integrity constraints.

## 4. Auth + identity migration across institutional constraints
Why it is strong:
- This is realistic, hard engineering.
- It shows the ability to work in a university environment with identity and policy constraints.

## 5. AWS infrastructure and private-data design
Why it is strong:
- Good evidence of cloud engineering and secure network design.
- It demonstrates infrastructure thinking beyond application code.

## 6. Database schema evolution and migration practice
Why it is strong:
- It reflects production-level schema management.
- This is especially valuable because many applicants only build a single initial schema.

## 7. Real-time operational controls for a live event
Why it is strong:
- The moderator and judge dashboards reflect operational software, not just a static admin UI.
- This is a meaningful indicator of product understanding.

## 8. Results pipeline and final award generation
Why it is strong:
- It demonstrates the ability to take raw scoring data and turn it into a business-facing outcome.
- That is a strong FDE or product-ownership pattern.

---

## Bottom line

This project is materially more than a demo. It is a full-stack, role-aware operational platform for running live judging events, built across:
- Next.js frontend
- Express/Lambda backend
- PostgreSQL data model
- Auth0-based access control
- AWS deployment infrastructure
- migration-driven schema evolution

The repository provides solid evidence of engineering breadth and product seriousness. The greatest technical value is not in any single screen but in the fact that the app coordinates a real event workflow end-to-end, across identity, orchestration, scoring, analytics, and cloud deployment.
