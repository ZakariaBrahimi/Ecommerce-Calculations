import { extractResults } from '../../../src/infrastructure/providers/meta-ads/MetaResultsExtractor';

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
