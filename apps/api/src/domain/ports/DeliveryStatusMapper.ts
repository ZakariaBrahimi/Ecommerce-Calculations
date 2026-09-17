import { InternalDeliveryStatus } from '../enums/InternalDeliveryStatus';

/**
 * Translates a delivery provider's own raw status vocabulary into
 * ProfitFlow AI's internal lifecycle. One implementation per provider lives
 * in infrastructure/providers/<provider>/ - the domain and application
 * layers never see a provider's raw status strings directly, only this
 * contract.
 */
export interface DeliveryStatusMapper {
  /** The provider key this mapper serves, e.g. "elogistia". */
  readonly provider: string;

  /**
   * @throws UnknownDeliveryStatusError if `rawStatus` has no mapping.
   */
  map(rawStatus: string): InternalDeliveryStatus;
}
