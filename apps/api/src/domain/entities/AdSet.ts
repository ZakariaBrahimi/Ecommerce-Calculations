import { CampaignStatus } from '../enums/CampaignStatus';

export interface AdSetProps {
  id: string;
  tenantId: string;
  campaignId: string; // internal Campaign.id
  externalAdSetId: string;
  name: string;
  status: CampaignStatus;
  rawStatus: string;
  dailyBudget: number | null;
  startDate: Date | null;
  endDate: Date | null;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class AdSet {
  private constructor(private props: AdSetProps) {}

  static create(
    props: Omit<AdSetProps, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): AdSet {
    const now = new Date();
    return new AdSet({
      ...props,
      id: props.id ?? crypto.randomUUID(),
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  static fromPersistence(props: AdSetProps): AdSet {
    return new AdSet(props);
  }

  get id(): string {
    return this.props.id;
  }

  get externalAdSetId(): string {
    return this.props.externalAdSetId;
  }

  applySync(
    update: {
      name: string;
      status: CampaignStatus;
      rawStatus: string;
      dailyBudget: number | null;
      startDate: Date | null;
      endDate: Date | null;
    },
    syncedAt: Date,
  ): boolean {
    const changed =
      update.name !== this.props.name ||
      update.status !== this.props.status ||
      update.rawStatus !== this.props.rawStatus ||
      update.dailyBudget !== this.props.dailyBudget;

    this.props = { ...this.props, ...update, lastSyncedAt: syncedAt, updatedAt: syncedAt };
    return changed;
  }

  toPrimitives(): AdSetProps {
    return { ...this.props };
  }
}
