// Password protection in the ECMA-376 agile format (AES-256, SHA-512), using the platform's crypto.
import { strFromU8, strToU8 } from 'fflate';
import { kid, parseXml } from '../docx/xml';
import { readCompound, writeCompound } from './cfb';
import { sha512 } from './sha512';

const SEGMENT = 4096;
const VERIFIER_INPUT = [0xfe, 0xa7, 0xd2, 0x76, 0x3b, 0x4b, 0x9e, 0x79];
const VERIFIER_HASH = [0xd7, 0xaa, 0x0f, 0x6d, 0x30, 0x61, 0x34, 0x4e];
const KEY_VALUE = [0x14, 0x6e, 0x0b, 0xe7, 0xab, 0xac, 0xd0, 0xd6];
const HMAC_KEY = [0x5f, 0xb2, 0xad, 0x01, 0x0c, 0xb9, 0xe1, 0xf6];
const HMAC_VALUE = [0xa0, 0x67, 0x7f, 0x02, 0xb2, 0x2c, 0x84, 0x33];

const concat = (...parts: (Uint8Array | number[])[]): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
};
const le32 = (n: number): Uint8Array => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const b64 = (s: string): Uint8Array => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toB64 = (b: Uint8Array): string => { let s = ''; for (const c of b) s += String.fromCharCode(c); return btoa(s); };
const hashName = (h: string): string => h.replace(/^SHA(\d)/i, 'SHA-$1').toUpperCase();
const digest = async (algo: string, ...parts: (Uint8Array | number[])[]): Promise<Uint8Array> => new Uint8Array(await crypto.subtle.digest(algo, concat(...parts)));
const fit = (b: Uint8Array, n: number, fill: number): Uint8Array => { const out = new Uint8Array(n).fill(fill); out.set(b.subarray(0, n)); return out; };
const utf16 = (s: string): Uint8Array => { const out = new Uint8Array(s.length * 2); for (let i = 0; i < s.length; i++) new DataView(out.buffer).setUint16(i * 2, s.charCodeAt(i), true); return out; };

const aesKey = (raw: Uint8Array): Promise<CryptoKey> => crypto.subtle.importKey('raw', concat(raw), 'AES-CBC', false, ['encrypt', 'decrypt']);

// The format has no padding; the platform always pads, so one block is added or dropped around each call.
const encryptRaw = async (key: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> =>
  new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv: concat(iv) }, key, concat(data))).subarray(0, data.length);

const decryptRaw = async (key: CryptoKey, iv: Uint8Array, data: Uint8Array): Promise<Uint8Array> => {
  const last = data.subarray(data.length - 16);
  const tail = await encryptRaw(key, last, new Uint8Array(16).fill(16));
  return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv: concat(iv) }, key, concat(data, tail)));
};

// The long hash chain is shared; each purpose then adds its own short key.
const spinHash = async (password: string, salt: Uint8Array, spin: number, algo: string): Promise<Uint8Array> => {
  let h = await digest(algo, salt, utf16(password));
  if (algo === 'SHA-512') {
    const buf = new Uint8Array(68);
    const view = new DataView(buf.buffer);
    for (let i = 0; i < spin; i++) { view.setUint32(0, i, true); buf.set(h, 4); h = sha512(buf); }
    return h;
  }
  for (let i = 0; i < spin; i++) h = await digest(algo, le32(i), h);
  return h;
};

const deriveKey = async (spun: Uint8Array, algo: string, blockKey: number[], bytes: number): Promise<Uint8Array> => fit(await digest(algo, spun, blockKey), bytes, 0x36);

const packageIv = async (algo: string, salt: Uint8Array, i: number, size: number): Promise<Uint8Array> => fit(await digest(algo, salt, le32(i)), size, 0x36);

export const isEncrypted = (files: Map<string, Uint8Array>): boolean => files.has('EncryptedPackage') && files.has('EncryptionInfo');

