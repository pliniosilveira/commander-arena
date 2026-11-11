/** The words of a mode of a modal spell or ability (CR 700.2), shared by the log and the panels. */

/** A mode's text without its closing period, to join with others: "Destroy target artifact". */
export function modeText(text: string): string {
  return text.trim().replace(/\.$/, '');
}
