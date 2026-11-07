import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import forge from 'node-forge';
import { kid, kids, parseXml, textOf, type XNode } from '../docx/xml';

// Package signatures as described in ECMA-376 Part 2 (XML digital signatures over package parts).
const DSIG = 'http://www.w3.org/2000/09/xmldsig#';
const SHA256 = 'http://www.w3.org/2001/04/xmlenc#sha256';
const RSA256 = 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256';
const C14N = 'http://www.w3.org/TR/2001/REC-xml-c14n-20010315';
const PKG = 'http://schemas.openxmlformats.org/package/2006/digital-signature';
const ORIGIN_REL = 'http://schemas.openxmlformats.org/package/2006/relationships/digital-signature/origin';
const SIG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships/digital-signature/signature';

export interface Signer { key: forge.pki.rsa.PrivateKey; cert: forge.pki.Certificate }
export interface SignatureInfo { signer: string; issuer: string; time: string; purpose?: string; valid: boolean; intact: boolean; selfSigned: boolean }

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '&#xD;');
const escA = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;').replace(/\t/g, '&#x9;').replace(/\n/g, '&#xA;').replace(/\r/g, '&#xD;');
const b64 = (bytes: string): string => forge.util.encode64(bytes);
// Large parts are fed in pieces, since turning a whole picture into one string overflows the stack.
const sha256 = (data: Uint8Array): string => {
  const md = forge.md.sha256.create();
  for (let i = 0; i < data.length; i += 0x8000) md.update(String.fromCharCode(...data.subarray(i, i + 0x8000)));
  return b64(md.digest().bytes());
};
const sha256s = (s: string): string => { const md = forge.md.sha256.create(); md.update(s, 'utf8'); return b64(md.digest().bytes()); };

// Canonical XML (inclusive, without comments) for an element tree read by the app's own parser.
export const canonical = (n: XNode, inherited: Map<string, string> = new Map()): string => {
  const ns = new Map(inherited);
  const decl: [string, string][] = [];
  const attrs: [string, string][] = [];
  for (const [k, v] of Object.entries(n.attrs)) {
    if (k === 'xmlns' || k.startsWith('xmlns:')) { if (inherited.get(k) !== v) decl.push([k, v]); ns.set(k, v); } else attrs.push([k, v]);
  }
  decl.sort(([a], [b]) => (a === 'xmlns' ? -1 : b === 'xmlns' ? 1 : a.localeCompare(b)));
  const nsOf = (q: string) => (q.includes(':') ? ns.get(`xmlns:${q.split(':')[0]}`) ?? '' : '');
  attrs.sort(([a], [b]) => nsOf(a).localeCompare(nsOf(b)) || a.split(':').pop()!.localeCompare(b.split(':').pop()!));
  const head = [...decl, ...attrs].map(([k, v]) => ` ${k}="${escA(v)}"`).join('');
  const body = n.children.map((c) => (typeof c === 'string' ? esc(c) : canonical(c, ns))).join('');
  return `<${n.name}${head}>${body}</${n.name}>`;
};

const PARTS_SKIP = /^(\[Content_Types\]\.xml|_xmlsignatures\/.*|_rels\/\.rels|docProps\/core\.xml)$/;