export const decryptPackage = async (bytes: Uint8Array, password: string): Promise<Uint8Array> => {
  const files = readCompound(bytes);
  const info = files.get('EncryptionInfo');
  const pack = files.get('EncryptedPackage');
  if (!info || !pack) throw new Error('This file is not a protected document.');
  if (new DataView(info.buffer, info.byteOffset).getUint16(0, true) !== 4) throw new Error('This older kind of password protection is not supported.');
  const xml = parseXml(strFromU8(info.subarray(8)));
  const kd = kid(xml, 'keyData')!.attrs;
  const enc = (kid(kid(xml, 'keyEncryptors'), 'keyEncryptor')?.children.find((c) => typeof c !== 'string')) as { attrs: Record<string, string> } | undefined;
  if (!enc) throw new Error('This kind of password protection is not supported.');
  const e = enc.attrs;
  const algo = hashName(e['hashAlgorithm']!);
  const salt = b64(e['saltValue']!);
  const spin = Number(e['spinCount']);
  const keyBytes = Number(e['keyBits']) / 8;
  const spun = await spinHash(password, salt, spin, algo);
  const open = async (block: number[], value: string) => decryptRaw(await aesKey(await deriveKey(spun, algo, block, keyBytes)), salt, b64(value));
  const input = await open(VERIFIER_INPUT, e['encryptedVerifierHashInput']!);
  const expected = await open(VERIFIER_HASH, e['encryptedVerifierHashValue']!);
  const actual = await digest(algo, input.subarray(0, Number(e['saltSize'])));
  if (actual.some((v, i) => v !== expected[i])) throw new Error('That password is not correct.');
  const key = await aesKey((await open(KEY_VALUE, e['encryptedKeyValue']!)).subarray(0, Number(kd['keyBits']) / 8));
  const size = Number(new DataView(pack.buffer, pack.byteOffset).getBigUint64(0, true));
  const dataAlgo = hashName(kd['hashAlgorithm']!);
  const dataSalt = b64(kd['saltValue']!);
  const out = new Uint8Array(size);
  const blockSize = Number(kd['blockSize']);
  for (let i = 0, at = 8; at < pack.length && (i * SEGMENT) < size; i++, at += SEGMENT) {
    const seg = pack.subarray(at, Math.min(at + SEGMENT, pack.length));
    const usable = seg.subarray(0, seg.length - (seg.length % 16));
    const plain = await decryptRaw(key, await packageIv(dataAlgo, dataSalt, i, blockSize), usable);
    out.set(plain.subarray(0, Math.min(plain.length, size - i * SEGMENT)), i * SEGMENT);
  }
  return out;
};

const random = (n: number): Uint8Array => crypto.getRandomValues(new Uint8Array(n));
const pad16 = (b: Uint8Array): Uint8Array => (b.length % 16 ? concat(b, new Uint8Array(16 - (b.length % 16))) : b);

export const encryptPackage = async (data: Uint8Array, password: string): Promise<Uint8Array> => {
  const algo = 'SHA-512';
  const spin = 100000;
  const salt = random(16);
  const dataSalt = random(16);
  const secret = random(32);
  const key = await aesKey(secret);
  const parts: Uint8Array[] = [(() => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(data.length), true); return b; })()];
  for (let i = 0; i * SEGMENT < data.length; i++) parts.push(await encryptRaw(key, await packageIv(algo, dataSalt, i, 16), pad16(data.subarray(i * SEGMENT, (i + 1) * SEGMENT))));
  const pack = concat(...parts);

  const spun = await spinHash(password, salt, spin, algo);
  const seal = async (block: number[], value: Uint8Array) => toB64(await encryptRaw(await aesKey(await deriveKey(spun, algo, block, 32)), salt, pad16(value)));
  const verifier = random(16);
  const hmacSecret = random(64);
  const hmacKey = await crypto.subtle.importKey('raw', concat(hmacSecret), { name: 'HMAC', hash: algo }, false, ['sign']);
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, pack));
  const iv = async (block: number[]) => fit(await digest(algo, dataSalt, block), 16, 0x36);
  const encHmacKey = toB64(await encryptRaw(key, await iv(HMAC_KEY), pad16(hmacSecret)));
  const encHmacValue = toB64(await encryptRaw(key, await iv(HMAC_VALUE), pad16(hmac)));
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n<encryption xmlns="http://schemas.microsoft.com/office/2006/encryption" xmlns:p="http://schemas.microsoft.com/office/2006/keyEncryptor/password"><keyData saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${toB64(dataSalt)}"/><dataIntegrity encryptedHmacKey="${encHmacKey}" encryptedHmacValue="${encHmacValue}"/><keyEncryptors><keyEncryptor uri="http://schemas.microsoft.com/office/2006/keyEncryptor/password"><p:encryptedKey spinCount="${spin}" saltSize="16" blockSize="16" keyBits="256" hashSize="64" cipherAlgorithm="AES" cipherChaining="ChainingModeCBC" hashAlgorithm="SHA512" saltValue="${toB64(salt)}" encryptedVerifierHashInput="${await seal(VERIFIER_INPUT, verifier)}" encryptedVerifierHashValue="${await seal(VERIFIER_HASH, await digest(algo, verifier))}" encryptedKeyValue="${await seal(KEY_VALUE, secret)}"/></keyEncryptor></keyEncryptors></encryption>`;
  const info = concat([4, 0, 4, 0, 0x40, 0, 0, 0], strToU8(xml));
  return writeCompound([['EncryptionInfo', info], ['EncryptedPackage', pack]]);
};

