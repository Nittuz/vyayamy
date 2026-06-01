import { computeChoreography } from '@/ui/completeSetChoreography';
import { duration } from '@/ui/motion';

describe('computeChoreography', () => {
  test('full motion: spring + glow + 600ms tally + medium haptic', () => {
    const c = computeChoreography({ reduceMotion: false, isPR: false });
    expect(c.animateCheck).toBe(true);
    expect(c.glow).toBe(true);
    expect(c.tallyMs).toBe(duration.counter);
    expect(c.haptic).toBe('medium');
    expect(c.showPRPill).toBe(false);
  });

  test('reduced motion: skips animation + glow, instant tally, keeps haptic', () => {
    const c = computeChoreography({ reduceMotion: true, isPR: false });
    expect(c.animateCheck).toBe(false);
    expect(c.glow).toBe(false);
    expect(c.tallyMs).toBe(0);
    expect(c.haptic).toBe('medium');
  });

  test('PR upgrades the haptic to success and shows the pill', () => {
    const c = computeChoreography({ reduceMotion: false, isPR: true });
    expect(c.haptic).toBe('success');
    expect(c.showPRPill).toBe(true);
  });

  test('PR pill still shows under reduced motion (it is state, not motion)', () => {
    const c = computeChoreography({ reduceMotion: true, isPR: true });
    expect(c.showPRPill).toBe(true);
    expect(c.haptic).toBe('success');
    expect(c.animateCheck).toBe(false);
  });
});
