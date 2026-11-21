import {
  PrismaClient,
  Role,
  UserStatus,
  DepartmentStatus,
  StartupStage,
  ProblemSeverity,
  ProblemStatus,
  ProposalStatus,
  EvaluationRecommendation,
  EvaluationStatus,
  PilotStatus,
  MilestoneStatus,
  DisbursementStatus,
  ProcurementType,
  ProcurementStatus,
  DocumentCategory,
} from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

// Helper to generate normalized 384-dimensional vector string for pgvector
function generatePseudoEmbedding(seed: number): string {
  const dim = 384;
  const values: number[] = [];
  let sumSq = 0;
  for (let i = 0; i < dim; i++) {
    const val = Math.sin(seed * (i + 1) * 0.17) * Math.cos(seed * (i + 1) * 0.31);
    values.push(val);
    sumSq += val * val;
  }
  const norm = Math.sqrt(sumSq) || 1;
  const normalized = values.map((v) => Number((v / norm).toFixed(6)));
  return `[${normalized.join(',')}]`;
}

// Helper to generate chained audit logs
let lastHash = 'GENESIS';

interface AuditLogInput {
  actorId: string | null;
  action: string;
  entity: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
}

function createChainedAuditLog(input: AuditLogInput) {
  const dataToHash = `${lastHash}|${input.actorId || 'SYSTEM'}|${input.action}|${input.entity}|${input.entityId}|${JSON.stringify(input.payload)}|${input.createdAt.toISOString()}`;
  const hash = crypto.createHash('sha256').update(dataToHash).digest('hex');
  const record = {
    actorId: input.actorId,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId,
    payload: input.payload as any,
    prevHash: lastHash,
    hash,
    createdAt: input.createdAt,
  };
  lastHash = hash;
  return record;
}

