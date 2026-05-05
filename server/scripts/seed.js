import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { webcrypto, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();
const subtle = webcrypto.subtle;

// Helper: Buffer to Base64
const bufferToBase64 = (buf) => Buffer.from(buf).toString('base64');

// Helper: Generate RSA Keypair
async function generateKeys() {
  const keyPair = await subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["encrypt", "decrypt"]
  );
  
  const public_key = bufferToBase64(await subtle.exportKey("spki", keyPair.publicKey));
  const private_key_raw = await subtle.exportKey("pkcs8", keyPair.privateKey);
  
  return { public_key, private_key_raw, keyPair };
}

// Helper: Wrap Private Key (Simulate client behavior)
async function wrapKey(privateKeyRaw, password, salt) {
  const enc = new TextEncoder();
  const baseKey = await subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  const wrappingKey = await subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"]
  );
  
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const encrypted = await subtle.encrypt({ name: "AES-GCM", iv }, wrappingKey, privateKeyRaw);
  
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(encrypted), iv.length);
  
  return bufferToBase64(combined);
}

// Helper: Encrypt Message (Simulate client behavior)
async function encryptMsg(text, recipientPublicKeyBuf, senderPublicKeyBuf) {
  const aesKey = await subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await subtle.encrypt({ name: "AES-GCM", iv }, aesKey, enc.encode(text));
  
  const exportedAesKey = await subtle.exportKey("raw", aesKey);
  
  const recipientKey = await subtle.importKey("spki", recipientPublicKeyBuf, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  const senderKey = await subtle.importKey("spki", senderPublicKeyBuf, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  
  const encryptedKey = await subtle.encrypt({ name: "RSA-OAEP" }, recipientKey, exportedAesKey);
  const encryptedKeyForSelf = await subtle.encrypt({ name: "RSA-OAEP" }, senderKey, exportedAesKey);
  
  return {
    ciphertext: bufferToBase64(ciphertext),
    iv: bufferToBase64(iv),
    encryptedKey: bufferToBase64(encryptedKey),
    encryptedKeyForSelf: bufferToBase64(encryptedKeyForSelf)
  };
}

async function main() {
  console.log("🚀 Starting Seed Process...");
  
  // Clear existing data
  await prisma.message.deleteMany();
  await prisma.user.deleteMany();
  
  const userNames = [
    "Alice", "Bob", "Charlie", "Diana", "Ethan", 
    "Fiona", "George", "Hannah", "Ian", "Julia", 
    "Kevin", "Laura", "Mike", "Nina", "Oscar"
  ];
  
  const users = [];
  const password = "password123";
  const passwordHash = await bcrypt.hash(password, 10);

  console.log("👤 Creating 15 Secure Users...");
  
  for (const name of userNames) {
    const { public_key, private_key_raw } = await generateKeys();
    const salt = webcrypto.getRandomValues(new Uint8Array(16));
    const wrapped_private_key = await wrapKey(private_key_raw, password, salt);
    
    const user = await prisma.user.create({
      data: {
        username: name.toLowerCase(),
        display_name: name,
        password_hash: passwordHash,
        public_key,
        wrapped_private_key,
        pbkdf2_salt: bufferToBase64(salt)
      }
    });
    users.push(user);
    process.stdout.write(".");
  }
  console.log("\n✅ Users Created.");

  console.log("✉️ Generating 50 Encrypted Messages...");
  
  const sampleTexts = [
    "Hey! How is the E2EE going?",
    "The encryption is working perfectly.",
    "Did you see the new UI?",
    "WhisperBox feels so smooth.",
    "Meeting at 5 PM? Don't forget the key.",
    "I just sent you the secret document.",
    "Remember, the server can't read this!",
    "AES-GCM is really fast.",
    "Check out the RSA-OAEP key exchange.",
    "This is a total zero-knowledge system."
  ];

  for (let i = 0; i < 50; i++) {
    const sender = users[Math.floor(Math.random() * users.length)];
    let recipient = users[Math.floor(Math.random() * users.length)];
    while (recipient.id === sender.id) {
      recipient = users[Math.floor(Math.random() * users.length)];
    }

    const text = sampleTexts[Math.floor(Math.random() * sampleTexts.length)];
    const recipientPub = Buffer.from(recipient.public_key, 'base64');
    const senderPub = Buffer.from(sender.public_key, 'base64');
    
    const payload = await encryptMsg(text, recipientPub, senderPub);
    
    await prisma.message.create({
      data: {
        from_user_id: sender.id,
        to_user_id: recipient.id,
        ciphertext: payload.ciphertext,
        iv: payload.iv,
        encrypted_key: payload.encryptedKey,
        encrypted_key_for_self: payload.encryptedKeyForSelf,
        delivered: true,
        created_at: new Date(Date.now() - Math.floor(Math.random() * 100000000))
      }
    });
    if (i % 10 === 0) process.stdout.write(".");
  }

  console.log("\n✨ Seed Completed Successfully!");
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
