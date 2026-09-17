import { Request, Response } from 'express';
import { DeliverySyncScheduler } from '../../../infrastructure/jobs/DeliverySyncScheduler';

/**
 * Internal-only (see requireInternalToken) manual trigger for the sync job -
 * useful for ops/on-call to force a run without waiting for the cron tick.
 * Not exposed to tenants; never reachable with a tenant session token.
 */
export class DeliverySyncController {
  constructor(private readonly scheduler: DeliverySyncScheduler) {}

  triggerNow = async (_req: Request, res: Response): Promise<void> => {
    await this.scheduler.runOnce();
    res.status(202).json({ status: 'completed' });
  };
}
