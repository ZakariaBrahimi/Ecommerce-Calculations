import { Request, Response } from 'express';
import { IssueDemoTenantTokenUseCase } from '../../../application/use-cases/IssueDemoTenantTokenUseCase';

export class DemoAuthController {
  constructor(private readonly issueTokenUseCase: IssueDemoTenantTokenUseCase) {}

  issueToken = async (req: Request, res: Response): Promise<void> => {
    const tenantId = req.body?.tenantId;
    if (typeof tenantId !== 'string' || tenantId.trim() === '') {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'tenantId is required' } });
      return;
    }

    const session = this.issueTokenUseCase.execute({ tenantId: tenantId.trim() });
    res.status(200).json({ tenantId: tenantId.trim(), ...session });
  };
}
