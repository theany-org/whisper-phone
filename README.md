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
- **On-device key generation** — private key stored in hardware-backed secure storage
- **Key rotation on login** — fresh keypair generated each time you sign in
- **Real-time messaging** — WebSocket with exponential backoff reconnection
- **Message status** — sending / sent / failed indicators per message
- **Online presence** — see if a contact is currently connected
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

Copy the environment file and set your server address:

```bash
cp .env.example .env
```

Edit `.env`:

```env
EXPO_PUBLIC_WHISPER_API_URL=https://your-server.example.com
```

> You can also change the server URL at runtime from the login screen — tap the server icon at the bottom.

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
│   ├── _layout.tsx          # Root layout — loads polyfill, hydrates stores
│   ├── index.tsx            # Entry redirect (auth check)
│   ├── (auth)/
│   │   ├── _layout.tsx      # Auth stack (no header, fade animation)
│   │   ├── login.tsx        # Sign-in screen + custom server config
│   │   └── register.tsx     # Registration screen
│   └── (chat)/
│       ├── _layout.tsx      # Chat stack (dark header)
│       ├── index.tsx        # Conversations list
│       ├── settings.tsx        # Settings
│       └── [username].tsx   # Chat screen (dynamic route)
├── components/
│   └── MessageBubble.tsx    # Animated message bubble with status indicator
├── crypto/
│   ├── polyfill.ts          # Patches crypto.getRandomValues for Hermes/RN
│   └── cryptoService.ts     # Key generation, NaCl encrypt/decrypt
├── services/
│   ├── api.ts               # Axios client — auth + user endpoints
│   ├── config.ts            # Reads API/WS URLs from serverStore
│   ├── messageDb.ts         # SQLite for store messages
│   └── socket.ts            # WebSocket manager with reconnect logic
├── store/
│   ├── authStore.ts         # Auth state (Zustand) — login, register, logout
│   ├── chatStore.ts         # Messages + conversations (Zustand)
│   ├── serverStore.ts       # Server URL (persisted in SecureStore)
│   └── settingsStore.ts     # Settings store
├── types/
│   └── index.ts             # Shared TypeScript interfaces
└── app.json                 # Expo config
```

---

## Cryptography

| Primitive         | Library           | Purpose                   |
| ----------------- | ----------------- | ------------------------- |
| X25519 ECDH       | TweetNaCl         | Shared secret derivation  |
| XSalsa20-Poly1305 | TweetNaCl         | Authenticated encryption  |
| CSPRNG            | expo-crypto       | Nonce generation          |
| Secure storage    | expo-secure-store | Private key + JWT at rest |

**Key lifecycle:**

1. **Register** — `nacl.box.keyPair()` generates a Curve25519 keypair. Private key is saved to `expo-secure-store`. Public key is sent to the server.
2. **Login** — A fresh keypair is generated and the new public key is pushed to the server. This ensures a valid local key exists even after reinstall or device change.
3. **Logout** — Private key is deleted from `expo-secure-store`.

**Message encryption** (sender side):

```
sharedKey = X25519(myPrivateKey, recipientPublicKey)
nonce     = random 24 bytes (expo-crypto CSPRNG)
ciphertext = XSalsa20-Poly1305(plaintext, nonce, sharedKey)
```

Both `ciphertext` and `nonce` are base64-encoded and sent over WebSocket.

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
| Routing        | Expo Router (file-based)         |
| State          | Zustand 5                        |
| Encryption     | TweetNaCl 1.0                    |
| HTTP           | Axios 1.x                        |
| Realtime       | Native WebSocket                 |
| Secure storage | expo-secure-store                |
| Styling        | Tailwind CSS (Uniwind)           |
| Keyboard       | react-native-keyboard-controller |

---

## Self-Hosting

You can run your own server and point the app at it. See the [server README](https://github.com/theany-org/whisper-server/README.md) for the full setup guide (Docker Compose, environment variables, database migrations).

Once your server is running, either:

- Set `EXPO_PUBLIC_WHISPER_API_URL` in `.env` before building, **or**
- Tap the server icon on the login screen and enter your URL at runtime

---

## Security Notes

- The server is a relay only — it never decrypts or stores message content
- Private keys are stored in the OS keychain / secure enclave via `expo-secure-store`
- A new keypair is generated on each login, so previous sessions cannot decrypt future messages
- WebSocket tickets are single-use and expire in 30 seconds
- The app auto-disconnects and redirects to login on repeated authentication failures

---

## License

[MIT](https://github.com/theany-org/whisper-server/LICENSE)
