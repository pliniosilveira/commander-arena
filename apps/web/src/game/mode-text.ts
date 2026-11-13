/** The words of a mode of a modal spell or ability (CR 700.2), shared by the log and the panels. */

/** A mode's text without its closing period, to join with others: "Destroy target artifact". */
export function modeText(text: string): string {
  return text.trim().replace(/\.$/, '');
}

/** " (x2)" for a mode chosen more than once (D-344, CR 700.2d); '' for one that was chosen once. */
export function timesNote(times: number): string {
  return times > 1 ? ` (x${times})` : '';
}
