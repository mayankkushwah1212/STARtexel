import { AuthService } from '../src/auth/auth.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';

describe('JWT_SECRET Startup Validation', () => {
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it('AuthService constructor must throw if JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => {
      new AuthService({} as any, {} as any);
    }).toThrow('JWT_SECRET environment variable is missing.');
  });

  it('JwtStrategy constructor must throw if JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    expect(() => {
      new JwtStrategy();
    }).toThrow('JWT_SECRET environment variable is missing.');
  });

  it('validateEnv function must throw if JWT_SECRET is missing', () => {
    delete process.env.JWT_SECRET;
    const { validateEnv } = require('../src/config/env.validation');
    expect(() => {
      validateEnv({});
    }).toThrow('JWT_SECRET environment variable is missing.');
  });
});
