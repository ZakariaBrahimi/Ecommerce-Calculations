import { InternalDeliveryStatus } from '../enums/InternalDeliveryStatus';

/**
 * A single point in a delivery order's status history, as reported by the
 * provider. Append-only - never mutated once recorded.
 */
export interface DeliveryStatusEventProps {
  id: string;
  deliveryOrderId: string;
  tenantId: string;
  internalStatus: InternalDeliveryStatus;
  rawStatus: string;
  occurredAt: Date;
  recordedAt: Date;
}

export class DeliveryStatusEvent {
  private constructor(private props: DeliveryStatusEventProps) {}

  static create(
    props: Omit<DeliveryStatusEventProps, 'id' | 'recordedAt'> & { id?: string; recordedAt?: Date },
  ): DeliveryStatusEvent {
    return new DeliveryStatusEvent({
      ...props,
      id: props.id ?? crypto.randomUUID(),
      recordedAt: props.recordedAt ?? new Date(),
    });
  }

  toPrimitives(): DeliveryStatusEventProps {
    return { ...this.props };
  }
}
