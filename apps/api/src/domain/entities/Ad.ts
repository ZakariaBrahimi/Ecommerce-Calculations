import { CampaignStatus } from '../enums/CampaignStatus';

export interface AdProps {
  id: string;
  tenantId: string;
  campaignId: string; // internal Campaign.id (denormalized for direct queries)
  adSetId: string; // internal AdSet.id
  externalAdId: string;
  name: string;
  status: CampaignStatus;
  rawStatus: string;
  lastSyncedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export class Ad {
  private constructor(private props: AdProps) {}

  static create(
    props: Omit<AdProps, 'id' | 'createdAt' | 'updatedAt'> & {
      id?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): Ad {
    const now = new Date();
    return new Ad({
      ...props,
      id: props.id ?? crypto.randomUUID(),
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  static fromPersistence(props: AdProps): Ad {
    return new Ad(props);
  }

  get id(): string {
    return this.props.id;
  }

  get externalAdId(): string {
    return this.props.externalAdId;
  }

  applySync(update: { name: string; status: CampaignStatus; rawStatus: string }, syncedAt: Date): boolean {
    const changed = update.name !== this.props.name || update.rawStatus !== this.props.rawStatus;
    this.props = { ...this.props, ...update, lastSyncedAt: syncedAt, updatedAt: syncedAt };
    return changed;
  }

  toPrimitives(): AdProps {
    return { ...this.props };
  }
}
