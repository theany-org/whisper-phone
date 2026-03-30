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

// ── Shared Core ──────────────────────────────────────────────────────

async function _encrypt(
  data: Uint8Array,
  recipientPublicKeyB64: string
): Promise<EncryptedPayload> {
  const privateKey = await getPrivateKey();
  if (!privateKey) throw new Error("Private key not found");

  const recipientPub = decodeBase64(recipientPublicKeyB64);
  const sharedKey = nacl.box.before(recipientPub, privateKey);

  const nonceBytes = new Uint8Array(nacl.box.nonceLength);
  const randomBytes = await Crypto.getRandomBytesAsync(nacl.box.nonceLength);
  nonceBytes.set(new Uint8Array(randomBytes));

  const encrypted = nacl.box.after(data, nonceBytes, sharedKey);
  if (!encrypted) throw new Error("Encryption failed");

  return {
    ciphertext: encodeBase64(encrypted),
    nonce: encodeBase64(nonceBytes),
  };
}

async function _decrypt(
  ciphertextB64: string,
  nonceB64: string,
  senderPublicKeyB64: string
): Promise<Uint8Array> {
  const privateKey = await getPrivateKey();
  if (!privateKey) throw new Error("Private key not found");

  const senderPub = decodeBase64(senderPublicKeyB64);
  const sharedKey = nacl.box.before(senderPub, privateKey);
  const nonce = decodeBase64(nonceB64);
  const ciphertext = decodeBase64(ciphertextB64);

  const decrypted = nacl.box.open.after(ciphertext, nonce, sharedKey);
  if (!decrypted) throw new Error("Decryption failed — message tampered or wrong key");

  return decrypted;
}

// ── Encryption ──────────────────────────────────────────────────────

export interface EncryptedPayload {
  ciphertext: string; // base64
  nonce: string; // base64
}

/** Encrypt a plaintext string for `recipientPublicKeyB64`. */
export async function encryptMessage(
  plaintext: string,
  recipientPublicKeyB64: string
): Promise<EncryptedPayload> {
  return _encrypt(decodeUTF8(plaintext), recipientPublicKeyB64);
}

/** Encrypt raw bytes (e.g. audio) for `recipientPublicKeyB64`. */
export async function encryptBytes(
  data: Uint8Array,
  recipientPublicKeyB64: string
): Promise<EncryptedPayload> {
  return _encrypt(data, recipientPublicKeyB64);
}

// ── Decryption ──────────────────────────────────────────────────────

/** Decrypt an incoming text message from `senderPublicKeyB64`. */
export async function decryptMessage(
  ciphertextB64: string,
  nonceB64: string,
  senderPublicKeyB64: string
): Promise<string> {
  const bytes = await _decrypt(ciphertextB64, nonceB64, senderPublicKeyB64);
  return encodeUTF8(bytes);
}

/** Decrypt incoming raw bytes (e.g. audio) from `senderPublicKeyB64`. */
export async function decryptBytes(
  ciphertextB64: string,
  nonceB64: string,
  senderPublicKeyB64: string
): Promise<Uint8Array> {
  return _decrypt(ciphertextB64, nonceB64, senderPublicKeyB64);
}
