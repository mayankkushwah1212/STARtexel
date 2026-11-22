import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuditService, canonicalJsonStringify } from '../src/audit/audit.service';
import { PrismaClient, UserStatus } from '@prisma/client';
import * as crypto from 'crypto';

describe('AuditService & Cryptographic Chain Verification', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auditService: AuditService;
  let superuserPrisma: PrismaClient;

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

    // Dedicated owner/superuser client for out-of-band tampering tests and test cleanup
    superuserPrisma = new PrismaClient({
      datasources: {
        db: {
          url:
            process.env.DIRECT_URL ||
            'postgresql://postgres:postgres@localhost:5432/startexel?schema=public',
        },
      },
    });
    await superuserPrisma.$connect();
  });

  afterAll(async () => {
    if (superuserPrisma) {
      await superuserPrisma.$disconnect();
    }
    await app.close();
  });

  it('should verify that the existing seeded audit chain is cryptographically intact', async () => {
    const result = await auditService.verifyChain();
    expect(result.valid).toBe(true);
    expect(result.totalRecords).toBeGreaterThan(0);
    expect(result.genesisHash).toBe('GENESIS');
    expect(result.latestHash).toBeDefined();

    // Also verify via HTTP GET /audit/verify
    const response = await request(app.getHttpServer())
      .get('/audit/verify')
      .expect(200);

    expect(response.body.valid).toBe(true);
    expect(response.body.totalRecords).toBe(result.totalRecords);
  });

  it('should write a new hash-chained record inside a transaction serialized by pg_advisory_xact_lock', async () => {
    // 1. Get the current latest record
    const latestBefore = await prisma.auditLog.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    const expectedPrevHash = latestBefore ? latestBefore.hash : 'GENESIS';

    // 2. Write new log entry
    const entry = await auditService.record({
      action: 'SECURITY_INTEGRITY_CHECK',
      entity: 'AuditTest',
      entityId: 'TEST-001',
      payload: { testRun: true, timestamp: Date.now() },
    });

    expect(entry.id).toBeDefined();
    expect(entry.prevHash).toBe(expectedPrevHash);

    // 3. Recompute expected hash manually to verify formula
    const dataToHash = `${expectedPrevHash}|SYSTEM|${entry.action}|${entry.entity}|${entry.entityId}|${canonicalJsonStringify(entry.payload)}|${entry.createdAt.toISOString()}`;
    const expectedHash = crypto.createHash('sha256').update(dataToHash).digest('hex');
    expect(entry.hash).toBe(expectedHash);

    // 4. Verification of the extended chain must still pass
    const verifyResult = await auditService.verifyChain();
    expect(verifyResult.valid).toBe(true);
    expect(verifyResult.latestHash).toBe(entry.hash);
  });

  it('should call audit log on every state transition inside a DB transaction', async () => {
    // 1. Create a test user in PENDING state
    const testUser = await prisma.user.create({
      data: {
        email: `audit-transition-${Date.now()}@test.com`,
        passwordHash: '$2b$10$abcdefghijklmnopqrstuvwxyz123456',
        firstName: 'Audit',
        lastName: 'Tester',
        role: 'STARTUP',
        status: UserStatus.PENDING,
      },
    });

    const previousStatus = testUser.status;
    const newStatus = UserStatus.ACTIVE;

    // 2. Execute state transition using transitionState helper
    const { entity: updatedUser, auditRecord } = await auditService.transitionState({
      entity: 'User',
      entityId: testUser.id,
      fromState: previousStatus,
      toState: newStatus,
      action: 'USER_APPROVED',
      metadata: { email: testUser.email, role: testUser.role },
      updateFn: async (tx) => {
        return tx.user.update({
          where: { id: testUser.id },
          data: { status: newStatus },
        });
      },
    });

    expect(updatedUser.status).toBe(UserStatus.ACTIVE);
    expect(auditRecord).toBeDefined();
    expect(auditRecord.action).toBe('USER_APPROVED');
    expect(auditRecord.entity).toBe('User');
    expect(auditRecord.entityId).toBe(testUser.id);
    expect(auditRecord.payload).toEqual({
      from: 'PENDING',
      to: 'ACTIVE',
      email: testUser.email,
      role: 'STARTUP',
    });

    // 3. Confirm cryptographic chain remains valid after state transition
    const chainCheck = await auditService.verifyChain();
    expect(chainCheck.valid).toBe(true);
    expect(chainCheck.latestHash).toBe(auditRecord.hash);

    // 4. Clean up test user
    await prisma.user.delete({ where: { id: testUser.id } });
  });

  it('should enforce revoked UPDATE and DELETE privileges on audit_logs for the app DB user', async () => {
    // The runtime PrismaService connects using DATABASE_URL (the restricted startexel_app role)
    // 1. App DB user CAN read from audit_logs
    const count = await prisma.auditLog.count();
    expect(count).toBeGreaterThan(0);

    // 2. App DB user CAN append (INSERT) to audit_logs
    const appendTest = await auditService.record({
      action: 'APP_USER_APPEND_PERMITTED',
      entity: 'Security',
      entityId: 'PERM-001',
      payload: { permissionTest: true },
    });
    expect(appendTest.id).toBeDefined();

    // 3. App DB user CANNOT UPDATE audit_logs (DB-level revocation 42501)
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE audit_logs SET action = 'MALICIOUS_UPDATE' WHERE id = $1::uuid`,
        appendTest.id,
      ),
    ).rejects.toThrow(/permission denied for table audit_logs/i);

    // 4. App DB user CANNOT DELETE from audit_logs (DB-level revocation 42501)
    await expect(
      prisma.$executeRawUnsafe(
        `DELETE FROM audit_logs WHERE id = $1::uuid`,
        appendTest.id,
      ),
    ).rejects.toThrow(/permission denied for table audit_logs/i);

    // Clean up test append record using superuser client
    await superuserPrisma.$executeRawUnsafe(
      `DELETE FROM audit_logs WHERE id = $1::uuid`,
      appendTest.id,
    );
  });

  it('should detect a deleted row in the audit chain via /audit/verify', async () => {
    // 1. Create three sequentially chained audit records
    const row1 = await auditService.record({
      action: 'DELETE_TEST_STEP_1',
      entity: 'ChainIntegrity',
      entityId: 'DEL-ROW-001',
      payload: { step: 1 },
    });

    const row2 = await auditService.record({
      action: 'DELETE_TEST_STEP_2',
      entity: 'ChainIntegrity',
      entityId: 'DEL-ROW-002',
      payload: { step: 2 },
    });

    const row3 = await auditService.record({
      action: 'DELETE_TEST_STEP_3',
      entity: 'ChainIntegrity',
      entityId: 'DEL-ROW-003',
      payload: { step: 3 },
    });

    // 2. Verify that chain is fully valid before deletion
    const beforeDelete = await auditService.verifyChain();
    expect(beforeDelete.valid).toBe(true);

    // 3. Out-of-band deletion of the middle row (row2) via superuser bypass
    // Now row3 points to row2's hash, but row1 is the immediately preceding row!
    await superuserPrisma.$executeRawUnsafe(
      `DELETE FROM audit_logs WHERE id = $1::uuid`,
      row2.id,
    );

    // 4. verifyChain() must detect the deleted row gap
    const afterDelete = await auditService.verifyChain();
    expect(afterDelete.valid).toBe(false);
    expect(afterDelete.brokenRecordId).toBe(row3.id);
    expect(afterDelete.reason).toBe('PREV_HASH_MISMATCH');
    expect(afterDelete.expectedPrevHash).toBe(row1.hash);
    expect(afterDelete.actualPrevHash).toBe(row2.hash);

    // 5. GET /audit/verify must report the broken link
    const httpResponse = await request(app.getHttpServer())
      .get('/audit/verify')
      .expect(200);

    expect(httpResponse.body.valid).toBe(false);
    expect(httpResponse.body.brokenRecordId).toBe(row3.id);
    expect(httpResponse.body.reason).toBe('PREV_HASH_MISMATCH');
    expect(httpResponse.body.expectedPrevHash).toBe(row1.hash);
    expect(httpResponse.body.actualPrevHash).toBe(row2.hash);

    // Clean up row1 and row3 to restore chain integrity
    await superuserPrisma.$executeRawUnsafe(
      `DELETE FROM audit_logs WHERE id IN ($1::uuid, $2::uuid)`,
      row1.id,
      row3.id,
    );

    const restoredCheck = await auditService.verifyChain();
    expect(restoredCheck.valid).toBe(true);
  });

  it('should handle 20 concurrent record() calls producing a valid chain', async () => {
    const concurrentCount = 20;

    // Launch 20 concurrent record() calls simultaneously
    const recordPromises = Array.from({ length: concurrentCount }, (_, i) =>
      auditService.record({
        action: 'CONCURRENT_AUDIT_STRESS',
        entity: 'ConcurrentWorker',
        entityId: `WORKER-${i + 1}`,
        payload: {
          workerIndex: i + 1,
          timestamp: Date.now(),
          entropy: crypto.randomBytes(6).toString('hex'),
        },
      }),
    );

    const results = await Promise.all(recordPromises);
    expect(results).toHaveLength(concurrentCount);

    // All 20 entries must have unique IDs and unique hashes
    const idSet = new Set(results.map((r) => r.id));
    const hashSet = new Set(results.map((r) => r.hash));
    expect(idSet.size).toBe(concurrentCount);
    expect(hashSet.size).toBe(concurrentCount);

    // Verify that the whole cryptographic chain remains intact without any forks or breaks
    const verifyResult = await auditService.verifyChain();
    expect(verifyResult.valid).toBe(true);

    // Also verify via HTTP GET /audit/verify
    const httpResponse = await request(app.getHttpServer())
      .get('/audit/verify')
      .expect(200);

    expect(httpResponse.body.valid).toBe(true);
  });

  it('should catch database tampering when a row payload is maliciously modified', async () => {
    // 1. Create a dedicated test log entry to tamper with
    const testLog = await auditService.record({
      action: 'CONTRACT_PAYMENT_DISBURSED',
      entity: 'Procurement',
      entityId: 'PROC-TAMPER-TEST',
      payload: { amount: 50000.0, recipient: 'LegitimateVendor' },
    });

    // 2. Confirm chain is valid before tampering
    const beforeTampering = await auditService.verifyChain();
    expect(beforeTampering.valid).toBe(true);

    // 3. Maliciously tamper with the payload in the database via superuser raw SQL (simulating rogue DBA / direct breach)
    const originalPayload = testLog.payload;
    const maliciousPayload = JSON.stringify({
      amount: 9999999.0, // Fraudulent modification
      recipient: 'AttackerAccount',
    });

    await superuserPrisma.$executeRawUnsafe(
      `UPDATE audit_logs SET payload = $1::jsonb WHERE id = $2::uuid`,
      maliciousPayload,
      testLog.id,
    );

    // 4. Verify that verifyChain() catches the tampering and reports the broken link
    const afterTampering = await auditService.verifyChain();
    expect(afterTampering.valid).toBe(false);
    expect(afterTampering.brokenRecordId).toBe(testLog.id);
    expect(afterTampering.reason).toBe('HASH_MISMATCH');
    expect(afterTampering.tamperedRecord?.id).toBe(testLog.id);

    // 5. Verify via HTTP GET /audit/verify that API also reports the tampering
    const httpResponse = await request(app.getHttpServer())
      .get('/audit/verify')
      .expect(200);

    expect(httpResponse.body.valid).toBe(false);
    expect(httpResponse.body.brokenRecordId).toBe(testLog.id);
    expect(httpResponse.body.reason).toBe('HASH_MISMATCH');

    // 6. Restore original payload so chain is intact again
    await superuserPrisma.$executeRawUnsafe(
      `UPDATE audit_logs SET payload = $1::jsonb WHERE id = $2::uuid`,
      JSON.stringify(originalPayload),
      testLog.id,
    );

    // 7. Verify chain is restored to valid status
    const restored = await auditService.verifyChain();
    expect(restored.valid).toBe(true);
  });

  it('should catch database tampering when prev_hash link is broken', async () => {
    // 1. Create another test log
    const testLog2 = await auditService.record({
      action: 'CRITICAL_KEY_ROTATION',
      entity: 'Security',
      entityId: 'KEY-002',
      payload: { keyVersion: 2 },
    });

    const originalPrevHash = testLog2.prevHash;
    const fakePrevHash = 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef';

    // 2. Tamper with prev_hash directly via superuser raw SQL
    await superuserPrisma.$executeRawUnsafe(
      `UPDATE audit_logs SET prev_hash = $1 WHERE id = $2::uuid`,
      fakePrevHash,
      testLog2.id,
    );

    // 3. verifyChain must catch the prev_hash mismatch
    const result = await auditService.verifyChain();
    expect(result.valid).toBe(false);
    expect(result.brokenRecordId).toBe(testLog2.id);
    expect(result.reason).toBe('PREV_HASH_MISMATCH');
    expect(result.actualPrevHash).toBe(fakePrevHash);

    // 4. Restore original prev_hash
    await superuserPrisma.$executeRawUnsafe(
      `UPDATE audit_logs SET prev_hash = $1 WHERE id = $2::uuid`,
      originalPrevHash,
      testLog2.id,
    );

    // 5. Clean verification again
    const cleanResult = await auditService.verifyChain();
    expect(cleanResult.valid).toBe(true);
  });
});
