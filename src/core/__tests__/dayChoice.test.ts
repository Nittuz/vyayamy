import {
  buildDayChoiceOptions,
  dayChoicePatch,
  dayChoiceValue,
  DAY_CHOICE_NONE,
  DAY_CHOICE_REST,
} from '@/core/dayChoice';

describe('buildDayChoiceOptions', () => {
  test('always leads with Rest then None, day context in every accessibility label', () => {
    const options = buildDayChoiceOptions('Monday', [{ id: 'tpl-push', name: 'Push' }]);
    expect(options).toEqual([
      { value: DAY_CHOICE_REST, label: 'Rest', accessibilityLabel: 'Monday schedule, rest' },
      {
        value: DAY_CHOICE_NONE,
        label: 'None',
        accessibilityLabel: 'Monday schedule, no template',
      },
      {
        value: 'tpl-push',
        label: 'Push',
        accessibilityLabel: 'Monday schedule, Push',
      },
    ]);
  });

  test('with no templates configured, still offers Rest and None', () => {
    expect(buildDayChoiceOptions('Day 3', [])).toEqual([
      { value: DAY_CHOICE_REST, label: 'Rest', accessibilityLabel: 'Day 3 schedule, rest' },
      { value: DAY_CHOICE_NONE, label: 'None', accessibilityLabel: 'Day 3 schedule, no template' },
    ]);
  });

  test('preserves template order and labels as given', () => {
    const options = buildDayChoiceOptions('Tuesday', [
      { id: 'a', name: 'Legs' },
      { id: 'b', name: 'Upper body' },
    ]);
    expect(options.slice(2)).toEqual([
      { value: 'a', label: 'Legs', accessibilityLabel: 'Tuesday schedule, Legs' },
      { value: 'b', label: 'Upper body', accessibilityLabel: 'Tuesday schedule, Upper body' },
    ]);
  });
});

describe('dayChoiceValue', () => {
  test('a rest day reads as rest regardless of any stored templateId', () => {
    expect(dayChoiceValue({ isRestDay: true, templateId: 'tpl-push' })).toBe(DAY_CHOICE_REST);
    expect(dayChoiceValue({ isRestDay: true, templateId: null })).toBe(DAY_CHOICE_REST);
  });

  test('a non-rest day with no template reads as none', () => {
    expect(dayChoiceValue({ isRestDay: false, templateId: null })).toBe(DAY_CHOICE_NONE);
  });

  test('a non-rest day with a template reads as that template id', () => {
    expect(dayChoiceValue({ isRestDay: false, templateId: 'tpl-push' })).toBe('tpl-push');
  });
});

describe('dayChoicePatch', () => {
  test('rest only sets isRestDay — templateId is left untouched', () => {
    expect(dayChoicePatch(DAY_CHOICE_REST)).toEqual({ isRestDay: true });
  });

  test('none clears rest and the template together', () => {
    expect(dayChoicePatch(DAY_CHOICE_NONE)).toEqual({ isRestDay: false, templateId: null });
  });

  test('a template id clears rest and sets that template', () => {
    expect(dayChoicePatch('tpl-push')).toEqual({ isRestDay: false, templateId: 'tpl-push' });
  });

  test('round-trips through dayChoiceValue for a non-rest slot', () => {
    const slot = { isRestDay: false, templateId: 'tpl-legs' };
    const value = dayChoiceValue(slot);
    expect(dayChoicePatch(value)).toEqual(slot);
  });
});
