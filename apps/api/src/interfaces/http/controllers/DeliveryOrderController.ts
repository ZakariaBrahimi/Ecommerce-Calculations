import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import { FetchDeliveryOrdersUseCase } from '../../../application/use-cases/FetchDeliveryOrdersUseCase';
import { FetchOrderStatusUseCase } from '../../../application/use-cases/FetchOrderStatusUseCase';
import { DeliveryOrderRepository } from '../../../domain/ports/DeliveryOrderRepository';

export class DeliveryOrderController {
  constructor(
    private readonly fetchOrders: FetchDeliveryOrdersUseCase,
    private readonly fetchOrderStatus: FetchOrderStatusUseCase,
    private readonly repository: DeliveryOrderRepository,
  ) {}

  /** Triggers a pull from the provider and returns the resulting sync counts. */
  refreshOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const tenantId = req.tenantId!;
    const trackingNumber = typeof req.query.trackingNumber === 'string' ? req.query.trackingNumber : undefined;
    const result = await this.fetchOrders.execute({ tenantId, trackingNumber });
    res.status(200).json(result);
  };

  /** Lists orders already synced into ProfitFlow AI's own database (paginated locally - see docs). */
  listOrders = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const tenantId = req.tenantId!;
    const limit = parsePositiveInt(req.query.limit, 50);
    const offset = parsePositiveInt(req.query.offset, 0);

    const orders = await this.repository.list(tenantId, { limit, offset });
    res.status(200).json({ items: orders.map((o) => o.toPrimitives()), limit, offset });
  };

  /** Forces a fresh status check for one tracking number against the provider. */
  refreshStatus = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const tenantId = req.tenantId!;
    const { trackingNumber } = req.params;
    const results = await this.fetchOrderStatus.execute({ tenantId, trackingNumbers: [trackingNumber] });
    if (results.length === 0) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No status returned for tracking number' } });
      return;
    }
    res.status(200).json(results[0]);
  };

  /** Returns this order's full recorded status history. */
  getHistory = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    const tenantId = req.tenantId!;
    const { trackingNumber } = req.params;
    const history = await this.repository.listStatusHistory(tenantId, trackingNumber);
    res.status(200).json({ items: history.map((e) => e.toPrimitives()) });
  };
}

function parsePositiveInt(value: unknown, fallback: number): number {
  if (typeof value !== 'string') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) || parsed < 0 ? fallback : parsed;
}
