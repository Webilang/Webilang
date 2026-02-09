import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import rateLimit from "express-rate-limit";
import multer from "multer";
import OpenAI, { toFile } from "openai";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.warn("Missing OPENAI_API_KEY in environment.");
}

const openai = new OpenAI({ apiKey: openaiApiKey });

const upload = multer({ storage: multer.memoryStorage() });

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false
});
app.use(limiter);

const systemPrompt = `You are ทา (Taa), a Thai masseuse in a Phuket spa. Always speak politely and warmly.
Domain focus: greetings, scheduling, payment, compliments, spa etiquette.
You must return a JSON object with fields:
- thai: ONE sentence in Thai script only (no romanization).
- ru_translit: Russian transcription of the Thai sentence.
- ru_translation: Russian translation of the Thai sentence.
- ru_note: optional brief correction note in Russian (1-2 lines).
If the learner's Thai is ungrammatical, provide a gentle correction.
The thai field must be exactly one Thai sentence.`;

const translitMap = [
  ["สวัสดี", "саватди"],
  ["ครับ", "кхрап"],
  ["ค่ะ", "кха"],
  ["สบายดีไหม", "сабай ди май"],
  ["ผม", "пхом"],
  ["ฉัน", "чан"],
  ["ชื่อ", "чы"],
  ["คุณ", "кхун"],
  ["นวด", "нуат"],
  ["เท้า", "тхао"],
  ["ดีมาก", "ди мак"],
  ["ขอบคุณ", "кхоп кхун"],
  ["พรุ่งนี้", "пхрунг-ни"],
  ["กลับมา", "клап ма"],
  ["ลาก่อน", "ла гон"],
  ["แล้วเจอกัน", "лэо чё кан"],
  ["ยินดี", "йин-ди"],
  ["ต้อนรับ", "тон-рап"],
  ["ค่ะ", "кха"],
  ["ครับ", "кхрап"],
  ["ไหม", "май"],
  ["ที่", "ти"],
  ["นี่", "ни"],
  ["ครั้งแรก", "кранг рэк"],
  ["ของ", "кхонг"],
  ["ผมครับ", "пхом кхрап"],
  ["ฉันชื่อทา", "чан чы та"],
  ["ผมชื่อคอนสแตนติน", "пхом чы константин"],
  ["พรุ่งนี้ผมจะกลับมาครับ", "пхрунг-ни пхом ча клап ма кхрап"],
  ["ลาก่อนครับ", "ла гон кхрап"],
  ["ลาก่อนค่ะ", "ла гон кха"],
  ["แล้วเจอกันครับ", "лэо чё кан кхрап"],
  ["แล้วเจอกันค่ะ", "лэо чё кан кха"]
];

function toRussianTranslit(thaiText) {
  let result = thaiText;
  for (const [thai, ru] of translitMap) {
    result = result.split(thai).join(ru);
  }
  return result;
}

app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: "Missing message" });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message }
      ]
    });

    const content = completion.choices?.[0]?.message?.content;
    const parsed = content ? JSON.parse(content) : {};

    const thai = parsed.thai || "";
    const response = {
      thai,
      ru_translit: toRussianTranslit(thai),
      ru_translation: parsed.ru_translation || "",
      ru_note: parsed.ru_note || ""
    };

    return res.json(response);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to generate reply" });
  }
});

app.post("/api/annotate", async (req, res) => {
  try {
    const { thai } = req.body;
    if (!thai) {
      return res.status(400).json({ error: "Missing thai" });
    }

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "Return JSON with fields ru_translation only. Translate the Thai text to Russian in one sentence."
        },
        { role: "user", content: thai }
      ]
    });

    const content = completion.choices?.[0]?.message?.content;
    const parsed = content ? JSON.parse(content) : {};

    return res.json({
      ru_translit: toRussianTranslit(thai),
      ru_translation: parsed.ru_translation || ""
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to annotate" });
  }
});

app.post("/api/transcribe", upload.single("audio"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Missing audio" });
    }

    const audioFile = await toFile(req.file.buffer, req.file.originalname, {
      type: req.file.mimetype
    });

    const transcript = await openai.audio.transcriptions.create({
      file: audioFile,
      model: "whisper-1",
      language: "th"
    });

    return res.json({ text: transcript.text || "" });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to transcribe" });
  }
});

app.post("/api/speech", async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: "Missing text" });
    }

    const speech = await openai.audio.speech.create({
      model: "gpt-4o-mini-tts",
      voice: "alloy",
      input: text,
      format: "mp3"
    });

    const buffer = Buffer.from(await speech.arrayBuffer());
    res.setHeader("Content-Type", "audio/mpeg");
    res.send(buffer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Failed to synthesize" });
  }
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
