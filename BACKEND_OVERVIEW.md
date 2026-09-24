# Backend Overview and Practical Limits

This repository uses a serverless backend pattern for the frontend application. The backend is not a set of independent microservices. It is closer to a single API application deployed as AWS Lambda behind API Gateway, with PostgreSQL in RDS as the source of truth.

This document is meant to help another codebase understand the actual shape of the backend, the constraints that come with it, and the workarounds we use to keep development and deployment manageable.

## High-Level Architecture

The current flow is:

Frontend -> API Gateway -> Lambda -> RDS PostgreSQL

Supporting services include:

- AWS Secrets Manager for database credentials and signing secrets
- AWS Amplify or a frontend host for the web app
- TypeScript for the API implementation
- SQL migration files for schema changes and data updates

The important detail is that the frontend never talks to the database directly. Every data change has to go through the API layer, and the API layer is the only place where authentication, authorization, request validation, and database access are coordinated.

## What The Backend Actually Is

Although the backend is organized into folders like routes, handlers, middleware, queries, and utils, deployment-wise it behaves like one application.

That means:

- A single Lambda bundle contains the API code.
- API Gateway forwards requests into that Lambda.
- Express-style routing inside Lambda decides which handler runs.
- Database queries live in the backend codebase, not in the frontend.
- All auth, role checks, and response formatting happen server-side.

This is simpler than maintaining many small services, but it also means the backend has shared runtime, shared configuration, and shared deployment boundaries.

## Main Limitations

### 1. There is no direct frontend access to RDS

The frontend cannot edit the database directly. It must call an API route, and that route must be implemented in the Lambda backend.

Practical impact:

- Any new screen that needs data must have an API endpoint first.
- Any form submission must map to a backend route and query.
- You cannot treat the frontend like it has a local model of the database.

Workaround:

- Add the endpoint in the backend first.
- Use the backend query layer to encapsulate the SQL.
- Keep the frontend thin and focused on presentation and user interaction.

### 2. All API logic deploys together

Because the backend is packaged as one Lambda application, a change to one route usually means redeploying the whole API bundle.

Practical impact:

- Small edits still go through the same build and deploy flow.
- You do not get fully independent deploys for each endpoint.
- Shared code changes can affect unrelated routes if the bundle has a regression.

Workaround:

- Keep route-specific logic isolated in handler files.
- Keep shared utilities small and stable.
- Use focused tests and local validation before deployment.

### 3. Lambda execution is stateless

Each request has to succeed without depending on in-memory state from a previous request.

Practical impact:

- Sessions, auth state, and temporary data cannot live in memory alone.
- Caches inside the Lambda can help performance, but they are not guaranteed.
- Any important state must be stored in the database, in tokens, or in an external service.

Workaround:

- Treat the database as the source of truth.
- Recompute request context from the token or user record on each call.
- Only use in-memory caching for optional performance improvements.

### 4. RDS connectivity adds deployment complexity

Since Lambda needs to talk to a private RDS database, networking and secrets matter.

Practical impact:

- The Lambda must be configured with the correct VPC access.
- Security groups and subnets have to be correct.
- Database credentials must be fetched from Secrets Manager.
- Local development cannot assume the same network path as production.

Workaround:

- Store credentials in Secrets Manager, not in code.
- Use environment variables to inject secret ARNs and runtime settings.
- Keep a local development path that can point at a dev database or a separate local setup when needed.

### 5. Schema changes are separate from API changes

Updating the API is not enough if the database schema does not match.

Practical impact:

- New fields often require SQL migration files.
- Renaming or removing fields has to be coordinated carefully.
- API code and database schema can drift if migrations are skipped.

Workaround:

- Treat migrations as part of the feature, not an afterthought.
- Update schema, seed/test data, and API code together.
- Verify the backend against real or representative data after schema changes.

### 6. Frontend and backend must stay in sync manually

The frontend depends on the contract exposed by the API.

Practical impact:

- If an endpoint changes shape, the frontend must be updated too.
- If the backend adds new validation rules, the frontend may need to mirror them.
- If auth changes, the frontend login flow can break without warning.

Workaround:

- Keep response formats consistent.
- Use typed shared shapes where possible.
- Document route behavior and expected payloads clearly.

## How We Work Around These Limits

### Route and handler organization

Instead of putting all logic in one file, the backend is broken into route folders and handler folders. That does not turn it into microservices, but it makes the monolith easier to reason about.

Typical pattern:

- Route file defines the HTTP path and method.
- Handler file contains the request logic.
- Query file contains SQL for the database operation.
- Middleware handles auth, logging, and request pre-processing.

This separation keeps the app maintainable even though the deployment target is still one Lambda.

### Query layer for SQL

Database access is isolated into query modules rather than scattering SQL across handlers.

Benefits:

- Easier to review and test database behavior.
- Less duplication.
- Cleaner handler code.

### Secrets and environment variables

Secrets are not hardcoded. They are injected at runtime, usually through Secrets Manager ARNs and environment variables.

This lets the same code run in different environments with different databases and auth settings.

### Auth middleware

Authentication and authorization are handled before business logic runs.

That matters because the frontend cannot be trusted to enforce access rules. Every route that needs protection must validate the request server-side.

### Explicit migrations

Schema changes are tracked in SQL migration files.

This is the main workaround for keeping a serverless backend stable while the frontend continues evolving. The database becomes predictable only if migrations are applied consistently.

## Implications For A New Codebase

If this pattern is reused in another application, the main thing to understand is that the backend is simple in runtime shape but strict in operational shape.

You should expect to:

- add API routes before wiring up new frontend screens
- add SQL queries before relying on new data fields
- deploy the whole backend when shared API code changes
- manage secrets and VPC settings as part of the backend, not as a frontend concern
- keep a tight contract between frontend types and backend response shapes

In other words, the frontend can move quickly, but it still depends on a backend that has to be wired carefully every time a new capability is introduced.

## Short Version

The backend is a serverless monolith: one Lambda, one API Gateway, one RDS database, and one shared deployment boundary.

That design is workable and relatively simple, but it comes with limits:

- no direct database access from the frontend
- no independent endpoint deploys
- stateless request handling
- VPC and secrets complexity
- schema changes that must be coordinated with API changes

The way around those limits is discipline: keep routes isolated, keep SQL centralized, keep secrets external, and treat migrations and frontend contracts as part of the same feature.
