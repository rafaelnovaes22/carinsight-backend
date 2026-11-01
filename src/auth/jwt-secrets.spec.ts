import { jwtSecret, validateJwtSecrets } from './jwt-secrets';

describe('JWT configuration', () => {
  const original = { ...process.env };
  afterEach(() => {
    process.env = { ...original };
  });

  it('refuses absent and short production secrets without exposing their value', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.JWT_SECRET;
    expect(() => jwtSecret('JWT_SECRET')).toThrow('JWT_SECRET deve conter');
    process.env.JWT_SECRET = 'short';
    expect(() => jwtSecret('JWT_SECRET')).toThrow('JWT_SECRET deve conter');
  });

  it('requires separate signing keys for refresh and access', () => {
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.JWT_REFRESH_SECRET = process.env.JWT_SECRET;
    expect(validateJwtSecrets).toThrow('devem ser diferentes');
  });

  it('uses stable process-local keys for local development only', () => {
    process.env.NODE_ENV = 'test';
    delete process.env.JWT_SECRET;
    delete process.env.JWT_REFRESH_SECRET;
    expect(jwtSecret('JWT_SECRET')).toHaveLength(64);
    expect(jwtSecret('JWT_SECRET')).toBe(jwtSecret('JWT_SECRET'));
    expect(jwtSecret('JWT_SECRET')).not.toBe(jwtSecret('JWT_REFRESH_SECRET'));
  });
});
