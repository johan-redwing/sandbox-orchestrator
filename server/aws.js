import {
  EC2Client, CreateVpcCommand, CreateSubnetCommand, CreateInternetGatewayCommand,
  AttachInternetGatewayCommand, CreateRouteTableCommand, CreateRouteCommand,
  AssociateRouteTableCommand, CreateSecurityGroupCommand, AuthorizeSecurityGroupIngressCommand,
  RunInstancesCommand, DescribeInstancesCommand, StartInstancesCommand,
  StopInstancesCommand, TerminateInstancesCommand, ImportKeyPairCommand,
  DeleteKeyPairCommand, DescribeImagesCommand, ModifySubnetAttributeCommand,
  DescribeInstanceTypesCommand, CreateTagsCommand,
} from '@aws-sdk/client-ec2';
import { CloudWatchClient, GetMetricStatisticsCommand } from '@aws-sdk/client-cloudwatch';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import crypto from 'crypto';
import { getInfra, setInfra, audit, secEvent } from './db.js';

const REGION = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const VPC_CIDR = process.env.VPC_CIDR || '10.100.0.0/16';
const SUBNET_CIDR = process.env.SUBNET_CIDR || '10.100.1.0/24';

const ec2 = new EC2Client({ region: REGION });
const cw = new CloudWatchClient({ region: REGION });
const ssm = new SSMClient({ region: REGION });

const TAG_PROJECT = 'SandboxConsole';

function tags(name, extra = {}) {
  return [
    { Key: 'Name', Value: name },
    { Key: 'Project', Value: TAG_PROJECT },
    ...Object.entries(extra).map(([Key, Value]) => ({ Key, Value: String(Value) })),
  ];
}

// ══════════════════════════════════════════
//  AMI RESOLUTION
// ══════════════════════════════════════════

export async function resolveUbuntuAmi() {
  // Check cache first
  const cached = getInfra('ubuntu_ami');
  const cacheAge = getInfra('ubuntu_ami_ts');
  if (cached && cacheAge && (Date.now() - parseInt(cacheAge)) < 86400000) return cached;

  try {
    // Try SSM parameter (most reliable)
    const resp = await ssm.send(new GetParameterCommand({
      Name: '/aws/service/canonical/ubuntu/server/24.04/stable/current/amd64/hvm/ebs-gp3/ami-id'
    }));
    const ami = resp.Parameter.Value;
    setInfra('ubuntu_ami', ami);
    setInfra('ubuntu_ami_ts', String(Date.now()));
    return ami;
  } catch (e) {
    console.log('SSM AMI lookup failed, trying EC2 describe-images:', e.message);
  }

  // Fallback: search EC2 images
  const resp = await ec2.send(new DescribeImagesCommand({
    Filters: [
      { Name: 'name', Values: ['ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*'] },
      { Name: 'state', Values: ['available'] },
      { Name: 'architecture', Values: ['x86_64'] },
    ],
    Owners: ['099720109477'], // Canonical
  }));

  if (!resp.Images || resp.Images.length === 0) throw new Error('No Ubuntu 24.04 AMI found');
  resp.Images.sort((a, b) => b.CreationDate.localeCompare(a.CreationDate));
  const ami = resp.Images[0].ImageId;
  setInfra('ubuntu_ami', ami);
  setInfra('ubuntu_ami_ts', String(Date.now()));
  return ami;
}

// ══════════════════════════════════════════
//  INSTANCE TYPE RESOLUTION (8i → 7i fallback)
// ══════════════════════════════════════════

const FALLBACK_MAP = {
  'm8i.large': 'm7i.large', 'm8i.xlarge': 'm7i.xlarge', 'm8i.2xlarge': 'm7i.2xlarge', 'm8i.4xlarge': 'm7i.4xlarge',
  'c8i.large': 'c7i.large', 'c8i.xlarge': 'c7i.xlarge', 'c8i.2xlarge': 'c7i.2xlarge',
  'r8i.large': 'r7i.large', 'r8i.xlarge': 'r7i.xlarge', 'r8i.2xlarge': 'r7i.2xlarge',
  'm8i-flex.large': 'm7i-flex.large', 'm8i-flex.xlarge': 'm7i-flex.xlarge',
};

const resolvedTypes = {}; // cache

