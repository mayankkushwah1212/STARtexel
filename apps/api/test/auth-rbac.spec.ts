import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { JwtService } from '@nestjs/jwt';
import { Role, UserStatus } from '@prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Auth & RBAC (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let prisma: PrismaService;

  // Cached tokens for demo accounts
  let adminToken: string;
  let deptToken: string;
  let startupToken: string;
  let evaluatorToken: string;
  let auditorToken: string;

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

    jwtService = moduleFixture.get<JwtService>(JwtService);
    prisma = moduleFixture.get<PrismaService>(PrismaService);

    // Login with seeded demo accounts to obtain tokens
    const adminRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@startexel.gov', password: 'Password123!' });
    adminToken = adminRes.body.accessToken;

    const deptRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'transport.lead@startexel.gov', password: 'Password123!' });
    deptToken = deptRes.body.accessToken;

    const startupRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'founder@aerovantage.io', password: 'Password123!' });
    startupToken = startupRes.body.accessToken;

    const evaluatorRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'evaluator.transport@startexel.org', password: 'Password123!' });
    evaluatorToken = evaluatorRes.body.accessToken;

    const auditorRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'auditor.general@startexel.gov', password: 'Password123!' });
    auditorToken = auditorRes.body.accessToken;
  });

  afterAll(async () => {
    // Clean up any test users created during test runs
    await prisma.user.deleteMany({
      where: { email: { contains: 'test-runner' } },
    });
    await app.close();
  });

  // ============================================================================
  // 1. REGISTRATION RESTRICTIONS & PASSWORD SECURITY
  // ============================================================================
  describe('Public /auth/register', () => {
    it('should reject registration if user tries to choose ADMIN role', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test-runner-admin@example.com',
          password: 'Password123!',
          firstName: 'Illegal',
          lastName: 'Admin',
          role: 'ADMIN',
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('Public registration only allows STARTUP or DEPT roles.');
    });

    it('should reject registration if user tries to choose EVALUATOR or AUDITOR', async () => {
      const resEval = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test-runner-eval@example.com',
          password: 'Password123!',
          firstName: 'Illegal',
          lastName: 'Eval',
          role: 'EVALUATOR',
        });
      expect(resEval.status).toBe(400);

      const resAudit = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test-runner-audit@example.com',
          password: 'Password123!',
          firstName: 'Illegal',
          lastName: 'Audit',
          role: 'AUDITOR',
        });
      expect(resAudit.status).toBe(400);
    });

    it('should reject registration if password is under 8 characters', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: 'test-runner-shortpwd@example.com',
          password: 'short',
          firstName: 'Short',
          lastName: 'Pwd',
          role: 'STARTUP',
        });

      expect(res.status).toBe(400);
    });

    it('should register a STARTUP user with status PENDING and NEVER return passwordHash', async () => {
      const email = `test-runner-startup-${Date.now()}@example.com`;
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email,
          password: 'Password123!',
          firstName: 'Jane',
          lastName: 'Founder',
          role: 'STARTUP',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toBeDefined();
      expect(res.body.user.email).toBe(email);
      expect(res.body.user.role).toBe(Role.STARTUP);
      expect(res.body.user.status).toBe(UserStatus.PENDING);
      expect(res.body.user.passwordHash).toBeUndefined();
      expect(res.body.passwordHash).toBeUndefined();
      expect(res.body.accessToken).toBeUndefined(); // Pending users do not get an active session
    });
  });

  // ============================================================================
  // 2. LOGIN & APPROVAL WORKFLOW
  // ============================================================================
  describe('Login & Approval Workflow', () => {
    let pendingUserId: string;
    const pendingEmail = `test-runner-pending-${Date.now()}@example.com`;

    beforeAll(async () => {
      const regRes = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: pendingEmail,
          password: 'Password123!',
          firstName: 'Bob',
          lastName: 'Pending',
          role: 'STARTUP',
        });
      pendingUserId = regRes.body.user.id;
    });

    it('should reject login for a user with status PENDING', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: pendingEmail,
          password: 'Password123!',
        });

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Your account is pending administrator approval.');
    });

    it('should forbid non-ADMIN users from approving a user', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/admin/users/${pendingUserId}/approve`)
        .set('Authorization', `Bearer ${startupToken}`);

      expect(res.status).toBe(403);
    });

    it('should allow an ADMIN to approve a PENDING user via PATCH /admin/users/:id/approve', async () => {
      const res = await request(app.getHttpServer())
        .patch(`/admin/users/${pendingUserId}/approve`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user.status).toBe(UserStatus.ACTIVE);
      expect(res.body.user.passwordHash).toBeUndefined();
    });

    it('should allow the newly approved user to log in and receive an accessToken', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: pendingEmail,
          password: 'Password123!',
        });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.user.email).toBe(pendingEmail);
      expect(res.body.user.status).toBe(UserStatus.ACTIVE);
      expect(res.body.user.passwordHash).toBeUndefined();
    });
  });

  // ============================================================================
  // 3. TOKEN VALIDATION (MISSING & EXPIRED TOKENS)
  // ============================================================================
  describe('Token Validation Guard', () => {
    it('should reject access without token with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer()).get('/test/admin');
      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Authentication token is missing');
    });

    it('should reject access with an expired token with 401 Unauthorized', async () => {
      const expiredToken = jwtService.sign(
        { sub: 'test-expired', email: 'expired@startexel.gov', role: Role.ADMIN },
        { expiresIn: '-10s' },
      );

      const res = await request(app.getHttpServer())
        .get('/test/admin')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(res.status).toBe(401);
      expect(res.body.message).toContain('Authentication token has expired.');
    });

    it('should reject access with a forged/malformed token with 401 Unauthorized', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/admin')
        .set('Authorization', 'Bearer invalid.token.payload');

      expect(res.status).toBe(401);
    });
  });

  // ============================================================================
  // 4. ROLE PERMISSION MATRIX (EACH ROLE CAN ONLY ACCESS ITS ALLOWED ROUTES)
  // ============================================================================
  describe('RBAC Roles Guard: Allowed Routes (200 OK)', () => {
    it('ADMIN can access /test/admin', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/admin')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('ADMIN portal');
    });

    it('DEPT can access /test/dept', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/dept')
        .set('Authorization', `Bearer ${deptToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('DEPT departmental dashboard');
    });

    it('STARTUP can access /test/startup', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/startup')
        .set('Authorization', `Bearer ${startupToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('STARTUP portal');
    });

    it('EVALUATOR can access /test/evaluator', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/evaluator')
        .set('Authorization', `Bearer ${evaluatorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('EVALUATOR scorecard suite');
    });

    it('AUDITOR can access /test/auditor', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/auditor')
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.message).toContain('AUDITOR compliance audit viewer');
    });
  });

  describe('RBAC Roles Guard: Disallowed Routes (403 Forbidden)', () => {
    it('STARTUP accessing /test/admin returns 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/admin')
        .set('Authorization', `Bearer ${startupToken}`);
      expect(res.status).toBe(403);
      expect(res.body.message).toContain("Role 'STARTUP' is not authorized");
    });

    it('DEPT accessing /test/admin returns 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/admin')
        .set('Authorization', `Bearer ${deptToken}`);
      expect(res.status).toBe(403);
    });

    it('EVALUATOR accessing /test/dept returns 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/dept')
        .set('Authorization', `Bearer ${evaluatorToken}`);
      expect(res.status).toBe(403);
    });

    it('AUDITOR accessing /test/startup returns 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/startup')
        .set('Authorization', `Bearer ${auditorToken}`);
      expect(res.status).toBe(403);
    });

    it('STARTUP accessing /test/auditor returns 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/auditor')
        .set('Authorization', `Bearer ${startupToken}`);
      expect(res.status).toBe(403);
    });

    it('ADMIN accessing strictly DEPT route returns 403 Forbidden', async () => {
      const res = await request(app.getHttpServer())
        .get('/test/dept')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(403);
    });
  });
});
