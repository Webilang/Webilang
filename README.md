# Thai Spa Beginner Chatbot (EPC-scaffolded)

A local web app for practicing Thai with a Phuket spa masseuse persona (ทา / Taa). The app supports text + microphone input, Thai responses with Russian transcription and translation, and EPC learning scaffolds.

## Setup

1. Copy environment variables:

```bash
cp .env.example .env
```

2. Install dependencies from the repo root:

```bash
npm install
```

3. Start the client and server concurrently:

```bash
npm run dev
```

- Client: http://localhost:5173
- Server: http://localhost:3001

## Notes

- Audio is sent to the server for transcription and discarded after processing.
- The server protects the OpenAI API key by handling all API calls.