export async function resolveInstanceType(requested) {
  if (resolvedTypes[requested]) return resolvedTypes[requested];

  try {
    await ec2.send(new DescribeInstanceTypesCommand({ InstanceTypes: [requested] }));
    resolvedTypes[requested] = requested;
    return requested;
  } catch (e) {
    const fallback = FALLBACK_MAP[requested];
    if (fallback) {
      console.log(`Instance type ${requested} not available, falling back to ${fallback}`);
      try {
        await ec2.send(new DescribeInstanceTypesCommand({ InstanceTypes: [fallback] }));
        resolvedTypes[requested] = fallback;
        return fallback;
      } catch (e2) {
        throw new Error(`Neither ${requested} nor ${fallback} available in ${REGION}`);
      }
    }
    throw new Error(`Instance type ${requested} not available in ${REGION}`);
  }
}

// ══════════════════════════════════════════
//  VPC + NETWORKING SETUP
// ══════════════════════════════════════════

export async function initializeInfrastructure() {
  console.log('Initializing Sandbox Console infrastructure...');

  // Check if already done
  const existingVpc = getInfra('vpc_id');
  if (existingVpc) {
    console.log(`Infrastructure already initialized (VPC: ${existingVpc})`);
    return { vpc_id: existingVpc, subnet_id: getInfra('subnet_id') };
  }

  // 1. Create VPC
  console.log('Creating VPC...');
  const vpc = await ec2.send(new CreateVpcCommand({
    CidrBlock: VPC_CIDR,
    TagSpecifications: [{ ResourceType: 'vpc', Tags: tags('SandboxConsole-VPC') }],
  }));
  const vpcId = vpc.Vpc.VpcId;
  setInfra('vpc_id', vpcId);
  console.log(`VPC created: ${vpcId}`);

  // 2. Create Internet Gateway
  console.log('Creating Internet Gateway...');
  const igw = await ec2.send(new CreateInternetGatewayCommand({
    TagSpecifications: [{ ResourceType: 'internet-gateway', Tags: tags('SandboxConsole-IGW') }],
  }));
  const igwId = igw.InternetGateway.InternetGatewayId;
  setInfra('igw_id', igwId);

  await ec2.send(new AttachInternetGatewayCommand({ InternetGatewayId: igwId, VpcId: vpcId }));
  console.log(`IGW attached: ${igwId}`);

  // 3. Create public subnet
  console.log('Creating public subnet...');
  const subnet = await ec2.send(new CreateSubnetCommand({
    VpcId: vpcId, CidrBlock: SUBNET_CIDR, AvailabilityZone: `${REGION}a`,
    TagSpecifications: [{ ResourceType: 'subnet', Tags: tags('SandboxConsole-Public') }],
  }));
  const subnetId = subnet.Subnet.SubnetId;
  setInfra('subnet_id', subnetId);

  // Enable auto-assign public IP
  await ec2.send(new ModifySubnetAttributeCommand({
    SubnetId: subnetId, MapPublicIpOnLaunch: { Value: true },
  }));
  console.log(`Subnet created: ${subnetId}`);

  // 4. Route table
  console.log('Creating route table...');
  const rt = await ec2.send(new CreateRouteTableCommand({
    VpcId: vpcId,
    TagSpecifications: [{ ResourceType: 'route-table', Tags: tags('SandboxConsole-RT') }],
  }));
  const rtId = rt.RouteTable.RouteTableId;
  setInfra('route_table_id', rtId);

  await ec2.send(new CreateRouteCommand({
    RouteTableId: rtId, DestinationCidrBlock: '0.0.0.0/0', GatewayId: igwId,
  }));
  await ec2.send(new AssociateRouteTableCommand({ RouteTableId: rtId, SubnetId: subnetId }));
  console.log('Route table configured');

  // 5. Security groups
  console.log('Creating security groups...');
  await createSecurityGroups(vpcId);

  audit('system', 'infra.init', vpcId, `VPC ${vpcId}, Subnet ${subnetId}, IGW ${igwId} created in ${REGION}`);
  console.log('Infrastructure initialization complete!');

  return { vpc_id: vpcId, subnet_id: subnetId };
}

