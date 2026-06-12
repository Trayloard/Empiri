---
name: Voice (STT/TTS) on Expo mobile
description: How to do speech-to-text and text-to-speech in an Expo app against an OpenAI-backed API, and why the web AI react lib doesn't work.
---

# Voice on Expo mobile

When adding voice (record -> STT -> chat -> TTS playback) to an Expo/React Native
app that talks to the workspace API server:

- Do NOT use a browser/web AI react helper lib that relies on `MediaRecorder`
  (e.g. an `integrations-openai-ai-react` template). `MediaRecorder` is a web API
  and is not available in React Native. Remove such libs from the mobile path.
- Record with `expo-audio` (`useAudioRecorder(RecordingPresets.HIGH_QUALITY)`,
  `AudioModule.requestRecordingPermissionsAsync`, `setAudioModeAsync`). Read the
  recorded file as base64 with `expo-file-system/legacy`
  (`readAsStringAsync(uri, { encoding: EncodingType.Base64 })`).
- Send base64 audio to your own API endpoints that proxy OpenAI STT/TTS, rather
  than calling OpenAI directly from the device. Bump the express
  json/urlencoded body limit (e.g. 50mb) because base64 audio is large.
- For TTS playback: write the returned base64 mp3 to `cacheDirectory`, then
  `createAudioPlayer({ uri })` + `play()`, and listen for `didJustFinish` to
  clean up.

**Why:** OpenAI voice was chosen here as an explicit, user-approved override of
the default ElevenLabs path — keep STT/TTS on separate `/voice/transcribe` and
`/voice/speech` endpoints.

**How to apply:** Voice/mic features in Expo are native-first; web degrades
gracefully (blob URIs and FileSystem are limited on web), so keep all
audio calls in try/catch and let text chat keep working when audio fails.