async function main() {
  console.log('🌱 Starting database seeding for Startexel...');

  // Clean existing data in reverse relational order
  await prisma.auditLog.deleteMany();
  await prisma.document.deleteMany();
  await prisma.procurement.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.pilot.deleteMany();
  await prisma.evaluation.deleteMany();
  await prisma.proposal.deleteMany();
  await prisma.problem.deleteMany();
  await prisma.user.deleteMany();
  await prisma.startup.deleteMany();
  await prisma.department.deleteMany();

  console.log('🧹 Cleaned existing tables.');

  // Default hashed password for all demo users (Password123!)
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // --------------------------------------------------------------------------
  // 1. DEPARTMENTS
  // --------------------------------------------------------------------------
  const deptMobility = await prisma.department.create({
    data: {
      name: 'Department of Urban Mobility & Smart Transit',
      code: 'DOT-MOBILITY',
      description:
        'Responsible for urban traffic management, intelligent public transportation systems, and micro-mobility integration across the capital region.',
      website: 'https://mobility.capital.gov',
      contactEmail: 'transit-innovations@capital.gov',
      contactPhone: '+1-555-019-2831',
      location: 'Transit Operations Centre, Metropolis',
      status: DepartmentStatus.ACTIVE,
    },
  });

  const deptWater = await prisma.department.create({
    data: {
      name: 'Department of Water Resources & Clean Environment',
      code: 'DWR-CLEAN',
      description:
        'Oversees river basin rejuvenation, municipal water quality monitoring, industrial effluent surveillance, and watershed sustainability.',
      website: 'https://water.state.gov',
      contactEmail: 'cleanwater@state.gov',
      contactPhone: '+1-555-019-8842',
      location: 'Water Resources Directorate, North Wing',
      status: DepartmentStatus.ACTIVE,
    },
  });

  const deptHealth = await prisma.department.create({
    data: {
      name: 'Department of Public Health & Biosecurity',
      code: 'DPH-BIO',
      description:
        'Spearheads preventative healthcare outreach, decentralized rural diagnostics, epidemic surveillance, and telemedicine deployment.',
      website: 'https://health.state.gov',
      contactEmail: 'innovation@health.state.gov',
      contactPhone: '+1-555-019-4411',
      location: 'State Healthcare Complex, Block B',
      status: DepartmentStatus.ACTIVE,
    },
  });

  const deptDigital = await prisma.department.create({
    data: {
      name: 'Municipal Corporation & Digital Infrastructure',
      code: 'MCD-DIGITAL',
      description:
        'Drives digital government initiatives, city-scale IoT telemetry, automated civic ticketing, and smart utility administration.',
      website: 'https://digital.metrocivic.gov',
      contactEmail: 'digital.governance@metrocivic.gov',
      contactPhone: '+1-555-019-5520',
      location: 'Civic Centre Tower, 14th Floor',
      status: DepartmentStatus.ACTIVE,
    },
  });

  console.log('✅ Created 4 Departments');

  // --------------------------------------------------------------------------
  // 2. STARTUPS
  // --------------------------------------------------------------------------
  const startupAero = await prisma.startup.create({
    data: {
      name: 'AeroVantage Mobility Technologies',
      registrationNumber: 'CIN-U72900KA2022PTC160101',
      description:
        'Edge-AI hardware and adaptive computer vision systems for traffic light synchronization and aerial perimeter surveillance.',
      industry: 'Autonomous Transit & Computer Vision',
      stage: StartupStage.GROWTH,
      website: 'https://aerovantage.io',
      foundedYear: 2022,
      headquarters: 'Innovation Hub, Sector 4',
      teamSize: 28,
      verified: true,
      logoUrl: 'https://assets.startexel.gov/startups/aerovantage-logo.svg',
    },
  });

  const startupEco = await prisma.startup.create({
    data: {
      name: 'EcoPurify WaterTech Solutions',
      registrationNumber: 'CIN-U41000DL2021PTC145203',
      description:
        'Next-generation optical sensor buoys and spectrometry probes measuring heavy metals and chemical effluents in real-time aquatic environments.',
      industry: 'CleanTech & IoT Sensing',
      stage: StartupStage.SCALING,
      website: 'https://ecopurify.tech',
      foundedYear: 2021,
      headquarters: 'Green Park Tech Incubator, Building 3',
      teamSize: 34,
      verified: true,
      logoUrl: 'https://assets.startexel.gov/startups/ecopurify-logo.svg',
    },
  });

  const startupMed = await prisma.startup.create({
    data: {
      name: 'MedSense Diagnostics AI',
      registrationNumber: 'CIN-U85100MH2023PTC189004',
      description:
        'Portable point-of-care microfluidic test carts equipped with machine learning algorithms capable of detecting 18 blood pathogens in under 10 minutes.',
      industry: 'MedTech & Point-of-Care Diagnostics',
      stage: StartupStage.EARLY_STAGE,
      website: 'https://medsense.ai',
      foundedYear: 2023,
      headquarters: 'BioTech Park, Lab 5',
      teamSize: 16,
      verified: true,
      logoUrl: 'https://assets.startexel.gov/startups/medsense-logo.svg',
    },
  });

  const startupShield = await prisma.startup.create({
    data: {
      name: 'ShieldNet Autonomous Safety',
      registrationNumber: 'CIN-U74999TN2024PTC192005',
      description:
        'Decentralized drone swarms and automated video analytics providing real-time perimeter security and disaster zone search-and-rescue assistance.',
      industry: 'GovTech & Autonomous Security',
      stage: StartupStage.EARLY_STAGE,
      website: 'https://shieldnet.io',
      foundedYear: 2024,
      headquarters: 'Pioneer Incubator, Suite 210',
      teamSize: 11,
      verified: false,
      logoUrl: 'https://assets.startexel.gov/startups/shieldnet-logo.svg',
    },
  });

  console.log('✅ Created 4 Startups');

  // --------------------------------------------------------------------------
  // 3. USERS (Covering all 5 Roles: ADMIN, DEPT, STARTUP, EVALUATOR, AUDITOR)
  // --------------------------------------------------------------------------
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@startexel.gov',
      passwordHash,
      firstName: 'Sarah',
      lastName: 'Jenkins',
      phoneNumber: '+1-555-100-0001',
      role: Role.ADMIN,
      status: UserStatus.ACTIVE,
      avatarUrl: 'https://assets.startexel.gov/avatars/admin-sarah.png',
    },
  });

  const deptUserTransit = await prisma.user.create({
    data: {
      email: 'transport.lead@startexel.gov',
      passwordHash,
      firstName: 'Marcus',
      lastName: 'Vance',
      phoneNumber: '+1-555-200-0010',
      role: Role.DEPT,
      status: UserStatus.ACTIVE,
      departmentId: deptMobility.id,
      avatarUrl: 'https://assets.startexel.gov/avatars/dept-marcus.png',
    },
  });

  const deptUserWater = await prisma.user.create({
    data: {
      email: 'cleanwater.officer@startexel.gov',
      passwordHash,
      firstName: 'Rajesh',
      lastName: 'Sharma',
      phoneNumber: '+1-555-200-0011',
      role: Role.DEPT,
      status: UserStatus.ACTIVE,
      departmentId: deptWater.id,
      avatarUrl: 'https://assets.startexel.gov/avatars/dept-rajesh.png',
    },
  });

  const deptUserHealth = await prisma.user.create({
    data: {
      email: 'health.director@startexel.gov',
      passwordHash,
      firstName: 'Elena',
      lastName: 'Rostova',
      phoneNumber: '+1-555-200-0012',
      role: Role.DEPT,
      status: UserStatus.ACTIVE,
      departmentId: deptHealth.id,
      avatarUrl: 'https://assets.startexel.gov/avatars/dept-elena.png',
    },
  });

  const startupUserAero = await prisma.user.create({
    data: {
      email: 'founder@aerovantage.io',
      passwordHash,
      firstName: 'Vikram',
      lastName: 'Patel',
      phoneNumber: '+1-555-300-0020',
      role: Role.STARTUP,
      status: UserStatus.ACTIVE,
      startupId: startupAero.id,
      avatarUrl: 'https://assets.startexel.gov/avatars/startup-vikram.png',
    },
  });

  const startupUserEco = await prisma.user.create({
    data: {
      email: 'cto@ecopurify.tech',
      passwordHash,
      firstName: 'Anya',
      lastName: 'Chen',
      phoneNumber: '+1-555-300-0021',
      role: Role.STARTUP,
      status: UserStatus.ACTIVE,
      startupId: startupEco.id,
      avatarUrl: 'https://assets.startexel.gov/avatars/startup-anya.png',
    },
  });

  const startupUserMed = await prisma.user.create({
    data: {
      email: 'ceo@medsense.ai',
      passwordHash,
      firstName: 'Tariq',
      lastName: 'Al-Mansoor',
      phoneNumber: '+1-555-300-0022',
      role: Role.STARTUP,
      status: UserStatus.ACTIVE,
      startupId: startupMed.id,
      avatarUrl: 'https://assets.startexel.gov/avatars/startup-tariq.png',
    },
  });

  const evaluatorTransport = await prisma.user.create({
    data: {
      email: 'evaluator.transport@startexel.org',
      passwordHash,
      firstName: 'Arthur',
      lastName: 'Pendelton',
      phoneNumber: '+1-555-400-0030',
      role: Role.EVALUATOR,
      status: UserStatus.ACTIVE,
      avatarUrl: 'https://assets.startexel.gov/avatars/evaluator-arthur.png',
    },
  });

  const evaluatorBiotech = await prisma.user.create({
    data: {
      email: 'evaluator.biotech@startexel.org',
      passwordHash,
      firstName: 'Maya',
      lastName: 'Lin',
      phoneNumber: '+1-555-400-0031',
      role: Role.EVALUATOR,
      status: UserStatus.ACTIVE,
      avatarUrl: 'https://assets.startexel.gov/avatars/evaluator-maya.png',
    },
  });

  const auditorGeneral = await prisma.user.create({
    data: {
      email: 'auditor.general@startexel.gov',
      passwordHash,
      firstName: 'Robert',
      lastName: 'Callahan',
      phoneNumber: '+1-555-500-0040',
      role: Role.AUDITOR,
      status: UserStatus.ACTIVE,
      avatarUrl: 'https://assets.startexel.gov/avatars/auditor-robert.png',
    },
  });

  console.log('✅ Created 10 Users across all 5 roles (ADMIN, DEPT, STARTUP, EVALUATOR, AUDITOR)');

  // --------------------------------------------------------------------------
  // 4. PROBLEMS (Challenge Statements)
  // --------------------------------------------------------------------------
  const problemTraffic = await prisma.problem.create({
    data: {
      title: 'AI-Powered Urban Traffic Congestion Mitigation & Signal Synchronization',
      slug: 'ai-urban-traffic-mitigation',
      code: 'PRB-2026-001',
      description:
        'Downtown corridors suffer severe peak-hour bottlenecks causing emergency vehicle delays and elevated carbon emissions. We solicit edge-computing AI computer vision models that dynamically adjust traffic light cycles based on real-time vehicle queue density and emergency vehicle priority beacons.',
      category: 'Smart Mobility & Transportation',
      severity: ProblemSeverity.HIGH,
      status: ProblemStatus.PILOTING,
      departmentId: deptMobility.id,
      createdById: deptUserTransit.id,
      budget: 150000.0,
      deadline: new Date('2026-12-15T23:59:59Z'),
      eligibilityCriteria:
        'Startups must demonstrate deployed prototypes with sub-second optical detection, compatibility with legacy NEMA TS2 traffic controllers, and 99.5% uptime.',
      expectedOutcomes:
        'Minimum 20% reduction in average corridor wait times, zero disruption to pedestrian crossing safety intervals, and automated green-wave priority for EMS vehicles.',
      tags: ['traffic-ai', 'computer-vision', 'edge-computing', 'smart-city', 'clean-air'],
    },
  });

  const problemWater = await prisma.problem.create({
    data: {
      title: 'Real-Time Autonomous IoT River Contaminant Sensing & Effluent Tracking',
      slug: 'realtime-iot-river-contaminant-sensing',
      code: 'PRB-2026-002',
      description:
        'Illegal nocturnal chemical discharges into municipal waterways endanger drinking water reservoirs. We require resilient solar-powered floating buoy sensors capable of continuous multi-parameter telemetry (pH, dissolved oxygen, turbidity, nitrates, and heavy metals) with automated alerts.',
      category: 'CleanTech & Environmental Protection',
      severity: ProblemSeverity.CRITICAL,
      status: ProblemStatus.PILOTING,
      departmentId: deptWater.id,
      createdById: deptUserWater.id,
      budget: 120000.0,
      deadline: new Date('2026-11-30T23:59:59Z'),
      eligibilityCriteria:
        'Self-cleaning optical lenses resistant to bio-fouling, cellular NB-IoT/LoRaWAN redundancy, and tamper-resistant casing.',
      expectedOutcomes:
        'Continuous 15-minute telemetry feeds, automated SMS/Webhook alerts when threshold exceeds EPA standards, and geo-triangulation of contamination sources.',
      tags: ['water-quality', 'iot-sensors', 'cleantech', 'environmental-surveillance'],
    },
  });

  const problemHealth = await prisma.problem.create({
    data: {
      title: 'Decentralized Point-of-Care Diagnostic Units for Remote Rural Primary Clinics',
      slug: 'point-of-care-rural-diagnostic-units',
      code: 'PRB-2026-003',
      description:
        'Rural health posts lack refrigerated lab infrastructure, delaying critical infectious disease blood work by up to 7 days. Seeking ruggedized, battery-operated microfluidic diagnostic devices requiring minimal cold-chain storage.',
      category: 'Healthcare Innovation',
      severity: ProblemSeverity.HIGH,
      status: ProblemStatus.IN_REVIEW,
      departmentId: deptHealth.id,
      createdById: deptUserHealth.id,
      budget: 200000.0,
      deadline: new Date('2027-01-20T23:59:59Z'),
      eligibilityCriteria:
        'FDA or CE-IVD equivalent certification track, multi-panel assay support (dengue, malaria, typhoid, liver profile), test time < 15 minutes.',
      expectedOutcomes:
        'Deployment in 15 primary health clinics, cloud synchronization of diagnostic results with state electronic medical record systems.',
      tags: ['medtech', 'point-of-care', 'rural-health', 'telemedicine'],
    },
  });

  const problemPerimeter = await prisma.problem.create({
    data: {
      title: 'Autonomous Drone Swarm Emergency Perimeter Surveillance in Flood Hazards',
      slug: 'drone-swarm-emergency-monitoring',
      code: 'PRB-2026-004',
      description:
        'Rapid reconnaissance of severed infrastructure, stranded citizens, and flood levee integrity during extreme monsoon weather.',
      category: 'Public Safety & Disaster Management',
      severity: ProblemSeverity.MEDIUM,
      status: ProblemStatus.PUBLISHED,
      departmentId: deptMobility.id,
      createdById: deptUserTransit.id,
      budget: 95000.0,
      deadline: new Date('2027-02-28T23:59:59Z'),
      eligibilityCriteria:
        'IP67 waterproof rating, thermal FLIR payloads, automated return-to-base charging pads, and BVLOS regulatory compliance.',
      expectedOutcomes:
        'Autonomous flight coordination of 4 drones simultaneously covering 10 sq km with real-time 4K thermal overlay.',
      tags: ['drones', 'disaster-response', 'thermal-imaging', 'public-safety'],
    },
  });

  // Populate vector embeddings for problems using raw SQL
  await prisma.$executeRawUnsafe(
    `UPDATE problems SET embedding = $1::vector WHERE id = $2::uuid`,
    generatePseudoEmbedding(101),
    problemTraffic.id,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE problems SET embedding = $1::vector WHERE id = $2::uuid`,
    generatePseudoEmbedding(102),
    problemWater.id,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE problems SET embedding = $1::vector WHERE id = $2::uuid`,
    generatePseudoEmbedding(103),
    problemHealth.id,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE problems SET embedding = $1::vector WHERE id = $2::uuid`,
    generatePseudoEmbedding(104),
    problemPerimeter.id,
  );

  console.log('✅ Created 4 Problems with vector(384) embeddings');

  // --------------------------------------------------------------------------
  // 5. PROPOSALS (Startup Bids)
  // --------------------------------------------------------------------------
  const proposalTrafficAero = await prisma.proposal.create({
    data: {
      code: 'PROP-2026-001',
      title: 'CorridorFlow: Edge-AI Dynamic Signal Coordination Platform',
      summary:
        'AeroVantage proposes CorridorFlow, deploying industrial edge compute units (NVIDIA Jetson Orin) interfaced directly with existing traffic signal cabinets, utilizing custom YOLOv10 object detection and reinforcement learning traffic phase optimization.',
      technicalApproach:
        'Low-latency RTSP video feed processing at 30 FPS across 4 intersection arms. Micro-controllers issue dry-contact actuation into controller backplanes. End-to-end fail-safe watchdog timer guarantees default green sequence if edge system reboots.',
      budget: 135000.0,
      durationMonths: 6,
      status: ProposalStatus.ACCEPTED,
      problemId: problemTraffic.id,
      startupId: startupAero.id,
      submittedById: startupUserAero.id,
      submittedAt: new Date('2026-10-10T14:30:00Z'),
    },
  });

  const proposalTrafficShield = await prisma.proposal.create({
    data: {
      code: 'PROP-2026-002',
      title: 'ShieldTraffic Optical Queue Length Estimator',
      summary:
        'ShieldNet offers a wide-angle 360-degree fisheye camera architecture coupled with thermal verification to track queue spillback at major roundabouts.',
      technicalApproach:
        'Centralized cloud-streaming pipeline utilizing AWS Wavelength 5G edge computing nodes for queue calculation and remote actuation.',
      budget: 148000.0,
      durationMonths: 8,
      status: ProposalStatus.UNDER_REVIEW,
      problemId: problemTraffic.id,
      startupId: startupShield.id,
      submittedById: adminUser.id,
      submittedAt: new Date('2026-10-14T18:15:00Z'),
    },
  });

  const proposalWaterEco = await prisma.proposal.create({
    data: {
      code: 'PROP-2026-003',
      title: 'AquaSentinel: Multi-Spectral Optical Buoy Fleet & Effluent Triangulation',
      summary:
        'EcoPurify introduces AquaSentinel solar-powered smart buoys equipped with solid-state spectrophotometry probes, automated anti-fouling wiper brushes, and 4G/Satellite dual telemetry.',
      technicalApproach:
        'Deploying 8 autonomous buoys at 2 km intervals along the industrial river sector. Built-in differential spectrometry detects organic solvent absorption bands and heavy metals with ppb sensitivity. Automated hydrodynamic dispersal modeling identifies upstream polluters.',
      budget: 115000.0,
      durationMonths: 5,
      status: ProposalStatus.ACCEPTED,
      problemId: problemWater.id,
      startupId: startupEco.id,
      submittedById: startupUserEco.id,
      submittedAt: new Date('2026-10-05T09:20:00Z'),
    },
  });

  const proposalHealthMed = await prisma.proposal.create({
    data: {
      code: 'PROP-2026-004',
      title: 'MicroLab-18: High-Throughput Cartridge Diagnostic System for Rural Clinics',
      summary:
        'MedSense proposes battery-backed MicroLab-18 handheld analyzers and disposable microfluidic test cards delivering quantitative diagnostic panels with automated EHR integration.',
      technicalApproach:
        'Capillary blood sample (40 microliters) inserted into single-use polydimethylsiloxane (PDMS) chip with pre-deposited lyophilized fluorescent reagents. Internal laser scanner measures analyte intensity and transmits results over encrypted MQTT.',
      budget: 190000.0,
      durationMonths: 9,
      status: ProposalStatus.SHORTLISTED,
      problemId: problemHealth.id,
      startupId: startupMed.id,
      submittedById: startupUserMed.id,
      submittedAt: new Date('2026-10-25T11:45:00Z'),
    },
  });

  // Populate vector embeddings for proposals
  await prisma.$executeRawUnsafe(
    `UPDATE proposals SET embedding = $1::vector WHERE id = $2::uuid`,
    generatePseudoEmbedding(201),
    proposalTrafficAero.id,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE proposals SET embedding = $1::vector WHERE id = $2::uuid`,
    generatePseudoEmbedding(202),
    proposalTrafficShield.id,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE proposals SET embedding = $1::vector WHERE id = $2::uuid`,
    generatePseudoEmbedding(203),
    proposalWaterEco.id,
  );
  await prisma.$executeRawUnsafe(
    `UPDATE proposals SET embedding = $1::vector WHERE id = $2::uuid`,
    generatePseudoEmbedding(204),
    proposalHealthMed.id,
  );

  console.log('✅ Created 4 Proposals with vector(384) embeddings');

  // --------------------------------------------------------------------------
  // 6. EVALUATIONS (Multi-criteria Scoring)
  // --------------------------------------------------------------------------
  await prisma.evaluation.create({
    data: {
      proposalId: proposalTrafficAero.id,
      evaluatorId: evaluatorTransport.id,
      technicalScore: 94.5,
      feasibilityScore: 91.0,
      costScore: 92.0,
      impactScore: 96.0,
      overallScore: 93.4,
      recommendation: EvaluationRecommendation.STRONGLY_ACCEPT,
      comments:
        'Exceptional technical proposal. The inclusion of edge Jetson Orin processing eliminates cloud latency concerns. Hardware fail-safe mechanism directly addresses departmental risk guidelines.',
      criteriaFeedback: {
        latencyCompliance: 'Sub-50ms verified',
        hardwareIntegrity: 'Meets NEMA TS2 standard',
        roiEstimateYears: 1.4,
      },
      status: EvaluationStatus.FINALIZED,
      submittedAt: new Date('2026-10-18T10:00:00Z'),
    },
  });

  await prisma.evaluation.create({
    data: {
      proposalId: proposalTrafficShield.id,
      evaluatorId: evaluatorTransport.id,
      technicalScore: 74.0,
      feasibilityScore: 70.0,
      costScore: 68.0,
      impactScore: 78.0,
      overallScore: 72.5,
      recommendation: EvaluationRecommendation.NEUTRAL,
      comments:
        'Cloud-streaming approach introduces network jitter vulnerabilities during cellular network congestion. Budget is slightly high compared to edge alternatives.',
      criteriaFeedback: {
        latencyCompliance: 'Exceeds 400ms under load',
        hardwareIntegrity: 'Non-standard cabinet requirements',
      },
      status: EvaluationStatus.FINALIZED,
      submittedAt: new Date('2026-10-20T16:30:00Z'),
    },
  });

  await prisma.evaluation.create({
    data: {
      proposalId: proposalWaterEco.id,
      evaluatorId: evaluatorBiotech.id,
      technicalScore: 93.0,
      feasibilityScore: 89.5,
      costScore: 95.0,
      impactScore: 97.0,
      overallScore: 93.6,
      recommendation: EvaluationRecommendation.STRONGLY_ACCEPT,
      comments:
        'Spectrophotometry approach is vastly superior to electrochemical probes which drift within weeks. The mechanical wiper mechanism will ensure longevity in river conditions.',
      criteriaFeedback: {
        calibrationStabilityDays: 180,
        batteryAutonomyDaysWithoutSun: 21,
      },
      status: EvaluationStatus.FINALIZED,
      submittedAt: new Date('2026-10-12T11:15:00Z'),
    },
  });

  await prisma.evaluation.create({
    data: {
      proposalId: proposalHealthMed.id,
      evaluatorId: evaluatorBiotech.id,
      technicalScore: 88.5,
      feasibilityScore: 84.0,
      costScore: 83.0,
      impactScore: 91.0,
      overallScore: 86.6,
      recommendation: EvaluationRecommendation.ACCEPT,
      comments:
        'Highly promising microfluidic device. Cartridge manufacturing scalability requires close monitoring during milestone 1.',
      criteriaFeedback: {
        reagentStabilityMonths: 12,
        operatorTrainingHours: 2,
      },
      status: EvaluationStatus.SUBMITTED,
      submittedAt: new Date('2026-11-01T14:00:00Z'),
    },
  });

  console.log('✅ Created 4 Evaluations');

  // --------------------------------------------------------------------------
  // 7. PILOTS (Funded Proof-of-Concepts)
  // --------------------------------------------------------------------------
  const pilotTraffic = await prisma.pilot.create({
    data: {
      code: 'PLT-2026-001',
      title: 'Downtown Arterial Corridor Adaptive Signal AI Pilot',
      scope:
        'Deployment of CorridorFlow across 6 contiguous signalized intersections on Grand Avenue between 4th and 10th Streets.',
      status: PilotStatus.IN_PROGRESS,
      startDate: new Date('2026-11-01T00:00:00Z'),
      endDate: new Date('2027-04-30T23:59:59Z'),
      allocatedBudget: 135000.0,
      spentBudget: 45000.0,
      kpiTargets: {
        targetCongestionReductionPercent: 22.0,
        emergencyPriorityResponseSec: 8.0,
        systemAvailabilityPercent: 99.5,
      },
      kpiResults: {
        observedWaitTimeReductionPercent: 18.4,
        emergencyPriorityResponseSec: 6.2,
      },
      departmentId: deptMobility.id,
      startupId: startupAero.id,
      problemId: problemTraffic.id,
      proposalId: proposalTrafficAero.id,
      managerId: deptUserTransit.id,
    },
  });

  const pilotWater = await prisma.pilot.create({
    data: {
      code: 'PLT-2026-002',
      title: 'Industrial Canal Smart Water Quality Sensor Network Pilot',
      scope:
        'Mooring and telemetry verification of 8 AquaSentinel buoys in the East Industrial Canal and Municipal Water Intake Basin.',
      status: PilotStatus.COMPLETED,
      startDate: new Date('2026-06-01T00:00:00Z'),
      endDate: new Date('2026-10-31T23:59:59Z'),
      actualEndDate: new Date('2026-10-28T17:00:00Z'),
      allocatedBudget: 115000.0,
      spentBudget: 115000.0,
      kpiTargets: {
        dataIngestionUptimePercent: 99.0,
        falseAlertRatePercent: 2.0,
        dischargeDetectionTimeMinutes: 30,
      },
      kpiResults: {
        dataIngestionUptimePercent: 99.8,
        falseAlertRatePercent: 0.4,
        dischargeDetectionTimeMinutes: 14,
        illegalDischargesIdentified: 7,
      },
      departmentId: deptWater.id,
      startupId: startupEco.id,
      problemId: problemWater.id,
      proposalId: proposalWaterEco.id,
      managerId: deptUserWater.id,
    },
  });

  console.log('✅ Created 2 Pilots');

  // --------------------------------------------------------------------------
  // 8. MILESTONES (Phased Deliverables & Tranches)
  // --------------------------------------------------------------------------
  await prisma.milestone.createMany({
    data: [
      {
        pilotId: pilotTraffic.id,
        title: 'Cabinet Interface & Hardware Bench Testing',
        description:
          'Procure, bench-test, and bench-certify 6 edge Jetson enclosures with traffic controller breakout boards.',
        orderIndex: 1,
        dueDate: new Date('2026-11-25T17:00:00Z'),
        completedDate: new Date('2026-11-20T15:30:00Z'),
        status: MilestoneStatus.VERIFIED,
        deliverables: 'Bench test logs, hardware wiring schematics, and city safety compliance approval certificate.',
        verificationCriteria: 'All 6 units running 72 hours continuous loop without thermal throttling or dropped frames.',
        verificationFeedback: 'Inspected by Marcus Vance. Hardware passed all isolation tests.',
        disbursementAmount: 45000.0,
        disbursementStatus: DisbursementStatus.DISBURSED,
      },
      {
        pilotId: pilotTraffic.id,
        title: 'Intersection Camera Mount & Field Optical Calibration',
        description:
          'Physical installation of overhead cameras at 6 intersections and calibration of bounding box virtual detection zones.',
        orderIndex: 2,
        dueDate: new Date('2027-01-15T17:00:00Z'),
        status: MilestoneStatus.IN_PROGRESS,
        deliverables: 'Field calibration report and latency telemetry dashboard.',
        verificationCriteria: 'Day/night classification accuracy > 95%.',
        disbursementAmount: 45000.0,
        disbursementStatus: DisbursementStatus.PENDING,
      },
      {
        pilotId: pilotTraffic.id,
        title: 'Active Loop Corridor Closed-Loop Actuation & Impact Audit',
        description:
          'Engage live signal timing actuation during peak commute hours and measure travel time variances against control corridor.',
        orderIndex: 3,
        dueDate: new Date('2027-04-15T17:00:00Z'),
        status: MilestoneStatus.PENDING,
        deliverables: 'Final traffic engineering impact report and public emissions reduction calculation.',
        disbursementAmount: 45000.0,
        disbursementStatus: DisbursementStatus.NOT_APPLICABLE,
      },
      {
        pilotId: pilotWater.id,
        title: 'Sensor Buoy Assembly & Calibration in Controlled Tank',
        description: 'Spectrometer lab calibration against certified chemical concentration standards.',
        orderIndex: 1,
        dueDate: new Date('2026-07-01T17:00:00Z'),
        completedDate: new Date('2026-06-28T14:00:00Z'),
        status: MilestoneStatus.VERIFIED,
        deliverables: 'Calibration curves and waterproof seal test records.',
        disbursementAmount: 35000.0,
        disbursementStatus: DisbursementStatus.DISBURSED,
      },
      {
        pilotId: pilotWater.id,
        title: 'Field River Deployment & Mooring Installation',
        description: 'Anchoring 8 buoys in designated GPS coordinates with solar charging verification.',
        orderIndex: 2,
        dueDate: new Date('2026-08-15T17:00:00Z'),
        completedDate: new Date('2026-08-12T16:45:00Z'),
        status: MilestoneStatus.VERIFIED,
        deliverables: 'GPS coordinates log, telemetry uplink verification, and diver mooring check.',
        disbursementAmount: 40000.0,
        disbursementStatus: DisbursementStatus.DISBURSED,
      },
      {
        pilotId: pilotWater.id,
        title: 'Continuous 90-Day Water Quality Monitoring & Final Verification',
        description:
          '90 days continuous telemetry streaming with emergency notification drill conducted with Environmental Police.',
        orderIndex: 3,
        dueDate: new Date('2026-10-31T17:00:00Z'),
        completedDate: new Date('2026-10-25T11:00:00Z'),
        status: MilestoneStatus.VERIFIED,
        deliverables: 'Final water quality telemetry dataset, incident response log, and graduation report.',
        disbursementAmount: 40000.0,
        disbursementStatus: DisbursementStatus.DISBURSED,
      },
    ],
  });

  console.log('✅ Created 6 Milestones');

  // --------------------------------------------------------------------------
  // 9. PROCUREMENTS (Graduation into Commercial Public Contracts)
  // --------------------------------------------------------------------------
  const procurementWater = await prisma.procurement.create({
    data: {
      contractNumber: 'PROC-2026-0089',
      title: 'Statewide Riverine Autonomous Water Quality Monitoring Network Expansion',
      description:
        'Following the 100% verified success of Pilot PLT-2026-002, the Department of Water Resources directly awards EcoPurify Solutions a 3-year commercial contract for deploying and maintaining 60 AquaSentinel buoys across all major industrial tributaries.',
      type: ProcurementType.DIRECT_AWARD,
      status: ProcurementStatus.CONTRACT_SIGNED,
      pilotId: pilotWater.id,
      departmentId: deptWater.id,
      startupId: startupEco.id,
      contractValue: 1250000.0,
      startDate: new Date('2026-12-01T00:00:00Z'),
      endDate: new Date('2029-11-30T23:59:59Z'),
      termsAndConditions:
        'Standard State GovTech Master Services Agreement. SLA guarantees 99.5% uptime with replacement of damaged buoys within 48 hours. Quarterly maintenance reviews and continuous cloud telemetry feed access.',
      approvalOfficer: 'Hon. Director Patricia Hayes, Secretary of Water & Natural Resources',
    },
  });

  const procurementTraffic = await prisma.procurement.create({
    data: {
      contractNumber: 'PROC-2026-0104',
      title: 'Metropolitan Smart Traffic Signal AI Framework Agreement',
      description:
        'Fast-track innovation partnership tender for city-wide rollout across 120 intersections contingent on successful final milestone of Pilot PLT-2026-001.',
      type: ProcurementType.INNOVATION_PARTNERSHIP,
      status: ProcurementStatus.PENDING_APPROVAL,
      pilotId: pilotTraffic.id,
      departmentId: deptMobility.id,
      startupId: startupAero.id,
      contractValue: 840000.0,
      startDate: new Date('2027-05-01T00:00:00Z'),
      endDate: new Date('2029-04-30T23:59:59Z'),
      termsAndConditions:
        'Contingent upon demonstration of minimum 20% corridor delay reduction upon conclusion of active trial.',
      approvalOfficer: 'Commissioner David Sterling, Metropolitan Transportation Board',
    },
  });

  console.log('✅ Created 2 Procurements');

  // --------------------------------------------------------------------------
  // 10. DOCUMENTS
  // --------------------------------------------------------------------------
  await prisma.document.createMany({
    data: [
      {
        title: 'CorridorFlow Edge Architecture Specification',
        fileName: 'AeroVantage-CorridorFlow-Tech-Spec.pdf',
        fileSize: 4280120,
        mimeType: 'application/pdf',
        fileUrl: 'minio://startexel-docs/proposals/PROP-2026-001/tech-spec.pdf',
        category: DocumentCategory.TECHNICAL_SPEC,
        uploadedById: startupUserAero.id,
        proposalId: proposalTrafficAero.id,
        startupId: startupAero.id,
      },
      {
        title: 'Downtown Arterial Traffic Pilot Calibration Signoff',
        fileName: 'PLT-2026-001-Milestone1-Signoff.pdf',
        fileSize: 852100,
        mimeType: 'application/pdf',
        fileUrl: 'minio://startexel-docs/pilots/PLT-2026-001/milestone1-signoff.pdf',
        category: DocumentCategory.MILESTONE_PROOF,
        uploadedById: deptUserTransit.id,
        pilotId: pilotTraffic.id,
      },
      {
        title: 'AquaSentinel Spectrometry Sensor Lab Validation Report',
        fileName: 'EcoPurify-Spectrometry-Test-Results.pdf',
        fileSize: 3105440,
        mimeType: 'application/pdf',
        fileUrl: 'minio://startexel-docs/proposals/PROP-2026-003/sensor-validation.pdf',
        category: DocumentCategory.PILOT_EVALUATION,
        uploadedById: startupUserEco.id,
        proposalId: proposalWaterEco.id,
        startupId: startupEco.id,
      },
      {
        title: 'Executed Commercial Agreement PROC-2026-0089',
        fileName: 'PROC-2026-0089-State-Water-Contract-Signed.pdf',
        fileSize: 6245100,
        mimeType: 'application/pdf',
        fileUrl: 'minio://startexel-docs/procurements/PROC-2026-0089/signed-contract.pdf',
        category: DocumentCategory.CONTRACT,
        uploadedById: deptUserWater.id,
        procurementId: procurementWater.id,
      },
      {
        title: 'MicroLab-18 Point-of-Care Clinical Pitch Deck',
        fileName: 'MedSense-MicroLab18-Executive-Pitch.pdf',
        fileSize: 5120000,
        mimeType: 'application/pdf',
        fileUrl: 'minio://startexel-docs/proposals/PROP-2026-004/pitch-deck.pdf',
        category: DocumentCategory.PROPOSAL_PITCH,
        uploadedById: startupUserMed.id,
        proposalId: proposalHealthMed.id,
        startupId: startupMed.id,
      },
    ],
  });

  console.log('✅ Created 5 Documents');

  // --------------------------------------------------------------------------
  // 11. AUDIT LOGS (Cryptographically Chained with SHA-256)
  // --------------------------------------------------------------------------
  const auditEntries = [
    createChainedAuditLog({
      actorId: adminUser.id,
      action: 'SYSTEM_BOOTSTRAP',
      entity: 'Platform',
      entityId: 'SYSTEM-ROOT',
      payload: { event: 'Platform initialized with core governance parameters' },
      createdAt: new Date('2026-10-01T08:00:00Z'),
    }),
    createChainedAuditLog({
      actorId: deptUserTransit.id,
      action: 'PROBLEM_PUBLISHED',
      entity: 'Problem',
      entityId: problemTraffic.id,
      payload: { code: 'PRB-2026-001', title: problemTraffic.title, budget: 150000.0 },
      createdAt: new Date('2026-10-02T10:15:00Z'),
    }),
    createChainedAuditLog({
      actorId: deptUserWater.id,
      action: 'PROBLEM_PUBLISHED',
      entity: 'Problem',
      entityId: problemWater.id,
      payload: { code: 'PRB-2026-002', title: problemWater.title, budget: 120000.0 },
      createdAt: new Date('2026-10-03T11:30:00Z'),
    }),
    createChainedAuditLog({
      actorId: startupUserAero.id,
      action: 'PROPOSAL_SUBMITTED',
      entity: 'Proposal',
      entityId: proposalTrafficAero.id,
      payload: { code: 'PROP-2026-001', problemCode: 'PRB-2026-001', requestedBudget: 135000.0 },
      createdAt: new Date('2026-10-10T14:30:00Z'),
    }),
    createChainedAuditLog({
      actorId: startupUserEco.id,
      action: 'PROPOSAL_SUBMITTED',
      entity: 'Proposal',
      entityId: proposalWaterEco.id,
      payload: { code: 'PROP-2026-003', problemCode: 'PRB-2026-002', requestedBudget: 115000.0 },
      createdAt: new Date('2026-10-05T09:20:00Z'),
    }),
    createChainedAuditLog({
      actorId: evaluatorTransport.id,
      action: 'EVALUATION_FINALIZED',
      entity: 'Evaluation',
      entityId: `${proposalTrafficAero.id}-${evaluatorTransport.id}`,
      payload: { proposalCode: 'PROP-2026-001', overallScore: 93.4, recommendation: 'STRONGLY_ACCEPT' },
      createdAt: new Date('2026-10-18T10:00:00Z'),
    }),
    createChainedAuditLog({
      actorId: deptUserTransit.id,
      action: 'PILOT_INITIATED',
      entity: 'Pilot',
      entityId: pilotTraffic.id,
      payload: { code: 'PLT-2026-001', proposalCode: 'PROP-2026-001', allocatedBudget: 135000.0 },
      createdAt: new Date('2026-10-28T16:00:00Z'),
    }),
    createChainedAuditLog({
      actorId: deptUserTransit.id,
      action: 'MILESTONE_VERIFIED',
      entity: 'Milestone',
      entityId: 'MILESTONE-PLT-001-1',
      payload: { pilotCode: 'PLT-2026-001', orderIndex: 1, disbursementAmount: 45000.0 },
      createdAt: new Date('2026-11-20T15:30:00Z'),
    }),
    createChainedAuditLog({
      actorId: deptUserWater.id,
      action: 'PILOT_COMPLETED',
      entity: 'Pilot',
      entityId: pilotWater.id,
      payload: { code: 'PLT-2026-002', status: 'COMPLETED', outcome: 'Target KPIs exceeded' },
      createdAt: new Date('2026-10-28T17:00:00Z'),
    }),
    createChainedAuditLog({
      actorId: deptUserWater.id,
      action: 'PROCUREMENT_CONTRACT_SIGNED',
      entity: 'Procurement',
      entityId: procurementWater.id,
      payload: { contractNumber: 'PROC-2026-0089', value: 1250000.0, awardee: 'EcoPurify Solutions' },
      createdAt: new Date('2026-11-15T12:00:00Z'),
    }),
    createChainedAuditLog({
      actorId: auditorGeneral.id,
      action: 'PROCUREMENT_AUDIT_INSPECTED',
      entity: 'Procurement',
      entityId: procurementWater.id,
      payload: { contractNumber: 'PROC-2026-0089', auditResult: 'COMPLIANT_WITH_GOVTECH_REGULATIONS' },
      createdAt: new Date('2026-11-18T14:45:00Z'),
    }),
  ];

  for (const entry of auditEntries) {
    await prisma.auditLog.create({
      data: entry,
    });
  }

  console.log('✅ Created 11 Cryptographically Chained Audit Logs with SHA-256');

  console.log('\n======================================================');
  console.log('✨ Startexel Demo Database Seeding Successfully Completed!');
  console.log('======================================================');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