async function createSecurityGroups(vpcId) {
  const profiles = [
    {
      name: 'standard',
      desc: 'SandboxConsole - Standard (SSH:22, HTTP:80, HTTPS:443)',
      rules: [
        { IpProtocol: 'tcp', FromPort: 22, ToPort: 22, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'SSH' }] },
        { IpProtocol: 'tcp', FromPort: 80, ToPort: 80, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'HTTP' }] },
        { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'HTTPS' }] },
      ],
      score: 88,
    },
    {
      name: 'enhanced',
      desc: 'SandboxConsole - Enhanced (SSH:2222, HTTPS:443)',
      rules: [
        { IpProtocol: 'tcp', FromPort: 2222, ToPort: 2222, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'SSH-Custom' }] },
        { IpProtocol: 'tcp', FromPort: 443, ToPort: 443, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'HTTPS' }] },
      ],
      score: 92,
    },
    {
      name: 'strict',
      desc: 'SandboxConsole - Strict (SSH:2222 only)',
      rules: [
        { IpProtocol: 'tcp', FromPort: 2222, ToPort: 2222, IpRanges: [{ CidrIp: '0.0.0.0/0', Description: 'SSH-Custom' }] },
      ],
      score: 96,
    },
  ];

  for (const p of profiles) {
    const sg = await ec2.send(new CreateSecurityGroupCommand({
      GroupName: `sandbox-${p.name}`, Description: p.desc, VpcId: vpcId,
      TagSpecifications: [{ ResourceType: 'security-group', Tags: tags(`SandboxConsole-SG-${p.name}`) }],
    }));
    const sgId = sg.GroupId;
    setInfra(`sg_${p.name}`, sgId);

    await ec2.send(new AuthorizeSecurityGroupIngressCommand({
      GroupId: sgId, IpPermissions: p.rules,
    }));
    console.log(`Security group created: ${p.name} → ${sgId}`);
  }
}

// ══════════════════════════════════════════
//  SSH KEY GENERATION
// ══════════════════════════════════════════

export function generateSSHKeyPair(sandboxId) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  // Extract raw 32-byte ed25519 public key from SPKI DER
  const pubKeyObj = crypto.createPublicKey(publicKey);
  const spkiDer = pubKeyObj.export({ type: 'spki', format: 'der' });
  const rawPubKey = spkiDer.slice(-32); // ED25519 raw key is last 32 bytes of SPKI

  // Build proper OpenSSH wire format:
  //   uint32(len("ssh-ed25519")) + "ssh-ed25519" + uint32(32) + <32 raw bytes>
  const keyType = Buffer.from('ssh-ed25519');
  const keyTypeLenBuf = Buffer.alloc(4);
  keyTypeLenBuf.writeUInt32BE(keyType.length);
  const keyDataLenBuf = Buffer.alloc(4);
  keyDataLenBuf.writeUInt32BE(rawPubKey.length);
  const wireFormat = Buffer.concat([keyTypeLenBuf, keyType, keyDataLenBuf, rawPubKey]);

  const opensshPubKey = `ssh-ed25519 ${wireFormat.toString('base64')} sandbox-${sandboxId}`;

  // Fingerprint from the wire format (same as ssh-keygen -l)
  const hash = crypto.createHash('sha256').update(wireFormat).digest('base64');
  const fingerprint = `SHA256:${hash}`;

  return {
    privateKeyPem: privateKey,
    opensshPubKey,
    fingerprint,
  };
}

export async function importKeyToEC2(sandboxId, opensshPubKey) {
  const keyName = `sandbox-${sandboxId}`;
  // Delete any pre-existing key with same name (e.g. from a failed prior attempt)
  try { await ec2.send(new DeleteKeyPairCommand({ KeyName: keyName })); } catch {}
  await ec2.send(new ImportKeyPairCommand({
    KeyName: keyName,
    PublicKeyMaterial: new Uint8Array(Buffer.from(opensshPubKey, 'utf-8')),
    TagSpecifications: [{ ResourceType: 'key-pair', Tags: tags(keyName, { SandboxId: sandboxId }) }],
  }));
  return keyName;
}

// ══════════════════════════════════════════
//  EC2 INSTANCE LIFECYCLE
// ══════════════════════════════════════════

