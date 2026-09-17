import { CampaignStatus } from '../enums/CampaignStatus';

export interface CampaignProps {
  id: string;
  tenantId: string;
  provider: string; // 'meta'
  adAccountId: string;
  externalCampaignId: string;
  name: string;
  objective: string | null;
  status: CampaignStatus;
  rawStatus: string; // Meta's effective_status, e.g. "CAMPAIGN_PAUSED"
  dailyBudget: number | null;
  currency: string | null;
  startDate: Date | null;
  endDate: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A Meta Ads campaign, normalized to ProfitFlow AI's own lifecycle. Spend
 * and results are NOT stored on this entity - they live in DailySpend rows
 * so history is preserved and the dashboard can aggregate over any window.
 */
export class Campaign {
  private constructor(private props: CampaignProps) {}

  static create(
    props: Omit<CampaignProps, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): Campaign {
    const now = new Date();
    return new Campaign({
      ...props,
      id: props.id ?? crypto.randomUUID(),
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  static fromPersistence(props: CampaignProps): Campaign {
    return new Campaign(props);
  }

  get id(): string {
    return this.props.id;
  }

  get tenantId(): string {
    return this.props.tenantId;
  }

  get externalCampaignId(): string {
    return this.props.externalCampaignId;
  }

  get status(): CampaignStatus {
    return this.props.status;
  }

  /** Applies freshly-synced fields from the provider. Returns true if anything changed. */
  applySync(update: {
    name: string;
    objective: string | null;
    status: CampaignStatus;
    rawStatus: string;
    dailyBudget: number | null;
    currency: string | null;
    startDate: Date | null;
    endDate: Date | null;
  }, syncedAt: Date): boolean {
    const changed =
      update.name !== this.props.name ||
      update.status !== this.props.status ||
      update.rawStatus !== this.props.rawStatus ||
      update.dailyBudget !== this.props.dailyBudget ||
      update.endDate?.getTime() !== this.props.endDate?.getTime();

    this.props = {
      ...this.props,
      ...update,
      lastSyncedAt: syncedAt,
      updatedAt: syncedAt,
    };
    return changed;
  }

  toPrimitives(): CampaignProps {
    return { ...this.props };
  }
}
