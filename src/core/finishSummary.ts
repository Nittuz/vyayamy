/**
 * What the finish step offers as its primary action.
 *
 * A workout with at least one logged set is finished; one with nothing logged
 * is discarded (HIG review 2026-10-04, finding 2: the step showed "0 SETS"
 * with only a Finish button, and finishing an empty session wrote an empty
 * workout into History).
 */
export type FinishSummaryAction = 'finish' | 'discard';

export function finishSummaryAction(setCount: number): FinishSummaryAction {
  return setCount > 0 ? 'finish' : 'discard';
}
