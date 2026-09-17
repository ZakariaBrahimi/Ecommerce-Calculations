import { extractResults, extractPurchases } from '../../../src/infrastructure/providers/meta-ads/MetaResultsExtractor';

describe('extractResults', () => {
  it('picks the omni_purchase action for an OUTCOME_SALES objective', () => {
    const result = extractResults(
      'OUTCOME_SALES',
      [
        { actionType: 'link_click', value: 50 },
        { actionType: 'omni_purchase', value: 7 },
      ],
      50,
    );
    expect(result).toEqual({ results: 7, resultType: 'omni_purchase' });
  });

  it('falls back through the priority list when the first action type is absent', () => {
    const result = extractResults(
      'OUTCOME_SALES',
      [{ actionType: 'offsite_conversion.fb_pixel_purchase', value: 3 }],
      10,
    );
    expect(result).toEqual({ results: 3, resultType: 'offsite_conversion.fb_pixel_purchase' });
  });

  it('maps OUTCOME_LEADS to lead-related actions', () => {
    const result = extractResults('OUTCOME_LEADS', [{ actionType: 'lead', value: 12 }], 100);
    expect(result).toEqual({ results: 12, resultType: 'lead' });
  });

  it('maps OUTCOME_TRAFFIC to link_click', () => {
    const result = extractResults('OUTCOME_TRAFFIC', [{ actionType: 'link_click', value: 42 }], 42);
    expect(result).toEqual({ results: 42, resultType: 'link_click' });
  });

  it('falls back to raw clicks when the objective has no action mapping (e.g. awareness)', () => {
    const result = extractResults('OUTCOME_AWARENESS', [], 25);
    expect(result).toEqual({ results: 25, resultType: 'link_click' });
  });

  it('falls back to raw clicks when the objective is unrecognized', () => {
    const result = extractResults('SOME_FUTURE_OBJECTIVE', [{ actionType: 'omni_purchase', value: 9 }], 5);
    expect(result).toEqual({ results: 5, resultType: 'link_click' });
  });

  it('reports resultType null when there is truly nothing to report', () => {
    const result = extractResults(null, [], 0);
    expect(result).toEqual({ results: 0, resultType: null });
  });
});

describe('extractPurchases', () => {
  it('pairs a purchase action with its action_value regardless of objective', () => {
    const result = extractPurchases(
      [
        { actionType: 'link_click', value: 50 },
        { actionType: 'omni_purchase', value: 7 },
      ],
      [{ actionType: 'omni_purchase', value: 15_400 }],
    );
    expect(result).toEqual({ purchases: 7, purchaseValue: 15_400 });
  });

  it('falls back through the same priority list as extractResults', () => {
    const result = extractPurchases(
      [{ actionType: 'offsite_conversion.fb_pixel_purchase', value: 3 }],
      [{ actionType: 'offsite_conversion.fb_pixel_purchase', value: 900 }],
    );
    expect(result).toEqual({ purchases: 3, purchaseValue: 900 });
  });

  it('reports purchaseValue as 0 when a purchase count exists but no action_value was returned', () => {
    const result = extractPurchases([{ actionType: 'omni_purchase', value: 2 }], []);
    expect(result).toEqual({ purchases: 2, purchaseValue: 0 });
  });

  it('reports zero purchases when no purchase action type is present, e.g. a traffic campaign', () => {
    const result = extractPurchases([{ actionType: 'link_click', value: 40 }], []);
    expect(result).toEqual({ purchases: 0, purchaseValue: 0 });
  });
});
