#!/bin/bash
# ═══════════════════════════════════════════════════════
#  Data Analytics Pipeline — User-Data Script
#  Template ID: analytics
#  Security Profile: enhanced (SSH:2222, HTTPS:443)
#  Recommended Instance: r8i.2xlarge (8 vCPU, 64GB RAM)
#  Volume: 250GB gp3, 6000 IOPS, 250 MB/s throughput
# ═══════════════════════════════════════════════════════

# ── Software Installation ──
apt-get update -y || true
apt-get install -y \
  python3 \
  python3-pip \
  redis-server \
  openjdk-17-jre-headless \
  || true

pip3 install \
  pandas \
  jupyter \
  pyspark \
  --break-system-packages || true

# ── SSH Hardening (Enhanced Profile) ──
# Non-standard port 2222, password auth disabled, root disabled, idle timeout
sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config
sed -i 's/Port 22$/Port 2222/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
echo "PermitRootLogin no" >> /etc/ssh/sshd_config
echo "ClientAliveInterval 300" >> /etc/ssh/sshd_config
echo "ClientAliveCountMax 3" >> /etc/ssh/sshd_config
systemctl restart sshd || systemctl restart ssh || true

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
