/** Network-layer fingerprint limits — JA4/HTTP/2 require patched Chromium binary. */

export const NETWORK_FINGERPRINT_LIMITATIONS = {
  ja3: 'JA3 is driven by patched Chromium --fingerprint-seed (validate: https://tls.browserleaks.com/json)',
  ja4: 'JA4/JA4+ not yet controlled from JS — requires binary network stack (validate: https://tls.peet.ws/api/all)',
  http2: 'HTTP/2 SETTINGS frame order not spoofed from JS (validate: https://tls.browserleaks.com/http2)',
} as const;

export function networkFingerprintWarnings(): string[] {
  return [
    NETWORK_FINGERPRINT_LIMITATIONS.ja4,
    NETWORK_FINGERPRINT_LIMITATIONS.http2,
  ];
}
