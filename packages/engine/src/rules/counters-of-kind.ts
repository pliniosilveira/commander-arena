/** The counters of one kind in a counter record, or of every kind added together when no kind is named (CR 122.1). */
export function countersOfKind(
  counters: Readonly<Record<string, number>> | undefined,
  counter: string | undefined,
): number {
  if (counters === undefined) return 0;
  if (counter !== undefined) return counters[counter] ?? 0;
  return Object.values(counters).reduce((total, n) => total + Math.max(0, n), 0);
}
