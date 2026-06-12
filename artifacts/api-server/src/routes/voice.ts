import { Router, type IRouter } from "express";
import { Buffer } from "node:buffer";
import {
  ensureCompatibleFormat,
  speechToText,
  textToSpeech,
} from "@workspace/integrations-openai-ai-server/audio";
import { TranscribeAudioBody, SynthesizeSpeechBody } from "@workspace/api-zod";

const router: IRouter = Router();

// Transcribe recorded audio into text
router.post("/voice/transcribe", async (req, res) => {
  const parsed = TranscribeAudioBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Audio data is required" });
    return;
  }

  let audioBuffer: Buffer;
  try {
    audioBuffer = Buffer.from(parsed.data.audio, "base64");
  } catch {
    res.status(400).json({ error: "Audio data is invalid" });
    return;
  }
  if (audioBuffer.length === 0) {
    res.status(422).json({ error: "No speech detected. Try again." });
    return;
  }

  let text: string;
  try {
    const { buffer, format } = await ensureCompatibleFormat(audioBuffer);
    text = (await speechToText(buffer, format)).trim();
  } catch (err) {
    req.log.error({ err }, "Transcription failed");
    res.status(502).json({ error: "Couldn't transcribe that. Try again." });
    return;
  }

  if (!text) {
    res.status(422).json({ error: "No speech detected. Try again." });
    return;
  }

  res.json({ text });
});

// Convert text into spoken audio
router.post("/voice/speech", async (req, res) => {
  const parsed = SynthesizeSpeechBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Text is required" });
    return;
  }
  const text = parsed.data.text.trim();
  if (!text) {
    res.status(400).json({ error: "Text is required" });
    return;
  }

  try {
    const audio = await textToSpeech(text, "alloy", "mp3");
    if (audio.length === 0) {
      res.status(502).json({ error: "Couldn't generate audio right now." });
      return;
    }
    res.json({ audio: audio.toString("base64"), format: "mp3" });
  } catch (err) {
    req.log.error({ err }, "Speech synthesis failed");
    res.status(502).json({ error: "Couldn't generate audio right now." });
  }
});

export default router;
