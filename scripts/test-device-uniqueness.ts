/**
 * Verifies that each new profile gets a unique device signature.
 * Run: npx tsx scripts/test-device-uniqueness.ts
 */
import { createProfile } from '../src/core/fingerprint/generator.js';
import { computeDeviceSignature } from '../src/core/fingerprint/device-generator.js';

const COUNT = 100;
const signatures = new Set<string>();
const duplicates: string[] = [];

for (let i = 0; i < COUNT; i++) {
  const profile = createProfile(`Test Profile ${i}`);
  const sig = profile.deviceSignature ?? computeDeviceSignature(profile.fingerprint);
  if (signatures.has(sig)) {
    duplicates.push(sig);
  }
  signatures.add(sig);
}

console.log(`Generated ${COUNT} profiles`);
console.log(`Unique signatures: ${signatures.size}`);
console.log(`Duplicates: ${duplicates.length}`);

if (duplicates.length > 0) {
  console.error('FAIL — duplicate device signatures found:', duplicates.slice(0, 5));
  process.exit(1);
}

const devices = new Set<string>();
for (let i = 0; i < 30; i++) {
  devices.add(createProfile(`OS test ${i}`).fingerprint.device);
}
console.log(`OS variety (30 samples): ${[...devices].join(', ')}`);
console.log('PASS — all device signatures are unique');
