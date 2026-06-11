import { act, renderHook } from '@testing-library/react-native';

import { useVoiceSession, type VoiceSessionDeps } from '@/voice/useVoiceSession';
import type { SpeechEngine } from '@/voice/speechEngine';

// The hook subscribes to AppState (background-stop); the global RN stub only
// exports Platform, so add AppState here.
jest.mock('react-native', () => ({
  Platform: { OS: 'ios', select: (spec: { ios: unknown }) => spec.ios },
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
}));
// speechEngine pulls in the native expo-speech-recognition module; the session
// uses an injected fake engine here, so stub the default one.
jest.mock('@/voice/speechEngine', () => ({ onDeviceEngine: {} }));
jest.mock('@/voice/dispatch', () => ({ dispatchCommand: jest.fn() }));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { dispatchCommand } = jest.requireMock('@/voice/dispatch') as { dispatchCommand: jest.Mock };

function makeFakeEngine() {
  let onResult: ((e: { transcript: string; isFinal: boolean }) => void) | null = null;
  const stop = jest.fn(() => {
    onResult = null;
  });
  const start = jest.fn((cb: (e: { transcript: string; isFinal: boolean }) => void) => {
    onResult = cb;
  });
  const engine: SpeechEngine = {
    isAvailable: () => true,
    requestPermissions: async () => true,
    start: start as unknown as SpeechEngine['start'],
    stop,
  };
  return {
    engine,
    start,
    stop,
    emit: (transcript: string) => onResult?.({ transcript, isFinal: true }),
  };
}

function deps(engine: SpeechEngine, over: Partial<VoiceSessionDeps> = {}): VoiceSessionDeps {
  return {
    engine,
    getDispatchContext: () => ({ userId: 'u', workoutId: 'w', activeWeId: 'we', activeSetId: 's', units: 'lb' }),
    getParserContext: () => ({ units: 'lb', hasActiveExercise: true }),
    onStartRest: jest.fn(),
    onNextExercise: jest.fn(),
    onPrevExercise: jest.fn(),
    onFinishWorkout: jest.fn(),
    onCompleteSet: jest.fn(),
    ...over,
  };
}

beforeEach(() => dispatchCommand.mockReset());

test('undo does not revert a setValues once the set was completed (#99)', async () => {
  const undo = jest.fn(async () => {});
  dispatchCommand.mockResolvedValue({ ok: true, message: '225 × 5', undo });
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start();
  });
  await act(async () => {
    fake.emit('225 for 5'); // setValues → registers the undo
  });
  await act(async () => {
    fake.emit('done'); // completeSet → must clear the stale undo
  });
  await act(async () => {
    fake.emit('undo'); // must NOT revert the now-completed set's values
  });

  expect(undo).not.toHaveBeenCalled();
});

test('denied microphone permission surfaces an error instead of failing silently (#104)', async () => {
  const fake = makeFakeEngine();
  fake.engine.requestPermissions = async () => false;
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start();
  });

  expect(result.current.ui.phase).toBe('error');
});

test('a failed dispatch surfaces an error (#104)', async () => {
  dispatchCommand.mockResolvedValue({ ok: false, message: 'No active set' });
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start();
  });
  await act(async () => {
    fake.emit('225 for 5');
  });

  expect(result.current.ui.phase).toBe('error');
  if (result.current.ui.phase === 'error') expect(result.current.ui.label).toBe('No active set');
});

test('re-entrant start() does not re-subscribe the engine (#97)', async () => {
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start();
  });
  await act(async () => {
    await result.current.start(); // already listening — should be a no-op
  });

  expect(fake.start).toHaveBeenCalledTimes(1);
});
