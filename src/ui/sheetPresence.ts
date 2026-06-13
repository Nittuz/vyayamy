/**
 * Pure presence state machine for the Sheet primitive (no react-native import,
 * so it is unit-testable).
 *
 * The point of this machine is the EXIT path: the Modal must stay mounted while
 * the panel animates out, then unmount on `exitDone`. Naive `visible`-driven
 * mounting kills the exit animation dead — the class of bug all five legacy
 * sheets shipped with. With Reduce Motion there is nothing to animate, so
 * show/hide jump straight between `open` and `idle`.
 */

export type SheetPhase = 'idle' | 'entering' | 'open' | 'exiting';

export type SheetEvent = 'show' | 'hide' | 'enterDone' | 'exitDone';

export function nextPhase(phase: SheetPhase, event: SheetEvent, reduceMotion: boolean): SheetPhase {
  switch (event) {
    case 'show':
      if (phase === 'open' || phase === 'entering') return phase;
      return reduceMotion ? 'open' : 'entering';
    case 'hide':
      if (phase === 'idle' || phase === 'exiting') return phase;
      return reduceMotion ? 'idle' : 'exiting';
    case 'enterDone':
      return phase === 'entering' ? 'open' : phase;
    case 'exitDone':
      return phase === 'exiting' ? 'idle' : phase;
  }
}

/** The Modal stays mounted in every phase except idle. */
export function isMounted(phase: SheetPhase): boolean {
  return phase !== 'idle';
}

/** Target value for the enter/exit progress animation in this phase. */
export function progressTarget(phase: SheetPhase): 0 | 1 {
  return phase === 'entering' || phase === 'open' ? 1 : 0;
}
