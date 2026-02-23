# Sandbox Console — Setup & Credentials

## 1. AWS Credentials Setup

### Create an IAM User

1. Open the AWS Console → **IAM** → **Users** → **Create user**
2. Username: `sandbox-console-admin`
3. Click **Next** → **Attach policies directly**
4. Attach these managed policies:
   - `AmazonEC2FullAccess`
   - `CloudWatchReadOnlyAccess`
   - `AmazonSSMReadOnlyAccess`
5. Click **Create user**
6. Select the user → **Security credentials** → **Create access key**
7. Choose **Command Line Interface (CLI)**
8. Save the **Access Key ID** and **Secret Access Key**

### Configure Environment Variables

```bash
cd sandbox-console/
cp .env.example .env
```

Edit `.env` with your credentials:

```
AWS_ACCESS_KEY_ID=AKIA...your-key...
AWS_SECRET_ACCESS_KEY=...your-secret...
AWS_DEFAULT_REGION=us-east-1
JWT_SECRET=pick-a-random-string-at-least-32-characters-long
PORT=3000
```

> **Security:** Never commit `.env` to version control.

---

## 2. First-Run: Admin Account Setup

There are **no default credentials**. On first launch, the application displays
an Initial Setup screen where you create your admin account.

**Requirements:**
- Username: at least 3 characters
- Password: at least 8 characters, no spaces
- Display name: optional (defaults to "Platform Admin")

After creating the admin account, you are redirected to the login screen.
The setup screen only appears once — after the admin is created, it is
permanently replaced by the login screen.

> **Store your credentials securely.** There is no password recovery mechanism.
> If you lose the admin password, delete `sandbox-console.db` and restart
> the application to re-run setup (this also clears all data).

---

## 3. Customer Accounts

Customers are created by the admin through the Customer Management page.
When a new customer is created, the system auto-generates a username and
password, which are displayed in a one-time confirmation dialog. The admin
must communicate these credentials to the customer.

There are no pre-seeded customer accounts.

---

## 4. First-Run Infrastructure Setup

After logging in as admin:

1. On the Dashboard, click **Initialize Infrastructure**
2. This creates:
   - VPC (`10.100.0.0/16`) with Internet Gateway
   - Public subnet (`10.100.1.0/24`) in `us-east-1a`
   - Route table with `0.0.0.0/0 → IGW`
   - Three security groups (Standard, Enhanced, Strict)
3. Wait for the green "VPC: vpc-xxxxx" confirmation

Infrastructure is created once and persisted in the SQLite database.

---

## 5. Instance Types

The platform uses Intel Xeon 5th Gen (Granite Rapids) instances.
If 8th-gen instances aren't available in your region, it automatically
falls back to equivalent 7th-gen instances.

| Requested   | Fallback    | vCPU | RAM  | $/hr   |
|-------------|-------------|------|------|--------|
| m8i.large   | m7i.large   | 2    | 8GB  | 0.1008 |
| m8i.xlarge  | m7i.xlarge  | 4    | 16GB | 0.2016 |
| c8i.2xlarge | c7i.2xlarge | 8    | 16GB | 0.357  |
| r8i.2xlarge | r7i.2xlarge | 8    | 64GB | 0.5292 |

---

## 6. Quick Start

```bash
chmod +x deploy.sh
./deploy.sh
```

Choose mode 1 (development) or mode 2 (production).

- Dev:  Frontend at `http://localhost:5173`, API at `http://localhost:3000`
- Prod: Everything at `http://localhost:3000`

On first visit, create your admin account via the setup screen.
