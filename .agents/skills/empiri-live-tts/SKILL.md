---
name: empiri-live-tts
description: How to implement or extend live text-to-speech (TTS) and speech-to-text (STT) in the Empiri Expo mobile app and its API server. Use when adding mic input, voice playback, auto-read responses, or any audio feature to Empiri.
---

# Empiri — Live TTS / STT Stack

## Architecture overview

```
Mobile (expo-audio)
  └─ STT: record → base64 → POST /api/voice/transcribe → { text }
  └─ TTS: AI reply text → POST /api/voice/speech → { audio: base64, format:"mp3" }
              → write to FileSystem.cacheDirectory → createAudioPlayer → play()
```

All voice calls go through the **API server** — never call OpenAI directly from the device.  
Voice model: **OpenAI** (intentional project decision, overrides default ElevenLabs path).

---

## API server — existing endpoints

**File:** `artifacts/api-server/src/routes/voice.ts`  
Imported by the main router; no changes needed unless adding new voice endpoints.

### POST `/api/voice/transcribe`
- Body: `{ audio: string /* base64 */, format: string }`  
- Response: `{ text: string }`  
- Uses: `speechToText(buffer, format)` from `@workspace/integrations-openai-ai-server/audio`

### POST `/api/voice/speech`
- Body: `{ text: string }`  
- Response: `{ audio: string /* base64 mp3 */ , format: "mp3" }`  
- Uses: `textToSpeech(text, "alloy", "mp3")` — voice is **"alloy"**, format is **mp3**

**Body size limit:** The Express server has a raised JSON body limit (≥50 MB) to handle base64 audio — do NOT lower it.

---

## Mobile — wiring that already exists

All voice state lives in **`artifacts/mobile/contexts/CompanionContext.tsx`**.

| Symbol | What it is |
|--------|-----------|
| `voiceEnabled` | boolean, persisted to AsyncStorage at key `empiri.voiceEnabled` |
| `playSpeech(text)` | calls `/api/voice/speech`, writes mp3 to cache, plays it |
| `transcribeAudio({ audio, format })` | generated API client fn — calls `/api/voice/transcribe` |
| `VOICE_KEY` | `"empiri.voiceEnabled"` — the AsyncStorage key |

`playSpeech` is already called in the AI reply handler and in the check-in greeting — check there before adding a new call site.

---

## Mobile — TTS playback pattern

```ts
import { createAudioPlayer } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";

async function playSpeech(text: string) {
  const { audio } = await synthesizeSpeech({ text }); // generated API client fn
  const path = `${FileSystem.cacheDirectory}empiri-${Date.now()}.mp3`;
  await FileSystem.writeAsStringAsync(path, audio, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const player = createAudioPlayer({ uri: path });
  player.play();
  // Clean up after playback finishes
  const sub = player.addListener("playbackStatusUpdate", (s) => {
    if (s.didJustFinish) {
      sub.remove();
      player.remove();
      FileSystem.deleteAsync(path, { idempotent: true }).catch(() => {});
    }
  });
}
```

---

## Mobile — STT recording pattern

```ts
import { useAudioRecorder, RecordingPresets, AudioModule } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";

const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

async function startRecording() {
  const { granted } = await AudioModule.requestRecordingPermissionsAsync();
  if (!granted) return;
  await AudioModule.setAudioModeAsync({ allowsRecordingIOS: true });
  await recorder.record();
}

async function stopAndTranscribe() {
  await recorder.stop();
  const uri = recorder.uri!;
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const { text } = await transcribeAudio({ audio: base64, format: "m4a" });
  // use text as user message
}
```

---

## Key gotchas

- **`MediaRecorder` does NOT exist in React Native.** Never use web audio recorder libs.
- **`expo-file-system/legacy`** — use the legacy import for `readAsStringAsync` / `writeAsStringAsync` / `cacheDirectory`. The new `expo-file-system` API differs.
- **Web degrades gracefully** — all audio calls must be in `try/catch`; let text chat keep working when audio fails.
- **`setAudioModeAsync({ allowsRecordingIOS: true })`** before recording on iOS, then restore it after.
- **File cleanup** — always delete cached mp3s after playback via `FileSystem.deleteAsync(..., { idempotent: true })`.
- **`voiceEnabled` toggle** — always gate `playSpeech` calls behind `if (voiceEnabled)`. The user controls this via the volume icon in the chat toolbar.

---

## Adding a new TTS feature — checklist

1. **Playback only** — call `playSpeech(text)` from CompanionContext. Done.  
2. **New voice endpoint** — add route to `voice.ts`, update OpenAPI spec, run codegen (`pnpm --filter @workspace/api-spec run codegen`), rebuild api-client-react.  
3. **Different voice/model** — change `"alloy"` in `textToSpeech(text, "alloy", "mp3")` in `voice.ts`. Available OpenAI voices: alloy, echo, fable, onyx, nova, shimmer.  
4. **Auto-read AI replies** — already implemented; check `CompanionContext.tsx` around `playSpeech` callsites before adding another.
