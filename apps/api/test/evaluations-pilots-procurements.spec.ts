import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import {
  EvaluationRecommendation,
  EvaluationStatus,
  MilestoneStatus,
  DisbursementStatus,
  PilotStatus,
  ProcurementStatus,
  ProcurementType,
  ProblemStatus,
  ProposalStatus,
} from '@prisma/client';

describe('Evaluations, Pilots with Milestones & Procurements (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auditService: AuditService;

  // Tokens
  let adminToken: string;
  let deptTransitToken: string;
  let deptWaterToken: string;
  let startupAeroToken: string;
  let startupEcoToken: string;
  let evaluatorToken: string;
  let auditorToken: string;

  // IDs
  let deptTransitId: string;
  let deptWaterId: string;
  let startupAeroId: string;
  let startupEcoId: string;

  // Shared test entity IDs
  let transitProblemId: string;
  let aeroProposalId: string;
  let ecoProposalId: string;
  let evaluationId: string;
  let pilotId: string;
  let milestoneId: string;
  let procurementId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    auditService = app.get(AuditService);

    // 1. Authenticate seeded demo users
    const login = async (email: string) => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'Password123!' });
      return res.body.accessToken;
    };

    adminToken = await login('admin@startexel.gov');
    deptTransitToken = await login('transport.lead@startexel.gov');
    deptWaterToken = await login('cleanwater.officer@startexel.gov');
    startupAeroToken = await login('founder@aerovantage.io');
    startupEcoToken = await login('cto@ecopurify.tech');
    evaluatorToken = await login('evaluator.transport@startexel.org');
    auditorToken = await login('auditor.general@startexel.gov');

    // Retrieve department and startup IDs
    const userTransit = await prisma.user.findUnique({ where: { email: 'transport.lead@startexel.gov' } });
    deptTransitId = userTransit!.departmentId!;

    const userWater = await prisma.user.findUnique({ where: { email: 'cleanwater.officer@startexel.gov' } });
    deptWaterId = userWater!.departmentId!;

    const userAero = await prisma.user.findUnique({ where: { email: 'founder@aerovantage.io' } });
    startupAeroId = userAero!.startupId!;

    const userEco = await prisma.user.findUnique({ where: { email: 'cto@ecopurify.tech' } });
    startupEcoId = userEco!.startupId!;

    // 2. Set up base problem and proposals for lifecycle testing
    const prbRes = await request(app.getHttpServer())
      .post('/problems')
      .set('Authorization', `Bearer ${deptTransitToken}`)
      .send({
        title: 'Autonomous Vehicle Corridor Optimization',
        description: 'Sensorized corridor testing for connected automated vehicle transit systems.',
        category: 'Urban Mobility',
        status: ProblemStatus.PUBLISHED,
        budget: 350000,
      });
    transitProblemId = prbRes.body.id;

    // Proposal 1: AeroVantage (Aero)
    const aeroRes = await request(app.getHttpServer())
      .post('/proposals')
      .set('Authorization', `Bearer ${startupAeroToken}`)
      .send({
        problemId: transitProblemId,
        title: 'AeroCorridor Connected Autonomous Telemetry',
        summary: 'Edge LiDAR and neural compute pods communicating via V2X low-latency roadside units.',
        technicalApproach: 'Deploy 40 edge nodes with YOLOR neural models and 5G NR-V2X radios for automated transit.',
        budget: 280000,
        durationMonths: 8,
        status: ProposalStatus.SUBMITTED,
      });
    aeroProposalId = aeroRes.body.id;

    // Proposal 2: EcoPurify (Eco)
    const ecoRes = await request(app.getHttpServer())
      .post('/proposals')
      .set('Authorization', `Bearer ${startupEcoToken}`)
      .send({
        problemId: transitProblemId,
        title: 'EcoV2X Ambient Air & Traffic Monitor',
        summary: 'Solar-powered ambient sensor pack measuring roadside particulate emissions and vehicle counts.',
        technicalApproach: 'Electrochemical spectrometry sensors coupled with LoRaWAN telemetry and local AI filtering.',
        budget: 195000,
        durationMonths: 6,
        status: ProposalStatus.SUBMITTED,
      });
    ecoProposalId = ecoRes.body.id;

    // Move Aero proposal: SUBMITTED -> UNDER_REVIEW -> ACCEPTED
    await request(app.getHttpServer())
      .patch(`/proposals/${aeroProposalId}/status`)
      .set('Authorization', `Bearer ${deptTransitToken}`)
      .send({ status: ProposalStatus.UNDER_REVIEW });

    await request(app.getHttpServer())
      .patch(`/proposals/${aeroProposalId}/status`)
      .set('Authorization', `Bearer ${deptTransitToken}`)
      .send({ status: ProposalStatus.SHORTLISTED });

    await request(app.getHttpServer())
      .patch(`/proposals/${aeroProposalId}/status`)
      .set('Authorization', `Bearer ${deptTransitToken}`)
      .send({ status: ProposalStatus.ACCEPTED });

    // Move Eco proposal: SUBMITTED -> UNDER_REVIEW
    await request(app.getHttpServer())
      .patch(`/proposals/${ecoProposalId}/status`)
      .set('Authorization', `Bearer ${deptTransitToken}`)
      .send({ status: ProposalStatus.UNDER_REVIEW });
  });

  afterAll(async () => {
    await app.close();
  });

  // ============================================================================
  // 1. EVALUATIONS: SCORING (SCORE JSON), CRUD, RBAC & STATE MACHINE
  // ============================================================================
  describe('Evaluations: Scoring (Score JSON), CRUD & RBAC', () => {
    it('EVALUATOR can submit an evaluation with granular score JSON (criteriaFeedback)', async () => {
      const criteriaFeedback = {
        sensorAccuracy: 95,
        latencyEfficiency: 92,
        cybersecurityCompliance: 88,
        operationalSafety: 94,
        deploymentReadiness: 90,
      };

      const res = await request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({
          proposalId: ecoProposalId,
          technicalScore: 92.5,
          feasibilityScore: 89.0,
          costScore: 84.0,
          impactScore: 96.0,
          recommendation: EvaluationRecommendation.STRONGLY_ACCEPT,
          comments: 'Exemplary technical submission. Sensor suite exceeds municipal accuracy requirements.',
          criteriaFeedback,
          status: EvaluationStatus.DRAFT,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.proposalId).toBe(ecoProposalId);
      expect(Number(res.body.technicalScore)).toBe(92.5);
      expect(Number(res.body.overallScore)).toBeCloseTo(90.8, 1);
      expect(res.body.criteriaFeedback).toEqual(criteriaFeedback);
      expect(res.body.status).toBe(EvaluationStatus.DRAFT);
      evaluationId = res.body.id;
    });

    it('STARTUP user cannot submit an evaluation (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({
          proposalId: ecoProposalId,
          technicalScore: 50,
          feasibilityScore: 50,
          costScore: 50,
          impactScore: 50,
          recommendation: EvaluationRecommendation.REJECT,
          comments: 'Startup attempting unauthorized evaluation.',
        })
        .expect(403);
    });

    it('DEPT, AUDITOR and ADMIN users cannot submit evaluations (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          proposalId: ecoProposalId,
          technicalScore: 80,
          feasibilityScore: 80,
          costScore: 80,
          impactScore: 80,
          recommendation: EvaluationRecommendation.ACCEPT,
          comments: 'Admin attempting evaluation.',
        })
        .expect(403);

      await request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          proposalId: ecoProposalId,
          technicalScore: 80,
          feasibilityScore: 80,
          costScore: 80,
          impactScore: 80,
          recommendation: EvaluationRecommendation.ACCEPT,
          comments: 'Dept officer attempting evaluation.',
        })
        .expect(403);

      await request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          proposalId: ecoProposalId,
          technicalScore: 80,
          feasibilityScore: 80,
          costScore: 80,
          impactScore: 80,
          recommendation: EvaluationRecommendation.ACCEPT,
          comments: 'Auditor attempting evaluation.',
        })
        .expect(403);
    });

    it('EVALUATOR cannot score a proposal that is not in UNDER_REVIEW status (400 Bad Request)', async () => {
      // aeroProposalId is in ACCEPTED status, not UNDER_REVIEW
      const res = await request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({
          proposalId: aeroProposalId,
          technicalScore: 85,
          feasibilityScore: 85,
          costScore: 85,
          impactScore: 85,
          recommendation: EvaluationRecommendation.ACCEPT,
          comments: 'Attempting to evaluate ACCEPTED proposal.',
        })
        .expect(400);

      expect(res.body.message).toContain("Only proposals in 'UNDER_REVIEW' status can be scored");
    });

    it('Evaluator cannot submit duplicate evaluation for the same proposal (409 Conflict)', async () => {
      await request(app.getHttpServer())
        .post('/evaluations')
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({
          proposalId: ecoProposalId,
          technicalScore: 90,
          feasibilityScore: 90,
          costScore: 90,
          impactScore: 90,
          recommendation: EvaluationRecommendation.ACCEPT,
          comments: 'Duplicate evaluation attempt.',
        })
        .expect(409);
    });

    it('EVALUATOR can update scores and score JSON on a DRAFT evaluation', async () => {
      const updatedCriteria = {
        sensorAccuracy: 98,
        latencyEfficiency: 95,
        cybersecurityCompliance: 92,
      };

      const res = await request(app.getHttpServer())
        .patch(`/evaluations/${evaluationId}`)
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({
          technicalScore: 95.0,
          criteriaFeedback: updatedCriteria,
          comments: 'Updated comments after reviewing supplemental technical appendix.',
        })
        .expect(200);

      expect(Number(res.body.technicalScore)).toBe(95.0);
      expect(res.body.criteriaFeedback).toEqual(updatedCriteria);
    });

    it('STARTUP user cannot view evaluations (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get('/evaluations')
        .set('Authorization', `Bearer ${startupEcoToken}`)
        .expect(403);

      await request(app.getHttpServer())
        .get(`/evaluations/${evaluationId}`)
        .set('Authorization', `Bearer ${startupEcoToken}`)
        .expect(403);
    });

    it('DEPT user can view evaluations for proposals in their department', async () => {
      const res = await request(app.getHttpServer())
        .get(`/evaluations/${evaluationId}`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .expect(200);

      expect(res.body.id).toBe(evaluationId);
      expect(res.body.proposal.code).toBeDefined();
    });

    // --------------------------------------------------------------------------
    // Evaluation State Machine Transitions
    // --------------------------------------------------------------------------
    it('rejects invalid jump from DRAFT to FINALIZED directly (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/evaluations/${evaluationId}/status`)
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({ status: EvaluationStatus.FINALIZED })
        .expect(400);

      expect(res.body.message).toContain("Invalid evaluation status transition from 'DRAFT' to 'FINALIZED'");
    });

    it('allows valid transition: DRAFT -> SUBMITTED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/evaluations/${evaluationId}/status`)
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({ status: EvaluationStatus.SUBMITTED, reason: 'Evaluation completed by panelist.' })
        .expect(200);

      expect(res.body.evaluation.status).toBe(EvaluationStatus.SUBMITTED);
      expect(res.body.auditRecordId).toBeDefined();
    });

    it('allows valid transition: SUBMITTED -> FINALIZED (locking further edits)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/evaluations/${evaluationId}/status`)
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({ status: EvaluationStatus.FINALIZED, reason: 'Final sign-off by committee.' })
        .expect(200);

      expect(res.body.evaluation.status).toBe(EvaluationStatus.FINALIZED);
    });

    it('rejects editing a FINALIZED evaluation (400 Bad Request)', async () => {
      await request(app.getHttpServer())
        .patch(`/evaluations/${evaluationId}`)
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({ technicalScore: 99.0 })
        .expect(400);
    });

    it('rejects any transition from terminal FINALIZED evaluation status (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/evaluations/${evaluationId}/status`)
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({ status: EvaluationStatus.SUBMITTED })
        .expect(400);

      expect(res.body.message).toContain("Allowed transitions: None (Evaluation is in terminal FINALIZED status)");
    });
  });

  // ============================================================================
  // 2. PILOTS WITH MILESTONES: CRUD, RBAC, DELIVERABLES & STATE MACHINES
  // ============================================================================
  describe('Pilots with Milestones: CRUD, Deliverables & State Machines', () => {
    it('DEPT user can initiate a pilot trial with phased milestones for an accepted proposal', async () => {
      const res = await request(app.getHttpServer())
        .post('/pilots')
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          proposalId: aeroProposalId,
          title: 'Metropolis Connected Autonomous Transit Pilot',
          scope: 'Trialing edge V2X communication on 15 high-frequency bus corridors over 6 months.',
          startDate: '2026-12-01T00:00:00Z',
          endDate: '2027-05-31T23:59:59Z',
          allocatedBudget: 240000,
          kpiTargets: {
            telemetryLatencyMs: 25,
            pedestrianDetectionAccuracy: 0.99,
            hardwareReliabilityUptime: 0.999,
          },
          milestones: [
            {
              title: 'Phase 1: Roadside Sensor & TPU Pod Installation',
              description: 'Install 20 sensor pods and establish private 5G mesh network connection.',
              orderIndex: 1,
              dueDate: '2027-01-31T23:59:59Z',
              verificationCriteria: 'Complete ping audit and streaming telemetry across all 20 nodes for 48 consecutive hours.',
              disbursementAmount: 80000,
            },
            {
              title: 'Phase 2: Live Transit Telemetry & Collision Avoidance Analytics',
              description: 'Run automated vehicle classification and near-miss event detection.',
              orderIndex: 2,
              dueDate: '2027-03-31T23:59:59Z',
              verificationCriteria: 'Validated 99% accuracy against ground truth manual counts.',
              disbursementAmount: 90000,
            },
          ],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.code).toMatch(/^PLT-\d{4}-\d{3}$/);
      expect(res.body.startupId).toBe(startupAeroId);
      expect(res.body.departmentId).toBe(deptTransitId);
      expect(res.body.status).toBe(PilotStatus.INITIATED);
      expect(res.body.milestones).toHaveLength(2);
      expect(Number(res.body.spentBudget)).toBe(0);

      pilotId = res.body.id;
      milestoneId = res.body.milestones[0].id;
    });

    it('rejects pilot creation from a proposal that is not in ACCEPTED status (400 Bad Request)', async () => {
      // ecoProposalId is in UNDER_REVIEW status, not ACCEPTED
      const res = await request(app.getHttpServer())
        .post('/pilots')
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          proposalId: ecoProposalId,
          title: 'Illegal Pilot from Non-Accepted Proposal',
          scope: 'Scope testing',
          startDate: '2027-01-01T00:00:00Z',
          endDate: '2027-06-01T00:00:00Z',
          allocatedBudget: 50000,
        })
        .expect(400);

      expect(res.body.message).toContain("Only proposals in 'ACCEPTED' status can graduate to a pilot");
    });

    it('STARTUP user cannot initiate a pilot (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/pilots')
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({
          proposalId: aeroProposalId,
          title: 'Startup Unauthorized Pilot',
          scope: 'Testing forbidden initiation',
          startDate: '2027-01-01T00:00:00Z',
          endDate: '2027-06-01T00:00:00Z',
          allocatedBudget: 50000,
        })
        .expect(403);
    });

    it('EVALUATOR and AUDITOR users cannot initiate a pilot (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/pilots')
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({
          proposalId: aeroProposalId,
          title: 'Evaluator Pilot',
          scope: 'Testing',
          startDate: '2027-01-01T00:00:00Z',
          endDate: '2027-06-01T00:00:00Z',
          allocatedBudget: 50000,
        })
        .expect(403);

      await request(app.getHttpServer())
        .post('/pilots')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          proposalId: aeroProposalId,
          title: 'Auditor Pilot',
          scope: 'Testing',
          startDate: '2027-01-01T00:00:00Z',
          endDate: '2027-06-01T00:00:00Z',
          allocatedBudget: 50000,
        })
        .expect(403);
    });

    it('DEPT user from a different department cannot create a pilot for transit proposal (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/pilots')
        .set('Authorization', `Bearer ${deptWaterToken}`)
        .send({
          proposalId: aeroProposalId,
          title: 'Cross-Dept Pilot Hijack Attempt',
          scope: 'Water department attempting to launch transit pilot',
          startDate: '2027-01-01T00:00:00Z',
          endDate: '2027-06-01T00:00:00Z',
          allocatedBudget: 50000,
        })
        .expect(403);
    });

    // --------------------------------------------------------------------------
    // Pilot Isolation Tests
    // --------------------------------------------------------------------------
    it('Startup Aero can view its own pilot via GET /pilots and GET /pilots/:id', async () => {
      const listRes = await request(app.getHttpServer())
        .get('/pilots')
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .expect(200);

      expect(listRes.body.items).toBeDefined();
      expect(listRes.body.items.length).toBeGreaterThan(0);
      for (const item of listRes.body.items) {
        expect(item.startupId).toBe(startupAeroId);
      }

      const getRes = await request(app.getHttpServer())
        .get(`/pilots/${pilotId}`)
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .expect(200);

      expect(getRes.body.id).toBe(pilotId);
      expect(getRes.body.milestones).toHaveLength(2);
    });

    it('Startup Eco CANNOT view Startup Aero pilot via GET /pilots/:id (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get(`/pilots/${pilotId}`)
        .set('Authorization', `Bearer ${startupEcoToken}`)
        .expect(403);
    });

    // --------------------------------------------------------------------------
    // Milestone Lifecycle: Deliverable Submission & Verification / Disbursement
    // --------------------------------------------------------------------------
    it('Startup Aero submits deliverables for Milestone 1', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/pilots/${pilotId}/milestones/${milestoneId}/submit`)
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({
          deliverables: 'Completed deployment of 20 edge TPU roadside units. Telemetry telemetry.transit.gov verified.',
          comments: 'Hardware operating within thermal specs. Zero packet drops observed.',
        })
        .expect(200);

      expect(res.body.milestone.status).toBe(MilestoneStatus.SUBMITTED);
      expect(res.body.milestone.deliverables).toContain('Completed deployment');
      expect(res.body.auditRecordId).toBeDefined();
    });

    it('Startup Eco CANNOT submit deliverables for Startup Aero milestone (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/pilots/${pilotId}/milestones/${milestoneId}/submit`)
        .set('Authorization', `Bearer ${startupEcoToken}`)
        .send({ deliverables: 'Malicious deliverable overwrite.' })
        .expect(403);
    });

    it('DEPT user verifies Milestone 1 deliverables and authorizes tranche disbursement', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/pilots/${pilotId}/milestones/${milestoneId}/verify`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          status: MilestoneStatus.VERIFIED,
          verificationFeedback: 'Field inspection confirmed. Sensor telemetry packet audit passed 100%. Tranche 1 approved.',
          disbursementStatus: DisbursementStatus.DISBURSED,
        })
        .expect(200);

      expect(res.body.milestone.status).toBe(MilestoneStatus.VERIFIED);
      expect(res.body.milestone.disbursementStatus).toBe(DisbursementStatus.DISBURSED);

      // Verify that pilot.spentBudget was incremented by 80,000 (disbursementAmount)
      const pilotCheck = await request(app.getHttpServer())
        .get(`/pilots/${pilotId}`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .expect(200);

      expect(Number(pilotCheck.body.spentBudget)).toBe(80000);
    });

    it('STARTUP user cannot verify milestone deliverables (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/pilots/${pilotId}/milestones/${milestoneId}/verify`)
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({ status: MilestoneStatus.VERIFIED, verificationFeedback: 'Startup attempting self-verification.' })
        .expect(403);
    });

    it('rejects invalid milestone transition (VERIFIED is terminal: cannot re-verify or re-submit) (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/pilots/${pilotId}/milestones/${milestoneId}/submit`)
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({ deliverables: 'Attempting re-submission on verified milestone.' })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/pilots/${pilotId}/milestones/${milestoneId}/verify`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: MilestoneStatus.VERIFIED, verificationFeedback: 'Re-verifying.' })
        .expect(400);
    });

    // --------------------------------------------------------------------------
    // Pilot State Machine Transitions
    // --------------------------------------------------------------------------
    it('rejects invalid jump from INITIATED directly to GRADUATED or COMPLETED (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/pilots/${pilotId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: PilotStatus.GRADUATED })
        .expect(400);

      expect(res.body.message).toContain("Invalid pilot status transition from 'INITIATED' to 'GRADUATED'");
    });

    it('allows valid transition: INITIATED -> IN_PROGRESS', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/pilots/${pilotId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: PilotStatus.IN_PROGRESS, reason: 'Field trials commenced.' })
        .expect(200);

      expect(res.body.pilot.status).toBe(PilotStatus.IN_PROGRESS);
    });

    it('allows valid transition: IN_PROGRESS -> COMPLETED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/pilots/${pilotId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          status: PilotStatus.COMPLETED,
          reason: 'All milestones satisfied and trial benchmarks met.',
          kpiResults: { telemetryLatencyMs: 18, pedestrianDetectionAccuracy: 0.994 },
        })
        .expect(200);

      expect(res.body.pilot.status).toBe(PilotStatus.COMPLETED);
    });

    it('allows valid transition: COMPLETED -> GRADUATED (qualifies for direct procurement)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/pilots/${pilotId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: PilotStatus.GRADUATED, reason: 'Trial graduated; qualifying for public contract award.' })
        .expect(200);

      expect(res.body.pilot.status).toBe(PilotStatus.GRADUATED);
    });

    it('rejects any transition from terminal GRADUATED status (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/pilots/${pilotId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: PilotStatus.IN_PROGRESS })
        .expect(400);

      expect(res.body.message).toContain("Allowed transitions: None (Pilot is in a terminal status)");
    });
  });

  // ============================================================================
  // 3. PROCUREMENTS: CONTRACT AWARD, SIGNING, RBAC & STATE MACHINE
  // ============================================================================
  describe('Procurements: Contract Award, Signing, RBAC & State Machine', () => {
    it('DEPT user can award a procurement contract to the graduated pilot startup', async () => {
      const res = await request(app.getHttpServer())
        .post('/procurements')
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          pilotId,
          startupId: startupAeroId,
          title: 'Metropolis Intelligent Transit AI Fleet Contract',
          description: 'Production scale deployment of 250 connected edge sensors across the metropolitan bus corridor.',
          type: ProcurementType.DIRECT_AWARD,
          contractValue: 750000,
          startDate: '2027-06-01T00:00:00Z',
          endDate: '2029-05-31T23:59:59Z',
          termsAndConditions: 'Standard public procurement SLA: 99.9% uptime, 2-hour field maintenance response.',
          approvalOfficer: 'Marcus Vance, Transit Innovations Director',
          status: ProcurementStatus.DRAFT,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.contractNumber).toMatch(/^PROC-\d{4}-\d{4}$/);
      expect(res.body.departmentId).toBe(deptTransitId);
      expect(res.body.startupId).toBe(startupAeroId);
      expect(res.body.status).toBe(ProcurementStatus.DRAFT);
      expect(Number(res.body.contractValue)).toBe(750000);
      procurementId = res.body.id;
    });

    it('rejects procurement creation without a pilotId (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .post('/procurements')
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          title: 'Contract without Pilot',
          description: 'Testing requirement that procurement is created only from pilot',
          type: ProcurementType.DIRECT_AWARD,
          contractValue: 500000,
          startDate: '2027-01-01T00:00:00Z',
          endDate: '2028-01-01T00:00:00Z',
        })
        .expect(400);

      expect(res.body.message).toBeDefined();
    });

    it('rejects procurement creation from a pilot that is not in COMPLETED/GRADUATED status (400 Bad Request)', async () => {
      // Find or create an INITIATED pilot
      const otherPilot = await prisma.pilot.findFirst({
        where: { status: PilotStatus.INITIATED },
      });

      if (otherPilot) {
        const res = await request(app.getHttpServer())
          .post('/procurements')
          .set('Authorization', `Bearer ${adminToken}`)
          .send({
            pilotId: otherPilot.id,
            title: 'Premature Procurement Award',
            description: 'Attempting procurement from non-completed pilot',
            type: ProcurementType.DIRECT_AWARD,
            contractValue: 500000,
            startDate: '2027-01-01T00:00:00Z',
            endDate: '2028-01-01T00:00:00Z',
          })
          .expect(400);

        expect(res.body.message).toContain("Procurement contracts can only be created from a 'COMPLETED' pilot project");
      }
    });

    it('STARTUP user cannot create a procurement contract (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/procurements')
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({
          pilotId,
          title: 'Self-Awarded Contract',
          description: 'Testing forbidden creation',
          type: ProcurementType.DIRECT_AWARD,
          contractValue: 500000,
          startDate: '2027-01-01T00:00:00Z',
          endDate: '2028-01-01T00:00:00Z',
        })
        .expect(403);
    });

    it('EVALUATOR and AUDITOR users cannot create a procurement contract (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/procurements')
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({
          pilotId,
          title: 'Evaluator Contract',
          description: 'Testing forbidden creation',
          type: ProcurementType.DIRECT_AWARD,
          contractValue: 500000,
          startDate: '2027-01-01T00:00:00Z',
          endDate: '2028-01-01T00:00:00Z',
        })
        .expect(403);

      await request(app.getHttpServer())
        .post('/procurements')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({
          pilotId,
          title: 'Auditor Contract',
          description: 'Testing forbidden creation',
          type: ProcurementType.DIRECT_AWARD,
          contractValue: 500000,
          startDate: '2027-01-01T00:00:00Z',
          endDate: '2028-01-01T00:00:00Z',
        })
        .expect(403);
    });

    // --------------------------------------------------------------------------
    // Procurement Isolation Tests
    // --------------------------------------------------------------------------
    it('Startup Aero sees ONLY its awarded contracts in GET /procurements', async () => {
      const res = await request(app.getHttpServer())
        .get('/procurements')
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(res.body.items.length).toBeGreaterThan(0);
      for (const item of res.body.items) {
        expect(item.startupId).toBe(startupAeroId);
      }
    });

    it('Startup Eco CANNOT view Startup Aero contract via GET /procurements/:id (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get(`/procurements/${procurementId}`)
        .set('Authorization', `Bearer ${startupEcoToken}`)
        .expect(403);
    });

    // --------------------------------------------------------------------------
    // Procurement State Machine Transitions
    // --------------------------------------------------------------------------
    it('rejects invalid jump from DRAFT to CONTRACT_SIGNED or FULFILLED (400 Bad Request)', async () => {
      const res1 = await request(app.getHttpServer())
        .patch(`/procurements/${procurementId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProcurementStatus.CONTRACT_SIGNED })
        .expect(400);

      expect(res1.body.message).toContain("Invalid procurement status transition from 'DRAFT' to 'CONTRACT_SIGNED'");

      const res2 = await request(app.getHttpServer())
        .patch(`/procurements/${procurementId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProcurementStatus.FULFILLED })
        .expect(400);

      expect(res2.body.message).toContain("Invalid procurement status transition from 'DRAFT' to 'FULFILLED'");
    });

    it('allows valid transition: DRAFT -> PENDING_APPROVAL', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/procurements/${procurementId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProcurementStatus.PENDING_APPROVAL, reason: 'Submitted to state legal and audit review.' })
        .expect(200);

      expect(res.body.procurement.status).toBe(ProcurementStatus.PENDING_APPROVAL);
    });

    it('allows valid transition: PENDING_APPROVAL -> APPROVED (by ADMIN)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/procurements/${procurementId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          status: ProcurementStatus.APPROVED,
          approvalOfficer: 'Sarah Jenkins, State Chief Procurement Officer',
          reason: 'Legal compliance and treasury allocation confirmed.',
        })
        .expect(200);

      expect(res.body.procurement.status).toBe(ProcurementStatus.APPROVED);
    });

    it('allows awarded STARTUP vendor to execute contract signature: APPROVED -> CONTRACT_SIGNED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/procurements/${procurementId}/status`)
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({
          status: ProcurementStatus.CONTRACT_SIGNED,
          approvalOfficer: 'Vikram Patel, CEO AeroVantage',
          reason: 'Contract executed by vendor leadership.',
        })
        .expect(200);

      expect(res.body.procurement.status).toBe(ProcurementStatus.CONTRACT_SIGNED);
      expect(res.body.auditRecordId).toBeDefined();
    });

    it('allows valid transition: CONTRACT_SIGNED -> FULFILLED (by DEPT)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/procurements/${procurementId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          status: ProcurementStatus.FULFILLED,
          reason: 'All production hardware commissioned and operational.',
        })
        .expect(200);

      expect(res.body.procurement.status).toBe(ProcurementStatus.FULFILLED);
    });

    it('rejects any transition from terminal FULFILLED status (400 Bad Request)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/procurements/${procurementId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProcurementStatus.CONTRACT_SIGNED })
        .expect(400);

      expect(res.body.message).toContain("Allowed transitions: None (Contract is in a terminal status)");
    });
  });

  // ============================================================================
  // 4. CRYPTOGRAPHIC AUDIT LOG INTEGRITY VERIFICATION
  // ============================================================================
  describe('Cryptographic Audit Log Verification', () => {
    it('verifies that all evaluation, pilot, milestone, and procurement events are cryptographically intact in SHA-256 hash chain', async () => {
      const verification = await auditService.verifyChain();
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBeGreaterThan(0);
      expect(verification.latestHash).toBeDefined();

      // Also verify via GET /audit/verify
      const httpRes = await request(app.getHttpServer())
        .get('/audit/verify')
        .expect(200);

      expect(httpRes.body.valid).toBe(true);
      expect(httpRes.body.totalRecords).toBe(verification.totalRecords);
    });
  });
});
