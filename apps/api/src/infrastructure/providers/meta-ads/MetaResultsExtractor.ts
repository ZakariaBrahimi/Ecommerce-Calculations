import { RawInsightAction } from '../../../domain/ports/MetaAdsGateway';

export interface ExtractedResult {
  results: number;
  /** The action_type used, or "link_click" when falling back to raw clicks - never null-with-nonzero-results. */
  resultType: string | null;
}

/**
 * Meta's Ads Manager UI shows a single "Results" column whose meaning
 * depends on the campaign's objective (purchases for a sales campaign,
 * leads for a lead-gen campaign, link clicks for traffic, etc.) - the
 * Insights API itself only returns a flat `actions` array of
 * {action_type, value} pairs, with no single "results" field. This mirrors
 * that UI logic so ProfitFlow AI's "Number of results" column means the
 * same thing an advertiser already expects from Ads Manager.
 *
 * Priority lists (not single types) because Meta reports overlapping action
 * types for the same real-world event (e.g. website purchases show up
 * under both "omni_purchase" and the older pixel-specific action type) -
 * the first present, non-zero match wins.
 */
const OBJECTIVE_ACTION_TYPES: ReadonlyMap<string, readonly string[]> = new Map([
  ['OUTCOME_SALES', ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase']],
  ['CONVERSIONS', ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase']],
  ['PRODUCT_CATALOG_SALES', ['omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'purchase']],

  ['OUTCOME_LEADS', ['onsite_conversion.lead_grouped', 'lead']],
  ['LEAD_GENERATION', ['onsite_conversion.lead_grouped', 'lead']],

  ['OUTCOME_ENGAGEMENT', ['post_engagement']],
  ['POST_ENGAGEMENT', ['post_engagement']],

  ['OUTCOME_TRAFFIC', ['link_click']],
  ['LINK_CLICKS', ['link_click']],

  ['OUTCOME_APP_PROMOTION', ['omni_app_install', 'mobile_app_install']],
  ['APP_INSTALLS', ['omni_app_install', 'mobile_app_install']],
]);

export function extractResults(
  objective: string | null,
  actions: RawInsightAction[],
  fallbackClicks: number,
): ExtractedResult {
  const candidates = objective ? OBJECTIVE_ACTION_TYPES.get(objective.trim().toUpperCase()) : undefined;

  if (candidates) {
    for (const actionType of candidates) {
      const action = actions.find((a) => a.actionType === actionType);
      if (action) return { results: action.value, resultType: actionType };
    }
  }

  // No objective mapping (e.g. OUTCOME_AWARENESS has no single conversion
  // action) or none of the mapped action types were present in this
  // window's actions - fall back to link clicks rather than reporting a
  // misleading zero. Callers can tell this happened via resultType.
  return { results: fallbackClicks, resultType: fallbackClicks > 0 ? 'link_click' : null };
}
