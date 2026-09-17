import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { StartMetaOAuthUseCase } from '../../../application/use-cases/StartMetaOAuthUseCase';
import { CompleteMetaOAuthUseCase } from '../../../application/use-cases/CompleteMetaOAuthUseCase';

/**
 * "OAuth authentication" endpoints. `start` requires a tenant session (it's
 * the dashboard initiating the connect flow); `callback` deliberately does
 * NOT require one - Meta redirects the bare browser here with only
 * `code`/`state` in the query string, no Authorization header. The tenant
 * identity is instead recovered from the signed `state` param.
 */
export class MetaOAuthController {
  constructor(
    private readonly startUseCase: StartMetaOAuthUseCase,
    private readonly completeUseCase: CompleteMetaOAuthUseCase,
  ) {}

  start = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const result = this.startUseCase.execute({ tenantId: req.tenantId! });
    res.status(200).json(result);
  };

  callback = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const { code, state } = req.query;
    if (typeof code !== 'string' || typeof state !== 'string') {
      res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'code and state are required' } });
      return;
    }

    const result = await this.completeUseCase.execute({ code, state });
    // adAccounts only ever carries id/name/currency - never the access
    // token, which stays server-side in encrypted storage.
    res.status(200).json(result);
  };
}