const contentTypes = (files: Record<string, Uint8Array>): (path: string) => string => {
  const ct = parseXml(strFromU8(files['[Content_Types].xml']!));
  const over = new Map(kids(ct, 'Override').map((o) => [o.attrs['PartName']!.replace(/^\//, ''), o.attrs['ContentType']!]));
  const def = new Map(kids(ct, 'Default').map((o) => [o.attrs['Extension']!.toLowerCase(), o.attrs['ContentType']!]));
  return (p) => over.get(p) ?? def.get(p.split('.').pop()!.toLowerCase()) ?? 'application/octet-stream';
};

export const signPackage = (bytes: Uint8Array, signer: Signer, purpose: string): Uint8Array => {
  const files = unzipSync(bytes);
  const typeOf = contentTypes(files);
  const refs = Object.keys(files).filter((p) => !PARTS_SKIP.test(p) && !p.endsWith('/')).sort().map((p) =>
    `<Reference URI="/${escA(p)}?ContentType=${escA(typeOf(p))}"><DigestMethod Algorithm="${SHA256}"></DigestMethod><DigestValue>${sha256(files[p]!)}</DigestValue></Reference>`).join('');
  const time = new Date().toISOString().replace(/\.\d+Z$/, 'Z');
  const object = `<Object Id="idPackageObject"><Manifest>${refs}</Manifest><SignatureProperties><SignatureProperty Id="idSignatureTime" Target="#idPackageSignature"><mdssi:SignatureTime xmlns:mdssi="${PKG}"><mdssi:Format>YYYY-MM-DDThh:mm:ssTZD</mdssi:Format><mdssi:Value>${time}</mdssi:Value></mdssi:SignatureTime></SignatureProperty></SignatureProperties></Object>`;
  const office = `<Object Id="idOfficeObject"><SignatureProperties><SignatureProperty Id="idOfficeV1Details" Target="#idPackageSignature"><SignatureInfoV1 xmlns="http://schemas.microsoft.com/office/2006/digsig"><SignatureComments>${esc(purpose)}</SignatureComments><WindowsVersion>10.0</WindowsVersion><OfficeVersion>16.0</OfficeVersion><ApplicationVersion>16.0</ApplicationVersion><Monitors>1</Monitors><HorizontalResolution>1920</HorizontalResolution><VerticalResolution>1080</VerticalResolution><ColorDepth>32</ColorDepth><SignatureProviderId>{00000000-0000-0000-0000-000000000000}</SignatureProviderId><SignatureProviderUrl></SignatureProviderUrl><SignatureProviderDetails>9</SignatureProviderDetails><SignatureType>1</SignatureType></SignatureInfoV1></SignatureProperty></SignatureProperties></Object>`;
  const withNs = (x: string) => x.replace(/^<(\w+) /, `<$1 xmlns="${DSIG}" `);
  const signedInfo = `<SignedInfo><CanonicalizationMethod Algorithm="${C14N}"></CanonicalizationMethod><SignatureMethod Algorithm="${RSA256}"></SignatureMethod><Reference Type="http://www.w3.org/2000/09/xmldsig#Object" URI="#idPackageObject"><DigestMethod Algorithm="${SHA256}"></DigestMethod><DigestValue>${sha256s(withNs(object))}</DigestValue></Reference><Reference Type="http://www.w3.org/2000/09/xmldsig#Object" URI="#idOfficeObject"><DigestMethod Algorithm="${SHA256}"></DigestMethod><DigestValue>${sha256s(withNs(office))}</DigestValue></Reference></SignedInfo>`;
  const md = forge.md.sha256.create();
  md.update(signedInfo.replace('<SignedInfo>', `<SignedInfo xmlns="${DSIG}">`), 'utf8');
  const value = b64(signer.key.sign(md));
  const cert = b64(forge.asn1.toDer(forge.pki.certificateToAsn1(signer.cert)).getBytes());
  const sig = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Signature xmlns="${DSIG}" Id="idPackageSignature">${signedInfo}<SignatureValue>${value}</SignatureValue><KeyInfo><X509Data><X509Certificate>${cert}</X509Certificate></X509Data></KeyInfo>${object}${office}</Signature>`;

  const out: Record<string, Uint8Array> = { ...files };
  for (const k of Object.keys(out)) if (k.startsWith('_xmlsignatures/')) delete out[k];
  out['_xmlsignatures/origin.sigs'] = new Uint8Array();
  out['_xmlsignatures/sig1.xml'] = strToU8(sig);
  out['_xmlsignatures/_rels/origin.sigs.rels'] = strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${SIG_REL}" Target="sig1.xml"/></Relationships>`);
  const rels = strFromU8(out['_rels/.rels']!).replace(/<Relationship [^>]*digital-signature\/origin[^>]*\/>/g, '');
  out['_rels/.rels'] = strToU8(rels.replace('</Relationships>', `<Relationship Id="rIdSigOrigin" Type="${ORIGIN_REL}" Target="_xmlsignatures/origin.sigs"/></Relationships>`));
  let ct = strFromU8(out['[Content_Types].xml']!).replace(/<Default Extension="sigs"[^>]*\/>/g, '').replace(/<Override PartName="\/_xmlsignatures\/[^"]*"[^>]*\/>/g, '');
  ct = ct.replace('</Types>', `<Default Extension="sigs" ContentType="application/vnd.openxmlformats-package.digital-signature-origin"/><Override PartName="/_xmlsignatures/sig1.xml" ContentType="application/vnd.openxmlformats-package.digital-signature-xmlsignature+xml"/></Types>`);
  out['[Content_Types].xml'] = strToU8(ct);
  return zipSync(out, { level: 6 });
};

const name = (attrs: forge.pki.CertificateField[]): string => { const v = (attrs.find((a) => a.shortName === 'CN')?.value as string | undefined) ?? attrs.map((a) => a.value).join(', '); try { return forge.util.decodeUtf8(v); } catch { return v; } };

export const verifyPackage = (bytes: Uint8Array): SignatureInfo[] => {
  let files: Record<string, Uint8Array>;
  try { files = unzipSync(bytes); } catch { return []; }
  const out: SignatureInfo[] = [];
  for (const path of Object.keys(files).filter((p) => /^_xmlsignatures\/[^/]+\.xml$/.test(p))) {
    try {
      const root = parseXml(strFromU8(files[path]!));
      const sig = root.name === 'Signature' ? root : kids(root).find((c) => c.name === 'Signature') ?? root;
      const ns = new Map([['xmlns', DSIG]]);
      const si = kid(sig, 'SignedInfo')!;
      const certB64 = textOf(kid(kid(kid(sig, 'KeyInfo'), 'X509Data'), 'X509Certificate')).replace(/\s+/g, '');
      const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(forge.util.decode64(certB64)));
      const md = forge.md.sha256.create();
      md.update(canonical(si, new Map()).replace('<SignedInfo', `<SignedInfo xmlns="${DSIG}"`), 'utf8');
      const value = forge.util.decode64(textOf(kid(sig, 'SignatureValue')).replace(/\s+/g, ''));
      let valid = false;
      try { valid = (cert.publicKey as forge.pki.rsa.PublicKey).verify(md.digest().bytes(), value); } catch { valid = false; }
      let intact = true;
      const objects = new Map(kids(sig, 'Object').map((o) => [o.attrs['Id'] ?? '', o]));
      for (const ref of kids(si, 'Reference')) {
        const id = (ref.attrs['URI'] ?? '').replace(/^#/, '');
        const obj = objects.get(id);
        if (!obj) continue;
        const want = textOf(kid(ref, 'DigestValue')).trim();
        if (sha256s(canonical(obj, new Map()).replace(/^<Object/, `<Object xmlns="${DSIG}"`)) !== want) intact = false;
      }
      for (const ref of kids(kid(objects.get('idPackageObject'), 'Manifest'), 'Reference')) {
        const part = decodeURIComponent((ref.attrs['URI'] ?? '').split('?')[0]!.replace(/^\//, ''));
        const data = files[part];
        if (!data || (kid(ref, 'Transforms') ? false : sha256(data) !== textOf(kid(ref, 'DigestValue')).trim())) intact = false;
      }
      const deep = (n: XNode | undefined, end: string): XNode | undefined => { if (!n) return undefined; for (const c of kids(n)) { if (c.name.endsWith(end)) return c; const f = deep(c, end); if (f) return f; } return undefined; };
      const time = textOf(deep(deep(objects.get('idPackageObject'), 'SignatureTime'), 'Value'));
      const purpose = textOf(deep(objects.get('idOfficeObject'), 'SignatureComments'));
      void ns;
      out.push({ signer: name(cert.subject.attributes), issuer: name(cert.issuer.attributes), time, purpose: purpose || undefined, valid, intact, selfSigned: cert.isIssuer(cert) });
    } catch {
      out.push({ signer: 'Unknown', issuer: '', time: '', valid: false, intact: false, selfSigned: false });
    }
  }
  return out;
};

export const loadCertificate = (data: Uint8Array, password: string): Signer => {
  const p12 = forge.pkcs12.pkcs12FromAsn1(forge.asn1.fromDer(forge.util.binary.raw.encode(data)), password);
  const keyBag = (p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag })[forge.pki.oids.pkcs8ShroudedKeyBag] ?? [])[0] ?? (p12.getBags({ bagType: forge.pki.oids.keyBag })[forge.pki.oids.keyBag] ?? [])[0];
  const certBag = (p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [])[0];
  if (!keyBag?.key || !certBag?.cert) throw new Error('This file has no signing key and certificate.');
  return { key: keyBag.key as forge.pki.rsa.PrivateKey, cert: certBag.cert };
};

// A personal certificate proves who signed only to people who already trust it.
export const makeCertificate = (person: string, email: string): { signer: Signer; p12: Uint8Array } => {
  const keys = forge.pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 });
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = `01${forge.util.bytesToHex(forge.random.getBytesSync(9))}`;
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 5 * 365 * 864e5);
  const attrs = [{ shortName: 'CN', value: person, valueTagClass: forge.asn1.Type.UTF8 }, ...(email ? [{ name: 'emailAddress', value: email, valueTagClass: forge.asn1.Type.IA5STRING }] : [])] as unknown as forge.pki.CertificateField[];
  cert.setSubject(attrs);
  cert.setIssuer(attrs);
  cert.setExtensions([{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true, nonRepudiation: true }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  return { signer: { key: keys.privateKey, cert }, p12: exportSigner({ key: keys.privateKey, cert }, '') };
};

export const exportSigner = (s: Signer, password: string): Uint8Array => {
  const asn = forge.pkcs12.toPkcs12Asn1(s.key, [s.cert], password, { algorithm: '3des' });
  return forge.util.binary.raw.decode(forge.asn1.toDer(asn).getBytes());
};
