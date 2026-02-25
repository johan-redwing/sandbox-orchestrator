# Sandbox Orchestrator

A full-stack platform for deploying and managing real AWS EC2 sandbox instances on Intel Xeon 5th Gen (Granite Rapids) processors. Built with React, Express, SQLite, and AWS SDK v3.

Every action in this application creates, modifies, or destroys real AWS infrastructure. Instances are provisioned with encrypted EBS volumes, ED25519 SSH keys, CloudWatch monitoring, and tiered security profiles — all managed through a dual-role web interface with real-time metrics and credit-based billing.

---

![Sandbox Orchestrator](sandbox_orchestrator_img.jpeg)

## Key Features

- **Real EC2 provisioning** — Launches actual instances in a dedicated VPC with public subnet, internet gateway, and per-template security groups
- **Zero hardcoded credentials** — Admin account created via first-run setup screen; customer passwords auto-generated with `crypto.randomBytes`
- **ED25519 SSH keys** — Generated server-side per sandbox, private key shown once, never stored
- **CloudWatch metrics** — CPU, memory, network, disk, and IOPS polled every 60 seconds with sparkline history
- **Credit system** — Per-second billing with 1-hour grace period and automatic instance stop on depletion
- **Dual-role UI** — Admin command center (dark theme) and customer portal (light theme), role determined by login
- **Intel Granite Rapids** — 12 instance types across M8i, C8i, R8i, and M8i-flex families with automatic M7i/C7i/R7i fallback

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser                                            │
│  React SPA (Vite)         port 5173 (dev)           │
│  ├── Setup Screen ──→ POST /api/setup/admin         │
│  ├── Login ──→ POST /api/auth/login                 │
│  ├── Admin Dashboard ──→ /api/admin/*               │
│  └── Customer Portal ──→ /api/customer/*            │
└───────────────┬─────────────────────────────────────┘
                │ REST + JWT
┌───────────────▼─────────────────────────────────────┐
│  Express API Server                  port 3000      │
│  ├── server/index.js   30 REST endpoints            │
│  ├── server/aws.js     EC2, CloudWatch, SSM, VPC    │
│  ├── server/db.js      SQLite schema + queries      │
│  └── server/metrics.js Polling daemon + credit tick  │
└───────────┬──────────────┬──────────────────────────┘
            │              │
     ┌──────▼──────┐  ┌───▼────────────────────┐
     │   SQLite    │  │   AWS (us-east-1)       │
     │  8 tables   │  │  ├── VPC 10.100.0.0/16  │
     │  WAL mode   │  │  ├── EC2 instances       │
     └─────────────┘  │  ├── CloudWatch metrics  │
                      │  └── SSM (AMI lookup)    │
                      └─────────────────────────┘
```

---

## Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18+ | 20+ recommended (18 shows AWS SDK deprecation warning) |
| npm | Bundled with Node | |
| AWS account | — | IAM user with EC2, CloudWatch, SSM permissions |
| Browser | Modern | Chrome, Firefox, Safari, or Edge |

---

## Quick Start

```bash
# 1. Extract and enter
tar -xzf sandbox-console-production.tar.gz
cd sandbox-console/

# 2. Configure AWS credentials
cp .env.example .env
nano .env    # Fill in your keys

# 3. Launch
chmod +x deploy.sh
./deploy.sh

# 4. Open browser → create admin account → initialize infrastructure
```

---

## Configuration

### Required Environment Variables

| Variable | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | IAM access key (starts with `AKIA...`) |
| `AWS_SECRET_ACCESS_KEY` | IAM secret key |
| `AWS_DEFAULT_REGION` | AWS region (default: `us-east-1`) |
| `JWT_SECRET` | Random string, 32+ characters |
| `PORT` | Server port (default: `3000`) |

### Optional

| Variable | Description |
|---|---|
| `EC2_INSTANCE_PROFILE` | IAM instance profile name for CloudWatch agent (enables memory/disk metrics) |
| `VPC_CIDR` | Override VPC CIDR (default: `10.100.0.0/16`) |
| `SUBNET_CIDR` | Override subnet CIDR (default: `10.100.1.0/24`) |

### IAM Policies Required

Attach these to your IAM user:

| Policy | Purpose |
|---|---|
| `AmazonEC2FullAccess` | Manage instances, VPCs, security groups, key pairs |
| `CloudWatchReadOnlyAccess` | Read metrics for dashboard display |
| `AmazonSSMReadOnlyAccess` | Resolve Ubuntu 24.04 AMI via SSM parameter |
| `SandboxConsole-PassRole` (inline) | Attach instance profile at launch — only needed if using `EC2_INSTANCE_PROFILE` |

---

## First-Run Setup

### 1. Create Admin Account

On first launch there are no users in the database. The browser displays an **Initial Setup** screen:

- Choose a username (≥3 characters)
- Set a password (≥8 characters, no spaces)
- Optionally set a display name
- All four validation rules must show green before the button activates

> **There is no password recovery.** If you lose the admin password, delete `sandbox-console.db` and restart to re-run setup. This clears all data.

### 2. Initialize Infrastructure

After logging in as admin:

1. Click **Initialize Infrastructure** on the dashboard
2. Wait 15–30 seconds for VPC, subnet, IGW, route table, and 3 security groups to be created
3. Green confirmation shows the VPC ID

This runs once. The infrastructure IDs are persisted in SQLite and reused across restarts.

### 3. Create Customers

Navigate to **Customers → Add Customer**. The system auto-generates a username and 14-character random password, displayed once in an alert dialog.

---

## Instance Catalog

All instances use Intel Xeon 5th Gen Scalable Processors (Granite Rapids). If 8th-gen types are unavailable in your region, the platform automatically falls back to equivalent 7th-gen (Sapphire Rapids) instances at the same price.

| Instance | vCPU | Memory | Price/hr |
|---|---|---|---|
| m8i.large | 2 | 8 GB | $0.1008 |
| m8i.xlarge | 4 | 16 GB | $0.2016 |
| m8i.2xlarge | 8 | 32 GB | $0.4032 |
| m8i.4xlarge | 16 | 64 GB | $0.8064 |
| c8i.large | 2 | 4 GB | $0.0892 |
| c8i.xlarge | 4 | 8 GB | $0.1785 |
| c8i.2xlarge | 8 | 16 GB | $0.3570 |
| r8i.large | 2 | 16 GB | $0.1323 |
| r8i.xlarge | 4 | 32 GB | $0.2646 |
| r8i.2xlarge | 8 | 64 GB | $0.5292 |
| m8i-flex.large | 2 | 8 GB | $0.0941 |
| m8i-flex.xlarge | 4 | 16 GB | $0.1882 |

---

## Default Templates

| Template | Instance | Security | SSH Port | Stack |
|---|---|---|---|---|
| Dev / Test Environment | m8i.xlarge | Standard (22/80/443) | 22 | Docker, Git, Node.js, Python, PostgreSQL |
| Data Analytics Pipeline | r8i.2xlarge | Enhanced (2222/443) | 2222 | Spark, Pandas, Jupyter, Redis, Intel AMX |
| AI / ML Inference Lab | c8i.2xlarge | Strict (2222 only) | 2222 | OpenVINO, ONNX, PyTorch, AVX-512, AMX |

---

## Project Structure

```
sandbox-console/
├── server/
│   ├── index.js          Express API — 30 endpoints, JWT auth, sandbox lifecycle
│   ├── db.js             SQLite schema, migrations, seeds, query helpers
│   ├── aws.js            EC2, VPC, CloudWatch, SSM, SSH key generation
│   └── metrics.js        60s CloudWatch poll, credit tick, grace period, state sync
├── src/
│   ├── App.jsx           React frontend — setup, login, admin, customer views
│   └── main.jsx          React entry point
├── package.json          Dependencies
├── vite.config.js        Vite config with API proxy
├── index.html            HTML shell
├── deploy.sh             One-command installer
├── .env.example          Environment template
├── CREDENTIALS.md        Setup and credential reference
├── BUILD_PLAN.md         Architecture and file status tracker
└── README.md             This file
```

---

## API Endpoints

### Setup (unauthenticated)
| Method | Path | Description |
|---|---|---|
| GET | `/api/setup/status` | Check if admin exists |
| POST | `/api/setup/admin` | Create admin account (first run only) |

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/api/auth/login` | Authenticate, returns JWT |

### Admin
| Method | Path | Description |
|---|---|---|
| GET | `/api/admin/dashboard` | Platform KPIs and activity |
| GET | `/api/admin/customers` | List all customers |
| POST | `/api/admin/customers` | Create customer (auto-generates credentials) |
| PUT | `/api/admin/customers/:id` | Update customer / top-up credits |
| GET | `/api/admin/sandboxes` | List all sandboxes |
| GET | `/api/admin/templates` | List all templates |
| POST | `/api/admin/templates` | Create template |
| PUT | `/api/admin/templates/:id` | Update template |
| DELETE | `/api/admin/templates/:id` | Delete template |
| GET | `/api/admin/security` | Security events |
| GET | `/api/admin/audit` | Audit log |
| GET | `/api/admin/infra/status` | VPC/infrastructure status |
| POST | `/api/admin/infra/init` | Initialize VPC (one-time) |

### Customer
| Method | Path | Description |
|---|---|---|
| GET | `/api/customer/dashboard` | Credit balance, sandboxes, spend |
| GET | `/api/customer/credits` | Detailed credit breakdown |
| GET | `/api/customer/sandboxes` | List own sandboxes |
| POST | `/api/customer/sandboxes` | Deploy new sandbox |
| GET | `/api/customer/sandboxes/:id` | Sandbox detail |
| POST | `/api/customer/sandboxes/:id/:action` | Stop / start / terminate |
| GET | `/api/customer/templates` | Available templates |

### Shared
| Method | Path | Description |
|---|---|---|
| GET | `/api/metrics/:sandboxId` | CloudWatch metrics + sparkline history |
| GET | `/api/instance-prices` | Instance pricing table |

---

## Security

| Layer | Implementation |
|---|---|
| **Credentials** | Zero hardcoded passwords. Admin set at deploy time. Customer passwords randomly generated (14-char, crypto.randomBytes). All hashed with bcrypt (10 rounds). |
| **Authentication** | JWT tokens with 24-hour expiry. Role-based route protection. |
| **SSH** | ED25519 keys generated server-side. Private key returned once, never stored. Keys deleted from EC2 on sandbox termination. |
| **Network** | Dedicated VPC (10.100.0.0/16). Three security group profiles: Standard (22/80/443), Enhanced (2222/443), Strict (2222). |
| **Instance** | IMDSv2 required. Encrypted EBS (AES-256-GCM). SSH hardened via user-data (password auth disabled, root login disabled, idle timeout). |
| **Audit** | Every action logged with timestamp, actor, action, target, and detail. |

---

## CloudWatch Metrics

**CPU and Network** work out of the box via the `AWS/EC2` namespace.

**Memory and Disk** require an IAM instance profile so the CloudWatch agent can publish to the `SandboxConsole` custom namespace. To enable:

1. Create IAM role `SandboxConsole-EC2-Role` with `CloudWatchAgentServerPolicy`
2. Grant `iam:PassRole` to your Sandbox Console IAM user
3. Add `EC2_INSTANCE_PROFILE=SandboxConsole-EC2-Role` to `.env`

See the Production Guide (Section 7) for step-by-step instructions.

---

## Credit System

- Credits deduct every 60 seconds based on running instance hourly rates
- Stopped instances charge at 10% of the running rate (EBS storage)
- At $0.00 balance, a **1-hour grace period** starts
- After 1 hour at zero, running instances are automatically stopped via EC2 API
- Admin can top up credits at any time; grace timer clears when balance > $0

---

## Development

```bash
# Dev mode — hot reload + API
./deploy.sh   # Choose option 1

# Frontend: http://localhost:5173
# API:      http://localhost:3000
```

Vite proxies `/api/*` requests to Express. Changes to `src/App.jsx` hot-reload instantly. Server changes require restart.

```bash
# Production mode — optimized build
./deploy.sh   # Choose option 2

# Everything: http://localhost:3000
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "Platform infrastructure not initialized" | Log in as admin → click Initialize Infrastructure |
| "Insufficient credits" | Admin must top up the customer's credits |
| Memory/Disk metrics show 0% | Set up IAM instance profile (see CloudWatch section above) |
| SSH connection refused on port 2222 | Wait 2–3 minutes after deploy for user-data to reconfigure sshd |
| Instance ID not found during deploy | EC2 eventual consistency — the app retries automatically for up to 2 minutes |
| Stale templates after code changes | Delete `sandbox-console.db` and restart to re-seed |
| Lost admin password | Delete `sandbox-console.db` and restart — triggers setup screen (clears all data) |

---

## License

Proprietary. MIT Open Source License
