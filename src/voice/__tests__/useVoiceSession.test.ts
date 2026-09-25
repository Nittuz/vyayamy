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
  let onEnd: (() => void) | null = null;
  // Engine contract: stop() may still deliver ONE late final (server
  // recognition finalizes after audio ends), so the fake keeps its callback.
  const stop = jest.fn();
  const start = jest.fn(
    (
      cb: (e: { transcript: string; isFinal: boolean }) => void,
      _onError: unknown,
      endCb?: () => void,
    ) => {
      onResult = cb;
      onEnd = endCb ?? null;
    },
  );
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
    end: () => onEnd?.(),
  };
}

function deps(engine: SpeechEngine, over: Partial<VoiceSessionDeps> = {}): VoiceSessionDeps {
  return {
    engine,
    getDispatchContext: () => ({
      userId: 'u',
      workoutId: 'w',
      activeWeId: 'we',
      activeSetId: 's',
      units: 'lb',
    }),
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

test('hold release keeps a start-failure error on the card', async () => {
  const fake = makeFakeEngine();
  let errCb: ((code: string) => void) | null = null;
  fake.engine.start = ((_: unknown, onError: (code: string) => void) => {
    errCb = onError;
  }) as unknown as SpeechEngine['start'];
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start(); // hold begins
  });
  act(() => {
    errCb?.('boom'); // engine dies mid-hold
  });
  act(() => {
    result.current.release(); // finger lifts
  });

  expect(result.current.ui.phase).toBe('error'); // stop() here would read 'idle'
});

test('hold release keeps a pending command and confirmPending still applies it', async () => {
  dispatchCommand.mockResolvedValue({ ok: true, message: '225 × 5' });
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start();
  });
  await act(async () => {
    fake.emit('add bench press'); // low-confidence → pending
  });
  expect(result.current.ui.phase).toBe('pending');

  act(() => {
    result.current.release(); // finger lifts — must NOT discard the command
  });
  expect(result.current.ui.phase).toBe('pending');
  expect(fake.stop).toHaveBeenCalled(); // engine off, ui preserved

  await act(async () => {
    await result.current.confirmPending();
  });
  expect(dispatchCommand).toHaveBeenCalled();
});

test('a preserved pending survives the silence timeout after release (timer cleared)', async () => {
  jest.useFakeTimers();
  try {
    dispatchCommand.mockResolvedValue({ ok: true, message: '225 × 5' });
    const fake = makeFakeEngine();
    const { result } = renderHook(() =>
      useVoiceSession(deps(fake.engine, { silenceTimeoutMs: 1000 })),
    );

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      fake.emit('add bench press'); // low-confidence → pending
    });
    act(() => {
      result.current.release();
    });
    expect(result.current.ui.phase).toBe('pending');

    act(() => {
      jest.advanceTimersByTime(5000); // a leaked silence timer would stop() here
    });
    expect(result.current.ui.phase).toBe('pending');
  } finally {
    jest.useRealTimers();
  }
});

test('a silent re-hold brings the pending question back — never an invisible pending', async () => {
  dispatchCommand.mockResolvedValue({ ok: true, message: 'Add Bench Press' });
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start();
  });
  await act(async () => {
    fake.emit('add bench press'); // pending
  });
  act(() => {
    result.current.release(); // preserved — the say-"yes"/Confirm flow lives on
  });
  act(() => {
    fake.end();
  });
  expect(result.current.ui.phase).toBe('pending');

  await act(async () => {
    await result.current.start(); // re-hold shows listening over the question...
  });
  expect(result.current.ui.phase).toBe('listening');
  act(() => {
    result.current.release(); // ...and a silent release
  });
  act(() => {
    fake.end();
  });
  // ...restores the question: the command is still pending, so the card must say so.
  expect(result.current.ui.phase).toBe('pending');

  await act(async () => {
    await result.current.confirmPending(); // the Confirm button still applies it
  });
  expect(dispatchCommand).toHaveBeenCalledTimes(1);
  expect(result.current.ui.phase).toBe('applied');
});

test('hold release from plain listening returns to idle and allows a fresh start', async () => {
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start();
  });
  act(() => {
    result.current.release();
  });
  act(() => {
    fake.end(); // the recognizer settles
  });
  expect(result.current.ui.phase).toBe('idle');

  await act(async () => {
    await result.current.start(); // listeningRef must have been reset
  });
  expect(fake.start).toHaveBeenCalledTimes(2);
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

