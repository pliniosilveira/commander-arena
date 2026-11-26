/**
 * Linked abilities of a permanent that puts a permanent onto the battlefield (Diabolic Servitude; CR 607.1, 607.2, 400.7): "When this enchantment enters, return target creature card from
 * your graveyard to the battlefield. When the creature put onto the battlefield with this enchantment dies, ... When this enchantment leaves the battlefield, exile the creature put onto the
 * battlefield with this enchantment." The two last abilities read what the first put there, so the first is marked `putWithSource` (the engine's `GameObject.putWith`), as an Aura that
 * returns a card marks its own (`effect.return-enchanted-card-attach`). Like `linkExile`, it links only when exactly one ability of the face puts a permanent onto the battlefield, once;
 * otherwise the readers are refused (their index in `refused`), never guessed.
 */
import type { Ability, Effect } from '@commander-arena/engine';

/** Whether a tree reads the link (`putWithThis`, or a filter's `putWithSource`) and whether it makes one (a `moveToZone` with the flag). */
function scan(node: unknown, found: { reads: boolean; makes: boolean }): void {
  if (Array.isArray(node)) {
    for (const item of node) scan(item, found);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record.kind === 'putWithThis') found.reads = true;
  if (record.putWithSource === true) {
    if (record.kind === 'moveToZone') found.makes = true;
    else found.reads = true;
  }
  for (const value of Object.values(record)) scan(value, found);
}

/** The `moveToZone` effects to the battlefield in an effect tree that the link could mark: a chosen card is never remembered (`validateCard`). */
function battlefieldMoves(node: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(node)) {
    for (const item of node) battlefieldMoves(item, out);
    return;
  }
  if (node === null || typeof node !== 'object') return;
  const record = node as Record<string, unknown>;
  if (record.kind === 'moveToZone' && record.to === 'battlefield') out.push(record);
  for (const value of Object.values(record)) battlefieldMoves(value, out);
}

/** The effect with its one `moveToZone` to the battlefield marked `putWithSource`. */
function marked<T>(node: T, target: unknown): T {
  if (Array.isArray(node)) return node.map((item) => marked(item, target)) as T;
  if (node === null || typeof node !== 'object') return node;
  const record = node as Record<string, unknown>;
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) copy[key] = marked(value, target);
  return (record === target ? { ...copy, putWithSource: true } : copy) as T;
}

export function linkPutWith(abilities: readonly Ability[]): {
  abilities: Ability[];
  refused: number[];
} {
  const readers: number[] = [];
  let makesAlready = false;
  abilities.forEach((a, i) => {
    const found = { reads: false, makes: false };
    scan(a, found);
    if (found.reads) readers.push(i);
    if (found.makes) makesAlready = true;
  });
  // Nothing reads the link, or the face made it itself (an Aura that returns the card it enchants).
  if (readers.length === 0 || makesAlready) return { abilities: [...abilities], refused: [] };
  const makers = abilities.flatMap((a, i) => {
    if ((a.kind !== 'triggered' && a.kind !== 'activated') || readers.includes(i)) return [];
    const moves: Record<string, unknown>[] = [];
    battlefieldMoves(a.effect, moves);
    return moves.length === 0 ? [] : [{ index: i, moves }];
  });
  // No ability puts anything onto the battlefield: the readers stay as they are, and the engine's own check says what is missing (`validateCard`).
  if (makers.length === 0) return { abilities: [...abilities], refused: [] };
  const [maker] = makers;
  const [move] = maker?.moves ?? [];
  const linkable =
    makers.length === 1 &&
    maker !== undefined &&
    maker.moves.length === 1 &&
    move !== undefined &&
    (move.objects as { kind?: unknown } | undefined)?.kind !== 'choose';
  if (!linkable) {
    return { abilities: abilities.filter((_, i) => !readers.includes(i)), refused: readers };
  }
  return {
    abilities: abilities.map((a, i) =>
      i === maker.index && (a.kind === 'triggered' || a.kind === 'activated')
        ? { ...a, effect: marked<Effect>(a.effect, move) }
        : a,
    ),
    refused: [],
  };
}
