import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { ConnectDeliveryProviderUseCase } from '../../../application/use-cases/ConnectDeliveryProviderUseCase';

/**
 * "Authentication" endpoint: the seller pastes their Elogistia API key here
 * once. It is validated and encrypted server-side and never echoed back -
 * the response never contains the key, only a connection status.
 */
export class DeliveryConnectionController {
  constructor(private readonly connectUseCase: ConnectDeliveryProviderUseCase) {}

  connect = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const tenantId = req.tenantId!;
    const apiKey = req.body?.apiKey;

    if (typeof apiKey !== 'string' || apiKey.trim() === '') {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'apiKey is required' } });
      return;
    }

    const result = await this.connectUseCase.execute({ tenantId, apiKey });
    res.status(201).json(result);
  };
}
