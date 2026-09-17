import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { SelectMetaAdAccountUseCase } from '../../../application/use-cases/SelectMetaAdAccountUseCase';
import { SyncMetaAdsUseCase } from '../../../application/use-cases/SyncMetaAdsUseCase';

export class MetaAdAccountController {
  constructor(
    private readonly selectUseCase: SelectMetaAdAccountUseCase,
    private readonly syncUseCase: SyncMetaAdsUseCase,
  ) {}

  select = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const tenantId = req.tenantId!;
    const adAccountId = req.body?.adAccountId;

    if (typeof adAccountId !== 'string' || adAccountId.trim() === '') {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'adAccountId is required' } });
      return;
    }

    const selection = await this.selectUseCase.execute({ tenantId, adAccountId });
    // Populate the dashboard immediately rather than making the seller wait
    // for the next scheduled sync tick - mirrors the delivery integration's
    // backfill-on-connect behavior.
    const sync = await this.syncUseCase.execute({ tenantId });

    res.status(200).json({ ...selection, sync });
  };
}
