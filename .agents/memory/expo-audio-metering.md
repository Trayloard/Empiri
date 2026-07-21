---
name: expo-audio metering API
description: How to read microphone volume (dBFS) from expo-audio's recorder; which type has metering and which does not.
---

# expo-audio metering — RecorderState vs RecordingStatus

## The rule
`metering?: number` lives on **`RecorderState`**, returned by `recorder.getStatus()`.  
It does **NOT** exist on `RecordingStatus`, the type passed to the `statusListener` callback in `useAudioRecorder(options, listener)`.  
Accessing `status.metering` inside the callback causes a TypeScript error.

**Why:** expo-audio separates the event-driven status callback (RecordingStatus, used for start/stop/duration events) from the synchronous state snapshot (RecorderState, which includes metering when enabled).

## How to apply
Enable metering in the recorder options, then poll `getStatus()` at a fixed interval:

```ts
const recorder = useAudioRecorder({
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
});

// In startListening — after recorder.record():
meterIntervalRef.current = setInterval(() => {
  if (!isRecordingRef.current) return;
  try {
    const s = recorder.getStatus();          // returns RecorderState
    const db = typeof s.metering === "number" ? s.metering : -160;
    // Map −60 dB (quiet) … −10 dB (loud) onto 0…1
    micVolumeRef.current = Math.max(0, Math.min(1, (db + 60) / 50));
  } catch {
    // getStatus() unavailable in some environments (e.g. Jest with fake timers)
  }
}, 120);

// In stopListening / endCall — clear interval and reset:
clearInterval(meterIntervalRef.current);
meterIntervalRef.current = null;
micVolumeRef.current = 0;
```

## Performance note
Store the volume in a `MutableRefObject<number>`, not React state.  
Consumers (e.g. ChatInput) poll from their own `setInterval` and drive a Reanimated `useSharedValue` — this keeps metering entirely off the React render cycle.
