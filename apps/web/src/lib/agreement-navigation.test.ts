import { describe, it, expect } from 'vitest';
import { agreementReturnUrl } from './agreement-navigation';
describe('agreement return context', () => {
  it('keeps each tab and search context while removing modal-opening actions', () => {
    for (const tab of ['active', 'signed', 'archived', 'waiting_for_me', 'review_required']) {
      expect(agreementReturnUrl(`/agreements?tab=${tab}&q=client&action=create`)).toBe(
        `/agreements?tab=${tab}&q=client`,
      );
    }
  });
  it('rejects external return targets and defaults to active agreements', () => {
    for (const target of [
      'https://evil.example/agreements',
      '//evil.example/agreements',
      '/settings',
      null,
    ]) {
      expect(agreementReturnUrl(target)).toBe('/agreements?tab=active');
    }
  });
});
