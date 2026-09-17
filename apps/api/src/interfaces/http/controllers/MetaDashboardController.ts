import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { GetCampaignDashboardUseCase } from '../../../application/use-cases/GetCampaignDashboardUseCase';

/** Backs "every time I open the dashboard" - a pure read of already-synced data. */
export class MetaDashboardController {
  constructor(private readonly dashboardUseCase: GetCampaignDashboardUseCase) {}

  getDashboard = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const dashboard = await this.dashboardUseCase.execute({ tenantId: req.tenantId! });
    res.status(200).json(dashboard);
  };
}
