# Whisper

A privacy-first, end-to-end encrypted messenger built with Expo React Native. Every message is encrypted on your device before it leaves — the server never sees plaintext.

> **Companion server:** [whisper-server](https://github.com/theany-org/whisper-server) — FastAPI + PostgreSQL + Redis

---

## How It Works

```
Your device                    Server                    Recipient's device
─────────────                  ──────                    ──────────────────
[Plaintext]                                              [Plaintext]
    │                                                         ▲
    ▼                                                         │
[NaCl box encrypt]                                    [NaCl box decrypt]
 X25519 + XSalsa20               relay only               X25519 + XSalsa20
 -Poly1305                  (sees only ciphertext)         -Poly1305
    │                                                         │
    └────────► WebSocket ──► [ciphertext + nonce] ──────────►┘
```

Keys are generated on your device at registration. The private key is stored in the OS secure enclave (`expo-secure-store`) and **never leaves your phone**. The server only stores your public key and relays encrypted blobs.

---

## Features

- **End-to-end encryption** — NaCl box (X25519 key exchange + XSalsa20-Poly1305 AEAD)
- **Zero knowledge server** — server never sees plaintext, only ciphertext
- **Encrypted voice messages** — audio bytes are encrypted before upload; server never touches audio
- **WebRTC voice calls** — peer-to-peer audio with coturn STUN/TURN for NAT traversal
- **Reply threading** — quote any message; reply metadata is encrypted alongside message content
- **Message retry** — failed messages can be resent in-place, preserving thread order
- **Swipe to reply** — gesture-driven reply with haptic feedback
- **On-device key generation** — private key stored in hardware-backed secure storage
- **Forward secrecy** — fresh keypair generated each login; previous sessions cannot decrypt new messages
- **Real-time presence** — push-based online/offline status (no polling)
- **Offline queue** — messages held on the server for up to 7 days
- **Local persistence** — optional SQLite message history (toggle in Settings)
- **Message status** — sending / sent / failed indicators per message
- **Custom server** — point the app at your own self-hosted backend
- **Dark UI** — clean, minimal dark-mode interface

---

## Requirements

- **Node.js** 20+
- **pnpm** (or npm/yarn)
- **Expo Go** app (for development) — or a physical device / emulator
- A running **Whisper server** (see [server setup](https://github.com/theany-org/whisper-server/README.md))

---

## Getting Started

### 1. Install dependencies

```bash
cd whisper
pnpm install
```

### 2. Configure the server URL

The server URL can be set at runtime from the login screen (tap the server icon at the bottom), or via an environment variable before building:

```bash
cp .env.example .env
```

Edit `.env`:

```env
EXPO_PUBLIC_WHISPER_API_URL=https://your-server.example.com
```

### 3. Start the development server

```bash
pnpm start
```

Then scan the QR code with **Expo Go** (Android/iOS), or press `a` for Android emulator / `i` for iOS simulator.

---

## Building for Production

### Android APK / AAB

```bash
# Requires EAS CLI: npm install -g eas-cli
eas build --platform android
```

### iOS IPA

```bash
eas build --platform ios
```

### Local build (without EAS)

```bash
pnpm android   # runs on connected device or emulator
pnpm ios       # runs on simulator
```

---

## Project Structure

```
whisper/
├── app/
│   ├── _layout.tsx              # Root layout — loads polyfill, hydrates stores
│   ├── (auth)/
│   │   ├── login.tsx            # Sign-in screen + custom server config
│   │   └── register.tsx         # Registration screen
│   └── (chat)/
│       ├── _layout.tsx          # Chat tab navigator
│       ├── index.tsx            # Conversations list
│       ├── [username].tsx       # Chat screen (dynamic route)
│       ├── settings.tsx         # Settings
│       └── (call)/
│           ├── incoming.tsx     # Incoming call modal
│           └── active.tsx       # In-call screen
├── components/
│   ├── MessageBubble.tsx        # Animated bubble: swipe-to-reply, voice playback, retry
│   └── VoiceRecorder.tsx        # Push-to-record UI with waveform timer
├── crypto/
│   ├── polyfill.ts              # Patches crypto.getRandomValues for Hermes/RN
│   └── cryptoService.ts         # Key generation, NaCl encrypt/decrypt (text + binary)
├── services/
│   ├── api.ts                   # Axios client — auth + user endpoints
│   ├── audioService.ts          # Mic permissions, recording options, file I/O
│   ├── messageDb.ts             # SQLite persistence helpers
│   ├── notificationService.ts   # Local push notifications
│   └── socket.ts                # WebSocket manager with exponential backoff
├── store/
│   ├── authStore.ts             # Auth state — login, register, logout, keypair
│   ├── callStore.ts             # WebRTC call state machine
│   ├── chatStore.ts             # Messages + conversations — send, receive, retry
│   ├── presenceStore.ts         # Online user set
│   ├── serverStore.ts           # Server URL (persisted in SecureStore)
│   └── settingsStore.ts         # App settings (local persistence toggle)
├── types/
│   └── index.ts                 # Shared TypeScript interfaces
├── utils/
│   └── formatDuration.ts        # mm:ss formatter for voice message durations
└── app.json                     # Expo config
```

---

## Cryptography

| Primitive         | Library           | Purpose                    |
| ----------------- | ----------------- | -------------------------- |
| X25519 ECDH       | TweetNaCl         | Shared secret derivation   |
| XSalsa20-Poly1305 | TweetNaCl         | Authenticated encryption   |
| CSPRNG            | expo-crypto       | Nonce + keypair generation |
| Secure storage    | expo-secure-store | Private key + JWT at rest  |

**Key lifecycle:**

1. **Register** — `nacl.box.keyPair()` generates a Curve25519 keypair. Private key is saved to `expo-secure-store`. Public key is sent to the server.
2. **Login** — A fresh keypair is generated and the new public key is pushed to the server. This ensures a valid local key exists even after reinstall or device change, and provides forward secrecy.
3. **Logout** — Private key is deleted from `expo-secure-store`.

**Text message encryption:**

```
sharedKey  = X25519(myPrivateKey, recipientPublicKey)
nonce      = random 24 bytes (CSPRNG)
payload    = JSON { text, replyTo? }   ← reply metadata encrypted too
ciphertext = XSalsa20-Poly1305(payload, nonce, sharedKey)
```

**Voice message encryption:**

Same NaCl box scheme applied to raw audio bytes. The encrypted binary is base64-encoded and sent over WebSocket. On receipt it is decrypted and written to a temporary `.m4a` cache file. All voice cache files are deleted on logout.

**Voice calls:**

WebRTC SDP offer/answer and ICE candidates are relayed through the server's WebSocket. The server routes signals via Redis pub/sub but never inspects them. Actual audio is peer-to-peer via coturn STUN/TURN.

---

## WebSocket Authentication

Raw JWTs are never passed in query strings. Instead:

1. App calls `POST /auth/ws-ticket` with its bearer token → gets a short-lived (30 s), single-use ticket
2. App opens `wss://server/ws/chat?ticket=<ticket>`
3. Server consumes the ticket atomically (`GETDEL`) — it can only be used once

---

## Environment Variables

| Variable                      | Description             | Default                     |
| ----------------------------- | ----------------------- | --------------------------- |
| `EXPO_PUBLIC_WHISPER_API_URL` | Default server base URL | `https://whisper.theany.ir` |

The user can also override the server URL at runtime from the login screen. The chosen URL is persisted in `expo-secure-store`.

---

## Tech Stack

| Layer          | Technology                       |
| -------------- | -------------------------------- |
| Framework      | Expo 54 / React Native 0.81      |
| Language       | TypeScript 5.9                   |
| Routing        | Expo Router 6 (file-based)       |
| State          | Zustand 5                        |
| Encryption     | TweetNaCl 1.0                    |
| HTTP           | Axios 1.x                        |
| Realtime       | Native WebSocket                 |
| Voice calls    | react-native-webrtc 124          |
| Audio          | expo-audio 1                     |
| Animation      | react-native-reanimated 4        |
| Gestures       | react-native-gesture-handler 2   |
| Secure storage | expo-secure-store                |
| Local DB       | expo-sqlite 16                   |
| Styling        | Tailwind CSS (Uniwind)           |
| Keyboard       | react-native-keyboard-controller |

---

## Self-Hosting

You can run your own server and point the app at it. See the [server README](https://github.com/theany-org/whisper-server/README.md) for the full setup guide (Docker Compose, environment variables, database migrations, coturn).

Once your server is running, either:

- Set `EXPO_PUBLIC_WHISPER_API_URL` in `.env` before building, **or**
- Tap the server icon on the login screen and enter your URL at runtime

---

## Known Limitations

- No public key fingerprint verification — trust on first use (TOFU) only
- No background push for new messages when the app is fully closed
- No read receipts or delivered-to-device acknowledgement shown in UI
- No message ordering guarantees — sequence numbers are not implemented
- Messages are deleted if a user is offline for more than 7 days (server queue TTL)
- No group chat
- Local persistence stores messages in SQLite within the device's app sandbox (not additionally encrypted at rest beyond OS-level protection)

---

## Security Notes

- The server is a relay only — it never decrypts or stores message content
- Private keys are stored in the OS keychain / secure enclave via `expo-secure-store`
- A new keypair is generated on each login, so previous sessions cannot decrypt future messages
- WebSocket tickets are single-use and expire in 30 seconds
- The app auto-disconnects and redirects to login on repeated authentication failures

---

## Releases

See the [GitHub Releases page](https://github.com/theany-org/whisper-phone/releases) for changelogs and version history.

Current version: **v1.2.1**

---

## License

[MIT](https://github.com/theany-org/whisper-server/blob/main/LICENSE)
