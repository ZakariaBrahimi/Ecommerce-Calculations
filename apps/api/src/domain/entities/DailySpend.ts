export interface DailySpendProps {
  id: string;
  tenantId: string;
  campaignId: string; // internal Campaign.id
  date: Date; // day granularity, UTC midnight
  spend: number;
  impressions: number;
  clicks: number;
  /** Count of the campaign objective's primary conversion action (see MetaResultsExtractor). */
  results: number;
  /** The Meta action_type used to derive `results`, e.g. "omni_purchase" - kept for auditability. */
  resultType: string | null;
  /** spend / results when results > 0, else null - never divide by zero. */
  costPerResult: number | null;
  currency: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One day's metrics for one campaign, pulled from Meta's Insights API.
 * Meta revises attributed conversions for several days after the fact, so
 * this row is always fully overwritten (never merged) for a given
 * (tenantId, campaignId, date) on each re-pull of the rolling sync window.
 */
export class DailySpend {
  private constructor(private props: DailySpendProps) {}

  static create(
    props: Omit<DailySpendProps, 'id' | 'createdAt' | 'updatedAt' | 'costPerResult'> & {
      id?: string;
      createdAt?: Date;
      updatedAt?: Date;
    },
  ): DailySpend {
    const now = new Date();
    return new DailySpend({
      ...props,
      id: props.id ?? crypto.randomUUID(),
      costPerResult: props.results > 0 ? props.spend / props.results : null,
      createdAt: props.createdAt ?? now,
      updatedAt: props.updatedAt ?? now,
    });
  }

  static fromPersistence(props: DailySpendProps): DailySpend {
    return new DailySpend(props);
  }

  get campaignId(): string {
    return this.props.campaignId;
  }

  get date(): Date {
    return this.props.date;
  }

  toPrimitives(): DailySpendProps {
    return { ...this.props };
  }
}
