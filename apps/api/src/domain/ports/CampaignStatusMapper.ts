import { CampaignStatus } from '../enums/CampaignStatus';

/**
 * Translates a provider's own fine-grained status vocabulary into
 * ProfitFlow AI's 3-bucket dashboard status. One implementation per
 * provider, analogous to DeliveryStatusMapper for the delivery integration.
 */
export interface CampaignStatusMapper {
  readonly provider: string;
  map(rawStatus: string): CampaignStatus;
}
