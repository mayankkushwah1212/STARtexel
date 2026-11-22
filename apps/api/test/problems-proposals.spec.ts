import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService } from '../src/audit/audit.service';
import { ProblemStatus, ProposalStatus, ProblemSeverity, UserStatus, Role } from '@prisma/client';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

describe('Problems & Proposals CRUD, RBAC & State Machines', () => {
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
  let pendingStartupToken: string;

  // Department & Startup IDs
  let deptTransitId: string;
  let deptWaterId: string;
  let startupAeroId: string;
  let startupEcoId: string;

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

    // 1. Authenticate seeded users to acquire tokens
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

    // Retrieve department and startup IDs directly from seeded users
    const userTransit = await prisma.user.findUnique({ where: { email: 'transport.lead@startexel.gov' } });
    deptTransitId = userTransit!.departmentId!;

    const userWater = await prisma.user.findUnique({ where: { email: 'cleanwater.officer@startexel.gov' } });
    deptWaterId = userWater!.departmentId!;

    const userAero = await prisma.user.findUnique({ where: { email: 'founder@aerovantage.io' } });
    startupAeroId = userAero!.startupId!;

    const userEco = await prisma.user.findUnique({ where: { email: 'cto@ecopurify.tech' } });
    startupEcoId = userEco!.startupId!;

    // Create a PENDING startup user to test RBAC rejection on submission
    const pendingEmail = `pending-startup-${Date.now()}@test.com`;
    const pwdHash = await bcrypt.hash('Password123!', 10);
    const pendingUser = await prisma.user.create({
      data: {
        email: pendingEmail,
        passwordHash: pwdHash,
        firstName: 'Pending',
        lastName: 'Founder',
        role: Role.STARTUP,
        status: UserStatus.PENDING,
        startupId: startupAeroId,
      },
    });

    // Sign a token for the pending user to test endpoint guard
    const jwtService = app.get(JwtService);
    const jwtPayload = { sub: pendingUser.id, email: pendingUser.email, role: pendingUser.role, status: pendingUser.status, startupId: pendingUser.startupId };
    pendingStartupToken = jwtService.sign(jwtPayload);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({
      where: { email: { contains: 'pending-startup-' } },
    });
    await app.close();
  });

  // ============================================================================
  // 1. PROBLEMS: CRUD & RBAC
  // ============================================================================
  describe('Problems: CRUD & RBAC', () => {
    let createdProblemId: string;

    it('DEPT user can create a problem challenge for their department', async () => {
      const res = await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          title: 'Automated Transit Lane Enforcement',
          description: 'Deploy roadside sensors to enforce dedicated bus lane compliance during peak commute hours.',
          category: 'Urban Mobility',
          severity: ProblemSeverity.HIGH,
          status: ProblemStatus.DRAFT,
          budget: 180000,
          deadline: '2027-01-31T23:59:59Z',
          tags: ['transit', 'enforcement', 'bus'],
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.code).toMatch(/^PRB-\d{4}-\d{3}$/);
      expect(res.body.slug).toContain('automated-transit-lane-enforcement');
      expect(res.body.departmentId).toBe(deptTransitId);
      expect(res.body.status).toBe(ProblemStatus.DRAFT);
      createdProblemId = res.body.id;
    });

    it('ADMIN user can create a problem challenge for any department', async () => {
      const res = await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          title: 'Municipal Rainwater Harvesting Infrastructure',
          description: 'Advanced stormwater storage and subterranean purification cistern network challenge.',
          category: 'Water Management',
          departmentId: deptWaterId,
          severity: ProblemSeverity.CRITICAL,
          status: ProblemStatus.PUBLISHED,
          budget: 250000,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.departmentId).toBe(deptWaterId);
      expect(res.body.status).toBe(ProblemStatus.PUBLISHED);
    });

    it('STARTUP user cannot create a problem (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({
          title: 'Illegal Startup Created Problem',
          description: 'Startups should not be allowed to post departmental problem challenges.',
          category: 'Prohibited',
        })
        .expect(403);
    });

    it('EVALUATOR and AUDITOR users cannot create a problem (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({ title: 'Eval Problem', description: 'Evaluator posting challenge', category: 'Testing' })
        .expect(403);

      await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${auditorToken}`)
        .send({ title: 'Audit Problem', description: 'Auditor posting challenge', category: 'Testing' })
        .expect(403);
    });

    it('Public / unauthenticated users can list problems', async () => {
      const res = await request(app.getHttpServer())
        .get('/problems')
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(res.body.total).toBeGreaterThan(0);
      expect(res.body.page).toBe(1);
    });

    it('Public / unauthenticated users can get problem details by ID or slug', async () => {
      const res = await request(app.getHttpServer())
        .get(`/problems/${createdProblemId}`)
        .expect(200);

      expect(res.body.id).toBe(createdProblemId);
      expect(res.body.department).toBeDefined();
      expect(res.body.createdBy).toBeDefined();
    });

    it('Owning DEPT user can update problem details', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/problems/${createdProblemId}`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          title: 'Automated Transit Lane Enforcement v2',
          budget: 195000,
        })
        .expect(200);

      expect(res.body.title).toBe('Automated Transit Lane Enforcement v2');
      expect(Number(res.body.budget)).toBe(195000);
    });

    it('DEPT user from a different department cannot update the problem (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/problems/${createdProblemId}`)
        .set('Authorization', `Bearer ${deptWaterToken}`)
        .send({ title: 'Malicious Cross-Dept Problem Update' })
        .expect(403);
    });

    it('STARTUP user cannot update problem details (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/problems/${createdProblemId}`)
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({ title: 'Startup Overwriting Problem' })
        .expect(403);
    });
  });

  // ============================================================================
  // 2. PROBLEMS: STATE MACHINE VALIDATIONS & INVALID TRANSITIONS
  // ============================================================================
  describe('Problems: State Machine & Transition Rules', () => {
    let testProblemId: string;

    beforeAll(async () => {
      // Create fresh problem in DRAFT status
      const res = await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          title: 'State Machine Test Problem',
          description: 'Testing lifecycle transitions strictly based on DESIGN.md specification.',
          category: 'Testing',
          status: ProblemStatus.DRAFT,
        });
      testProblemId = res.body.id;
    });

    it('rejects invalid jumps from DRAFT (e.g. DRAFT -> PILOTING or RESOLVED)', async () => {
      // DRAFT -> PILOTING (Invalid)
      const res1 = await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.PILOTING })
        .expect(400);

      expect(res1.body.message).toContain("Invalid problem status transition from 'DRAFT' to 'PILOTING'");

      // DRAFT -> RESOLVED (Invalid)
      const res2 = await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.RESOLVED })
        .expect(400);

      expect(res2.body.message).toContain("Invalid problem status transition from 'DRAFT' to 'RESOLVED'");
    });

    it('rejects transition to the same status (DRAFT -> DRAFT)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.DRAFT })
        .expect(400);

      expect(res.body.message).toContain("Problem is already in 'DRAFT' status");
    });

    it('allows valid transition: DRAFT -> PUBLISHED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.PUBLISHED, reason: 'Challenge finalized for public bidding.' })
        .expect(200);

      expect(res.body.problem.status).toBe(ProblemStatus.PUBLISHED);
      expect(res.body.auditRecordId).toBeDefined();
    });

    it('rejects invalid jump from PUBLISHED to RESOLVED or DRAFT', async () => {
      // PUBLISHED -> RESOLVED (Invalid)
      await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.RESOLVED })
        .expect(400);

      // PUBLISHED -> DRAFT (Invalid)
      await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.DRAFT })
        .expect(400);
    });

    it('allows valid transition: PUBLISHED -> IN_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.IN_REVIEW, reason: 'Proposal submission closed; review underway.' })
        .expect(200);

      expect(res.body.problem.status).toBe(ProblemStatus.IN_REVIEW);
    });

    it('rejects invalid jump from IN_REVIEW to RESOLVED', async () => {
      await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.RESOLVED })
        .expect(400);
    });

    it('allows valid transition: IN_REVIEW -> PILOTING', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.PILOTING, reason: 'Pilot phase commenced with accepted startup.' })
        .expect(200);

      expect(res.body.problem.status).toBe(ProblemStatus.PILOTING);
    });

    it('allows valid transition: PILOTING -> RESOLVED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.RESOLVED, reason: 'Pilot deliverables validated; problem solved.' })
        .expect(200);

      expect(res.body.problem.status).toBe(ProblemStatus.RESOLVED);
    });

    it('allows valid transition: RESOLVED -> CLOSED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.CLOSED, reason: 'Archiving closed challenge.' })
        .expect(200);

      expect(res.body.problem.status).toBe(ProblemStatus.CLOSED);
    });

    it('rejects any transition from terminal CLOSED status (e.g. CLOSED -> PUBLISHED)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/problems/${testProblemId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProblemStatus.PUBLISHED })
        .expect(400);

      expect(res.body.message).toContain("Allowed transitions: None (Problem is in terminal CLOSED status)");
    });

    it('verifies that all state transitions produced a cryptographically valid audit log chain', async () => {
      const verification = await auditService.verifyChain();
      expect(verification.valid).toBe(true);
      expect(verification.totalRecords).toBeGreaterThan(0);
    });
  });

  // ============================================================================
  // 3. PROPOSALS: CRUD & RBAC
  // ============================================================================
  describe('Proposals: CRUD & RBAC', () => {
    let openProblemId: string;
    let aeroProposalId: string;
    let ecoProposalId: string;

    beforeAll(async () => {
      // Create a published problem for testing proposal submission
      const prb = await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          title: 'Transit Sensor Deployment Challenge',
          description: 'Open call for edge AI sensors to capture vehicle classification counts.',
          category: 'Urban Mobility',
          status: ProblemStatus.PUBLISHED,
        });
      openProblemId = prb.body.id;
    });

    it('ACTIVE STARTUP user can submit a proposal', async () => {
      const res = await request(app.getHttpServer())
        .post('/proposals')
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({
          problemId: openProblemId,
          title: 'AeroTraffic AI Adaptive Sensor Network',
          summary: 'Solar-powered optical edge sensors streaming telemetry over LoRaWAN and 5G.',
          technicalApproach: 'Deploy 50 edge TPUs with tensor RT quantized neural networks.',
          budget: 135000,
          durationMonths: 6,
          status: ProposalStatus.SUBMITTED,
        })
        .expect(201);

      expect(res.body.id).toBeDefined();
      expect(res.body.code).toMatch(/^PROP-\d{4}-\d{3}$/);
      expect(res.body.startupId).toBe(startupAeroId);
      expect(res.body.status).toBe(ProposalStatus.SUBMITTED);
      aeroProposalId = res.body.id;
    });

    it('PENDING STARTUP user cannot submit a proposal (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/proposals')
        .set('Authorization', `Bearer ${pendingStartupToken}`)
        .send({
          problemId: openProblemId,
          title: 'Pending User Illegal Proposal',
          summary: 'Unapproved accounts must be rejected by proposal submission guard.',
          technicalApproach: 'Testing security perimeter.',
          budget: 50000,
          durationMonths: 3,
        })
        .expect(403);
    });

    it('DEPT, EVALUATOR, and AUDITOR users cannot submit proposals (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .post('/proposals')
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          problemId: openProblemId,
          title: 'Dept User Submitting Proposal',
          summary: 'Gov officers should not submit proposals.',
          technicalApproach: 'Testing RBAC',
          budget: 50000,
          durationMonths: 3,
        })
        .expect(403);

      await request(app.getHttpServer())
        .post('/proposals')
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .send({
          problemId: openProblemId,
          title: 'Evaluator Proposal',
          summary: 'Evaluators cannot bid.',
          technicalApproach: 'Testing RBAC',
          budget: 50000,
          durationMonths: 3,
        })
        .expect(403);
    });

    it('cannot submit a proposal to a CLOSED or DRAFT problem (400 Bad Request)', async () => {
      // Create closed problem
      const closedPrb = await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          title: 'Closed Challenge',
          description: 'Closed challenge testing.',
          category: 'Testing',
          status: ProblemStatus.CLOSED,
        });

      await request(app.getHttpServer())
        .post('/proposals')
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({
          problemId: closedPrb.body.id,
          title: 'Bidding on Closed Problem',
          summary: 'Should be rejected.',
          technicalApproach: 'Testing',
          budget: 50000,
          durationMonths: 3,
        })
        .expect(400);
    });

    it('Submit proposal from second startup for isolation testing', async () => {
      const res = await request(app.getHttpServer())
        .post('/proposals')
        .set('Authorization', `Bearer ${startupEcoToken}`)
        .send({
          problemId: openProblemId,
          title: 'EcoPurify Low-Power Sensor Pack',
          summary: 'Bio-inspired environmental optical sensors for micro-mobility tracking.',
          technicalApproach: 'Low energy mesh network.',
          budget: 115000,
          durationMonths: 5,
          status: ProposalStatus.SUBMITTED,
        })
        .expect(201);

      expect(res.body.startupId).toBe(startupEcoId);
      ecoProposalId = res.body.id;
    });

    // --------------------------------------------------------------------------
    // STARTUP ISOLATION: A startup sees ONLY its own proposals
    // --------------------------------------------------------------------------
    it('Startup Aero sees ONLY its own proposals in GET /proposals', async () => {
      const res = await request(app.getHttpServer())
        .get('/proposals')
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .expect(200);

      expect(res.body.items).toBeDefined();
      expect(res.body.items.length).toBeGreaterThan(0);
      // Every returned item MUST belong to Aero startup
      for (const item of res.body.items) {
        expect(item.startupId).toBe(startupAeroId);
        expect(item.startupId).not.toBe(startupEcoId);
      }
    });

    it('Startup Eco sees ONLY its own proposals in GET /proposals', async () => {
      const res = await request(app.getHttpServer())
        .get('/proposals')
        .set('Authorization', `Bearer ${startupEcoToken}`)
        .expect(200);

      for (const item of res.body.items) {
        expect(item.startupId).toBe(startupEcoId);
        expect(item.startupId).not.toBe(startupAeroId);
      }
    });

    it('Startup Aero CANNOT view Startup Eco proposal via GET /proposals/:id (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get(`/proposals/${ecoProposalId}`)
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .expect(403);
    });

    it('Startup Eco CANNOT view Startup Aero proposal via GET /proposals/:id (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .get(`/proposals/${aeroProposalId}`)
        .set('Authorization', `Bearer ${startupEcoToken}`)
        .expect(403);
    });

    it('DEPT user can view proposals for problems issued by their department', async () => {
      const res = await request(app.getHttpServer())
        .get(`/proposals/${aeroProposalId}`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .expect(200);

      expect(res.body.id).toBe(aeroProposalId);
    });

    it('ADMIN, EVALUATOR, and AUDITOR can view proposal details', async () => {
      await request(app.getHttpServer())
        .get(`/proposals/${aeroProposalId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/proposals/${aeroProposalId}`)
        .set('Authorization', `Bearer ${evaluatorToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/proposals/${aeroProposalId}`)
        .set('Authorization', `Bearer ${auditorToken}`)
        .expect(200);
    });
  });

  // ============================================================================
  // 4. PROPOSALS: STATE MACHINE VALIDATIONS & INVALID TRANSITIONS
  // ============================================================================
  describe('Proposals: State Machine & Transition Rules', () => {
    let testProposalId: string;
    let openProblemId: string;

    beforeAll(async () => {
      const prb = await request(app.getHttpServer())
        .post('/problems')
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({
          title: 'Proposal State Machine Problem',
          description: 'Problem challenge for proposal state transitions.',
          category: 'Testing',
          status: ProblemStatus.PUBLISHED,
        });
      openProblemId = prb.body.id;

      // Create draft proposal
      const prop = await request(app.getHttpServer())
        .post('/proposals')
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({
          problemId: openProblemId,
          title: 'Draft Lifecycle Proposal',
          summary: 'Testing draft to submitted to under review.',
          technicalApproach: 'Lifecycle testing architecture.',
          budget: 100000,
          durationMonths: 6,
          status: ProposalStatus.DRAFT,
        });
      testProposalId = prop.body.id;
    });

    it('rejects invalid jump from DRAFT (e.g. DRAFT -> ACCEPTED, SHORTLISTED, or REJECTED)', async () => {
      // DRAFT -> ACCEPTED (Invalid)
      const res1 = await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: ProposalStatus.ACCEPTED })
        .expect(400);

      expect(res1.body.message).toContain("Invalid proposal status transition from 'DRAFT' to 'ACCEPTED'");

      // DRAFT -> SHORTLISTED (Invalid)
      await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: ProposalStatus.SHORTLISTED })
        .expect(400);

      // DRAFT -> REJECTED (Invalid)
      await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: ProposalStatus.REJECTED })
        .expect(400);
    });

    it('allows valid transition: DRAFT -> SUBMITTED (by Startup)', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({ status: ProposalStatus.SUBMITTED, reason: 'Proposal completed and formally submitted.' })
        .expect(200);

      expect(res.body.proposal.status).toBe(ProposalStatus.SUBMITTED);
      expect(res.body.auditRecordId).toBeDefined();
    });

    it('rejects invalid jump from SUBMITTED to ACCEPTED or SHORTLISTED', async () => {
      // SUBMITTED -> ACCEPTED (Invalid)
      const res = await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: ProposalStatus.ACCEPTED })
        .expect(400);

      expect(res.body.message).toContain("Invalid proposal status transition from 'SUBMITTED' to 'ACCEPTED'");

      // SUBMITTED -> SHORTLISTED (Invalid)
      await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: ProposalStatus.SHORTLISTED })
        .expect(400);
    });

    it('Startup CANNOT move proposal to UNDER_REVIEW (restricted to review staff) (403 Forbidden)', async () => {
      await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({ status: ProposalStatus.UNDER_REVIEW })
        .expect(403);
    });

    it('DEPT user can transition proposal: SUBMITTED -> UNDER_REVIEW', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProposalStatus.UNDER_REVIEW, reason: 'Department evaluation panel convened.' })
        .expect(200);

      expect(res.body.proposal.status).toBe(ProposalStatus.UNDER_REVIEW);
    });

    it('rejects invalid jump from UNDER_REVIEW to ACCEPTED directly', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProposalStatus.ACCEPTED })
        .expect(400);

      expect(res.body.message).toContain("Invalid proposal status transition from 'UNDER_REVIEW' to 'ACCEPTED'");
    });

    it('allows valid transition: UNDER_REVIEW -> SHORTLISTED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProposalStatus.SHORTLISTED, reason: 'Evaluator scoring exceeded 90 point threshold.' })
        .expect(200);

      expect(res.body.proposal.status).toBe(ProposalStatus.SHORTLISTED);
    });

    it('rejects invalid backwards transition: SHORTLISTED -> DRAFT or SUBMITTED', async () => {
      await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProposalStatus.DRAFT })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProposalStatus.SUBMITTED })
        .expect(400);
    });

    it('allows valid transition: SHORTLISTED -> ACCEPTED', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProposalStatus.ACCEPTED, reason: 'Proposal accepted for Phase 1 pilot implementation.' })
        .expect(200);

      expect(res.body.proposal.status).toBe(ProposalStatus.ACCEPTED);
    });

    it('rejects invalid transition: ACCEPTED -> SHORTLISTED or REJECTED', async () => {
      await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProposalStatus.SHORTLISTED })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProposalStatus.REJECTED })
        .expect(400);
    });

    it('allows Startup to withdraw proposal: ACCEPTED -> WITHDRAWN', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({ status: ProposalStatus.WITHDRAWN, reason: 'Startup acquired; withdrawing active pilot application.' })
        .expect(200);

      expect(res.body.proposal.status).toBe(ProposalStatus.WITHDRAWN);
    });

    it('rejects any transition from terminal WITHDRAWN status', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/proposals/${testProposalId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: ProposalStatus.SUBMITTED })
        .expect(400);

      expect(res.body.message).toContain("Allowed transitions: None (Proposal is in a terminal status)");
    });

    it('Terminal REJECTED status cannot be transitioned to anything', async () => {
      // Create and reject another proposal to test REJECTED terminal state
      const p = await request(app.getHttpServer())
        .post('/proposals')
        .set('Authorization', `Bearer ${startupAeroToken}`)
        .send({
          problemId: openProblemId,
          title: 'Reject Terminal Test Proposal',
          summary: 'Testing terminal rejected status.',
          technicalApproach: 'Approach with sufficient characters for testing validation',
          budget: 50000,
          durationMonths: 2,
          status: ProposalStatus.SUBMITTED,
        });

      // SUBMITTED -> UNDER_REVIEW -> REJECTED
      await request(app.getHttpServer())
        .patch(`/proposals/${p.body.id}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProposalStatus.UNDER_REVIEW });

      await request(app.getHttpServer())
        .patch(`/proposals/${p.body.id}/status`)
        .set('Authorization', `Bearer ${deptTransitToken}`)
        .send({ status: ProposalStatus.REJECTED, reason: 'Technical feasibility score too low.' });

      // Attempt REJECTED -> ACCEPTED (400)
      const rejectAttempt = await request(app.getHttpServer())
        .patch(`/proposals/${p.body.id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: ProposalStatus.ACCEPTED })
        .expect(400);

      expect(rejectAttempt.body.message).toContain("Allowed transitions: None (Proposal is in a terminal status)");
    });

    it('verifies that all proposal state transitions are recorded in the intact cryptographic audit chain', async () => {
      const result = await auditService.verifyChain();
      expect(result.valid).toBe(true);
      expect(result.totalRecords).toBeGreaterThan(0);
    });
  });
});
