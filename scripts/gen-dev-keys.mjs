#!/usr/bin/env node
/**
 * Generate a fresh RSA-2048 keypair for Hub SSO (RS256).
 *
 * Prints the public PEM + private DER (base64) + the exact `.env` line to
 * paste. It NEVER writes `.env` or any other file — paste the output
 * yourself.
 *
 * Usage: node scripts/gen-dev-keys.mjs
 *
 * NOTE: the shared DEV keypair already exists (generated 2026-11-20, kid
 * c804e3560b5c8059; public key committed in src/auth/keys.ts). Run this
 * script only to ROTATE the dev key or to create a keypair for a fresh
 * environment. Rotating means updating the bundled public key + kid in
 * src/auth/keys.ts AND in every joined module, then retiring the old kid
 * after one token lifetime (1 hour) — see docs/SSO_TOKEN.md.
 *
 * For PRODUCTION, generate the keypair on the server (or in the secret
 * manager) and never let the private key touch a developer machine or this
 * repo — see docs/SSO_PRODUCTION.md.
 */
import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicDer = publicKey.export({ type: 'spki', format: 'der' });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
const privateDerB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
// kid = first 16 hex chars of the SHA-256 of the public key's DER encoding.
const kid = crypto.createHash('sha256').update(publicDer).digest('hex').slice(0, 16);

console.log('Hub SSO keypair (RSA-2048, RS256) — generated, NOT saved anywhere.\n');
console.log(`kid: ${kid}\n`);
console.log('--- PUBLIC KEY (safe to commit — paste into src/auth/keys.ts) ---');
console.log(publicPem.trim());
console.log('\n--- .env LINES (private — paste into your local .env, never commit) ---');
console.log(`VITE_JWT_PRIVATE_KEY_B64=${privateDerB64}`);
console.log('\n--- NEXT STEPS ---');
console.log('1. Paste the public PEM above into src/auth/keys.ts as DEV_PUBLIC_KEY_PEM');
console.log(`   and set DEV_KID to ${kid}.`);
console.log('2. Paste the VITE_JWT_PRIVATE_KEY_B64 line into your local .env (gitignored).');
console.log('3. Update the bundled public key + kid in every joined module (same rotation).');
console.log('4. Keep the OLD kid verifiable until all tokens signed with it expire (1 hour).');