export async function launchInstance({ sandboxId, instanceType, template, keyName }) {
  const ami = await resolveUbuntuAmi();
  const actualType = await resolveInstanceType(instanceType);

  const subnetId = getInfra('subnet_id');
  const sgId = getInfra(`sg_${template.security_profile}`);

  if (!subnetId || !sgId) throw new Error('Infrastructure not initialized. Run setup first.');

  // Build user-data: create the SSH user, inject pubkey, then run template script
  const sshUser = template.ssh_user;
  const userData = `#!/bin/bash
# Don't use set -e globally — some commands are expected to fail gracefully

# Create sandbox user (skip if already exists, e.g. 'ubuntu')
if ! id -u ${sshUser} &>/dev/null; then
  useradd -m -s /bin/bash ${sshUser}
fi
mkdir -p /home/${sshUser}/.ssh
chmod 700 /home/${sshUser}/.ssh

# The key is injected via EC2 key pair for ubuntu user
# Copy authorized_keys to sandbox user
cp /home/ubuntu/.ssh/authorized_keys /home/${sshUser}/.ssh/authorized_keys 2>/dev/null || true
chmod 600 /home/${sshUser}/.ssh/authorized_keys
chown -R ${sshUser}:${sshUser} /home/${sshUser}/.ssh

# Add sandbox user to sudo
echo "${sshUser} ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers.d/90-sandbox

# Run template setup (SSH hardening, software install, CloudWatch agent)
${template.user_data || '# No additional setup'}

# Signal completion
touch /tmp/sandbox-userdata-complete
`;

  const instanceProfileName = process.env.EC2_INSTANCE_PROFILE || '';

  const runParams = {
    ImageId: ami,
    InstanceType: actualType,
    KeyName: keyName,
    MinCount: 1,
    MaxCount: 1,
    SubnetId: subnetId,
    SecurityGroupIds: [sgId],
    UserData: Buffer.from(userData).toString('base64'),
    BlockDeviceMappings: [{
      DeviceName: '/dev/sda1',
      Ebs: {
        VolumeSize: template.volume_size || 100,
        VolumeType: template.volume_type || 'gp3',
        Encrypted: true,
        Iops: template.iops || 3000,
        Throughput: template.throughput || 125,
        DeleteOnTermination: true,
      },
    }],
    TagSpecifications: [{
      ResourceType: 'instance',
      Tags: tags(`SandboxConsole-${sandboxId}`, {
        SandboxId: sandboxId,
        Template: template.id,
      }),
    }],
    MetadataOptions: {
      HttpTokens: 'required', // IMDSv2
      HttpEndpoint: 'enabled',
    },
  };

  // Only attach instance profile if configured (requires IAM setup — see Section 7 of guide)
  if (instanceProfileName) {
    runParams.IamInstanceProfile = { Name: instanceProfileName };
    console.log(`[Launch] Using instance profile: ${instanceProfileName}`);
  } else {
    console.log('[Launch] No EC2_INSTANCE_PROFILE set — memory/disk metrics will not be available');
  }

  const resp = await ec2.send(new RunInstancesCommand(runParams));

  const instance = resp.Instances[0];
  return {
    instanceId: instance.InstanceId,
    actualType,
    vpcId: getInfra('vpc_id'),
    subnetId,
    sgId,
  };
}

