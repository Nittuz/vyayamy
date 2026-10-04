import type { SlotDraft } from '@/core/domain';
import { isPlanDraftDirty, planDraftKey } from '@/core/planDraft';

const slot = (over: Partial<SlotDraft> = {}): SlotDraft => ({
  key: 'weekly-1',
  templateId: 't1',
  isRestDay: false,
  label: '',
  dayOfWeek: 1,
  ...over,
});

const draft = (slots: SlotDraft[] = [slot()]) => ({
  name: 'Plan',
  planType: 'weekly' as const,
  slots,
});

test('an untouched draft is not dirty', () => {
  const base = planDraftKey(draft());
  expect(isPlanDraftDirty(base, draft())).toBe(false);
});

test('renaming, retyping, or changing a day makes it dirty', () => {
  const base = planDraftKey(draft());
  expect(isPlanDraftDirty(base, { ...draft(), name: 'Other' })).toBe(true);
  expect(isPlanDraftDirty(base, { ...draft(), planType: 'cycle' })).toBe(true);
  expect(isPlanDraftDirty(base, draft([slot({ isRestDay: true })]))).toBe(true);
});

test('a rest day hides its remembered template: picking Rest then the same template is clean', () => {
  const base = planDraftKey(draft([slot({ isRestDay: true, templateId: 't1' })]));
  expect(isPlanDraftDirty(base, draft([slot({ isRestDay: true, templateId: 't2' })]))).toBe(false);
});

test('no baseline yet means not dirty', () => {
  expect(isPlanDraftDirty(null, draft())).toBe(false);
});
