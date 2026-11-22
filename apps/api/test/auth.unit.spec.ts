import { UnauthorizedException, BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { AuthService } from '../src/auth/auth.service';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { Role, UserStatus } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Reflector } from '@nestjs/core';

describe('Auth & RBAC Unit Tests', () => {
  let authService: AuthService;
  let mockPrismaService: any;
  let mockJwtService: any;
  let mockConfigService: any;
  let usersStore: Map<string, any>;

  const defaultPasswordHash = bcrypt.hashSync('Password123!', 10);

  beforeEach(() => {
    usersStore = new Map();

    // Pre-populate with seeded test users
    const seededUsers = [
      {
        id: 'usr-admin-1',
        email: 'admin@startexel.gov',
        passwordHash: defaultPasswordHash,
        firstName: 'Sarah',
        lastName: 'Jenkins',
        role: Role.ADMIN,
        status: UserStatus.ACTIVE,
      },
      {
        id: 'usr-startup-1',
        email: 'founder@aerovantage.io',
        passwordHash: defaultPasswordHash,
        firstName: 'Vikram',
        lastName: 'Patel',
        role: Role.STARTUP,
        status: UserStatus.ACTIVE,
      },
      {
        id: 'usr-pending-1',
        email: 'pending@startup.io',
        passwordHash: defaultPasswordHash,
        firstName: 'Pending',
        lastName: 'User',
        role: Role.STARTUP,
        status: UserStatus.PENDING,
      },
      {
        id: 'usr-suspended-1',
        email: 'suspended@bad.io',
        passwordHash: defaultPasswordHash,
        firstName: 'Suspended',
        lastName: 'User',
        role: Role.STARTUP,
        status: UserStatus.SUSPENDED,
      },
    ];

    for (const u of seededUsers) {
      usersStore.set(u.email, { ...u });
    }

    mockPrismaService = {
      user: {
        findUnique: jest.fn(async ({ where }) => {
          if (where.id) {
            for (const u of usersStore.values()) {
              if (u.id === where.id) return { ...u };
            }
            return null;
          }
          if (where.email) {
            return usersStore.get(where.email.toLowerCase().trim()) || null;
          }
          return null;
        }),
        create: jest.fn(async ({ data }) => {
          const user = {
            id: `usr-${Date.now()}`,
            createdAt: new Date(),
            updatedAt: new Date(),
            ...data,
          };
          usersStore.set(user.email, user);
          return user;
        }),
        update: jest.fn(async ({ where, data }) => {
          for (const u of usersStore.values()) {
            if (u.id === where.id) {
              Object.assign(u, data);
              return { ...u };
            }
          }
          throw new Error('User not found');
        }),
      },
    };

    mockJwtService = {
      sign: jest.fn((payload) => `mocked.jwt.token.${payload.sub}.${payload.role}`),
    };

    mockConfigService = {
      get: jest.fn((key: string) => {
        if (key === 'JWT_SECRET') return 'unit-test-secret-key-12345';
        if (key === 'JWT_EXPIRES_IN') return '2h';
        return null;
      }),
    };

    authService = new AuthService(mockPrismaService, mockJwtService, mockConfigService);
  });

  // ============================================================================
  // 1. REGISTRATION UNIT TESTS
  // ============================================================================
  describe('POST /auth/register logic', () => {
    it('successfully registers STARTUP user with status PENDING', async () => {
      const result = await authService.register({
        email: 'newfounder@innovate.io',
        password: 'Password123!',
        firstName: 'Alice',
        lastName: 'Founder',
        role: Role.STARTUP,
      });

      expect(result.message).toContain('pending administrator approval');
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('newfounder@innovate.io');
      expect(result.user.role).toBe(Role.STARTUP);
      expect(result.user.status).toBe(UserStatus.PENDING);
      expect((result.user as any).passwordHash).toBeUndefined();
    });

    it('successfully registers DEPT user with status PENDING', async () => {
      const result = await authService.register({
        email: 'officer@water.gov',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Officer',
        role: Role.DEPT,
      });

      expect(result.user.role).toBe(Role.DEPT);
      expect(result.user.status).toBe(UserStatus.PENDING);
    });

    it('defaults to STARTUP role if no role specified', async () => {
      const result = await authService.register({
        email: 'defaultrole@test.io',
        password: 'Password123!',
        firstName: 'Default',
        lastName: 'Role',
      });

      expect(result.user.role).toBe(Role.STARTUP);
      expect(result.user.status).toBe(UserStatus.PENDING);
    });

    it('rejects role escalation: ADMIN role is rejected with 400', async () => {
      await expect(
        authService.register({
          email: 'hacker@startexel.gov',
          password: 'Password123!',
          firstName: 'Evil',
          lastName: 'Admin',
          role: Role.ADMIN,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects role escalation: EVALUATOR role is rejected with 400', async () => {
      await expect(
        authService.register({
          email: 'evaluator@test.org',
          password: 'Password123!',
          firstName: 'Illegal',
          lastName: 'Eval',
          role: Role.EVALUATOR,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects role escalation: AUDITOR role is rejected with 400', async () => {
      await expect(
        authService.register({
          email: 'auditor@test.org',
          password: 'Password123!',
          firstName: 'Illegal',
          lastName: 'Audit',
          role: Role.AUDITOR,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate email with 409 ConflictException', async () => {
      await expect(
        authService.register({
          email: 'founder@aerovantage.io',
          password: 'Password123!',
          firstName: 'Duplicate',
          lastName: 'User',
          role: Role.STARTUP,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ============================================================================
  // 2. LOGIN UNIT TESTS (PENDING USERS, INVALID PASSWORDS, ACTIVE USERS)
  // ============================================================================
  describe('POST /auth/login logic', () => {
    it('successfully logs in ACTIVE user and returns JWT accessToken', async () => {
      const result = await authService.login({
        email: 'founder@aerovantage.io',
        password: 'Password123!',
      });

      expect(result.accessToken).toBeDefined();
      expect(result.user).toBeDefined();
      expect(result.user.email).toBe('founder@aerovantage.io');
      expect(result.user.status).toBe(UserStatus.ACTIVE);
      expect((result.user as any).passwordHash).toBeUndefined();
    });

    it('rejects login with 401 Unauthorized when account status is PENDING', async () => {
      await expect(
        authService.login({
          email: 'pending@startup.io',
          password: 'Password123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Your account is pending administrator approval.'));
    });

    it('rejects login with 401 Unauthorized when account status is SUSPENDED', async () => {
      await expect(
        authService.login({
          email: 'suspended@bad.io',
          password: 'Password123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Your account has been deactivated or suspended.'));
    });

    it('rejects login with 401 Unauthorized on invalid password', async () => {
      await expect(
        authService.login({
          email: 'founder@aerovantage.io',
          password: 'WrongPassword999!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password.'));
    });

    it('rejects login with 401 Unauthorized on non-existent email', async () => {
      await expect(
        authService.login({
          email: 'ghost@nowhere.com',
          password: 'Password123!',
        }),
      ).rejects.toThrow(new UnauthorizedException('Invalid email or password.'));
    });
  });

  // ============================================================================
  // 3. GET /auth/me PROFILE UNIT TESTS
  // ============================================================================
  describe('GET /auth/me profile logic', () => {
    it('returns sanitized profile without passwordHash for valid user', async () => {
      const profile = await authService.getProfile('usr-startup-1');

      expect(profile).toBeDefined();
      expect(profile.id).toBe('usr-startup-1');
      expect(profile.email).toBe('founder@aerovantage.io');
      expect(profile.role).toBe(Role.STARTUP);
      expect((profile as any).passwordHash).toBeUndefined();
    });

    it('throws 401 Unauthorized if user is not found', async () => {
      await expect(authService.getProfile('usr-nonexistent')).rejects.toThrow(
        new UnauthorizedException('User not found.'),
      );
    });
  });

  // ============================================================================
  // 4. ROLES GUARD UNIT TESTS
  // ============================================================================
  describe('RolesGuard Unit Tests', () => {
    let rolesGuard: RolesGuard;
    let reflector: Reflector;

    beforeEach(() => {
      reflector = new Reflector();
      rolesGuard = new RolesGuard(reflector);
    });

    function createMockContext(userRole: Role | null, requiredRoles: Role[]) {
      jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(requiredRoles);
      return {
        getHandler: () => {},
        getClass: () => {},
        switchToHttp: () => ({
          getRequest: () => ({
            user: userRole ? { id: 'usr-1', email: 'test@gov', role: userRole } : null,
          }),
        }),
      } as any;
    }

    it('allows access when user role matches required role', () => {
      const context = createMockContext(Role.ADMIN, [Role.ADMIN]);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('allows access when user role is one of multiple allowed roles', () => {
      const context = createMockContext(Role.DEPT, [Role.ADMIN, Role.DEPT]);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });

    it('throws 403 ForbiddenException when user role is not authorized', () => {
      const context = createMockContext(Role.STARTUP, [Role.ADMIN]);
      expect(() => rolesGuard.canActivate(context)).toThrow(ForbiddenException);
    });

    it('allows access if no roles are required on route', () => {
      const context = createMockContext(Role.STARTUP, []);
      expect(rolesGuard.canActivate(context)).toBe(true);
    });
  });

  // ============================================================================
  // 5. JWT AUTH GUARD UNIT TESTS (EXPIRED & MISSING TOKENS)
  // ============================================================================
  describe('JwtAuthGuard Unit Tests', () => {
    let jwtAuthGuard: JwtAuthGuard;

    beforeEach(() => {
      jwtAuthGuard = new JwtAuthGuard();
    });

    it('throws 401 Unauthorized with token expired message on TokenExpiredError', () => {
      expect(() => {
        jwtAuthGuard.handleRequest(null, null, { name: 'TokenExpiredError' });
      }).toThrow(new UnauthorizedException('Authentication token has expired.'));
    });

    it('throws 401 Unauthorized when user is missing or token invalid', () => {
      expect(() => {
        jwtAuthGuard.handleRequest(null, null, { name: 'JsonWebTokenError' });
      }).toThrow(new UnauthorizedException('Authentication token is missing or invalid.'));
    });

    it('returns user if authenticated successfully', () => {
      const mockUser = { id: 'usr-1', role: Role.ADMIN };
      const result = jwtAuthGuard.handleRequest(null, mockUser, null);
      expect(result).toBe(mockUser);
    });
  });
});
