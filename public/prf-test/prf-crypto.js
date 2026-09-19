// Browser-side counterpart of fair-data-access (fair_data_access/keys.py and
// encrypt.py), using only WebCrypto:
//   data:     AES-256-GCM, file = 12-byte nonce || ciphertext+tag
//   key wrap: ECDH-ES on P-256 + HKDF-SHA256 (no salt, info
//             "fair-data-access-key-wrap") + AES-256-GCM, JSON envelope
//             {ephemeral_public_key, nonce, wrapped_key, algorithm}
// plus protection of the user's private key with a secret from a passkey
// (WebAuthn PRF extension).

const subtle = globalThis.crypto.subtle;
const enc = new TextEncoder();
const WRAP_INFO = enc.encode("fair-data-access-key-wrap");
const KEY_PROTECT_INFO = enc.encode("fair2adapt-private-key-protection");
export const ALGORITHM = "ECDH-ES+HKDF-SHA256+AES-256-GCM";

export const b64 = {
  encode: (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))),
  decode: (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0)),
};

function pemToDer(pem) {
  return b64.decode(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""));
}

function derToPem(der, label) {
  const body = b64.encode(der).match(/.{1,64}/g).join("\n");
  return `-----BEGIN ${label}-----\n${body}\n-----END ${label}-----\n`;
}

// Python's HKDF(salt=None) uses a zero salt; an empty salt gives the same PRK.
async function hkdfAesKey(secret, info, usages) {
  const base = await subtle.importKey("raw", secret, "HKDF", false, ["deriveKey"]);
  return subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    usages
  );
}

export async function generateUserKeyPair() {
  const pair = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pkcs8 = await subtle.exportKey("pkcs8", pair.privateKey);
  const spki = await subtle.exportKey("spki", pair.publicKey);
  return { pkcs8: new Uint8Array(pkcs8), publicPem: derToPem(spki, "PUBLIC KEY") };
}

export async function importPrivatePem(pem) {
  return subtle.importKey("pkcs8", pemToDer(pem), { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

async function importPrivatePkcs8(pkcs8) {
  return subtle.importKey("pkcs8", pkcs8, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

async function importPublicPem(pem) {
  return subtle.importKey("spki", pemToDer(pem), { name: "ECDH", namedCurve: "P-256" }, false, []);
}

/** Wrap a 32-byte dataset key for a recipient public key (PEM), like wrap_key(). */
export async function wrapKey(datasetKey, recipientPublicPem) {
  const recipient = await importPublicPem(recipientPublicPem);
  const eph = await subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const shared = await subtle.deriveBits({ name: "ECDH", public: recipient }, eph.privateKey, 256);
  const wrapping = await hkdfAesKey(shared, WRAP_INFO, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const wrapped = await subtle.encrypt({ name: "AES-GCM", iv: nonce }, wrapping, datasetKey);
  const ephPem = derToPem(await subtle.exportKey("spki", eph.publicKey), "PUBLIC KEY");
  return JSON.stringify({
    ephemeral_public_key: b64.encode(enc.encode(ephPem)),
    nonce: b64.encode(nonce),
    wrapped_key: b64.encode(wrapped),
    algorithm: ALGORITHM,
  });
}

/** Unwrap an envelope produced by fair-data-access wrap_key(), like unwrap_key(). */
export async function unwrapKey(envelopeJson, privateKey) {
  const env = JSON.parse(envelopeJson);
  if (env.algorithm !== ALGORITHM) throw new Error(`Unsupported algorithm ${env.algorithm}`);
  const ephPem = new TextDecoder().decode(b64.decode(env.ephemeral_public_key));
  const eph = await importPublicPem(ephPem);
  const shared = await subtle.deriveBits({ name: "ECDH", public: eph }, privateKey, 256);
  const wrapping = await hkdfAesKey(shared, WRAP_INFO, ["decrypt"]);
  const key = await subtle.decrypt({ name: "AES-GCM", iv: b64.decode(env.nonce) }, wrapping, b64.decode(env.wrapped_key));
  return new Uint8Array(key);
}

/** Encrypt / decrypt data like encrypt.py: nonce || ciphertext+tag. */
export async function encryptData(datasetKey, plaintext) {
  const key = await subtle.importKey("raw", datasetKey, "AES-GCM", false, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce }, key, plaintext));
  const out = new Uint8Array(12 + ct.length);
  out.set(nonce);
  out.set(ct, 12);
  return out;
}

export async function decryptData(datasetKey, blob) {
  const key = await subtle.importKey("raw", datasetKey, "AES-GCM", false, ["decrypt"]);
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: blob.slice(0, 12) }, key, blob.slice(12)));
}

/** Protect the private key (PKCS8) with a passkey PRF secret; returns base64. */
export async function protectPrivateKey(pkcs8, prfSecret) {
  const kek = await hkdfAesKey(prfSecret, KEY_PROTECT_INFO, ["encrypt"]);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv: nonce }, kek, pkcs8));
  const out = new Uint8Array(12 + ct.length);
  out.set(nonce);
  out.set(ct, 12);
  return b64.encode(out);
}

export async function unlockPrivateKey(protectedB64, prfSecret) {
  const blob = b64.decode(protectedB64);
  const kek = await hkdfAesKey(prfSecret, KEY_PROTECT_INFO, ["decrypt"]);
  const pkcs8 = await subtle.decrypt({ name: "AES-GCM", iv: blob.slice(0, 12) }, kek, blob.slice(12));
  return importPrivatePkcs8(pkcs8);
}
