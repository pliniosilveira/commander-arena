/** Browser side effects of the import screen. Call from event handlers only. */

/** Copies text with the Clipboard API; false when it is unavailable or refused. */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard === undefined) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
