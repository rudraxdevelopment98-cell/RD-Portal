/* ============================================================
   Voice I/O — thin wrapper around the browser's built-in
   Web Speech API (SpeechRecognition + SpeechSynthesis).
   Free, offline-capable on most platforms, no API key, no
   network call leaves the device for recognition/synthesis.
   ============================================================ */

type SR = typeof window extends any ? any : never;

function getRecognitionCtor(): SR | null {
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function speechSupported(): boolean {
  return !!getRecognitionCtor();
}

export function ttsSupported(): boolean {
  return "speechSynthesis" in window;
}

export interface Recognizer {
  start: () => void;
  stop: () => void;
  abort: () => void;
}

export function createRecognizer(handlers: {
  onResult: (text: string, isFinal: boolean) => void;
  onEnd: () => void;
  onError: (msg: string) => void;
}): Recognizer | null {
  const Ctor = getRecognitionCtor();
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.continuous = false;
  rec.interimResults = true;
  rec.lang = "en-US";
  rec.maxAlternatives = 1;

  rec.onresult = (e: any) => {
    let text = "";
    let isFinal = false;
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      if (e.results[i].isFinal) isFinal = true;
    }
    handlers.onResult(text.trim(), isFinal);
  };
  rec.onerror = (e: any) => handlers.onError(e?.error || "speech recognition error");
  rec.onend = () => handlers.onEnd();

  return {
    start: () => { try { rec.start(); } catch { /* already started */ } },
    stop: () => { try { rec.stop(); } catch { /* ignore */ } },
    abort: () => { try { rec.abort(); } catch { /* ignore */ } },
  };
}

let voicesCache: SpeechSynthesisVoice[] | null = null;
function pickVoice(): SpeechSynthesisVoice | undefined {
  if (!ttsSupported()) return undefined;
  if (!voicesCache || voicesCache.length === 0) voicesCache = window.speechSynthesis.getVoices();
  return voicesCache.find((v) => /en-US|en_US|en-GB/.test(v.lang) && /female|samantha|victoria|zira/i.test(v.name))
    || voicesCache.find((v) => v.lang.startsWith("en"))
    || voicesCache[0];
}

export function speak(text: string, onDone?: () => void) {
  if (!ttsSupported() || !text) { onDone?.(); return; }
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice();
    if (v) u.voice = v;
    u.rate = 1.02;
    u.pitch = 1;
    u.onend = () => onDone?.();
    u.onerror = () => onDone?.();
    window.speechSynthesis.speak(u);
  } catch {
    onDone?.();
  }
}

export function stopSpeaking() {
  if (ttsSupported()) window.speechSynthesis.cancel();
}
