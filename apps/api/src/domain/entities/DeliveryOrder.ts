import { InternalDeliveryStatus } from '../enums/InternalDeliveryStatus';

export interface DeliveryOrderProps {
  id: string;
  tenantId: string;
  provider: string; // e.g. 'elogistia'
  externalOrderId: string | null;
  trackingNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  address: string | null;
  commune: string | null;
  wilaya: string | null;
  deliveryFee: number | null;
  /** What the customer paid (revenue) - only meaningful once DELIVERED. See schema.prisma's note. */
  orderValue: number | null;
  /** COGS at order time. */
  productCost: number | null;
  internalStatus: InternalDeliveryStatus;
  rawStatus: string | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Aggregate root for a delivery-provider shipment tracked by ProfitFlow AI.
 * Never holds provider credentials or transport concerns - those live in
 * infrastructure/providers/*.
 */
export class DeliveryOrder {
  private constructor(private props: DeliveryOrderProps) {}

  static create(
    props: Omit<DeliveryOrderProps, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): DeliveryOrder {
    const now = new Date();
    return new DeliveryOrder({
      ...props,
      id: props.id ?? crypto.randomUUID(),
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  static fromPersistence(props: DeliveryOrderProps): DeliveryOrder {
    return new DeliveryOrder(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get trackingNumber(): string {
    return this.props.trackingNumber;
  }

  get internalStatus(): InternalDeliveryStatus {
    return this.props.internalStatus;
  }

  get rawStatus(): string | null {
    return this.props.rawStatus;
  }

  get lastSyncedAt(): Date | null {
    return this.props.lastSyncedAt;
  }

  /**
   * Applies a newly observed status from the provider. Returns true if the
   * internal status actually changed (callers use this to decide whether to
   * emit a status-history event / trigger downstream profit recomputation).
   */
  applyStatus(internalStatus: InternalDeliveryStatus, rawStatus: string, observedAt: Date): boolean {
    const changed = internalStatus !== this.props.internalStatus || rawStatus !== this.props.rawStatus;
    this.props.internalStatus = internalStatus;
    this.props.rawStatus = rawStatus;
    this.props.lastSyncedAt = observedAt;
    this.props.updatedAt = observedAt;
    return changed;
  }

  toPrimitives(): DeliveryOrderProps {
    return { ...this.props };
  }
}