export async function waitForRunning(instanceId, maxWait = 300) {
  // EC2 eventual consistency — wait before first describe
  await new Promise(r => setTimeout(r, 5000));

  const start = Date.now();
  let notFoundRetries = 0;
  while ((Date.now() - start) / 1000 < maxWait) {
    try {
      const resp = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
      const inst = resp.Reservations?.[0]?.Instances?.[0];
      if (!inst) {
        // Instance not yet visible — retry
        notFoundRetries++;
        if (notFoundRetries > 12) throw new Error(`Instance ${instanceId} not found after ${notFoundRetries} retries`);
        console.log(`[waitForRunning] Instance ${instanceId} not yet visible, retry ${notFoundRetries}...`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      if (inst.State.Name === 'running') {
        return {
          publicIp: inst.PublicIpAddress || '',
          publicDns: inst.PublicDnsName || '',
          state: 'running',
        };
      }
      if (inst.State.Name === 'terminated' || inst.State.Name === 'shutting-down') {
        throw new Error(`Instance ${instanceId} entered ${inst.State.Name}`);
      }
    } catch (e) {
      // InvalidInstanceID.NotFound is expected during eventual consistency window
      if (e.name === 'InvalidInstanceID.NotFound' || e.Code === 'InvalidInstanceID.NotFound') {
        notFoundRetries++;
        if (notFoundRetries > 12) throw e;
        console.log(`[waitForRunning] EC2 not-found for ${instanceId}, retry ${notFoundRetries}...`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      throw e;
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error(`Instance ${instanceId} did not reach running state within ${maxWait}s`);
}

export async function describeInstance(instanceId) {
  try {
    const resp = await ec2.send(new DescribeInstancesCommand({ InstanceIds: [instanceId] }));
    const inst = resp.Reservations?.[0]?.Instances?.[0];
    if (!inst) return null;
    return {
      instanceId: inst.InstanceId,
      state: inst.State.Name,
      publicIp: inst.PublicIpAddress || '',
      publicDns: inst.PublicDnsName || '',
      instanceType: inst.InstanceType,
      launchTime: inst.LaunchTime,
    };
  } catch {
    return null;
  }
}

export async function stopInstance(instanceId) {
  await ec2.send(new StopInstancesCommand({ InstanceIds: [instanceId] }));
}

export async function startInstance(instanceId) {
  await ec2.send(new StartInstancesCommand({ InstanceIds: [instanceId] }));
}

export async function terminateInstance(instanceId, sandboxId) {
  if (instanceId) {
    await ec2.send(new TerminateInstancesCommand({ InstanceIds: [instanceId] }));
  }
  // Clean up key pair
  if (sandboxId) {
    try { await ec2.send(new DeleteKeyPairCommand({ KeyName: `sandbox-${sandboxId}` })); } catch {}
  }
}

// ══════════════════════════════════════════
//  CLOUDWATCH METRICS
// ══════════════════════════════════════════

async function getMetric(namespace, metricName, instanceId, stat = 'Average', period = 300) {
  const end = new Date();
  const start = new Date(end.getTime() - 600000); // last 10 minutes
  try {
    const resp = await cw.send(new GetMetricStatisticsCommand({
      Namespace: namespace,
      MetricName: metricName,
      Dimensions: [{ Name: 'InstanceId', Value: instanceId }],
      StartTime: start,
      EndTime: end,
      Period: period,
      Statistics: [stat],
    }));
    if (resp.Datapoints && resp.Datapoints.length > 0) {
      resp.Datapoints.sort((a, b) => b.Timestamp - a.Timestamp);
      return resp.Datapoints[0][stat] || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

export async function fetchInstanceMetrics(instanceId) {
  const [cpu, netIn, netOut, diskRead, diskWrite] = await Promise.all([
    getMetric('AWS/EC2', 'CPUUtilization', instanceId),
    getMetric('AWS/EC2', 'NetworkIn', instanceId, 'Average', 300),
    getMetric('AWS/EC2', 'NetworkOut', instanceId, 'Average', 300),
    getMetric('AWS/EC2', 'EBSReadOps', instanceId, 'Sum', 300),
    getMetric('AWS/EC2', 'EBSWriteOps', instanceId, 'Sum', 300),
  ]);

  // Try CloudWatch agent metrics for memory
  let memory = 0;
  try {
    memory = await getMetric('SandboxConsole', 'mem_used_percent', instanceId);
  } catch {}

  // Try disk from agent
  let disk = 0;
  try {
    disk = await getMetric('SandboxConsole', 'disk_used_percent', instanceId);
  } catch {}

  return {
    cpu: Math.round(cpu * 100) / 100,
    memory: Math.round(memory * 100) / 100,
    net_in: Math.round((netIn / 1024 / 1024) * 100) / 100, // bytes → MB
    net_out: Math.round((netOut / 1024 / 1024) * 100) / 100,
    disk: Math.round(disk * 100) / 100,
    iops: Math.round((diskRead + diskWrite) / 300), // ops per second over period
  };
}

export function getInfraStatus() {
  return {
    vpc_id: getInfra('vpc_id'),
    subnet_id: getInfra('subnet_id'),
    igw_id: getInfra('igw_id'),
    sg_standard: getInfra('sg_standard'),
    sg_enhanced: getInfra('sg_enhanced'),
    sg_strict: getInfra('sg_strict'),
    ubuntu_ami: getInfra('ubuntu_ami'),
    region: REGION,
    initialized: !!getInfra('vpc_id'),
  };
}
