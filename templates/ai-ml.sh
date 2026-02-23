#!/bin/bash
# ═══════════════════════════════════════════════════════
#  AI / ML Inference Lab — User-Data Script
#  Template ID: ai-ml
#  Security Profile: strict (SSH:2222 only)
#  Recommended Instance: c8i.2xlarge (8 vCPU, 16GB RAM)
#  Volume: 200GB gp3, 6000 IOPS, 250 MB/s throughput
# ═══════════════════════════════════════════════════════

# ── Software Installation ──
apt-get update -y || true
apt-get install -y \
  python3 \
  python3-pip \
  || true

pip3 install \
  openvino \
  onnxruntime \
  torch \
  --break-system-packages || true

# ── SSH Hardening (Strict Profile) ──
# Non-standard port 2222, password auth disabled, root disabled,
# max 3 auth tries, idle timeout
sed -i 's/#Port 22/Port 2222/' /etc/ssh/sshd_config
sed -i 's/Port 22$/Port 2222/' /etc/ssh/sshd_config
sed -i 's/#PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config
echo "PermitRootLogin no" >> /etc/ssh/sshd_config
echo "MaxAuthTries 3" >> /etc/ssh/sshd_config
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
