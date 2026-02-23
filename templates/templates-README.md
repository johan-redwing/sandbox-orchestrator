# Sandbox Templates

This directory contains the template definitions and user-data scripts that configure EC2 instances at boot time.

## Files

| File | Purpose |
|---|---|
| `templates.json` | Template metadata (name, instance type, security profile, volume config, etc.) |
| `dev-test.sh` | User-data script for the Dev / Test Environment template |
| `analytics.sh` | User-data script for the Data Analytics Pipeline template |
| `ai-ml.sh` | User-data script for the AI / ML Inference Lab template |

## How Templates Work

When a customer deploys a sandbox, the backend:

1. Reads the template metadata from the database (originally seeded from `templates.json` values in `server/db.js`)
2. Wraps the user-data script with a preamble that creates the SSH user, copies authorized keys, and grants sudo
3. Base64-encodes the combined script and passes it to `RunInstances`
4. EC2 executes the script as root on first boot

## Template Fields

| Field | Description |
|---|---|
| `id` | Unique identifier used in API calls |
| `name` | Display name in the UI |
| `icon` | Lucide icon name (Terminal, Database, Brain) |
| `color` | Accent color hex for the UI card |
| `description` | Short description shown to customers |
| `recommended` | Default instance type pre-selected in the deploy form |
| `tags` | Technology tags displayed as badges |
| `security_profile` | `standard`, `enhanced`, or `strict` — determines which security group is used |
| `max_ttl` | Maximum time-to-live in hours |
| `ssh_user` | Linux username created on the instance |
| `ssh_port` | SSH port (22 for standard, 2222 for enhanced/strict) |
| `volume_size` | Root EBS volume size in GB |
| `volume_type` | EBS volume type (gp3) |
| `iops` | Provisioned IOPS |
| `throughput` | Provisioned throughput in MB/s |
| `user_data_file` | Filename of the bash script in this directory |

## User-Data Script Structure

Each `.sh` script has three sections:

1. **Software Installation** — `apt-get` and `pip` installs for the template's stack
2. **SSH Hardening** — Port configuration, password auth disable, root login disable, idle timeout
3. **CloudWatch Agent** — Downloads, configures, and starts the agent for memory/disk metrics

## Adding a New Template

1. Create a new `.sh` file in this directory with your user-data script
2. Add the template metadata to `templates.json`
3. Add the corresponding `insert_template.run(...)` call in `server/db.js` inside `seedDefaults()`
4. Delete `sandbox-console.db` and restart to re-seed

Alternatively, use the admin API: `POST /api/admin/templates` with the template JSON body.

## Security Profiles

| Profile | SSH Port | Inbound Rules | Security Score |
|---|---|---|---|
| `standard` | 22 | SSH:22, HTTP:80, HTTPS:443 | 88 |
| `enhanced` | 2222 | SSH:2222, HTTPS:443 | 92 |
| `strict` | 2222 | SSH:2222 only | 96 |
