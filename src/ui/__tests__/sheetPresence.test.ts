/**
 * The Sheet's presence machine exists for one reason: the Modal must stay
 * mounted through the exit animation (the dead-exit bug all five legacy sheets
 * shipped with), and must skip animation entirely under Reduce Motion.
 */
import { isMounted, nextPhase, progressTarget } from '@/ui/sheetPresence';

describe('normal motion', () => {
  test('full show → hide lifecycle animates both directions', () => {
    let p = nextPhase('idle', 'show', false);
    expect(p).toBe('entering');
    p = nextPhase(p, 'enterDone', false);
    expect(p).toBe('open');
    p = nextPhase(p, 'hide', false);
    expect(p).toBe('exiting');
    expect(isMounted(p)).toBe(true); // still mounted while animating out
    p = nextPhase(p, 'exitDone', false);
    expect(p).toBe('idle');
    expect(isMounted(p)).toBe(false);
  });

  test('hide during enter goes straight to exiting', () => {
    expect(nextPhase('entering', 'hide', false)).toBe('exiting');
  });

  test('re-show during exit re-enters', () => {
    expect(nextPhase('exiting', 'show', false)).toBe('entering');
  });

  test('stale animation callbacks cannot corrupt the phase', () => {
    expect(nextPhase('open', 'enterDone', false)).toBe('open');
    expect(nextPhase('idle', 'exitDone', false)).toBe('idle');
    expect(nextPhase('entering', 'exitDone', false)).toBe('entering');
  });

  test('progress targets 1 while visible-ish, 0 while hiding', () => {
    expect(progressTarget('entering')).toBe(1);
    expect(progressTarget('open')).toBe(1);
    expect(progressTarget('exiting')).toBe(0);
    expect(progressTarget('idle')).toBe(0);
  });
});

describe('reduce motion', () => {
  test('show and hide are instant — no intermediate phases', () => {
    expect(nextPhase('idle', 'show', true)).toBe('open');
    expect(nextPhase('open', 'hide', true)).toBe('idle');
  });
});
