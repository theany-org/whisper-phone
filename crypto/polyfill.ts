import { getRandomBytes } from "expo-crypto";

// tweetnacl detects its PRNG at module load time by checking:
//   self.crypto.getRandomValues  (browser path)
//   require('crypto').randomBytes (node path)
//
// React Native / Hermes has neither. We must polyfill BOTH global and self
// BEFORE tweetnacl is ever imported, so its IIFE finds the PRNG.

const getRandomValues = <T extends ArrayBufferView>(array: T): T => {
  const bytes = getRandomBytes(array.byteLength);
  (array as unknown as Uint8Array).set(bytes);
  return array;
};

const cryptoShim = { getRandomValues };

if (typeof globalThis.crypto === "undefined") {
  (globalThis as any).crypto = cryptoShim;
} else if (typeof globalThis.crypto.getRandomValues === "undefined") {
  globalThis.crypto.getRandomValues = getRandomValues;
}

// tweetnacl specifically reads `self.crypto`, not `global.crypto`
if (typeof self === "undefined") {
  (globalThis as any).self = globalThis;
}
if (typeof self.crypto === "undefined") {
  (self as any).crypto = cryptoShim;
} else if (typeof self.crypto.getRandomValues === "undefined") {
  (self as any).crypto.getRandomValues = getRandomValues;
}
