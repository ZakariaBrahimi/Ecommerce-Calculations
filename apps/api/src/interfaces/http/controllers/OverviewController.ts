import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { GetOverviewDashboardUseCase } from '../../../application/use-cases/GetOverviewDashboardUseCase';

/** Backs the dashboard's Overview KPIs, Delivery Funnel and Profit Breakdown sections. */
export class OverviewController {
  constructor(private readonly overviewUseCase: GetOverviewDashboardUseCase) {}

  getOverview = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const overview = await this.overviewUseCase.execute({ tenantId: req.tenantId! });
    res.status(200).json(overview);
  };
}
