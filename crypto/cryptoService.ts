import "./polyfill"; // MUST be first — sets up PRNG before tweetnacl loads

import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import nacl from "tweetnacl";
import {
  decodeBase64,
  decodeUTF8,
  encodeBase64,
  encodeUTF8,
} from "tweetnacl-util";

const PRIVATE_KEY_SLOT = "whisper_private_key";

// ── Key Management ──────────────────────────────────────────────────

/** Generate a NaCl box keypair. Returns base64-encoded public key.
 *  The private key is stored in SecureStore and never leaves the device. */
export async function generateKeyPair(): Promise<string> {
  const keyPair = nacl.box.keyPair();
  await SecureStore.setItemAsync(
    PRIVATE_KEY_SLOT,
    encodeBase64(keyPair.secretKey)
  );
  return encodeBase64(keyPair.publicKey);
}

/** Retrieve the private key from SecureStore. Returns null if absent. */
async function getPrivateKey(): Promise<Uint8Array | null> {
  const stored = await SecureStore.getItemAsync(PRIVATE_KEY_SLOT);
  if (!stored) return null;
  return decodeBase64(stored);
}

/** Delete private key + any cached material on logout. */
export async function clearKeys(): Promise<void> {
  await SecureStore.deleteItemAsync(PRIVATE_KEY_SLOT);
}

// ── Encryption ──────────────────────────────────────────────────────

export interface EncryptedPayload {
  ciphertext: string; // base64
  nonce: string; // base64
}

/** Encrypt a plaintext string for `recipientPublicKeyB64`.
 *  Uses NaCl box (X25519 + XSalsa20-Poly1305). */
export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyB64: string
): Promise<EncryptedPayload> {
  console.log("[CRYPTO] encrypt start", {
    plaintextLength: plaintext.length,
    recipientPublicKeyLength: recipientPublicKeyB64.length,
  });

  const privateKey = await getPrivateKey();
  if (!privateKey) throw new Error("Private key not found");
  console.log("[CRYPTO] private key loaded", { privateKeyLength: privateKey.length });

  const recipientPub = decodeBase64(recipientPublicKeyB64);
  const sharedKey = nacl.box.before(recipientPub, privateKey);
  console.log("[CRYPTO] shared key derived", {
    recipientPublicKeyBytes: recipientPub.length,
    sharedKeyLength: sharedKey.length,
  });

  const nonceBytes = new Uint8Array(nacl.box.nonceLength);
  const randomBytes = await Crypto.getRandomBytesAsync(nacl.box.nonceLength);
  nonceBytes.set(new Uint8Array(randomBytes));
  console.log("[CRYPTO] nonce generated", { nonceLength: nonceBytes.length });

  const messageBytes = decodeUTF8(plaintext);
  const encrypted = nacl.box.after(messageBytes, nonceBytes, sharedKey);

  if (!encrypted) throw new Error("Encryption failed");
  console.log("[CRYPTO] encrypt success", {
    messageBytes: messageBytes.length,
    ciphertextBytes: encrypted.length,
  });

  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonceBytes),
  };
}

// ── Decryption ──────────────────────────────────────────────────────

/** Decrypt an incoming message from `senderPublicKeyB64`. */
export async function decryptMessage(
  ciphertextB64: string,
  nonceB64: string,
  senderPublicKeyB64: string
): Promise<string> {
  console.log("[CRYPTO] decrypt start", {
    ciphertextLength: ciphertextB64.length,
    nonceLength: nonceB64.length,
    senderPublicKeyLength: senderPublicKeyB64.length,
  });

  const privateKey = await getPrivateKey();
  if (!privateKey) throw new Error("Private key not found");

  const senderPub = decodeBase64(senderPublicKeyB64);
  const sharedKey = nacl.box.before(senderPub, privateKey);
  const nonce = decodeBase64(nonceB64);
  const ciphertext = decodeBase64(ciphertextB64);

  const decrypted = nacl.box.open.after(ciphertext, nonce, sharedKey);
  if (!decrypted) throw new Error("Decryption failed — message tampered or wrong key");

  return encodeUTF8(decrypted);
}
