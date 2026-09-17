/**
 * Internal campaign lifecycle shown on the ProfitFlow AI dashboard. Meta
 * exposes a much finer-grained `effective_status` (see
 * infrastructure/providers/meta-ads/MetaCampaignStatusMapper.ts) which is
 * collapsed into these three buckets for the "Active / Paused / Stopped"
 * dashboard grouping the product asks for.
 */
export enum CampaignStatus {
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  STOPPED = 'STOPPED',
}
