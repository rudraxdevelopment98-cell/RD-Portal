import { useEffect, useRef, useState } from "react";
import { usePortal } from "../context/PortalContext";
import { createRecognizer, speak, speechSupported, stopSpeaking, ttsSupported, type Recognizer } from "../lib/voice/speech";
import { handleVoiceCommand, type VoiceResult } from "../lib/voice/intents";

interface LogEntry { id: number; who: "you" | "rudra"; text: string; ok?: boolean }

export default function VoiceAssistant() {
  const { state, me, proj, isManager, go, switchProject, reload } = usePortal();
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const recRef = useRef<Recognizer | null>(null);
  const idRef = useRef(0);
  const logEndRef = useRef<HTMLDivElement>(null);
  const supported = speechSupported();

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [log, interim]);

  const push = (who: LogEntry["who"], text: string, ok?: boolean) => {
    idRef.current += 1;
    setLog((l) => [...l.slice(-30), { id: idRef.current, who, text, ok }]);
  };

  const run = async (text: string) => {
    push("you", text);
    setInterim("");
    const ctx = { state, me, proj, isManager, go, switchProject, reload };
    let res: VoiceResult;
    try {
      res = await handleVoiceCommand(ctx as any, text);
    } catch {
      res = { ok: false, say: "Something went wrong running that command." };
    }
    push("rudra", res.say, res.ok);
    setSpeaking(true);
    speak(res.say, () => setSpeaking(false));
  };

  const startListening = () => {
    if (!supported) return;
    stopSpeaking(); setSpeaking(false);
    setOpen(true);
    const rec = createRecognizer({
      onResult: (text, isFinal) => {
        if (isFinal) { setListening(false); run(text); }
        else setInterim(text);
      },
      onEnd: () => setListening(false),
      onError: (msg) => { setListening(false); if (msg !== "no-speech" && msg !== "aborted") push("rudra", `Mic error: ${msg}`, false); },
    });
    recRef.current = rec;
    if (rec) { setListening(true); rec.start(); }
  };

  const stopListening = () => { recRef.current?.stop(); setListening(false); };

  if (!me) return null;

  return (
    <>
      <button
        className={`voice-fab ${listening ? "listening" : ""} ${speaking ? "speaking" : ""}`}
        title={supported ? "Talk to the portal" : "Voice not supported in this browser"}
        onClick={() => (open ? setOpen(false) : (setOpen(true)))}
      >
        🎙
      </button>

      {open && (
        <div className="voice-panel">
          <div className="voice-head">
            <span>🎙 Voice assistant</span>
            <button className="btn ghost sm" onClick={() => setOpen(false)}>✕</button>
          </div>

          {!supported && (
            <div className="voice-empty">
              Voice recognition isn't supported in this browser. Try Chrome or Edge.
              {ttsSupported() && <div style={{ marginTop: 6 }}>Speech playback still works for typed commands below.</div>}
            </div>
          )}

          <div className="voice-log">
            {log.length === 0 && (
              <div className="voice-empty">
                Try: "what's overdue", "create a task to fix the login bug, high priority, due tomorrow",
                "open tasks", "daily briefing", "summarize my work".
              </div>
            )}
            {log.map((e) => (
              <div key={e.id} className={`voice-line ${e.who}${e.ok === false ? " bad" : ""}`}>
                <b>{e.who === "you" ? "You" : "Portal"}</b>
                <span>{e.text}</span>
              </div>
            ))}
            {interim && <div className="voice-line you interim"><b>You</b><span>{interim}…</span></div>}
            <div ref={logEndRef} />
          </div>

          <form
            className="voice-input"
            onSubmit={(e) => { e.preventDefault(); const f = e.target as any; const v = f.cmd.value.trim(); if (v) { run(v); f.cmd.value = ""; } }}
          >
            <input name="cmd" placeholder="Type a command, or use the mic…" autoComplete="off" />
            {supported && (
              <button
                type="button"
                className={`voice-mic-btn ${listening ? "on" : ""}`}
                onClick={listening ? stopListening : startListening}
                title={listening ? "Stop listening" : "Speak a command"}
              >
                {listening ? "■" : "🎙"}
              </button>
            )}
          </form>
        </div>
      )}
    </>
  );
}
