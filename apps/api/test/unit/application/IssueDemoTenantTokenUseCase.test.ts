import { IssueDemoTenantTokenUseCase } from '../../../src/application/use-cases/IssueDemoTenantTokenUseCase';
import { TenantSessionIssuer } from '../../../src/domain/ports/TenantSessionIssuer';
import { NoopLogger } from './testFakes';

class FakeSessionIssuer implements TenantSessionIssuer {
  issue(tenantId: string) {
    return { token: `token-for-${tenantId}`, expiresInSeconds: 86_400 };
  }
}

describe('IssueDemoTenantTokenUseCase', () => {
  it('delegates to the session issuer and returns its result', () => {
    const logger = new NoopLogger();
    const warnSpy = jest.spyOn(logger, 'warn');
    const useCase = new IssueDemoTenantTokenUseCase(new FakeSessionIssuer(), logger);

    const result = useCase.execute({ tenantId: 'tenant-1' });

    expect(result).toEqual({ token: 'token-for-tenant-1', expiresInSeconds: 86_400 });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('not a real login'),
      expect.objectContaining({ tenantId: 'tenant-1' }),
    );
  });
});
