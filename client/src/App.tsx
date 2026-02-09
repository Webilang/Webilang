import { useCallback, useRef, useState } from "react";

type BotReply = {
  thai: string;
  ru_translit: string;
  ru_translation: string;
  ru_note?: string;
};

type Annotation = {
  ru_translit: string;
  ru_translation: string;
};

const phraseBank = [
  { thai: "สวัสดีครับ/ค่ะ", ru: "саватди кхрап/кха" },
  { thai: "สบายดีไหมครับ/ค่ะ", ru: "сабай ди май кхрап/кха" },
  { thai: "ผมชื่อคอนสแตนตินครับ", ru: "пхом чы константин кхрап" },
  { thai: "ฉันชื่อทาค่ะ", ru: "чан чы та кха" },
  { thai: "ผมอยากนวดเท้าครับ", ru: "пхом як нуат тхао кхрап" },
  { thai: "นี่เป็นครั้งแรกของผมครับ", ru: "ни пен кранг рэк кхонг пхом кхрап" },
  { thai: "ขอบคุณครับ/ค่ะ", ru: "кхоп кхун кхрап/кха" },
  { thai: "คุณนวดเท้าดีมากเลยครับ/ค่ะ", ru: "кхун нуат тхао ди мак лёй кхрап/кха" },
  { thai: "พรุ่งนี้ผมจะกลับมาครับ", ru: "пхрунг-ни пхом ча клап ма кхрап" },
  { thai: "ลาก่อนครับ/ค่ะ / แล้วเจอกันครับ/ค่ะ", ru: "ла гон кхрап/кха / лэо чё кан кхрап/кха" }
];

const epcPrompts = [
  "Ask for a natural phrase",
  "Correct me gently",
  "Make it more polite",
  "Simplify",
  "What should I practice next?"
];

async function postJson<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return (await response.json()) as T;
}

export default function App() {
  const [inputText, setInputText] = useState("");
  const [recognizedThai, setRecognizedThai] = useState("");
  const [recognizedAnnotation, setRecognizedAnnotation] = useState<Annotation | null>(null);
  const [botReply, setBotReply] = useState<BotReply | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [audioStatus, setAudioStatus] = useState("Audio locked");
  const [isRecording, setIsRecording] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const botAudioRef = useRef<HTMLAudioElement | null>(null);

  const unlockAudio = useCallback(async () => {
    if (audioEnabled) {
      return;
    }
    try {
      const AudioContext = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof window.AudioContext }).webkitAudioContext;
      if (AudioContext) {
        const context = new AudioContext();
        const buffer = context.createBuffer(1, 1, 22050);
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(context.destination);
        source.start(0);
        await context.resume();
        setAudioEnabled(true);
        setAudioStatus("Audio enabled");
      } else {
        setAudioStatus("Audio enabled (fallback)");
      }
    } catch (error) {
      console.error(error);
      setAudioStatus("Audio unlock failed");
    }
  }, [audioEnabled]);

  const handleInsert = (text: string) => {
    setInputText((prev) => (prev ? `${prev} ${text}` : text));
  };

  const handleSend = async () => {
    if (!inputText.trim()) {
      return;
    }
    setIsSending(true);
    try {
      const reply = await postJson<BotReply>("/api/chat", { message: inputText });
      setBotReply(reply);
    } catch (error) {
      console.error(error);
    } finally {
      setIsSending(false);
    }
  };

  const handleStartRecording = async () => {
    if (isRecording) {
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };
      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");
        try {
          const response = await fetch("/api/transcribe", { method: "POST", body: formData });
          if (!response.ok) {
            throw new Error("Transcribe failed");
          }
          const data = (await response.json()) as { text: string };
          setRecognizedThai(data.text);
          if (data.text) {
            const annotation = await postJson<Annotation>("/api/annotate", { thai: data.text });
            setRecognizedAnnotation(annotation);
          } else {
            setRecognizedAnnotation(null);
          }
        } catch (error) {
          console.error(error);
        }
        stream.getTracks().forEach((track) => track.stop());
      };
      recorder.start();
      recorderRef.current = recorder;
      setIsRecording(true);
    } catch (error) {
      console.error(error);
    }
  };

  const handleStopRecording = () => {
    recorderRef.current?.stop();
    setIsRecording(false);
  };

  const handlePlayAudio = async () => {
    if (!botReply?.thai) {
      return;
    }
    try {
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: botReply.thai })
      });
      if (!response.ok) {
        throw new Error("Speech failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      if (botAudioRef.current) {
        botAudioRef.current.src = url;
        await botAudioRef.current.play();
      }
    } catch (error) {
      console.error(error);
    }
  };

  return (
    <div className="app" onClick={unlockAudio}>
      <header>
        <h1>Thai Spa Beginner Chatbot</h1>
        <p className="subtitle">Practice Thai with ทา (Taa), your Phuket spa guide.</p>
      </header>

      <main className="grid">
        <section className="panel">
          <h2>Learner Input</h2>
          <label className="field-label">Type your message</label>
          <div className="input-row">
            <textarea
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              placeholder="Type Thai or Russian meaning..."
            />
            <button onClick={handleSend} disabled={isSending}>
              {isSending ? "Sending..." : "Send"}
            </button>
          </div>
          <div className="mic-row">
            <button onClick={isRecording ? handleStopRecording : handleStartRecording}>
              {isRecording ? "Stop" : "Start"}
            </button>
            <span className="hint">Mic record button</span>
          </div>
          <p className="note">Audio is sent to server for transcription.</p>
          <div className="recognized">
            <h3>Recognized Thai</h3>
            <p className="thai-text">{recognizedThai || "—"}</p>
            <p className="ru-text">{recognizedAnnotation?.ru_translit || ""}</p>
            <p className="ru-text">{recognizedAnnotation?.ru_translation || ""}</p>
          </div>
        </section>

        <section className="panel">
          <h2>Bot Output (ทา / Taa)</h2>
          <div className="bot-output">
            <p className="thai-text">{botReply?.thai || "—"}</p>
            <p className="ru-text">{botReply?.ru_translit || ""}</p>
            <p className="ru-text">{botReply?.ru_translation || ""}</p>
            {botReply?.ru_note && <p className="ru-note">{botReply.ru_note}</p>}
          </div>
          <button onClick={handlePlayAudio} disabled={!botReply?.thai}>
            Play audio
          </button>
          <p className="audio-status">{audioStatus}</p>
          <audio ref={botAudioRef} />
        </section>

        <section className="panel">
          <h2>EPC Coach Pane</h2>
          <ul className="checklist">
            <li>Plan</li>
            <li>Practice</li>
            <li>Transfer</li>
            <li>Reflect</li>
          </ul>
          <div className="epc-buttons">
            {epcPrompts.map((prompt) => (
              <button key={prompt} onClick={() => handleInsert(prompt)}>
                {prompt}
              </button>
            ))}
          </div>
          <h3>Quick Phrase Bank</h3>
          <div className="phrase-bank">
            {phraseBank.map((phrase) => (
              <button key={phrase.thai} onClick={() => handleInsert(phrase.thai)}>
                <span>{phrase.thai}</span>
                <span className="ru-text">{phrase.ru}</span>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
