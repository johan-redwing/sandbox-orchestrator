#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Dev / Test Environment — User-Data Script
#  Template ID: dev-test
#  Security Profile: standard (SSH:22, HTTP:80, HTTPS:443)
#  Recommended Instance: m8i.xlarge (4 vCPU, 16GB RAM)
#  Volume: 100GB gp3, 3000 IOPS, 125 MB/s throughput
# ═══════════════════════════════════════════════════════

# ── Software Installation ──
apt-get update -y || true
apt-get install -y \
  docker.io \
  git \
  nodejs \
  npm \
  python3 \
  python3-pip \
  postgresql \
  postgresql-client \
  redis-server \
  || true

systemctl enable docker && systemctl start docker || true

# ── CloudWatch Agent ──
wget -q https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb \
  && dpkg -i amazon-cloudwatch-agent.deb || true

cat > /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json << 'CWEOF'
{
  "metrics": {
    "namespace": "SandboxConsole",
    "metrics_collected": {
      "mem": { "measurement": ["mem_used_percent"] },
      "disk": { "measurement": ["disk_used_percent"], "resources": ["/"] }
    }
  },
  "logs": {}
}
CWEOF

/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl \
  -a fetch-config -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s || true

# ── SSH Hardening (Standard Profile) ──
# Port 22 (default), password auth disabled, idle timeout
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
echo "ClientAliveInterval 300" >> /etc/ssh/sshd_config
echo "ClientAliveCountMax 3" >> /etc/ssh/sshd_config
systemctl restart sshd || systemctl restart ssh || true
