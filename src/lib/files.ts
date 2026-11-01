/** Saves text as a file via a temporary download link (works in installed PWAs too). */
export function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** True when the system share sheet can send files (Android Chrome: Drive, Gmail, WhatsApp…). */
export function canShareFiles(): boolean {
  try {
    const probe = new File(['{}'], 'probe.json', { type: 'application/json' });
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [probe] });
  } catch {
    return false;
  }
}

/** Opens the share sheet with a file. Resolves false if the user cancelled. */
export async function shareText(filename: string, text: string, mime: string, title: string): Promise<boolean> {
  const file = new File([text], filename, { type: mime });
  try {
    await navigator.share({ files: [file], title });
    return true;
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return false;
    throw err;
  }
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}
