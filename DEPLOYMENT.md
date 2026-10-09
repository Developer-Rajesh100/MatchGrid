# Production Deployment: DigitalOcean App Platform

Live site: https://dcl-j3clh.ondigitalocean.app

Migrations and data seeding run automatically at backend startup (`backend/app/core/bootstrap.py`), before the server accepts requests. Seeding is create-only: it never overwrites or duplicates existing data.

## Step 1: Check the environment variables (before pushing)

In DigitalOcean go to **Apps → your app → Settings → backend → Environment Variables**. Make sure these exist:

| Variable | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `DEBUG` | `false` |
| `MONGO_URI` | your DigitalOcean MongoDB connection string (secret) |
| `MONGO_DB_NAME` | `dcl_scoreboard` |
| `JWT_SECRET` | a random string of 32+ characters (secret) |
| `ADMIN_BOOTSTRAP_PASSWORD` | a strong password, not a placeholder (secret) |
| `CORS_ORIGINS` | `https://dcl-j3clh.ondigitalocean.app` |

Generate a JWT secret:

```bash
python3 -c "import secrets; print(secrets.token_hex(32))"
```

## Step 2: Confirm auto-deploy

**Settings → App-Level → GitHub**: the repo should be `Stadia-India/DCL_score_board`, the branch `main`, and Autodeploy **on**.

## Step 3: Push

```bash
git push origin main
```

## Step 4: Watch the deployment

**Activity tab → latest deployment → Build / Deploy logs.** Look for:

- `Applying 0001…0004` and `Tournament seed: {...}`, which mean the migrations and seed ran.
- The deployment status switching to **Active**.

## Step 5: Verify

```bash
curl https://dcl-j3clh.ondigitalocean.app/health
curl https://dcl-j3clh.ondigitalocean.app/health/db
curl https://dcl-j3clh.ondigitalocean.app/api/matches
```

`/health/db` should report `teams: 6`, `players: 44` and `matches: 9`. Then open `/matches` in the browser.

## Step 6 (optional): Apply the app spec

This adds a pre-deploy migration job and explicit routes. The site works without it. Review `.do/app.yaml` against your app first (region and instance sizes are guesses):

```bash
doctl apps update <APP_ID> --spec .do/app.yaml
```

## If it fails

| Symptom | Fix |
|---|---|
| `Refusing to start… insecure config` | `JWT_SECRET` or `CORS_ORIGINS` is wrong (Step 1) |
| `Refusing to bootstrap the production admin…` | `ADMIN_BOOTSTRAP_PASSWORD` is a placeholder |
| Mongo authentication error | `MONGO_URI` is wrong |
| Deployment fails | The old version keeps running. Fix the cause and push again. |
| Site loads but the data is empty | Check the backend runtime logs for seed errors |

Every later `git push origin main` redeploys automatically. Migrations and seeding are idempotent, so redeploying never duplicates or overwrites data.

## Switches

- `AUTO_MIGRATE=false` disables migrations and seeding at startup.
- `AUTO_SEED=false` runs migrations only.
