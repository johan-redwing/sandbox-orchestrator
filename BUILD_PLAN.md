# SANDBOX CONSOLE — PRODUCTION BUILD PLAN

## RESUME INSTRUCTIONS
If the previous chat ran out of tokens, start a new chat and say:
> "Continue building from /home/claude/sandbox-console/ — read BUILD_PLAN.md for status."

Claude should then:
1. Read this file to see what's done and what's remaining
2. Check which files exist with `ls -la /home/claude/sandbox-console/ /home/claude/sandbox-console/server/ /home/claude/sandbox-console/src/`
3. Continue building the next incomplete file

## ARCHITECTURE
```
sandbox-console/
├── server/
│   ├── index.js          # Express API server (routes, auth, middleware)
│   ├── db.js             # SQLite schema, migrations, query helpers
│   ├── aws.js            # AWS SDK v3 (EC2, CloudWatch, VPC setup)
│   └── metrics.js        # CloudWatch polling daemon + cache
├── src/
│   ├── App.jsx           # React frontend (uses fetch() to hit /api/*)
│   └── main.jsx          # React entry point
├── package.json          # Dependencies for both server + client
├── vite.config.js        # Vite config with proxy to Express
├── index.html            # HTML shell
├── .env.example          # Template for AWS credentials
├── deploy.sh             # One-command installer
├── BUILD_PLAN.md         # This file
└── CREDENTIALS.md        # Login credentials reference
```

## CONFIGURATION
- Region: us-east-1
- VPC: Dedicated, auto-created (10.100.0.0/16)
- Subnet: Public subnet with IGW (10.100.1.0/24)
- AMI: Ubuntu 24.04 LTS (auto-resolved via SSM parameter)
- SSH: ED25519 keys generated server-side, private key returned once, never stored
- Security Groups: Per-profile (Standard: port 22+80+443, Enhanced: 2222+443, Strict: 2222 only)
- Metrics: CloudWatch basic + agent for memory, polled every 60s, cached server-side
- Credits: 1-hour grace period at $0.00 before auto-stop
- Instance fallback: Try m8i/c8i/r8i first, fall back to m7i/c7i/r7i if unavailable

## DEFAULT CREDENTIALS (not shown in UI)
| Role     | Username        | Password    |
|----------|-----------------|-------------|
| Admin    | admin           | Kj8#mPx2Qw |
| Customer | sarah.chen      | Fw3$nR8vT5  |
| Customer | marcus.johnson  | Hy6@bP4wK1  |
| Customer | priya.patel     | Jz2#cM7xN9  |

## AWS ENV VARS REQUIRED
```
AWS_ACCESS_KEY_ID=AKIAxxxxxxxxxxxx
AWS_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AWS_DEFAULT_REGION=us-east-1
```

## BUILD STATUS TRACKER
Mark each file [DONE] as completed:

- [DONE] BUILD_PLAN.md — this file
- [DONE] .env.example
- [DONE] package.json
- [DONE] vite.config.js
- [DONE] index.html
- [DONE] src/main.jsx
- [DONE] server/db.js — SQLite schema + queries
- [DONE] server/aws.js — AWS SDK EC2/CloudWatch/VPC
- [DONE] server/metrics.js — polling daemon
- [DONE] server/index.js — Express server + all API routes
- [DONE] src/App.jsx — Full React frontend with API integration
- [DONE] deploy.sh — installer script
- [DONE] CREDENTIALS.md

## API ROUTES (for frontend reference)

### Auth
- POST /api/auth/login          { username, password } → { token, user }

### Admin
- GET  /api/admin/dashboard     → platform KPIs
- GET  /api/admin/customers     → all customers
- POST /api/admin/customers     → create customer
- PUT  /api/admin/customers/:id → update customer (topup, suspend)
- GET  /api/admin/sandboxes     → all sandboxes
- GET  /api/admin/templates     → all templates
- POST /api/admin/templates     → create template
- PUT  /api/admin/templates/:id → update template
- DELETE /api/admin/templates/:id → delete template
- GET  /api/admin/security      → security events
- GET  /api/admin/audit         → audit log
- POST /api/admin/setup-vpc     → trigger VPC creation

### Customer
- GET  /api/customer/dashboard  → personal KPIs + sandboxes
- GET  /api/customer/credits    → credit details
- GET  /api/customer/sandboxes  → my sandboxes
- GET  /api/customer/sandboxes/:id → sandbox detail + metrics
- POST /api/customer/sandboxes  → deploy new sandbox
- POST /api/customer/sandboxes/:id/stop → stop
- POST /api/customer/sandboxes/:id/start → start
- POST /api/customer/sandboxes/:id/terminate → terminate
- GET  /api/customer/templates  → available templates

### Shared
- GET  /api/metrics/:sandboxId  → latest cached metrics
- POST /api/setup/init          → initialize VPC + security groups (admin, one-time)
