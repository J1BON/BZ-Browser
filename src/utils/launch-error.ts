/** Turn Playwright / Chromium launch dumps into a short user-facing message. */
export function formatLaunchError(raw: string): string {
  const text = raw.trim();
  if (!text) return 'Could not start browser profile';

  if (text.includes('Browser logs:') || text.includes('<launching>')) {
    if (text.includes('process did exit') || text.includes('has been closed')) {
      return 'Browser engine failed to start. Open Settings → reinstall browser kernel, then try again.';
    }
    return 'Browser engine failed to start. Check proxy settings or reinstall the browser kernel in Settings.';
  }

  if (text.includes('Patched fingerprint-chromium')) {
    return 'Browser kernel not installed. Open Settings and run setup first.';
  }

  if (text.includes('Launch gate score')) {
    const m = text.match(/Launch gate score (\d+)% below minimum (\d+)%/);
    if (m) return `Fingerprint check failed (${m[1]}% — need ${m[2]}%). Lower the minimum in profile settings or improve the fingerprint.`;
    return 'Fingerprint quality check failed before launch.';
  }

  if (text.includes('iOS/Safari profiles cannot run')) {
    return 'iOS profiles cannot run on Chromium. Create a Windows or Android profile instead.';
  }

  if (text.includes('ECONNREFUSED') || text.includes('proxy')) {
    return 'Proxy connection failed. Verify host, port, and credentials, then run Network detection.';
  }

  const firstLine = text.split(/\r?\n/).find((l) => l.trim())?.trim() ?? text;
  if (firstLine.length > 160) return `${firstLine.slice(0, 157)}…`;
  return firstLine;
}
