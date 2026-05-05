/**
 * WhisperBox Crypto Utilities
 * Implements E2EE using Web Crypto API
 */

const RSA_PARAMS = {
  name: "RSA-OAEP",
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: "SHA-256",
};

const AES_KW_PARAMS = { name: "AES-KW" };
const PBKDF2_PARAMS = {
  name: "PBKDF2",
  iterations: 100000,
  hash: "SHA-256",
};

// --- Helpers ---

export const bufferToBase64 = (buffer) => {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
};

export const base64ToBuffer = (base64) => {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

// --- Key Generation & Management ---

/**
 * Generates an RSA-OAEP 2048-bit keypair
 */
export const generateRSAKeyPair = async () => {
  return await window.crypto.subtle.generateKey(RSA_PARAMS, true, ["encrypt", "decrypt"]);
};

/**
 * Derives a 256-bit AES-GCM wrapping key from a password and salt
 */
export const deriveWrappingKey = async (password, saltBuffer) => {
  const enc = new TextEncoder();
  const baseKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveKey"]
  );

  return await window.crypto.subtle.deriveKey(
    {
      ...PBKDF2_PARAMS,
      salt: saltBuffer,
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

/**
 * Wraps (encrypts) the private key for storage on the server
 */
export const wrapPrivateKey = async (privateKey, wrappingKey) => {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const exportedKey = await window.crypto.subtle.exportKey("pkcs8", privateKey);
  
  const wrapped = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    exportedKey
  );
  
  // Prepend IV to the ciphertext
  const combined = new Uint8Array(iv.length + wrapped.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(wrapped), iv.length);
  
  return bufferToBase64(combined);
};

/**
 * Unwraps (decrypts) the private key from the server's blob
 */
export const unwrapPrivateKey = async (wrappedKeyBase64, wrappingKey) => {
  const combinedBuffer = new Uint8Array(base64ToBuffer(wrappedKeyBase64));
  
  const iv = combinedBuffer.slice(0, 12);
  const ciphertext = combinedBuffer.slice(12);
  
  const unwrappedBuffer = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    wrappingKey,
    ciphertext
  );
  
  return await window.crypto.subtle.importKey(
    "pkcs8",
    unwrappedBuffer,
    RSA_PARAMS,
    true,
    ["decrypt"]
  );
};

/**
 * Exports a public key to base64 string
 */
export const exportPublicKey = async (publicKey) => {
  const exported = await window.crypto.subtle.exportKey("spki", publicKey);
  return bufferToBase64(exported);
};

/**
 * Imports a public key from base64 string
 */
export const importPublicKey = async (publicKeyBase64) => {
  const buffer = base64ToBuffer(publicKeyBase64);
  return await window.crypto.subtle.importKey(
    "spki",
    buffer,
    RSA_PARAMS,
    true,
    ["encrypt"]
  );
};

// --- Encryption & Decryption ---

/**
 * Encrypts a message for a recipient (and self)
 */
export const encryptMessage = async (plaintext, recipientPublicKey, senderPublicKey) => {
  // Add metadata for basic replay protection
  const messageObject = {
    text: plaintext,
    timestamp: Date.now(),
  };
  
  // 1. Generate random AES-GCM 256-bit key and 96-bit IV
  const aesKey = await window.crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
  const iv = window.crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV

  // 2. Encrypt plaintext with AES-GCM
  const enc = new TextEncoder();
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    aesKey,
    enc.encode(JSON.stringify(messageObject))
  );

  // 3. Encrypt AES key with recipient's RSA public key
  const exportedAesKey = await window.crypto.subtle.exportKey("raw", aesKey);
  const encryptedKey = await window.crypto.subtle.encrypt(
    RSA_PARAMS,
    recipientPublicKey,
    exportedAesKey
  );

  // 4. Encrypt AES key with sender's RSA public key (for self-history)
  const encryptedKeyForSelf = await window.crypto.subtle.encrypt(
    RSA_PARAMS,
    senderPublicKey,
    exportedAesKey
  );

  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
    encryptedKey: bufferToBase64(encryptedKey),
    encryptedKeyForSelf: bufferToBase64(encryptedKeyForSelf),
  };
};

/**
 * Decrypts a received message
 */
export const decryptMessage = async (payload, privateKey) => {
  try {
    const { ciphertext, iv, encryptedKey, encryptedKeyForSelf } = payload;
    
    // 1. Decrypt the AES Key
    const keyToDecrypt = encryptedKey || encryptedKeyForSelf;
    const aesKeyBuffer = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" },
      privateKey,
      base64ToBuffer(keyToDecrypt)
    );
    
    const aesKey = await window.crypto.subtle.importKey(
      "raw",
      aesKeyBuffer,
      "AES-GCM",
      false,
      ["decrypt"]
    );
    
    // 2. Decrypt the message
    const ivBuffer = base64ToBuffer(iv);
    const ciphertextBuffer = base64ToBuffer(ciphertext);
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ivBuffer },
      aesKey,
      ciphertextBuffer
    );
    
    const decoded = new TextDecoder().decode(decrypted);
    
    // Handle both JSON payloads and raw text
    try {
      const data = JSON.parse(decoded);
      return data.text || decoded;
    } catch (e) {
      // If not JSON, it's a legacy or seeded raw text message
      return decoded;
    }
  } catch (err) {
    console.error("Decryption failed", err);
    throw new Error("Decryption failed");
  }
};
