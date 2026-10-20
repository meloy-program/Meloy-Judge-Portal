---
name: deploy-lambda
description: Build and deploy the Meloy Judge Portal Lambda backend (lambda/) to AWS. Use when making backend code changes that need to go live, updating the Lambda function, running a one-time database migration via a temporary endpoint, or checking the deployed Lambda's status.
---

# Deploy Lambda — Guide

The Lambda is an Express monolith deployed via `aws lambda update-function-code`. SAM is available but the direct zip-and-upload approach is faster for code changes.

---

## Prerequisites

- AWS CLI authenticated (`aws sts get-caller-identity` returns account `271669412379`)
- Working directory: `lambda/`

---

## Standard Deploy (code change)

```bash
cd lambda

# 1. Install deps if node_modules is missing
npm install

# 2. Compile TypeScript
npm run build        # runs `tsc` → outputs to dist/

# 3. Package
zip -r /tmp/lambda-update.zip dist/ node_modules/ package.json

# 4. Upload
aws lambda update-function-code \
  --function-name meloy-judge-api \
  --zip-file fileb:///tmp/lambda-update.zip \
  --region us-east-1 \
  --query 'LastModified' --output text

# 5. Wait for it to be active before calling
aws lambda wait function-updated \
  --function-name meloy-judge-api \
  --region us-east-1
```

---

## One-Time Database Migration Pattern

Use this when you need to run a SQL change against the live RDS (which is in a private VPC and not directly reachable).

### Step 1 — Add a temporary endpoint to `src/routes/admin.routes.ts`

Paste **before** `export default router;`:

```ts
/**
 * TEMPORARY: <describe what this does> (<date>)
 * DELETE this endpoint after running once.
 */
router.post('/run-migration-<slug>', async (_req, res) => {
  try {
    await query(`
      -- your SQL here
      UPDATE some_table SET column = 'value' WHERE condition;
    `);
    const result = await query('SELECT * FROM some_table');
    res.json({ message: 'Done', result });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});
```

### Step 2 — Build and deploy
Run the standard deploy steps above.

### Step 3 — Call the endpoint
```bash
curl -s -X POST \
  "https://o90rhtv5i4.execute-api.us-east-1.amazonaws.com/prod/admin/run-migration-<slug>" \
  -H "Content-Type: application/json" | python3 -m json.tool
```

Verify the response shows the expected data.

### Step 4 — Clean up
Remove the temporary endpoint from `admin.routes.ts`, rebuild, and redeploy.

---

## Key AWS Resources

| Resource | Value |
|---|---|
| Lambda function | `meloy-judge-api` |
| Region | `us-east-1` |
| API Gateway URL | `https://o90rhtv5i4.execute-api.us-east-1.amazonaws.com/prod` |
| RDS secret ARN | `arn:aws:secretsmanager:us-east-1:271669412379:secret:meloyjudge/rds/credentials-X5m8P7` |
| VPC subnets | `subnet-037afc317860648be` (1a), `subnet-059c9242e7c6e9a0a` (1b) |
| Security group | `sg-079fd1a5f67dd2d75` |
| AWS Account | `271669412379` |

---

## Environment Variables (Lambda)

Set in `template.yaml` Globals → never hardcode in code:

| Variable | Value |
|---|---|
| `AUTH0_DOMAIN` | `dev-cesh2xao4dfcu5ha.us.auth0.com` |
| `AUTH0_CLIENT_ID` | `eke2aRF6oZcSKk3iqZWWRnFffEOEpgvi` |
| `AUTH0_AUDIENCE` | `https://o90rhtv5i4.execute-api.us-east-1.amazonaws.com/prod` |
| `DEV_MODE` | `'false'` (never set to true in prod) |
| `RDS_SECRET_ARN` | Secrets Manager ARN |
| `JWT_SECRET_ARN` | Secrets Manager ARN |

---

## Notes

- RDS is in a **private VPC** — you cannot connect to it directly with `psql` from your machine
- The admin migration endpoints in `admin.routes.ts` have **no authentication** — only call them over HTTPS, never expose new ones long-term
- After deploying, wait for `function-updated` before calling the endpoint — the upload and propagation takes ~5–10 seconds
- `DEV_MODE=true` in `middleware/auth.ts` bypasses all auth as a mock admin — only use locally, never deploy with it enabled