test('a final that arrives after release is still parsed and dispatched', async () => {
  dispatchCommand.mockResolvedValue({ ok: true, message: '225 × 5' });
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start(); // hold begins
  });
  act(() => {
    result.current.release(); // finger lifts — server recognition has not finalized yet
  });
  // No idle flash: the card keeps its listening state until the recognizer settles.
  expect(result.current.ui.phase).toBe('listening');

  await act(async () => {
    fake.emit('225 for 5'); // the late final lands
  });

  expect(dispatchCommand).toHaveBeenCalledTimes(1);
  expect(result.current.ui.phase).toBe('applied');
});

test('the engine ending on its own returns the session to idle so the next tap starts again', async () => {
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start(); // tap to listen
  });
  expect(result.current.engineOn).toBe(true);

  act(() => {
    fake.end(); // server session ended by itself (silence, network, 1-minute cap)
  });
  expect(result.current.engineOn).toBe(false);
  expect(result.current.ui.phase).toBe('idle');

  await act(async () => {
    await result.current.start(); // must start a fresh session, not be swallowed
  });
  expect(fake.start).toHaveBeenCalledTimes(2);
  expect(result.current.engineOn).toBe(true);
});

test('an engine end after a surfaced outcome keeps the outcome on the card', async () => {
  dispatchCommand.mockResolvedValue({ ok: true, message: '225 × 5' });
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start();
  });
  await act(async () => {
    fake.emit('225 for 5');
  });
  expect(result.current.ui.phase).toBe('applied');
  act(() => {
    fake.end();
  });
  expect(result.current.ui.phase).toBe('applied');
  expect(result.current.engineOn).toBe(false);
});

test('release then end with nothing heard settles to idle without a flash in between', async () => {
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));
  await act(async () => {
    await result.current.start();
  });
  act(() => {
    result.current.release();
  });
  expect(result.current.ui.phase).toBe('listening');
  act(() => {
    fake.end();
  });
  expect(result.current.ui.phase).toBe('idle');
});

test('a low-confidence command survives release and a late spoken "yes" applies it', async () => {
  dispatchCommand.mockResolvedValue({ ok: true, message: '225 × -' });
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start(); // hold 1
  });
  act(() => {
    result.current.release();
  });
  await act(async () => {
    fake.emit('225'); // late final: bare weight → low confidence → asks
  });
  expect(result.current.ui.phase).toBe('pending');
  act(() => {
    fake.end();
  });
  expect(result.current.ui.phase).toBe('pending'); // still asking after the recognizer settles

  await act(async () => {
    await result.current.start(); // hold 2: "yes"
  });
  act(() => {
    result.current.release();
  });
  await act(async () => {
    fake.emit('yes'); // late final again
  });
  expect(dispatchCommand).toHaveBeenCalledTimes(1);
  expect(result.current.ui.phase).toBe('applied');
});

test('a low-confidence command survives a tap stop and a later "yes" applies it', async () => {
  dispatchCommand.mockResolvedValue({ ok: true, message: '225 × -' });
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));

  await act(async () => {
    await result.current.start(); // tap
  });
  await act(async () => {
    fake.emit('225');
  });
  expect(result.current.ui.phase).toBe('pending');
  act(() => {
    result.current.stop(); // tap again
  });
  expect(result.current.ui.phase).toBe('pending'); // the question stays on the card

  await act(async () => {
    await result.current.start();
  });
  act(() => {
    result.current.stop();
  });
  await act(async () => {
    fake.emit('yes');
  });
  expect(dispatchCommand).toHaveBeenCalledTimes(1);
  expect(result.current.ui.phase).toBe('applied');
});

test('the pending question says what was heard', async () => {
  const fake = makeFakeEngine();
  const { result } = renderHook(() => useVoiceSession(deps(fake.engine)));
  await act(async () => {
    await result.current.start();
  });
  await act(async () => {
    fake.emit('225');
  });
  expect(result.current.ui.phase).toBe('pending');
  if (result.current.ui.phase === 'pending') {
    expect(result.current.ui.label).toMatch(/225/);
    expect(result.current.ui.label).toMatch(/heard/i);
  }
});
