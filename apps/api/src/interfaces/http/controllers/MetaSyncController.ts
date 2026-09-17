import { Request, Response } from 'express';
import { MetaAdsSyncScheduler } from '../../../infrastructure/jobs/MetaAdsSyncScheduler';

/** Internal-only manual trigger for the Meta Ads sync job - see requireInternalToken. */
export class MetaSyncController {
  constructor(private readonly scheduler: MetaAdsSyncScheduler) {}

  triggerNow = async (_req: Request, res: Response): Promise<void> => {
    await this.scheduler.runOnce();
    res.status(202).json({ status: 'completed' });
  };
}
