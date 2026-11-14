/**
 * Keyword counters (CR 122.1b, D-430): "a keyword counter on a permanent or on a card in a zone other than the battlefield causes that object to gain that
 * keyword". The counter is named as the keyword is ("reach", "first strike"), and `derive` adds the keyword in layer 6 (CR 613.1f) from the counters the
 * object has, after the abilities it has printed and before every grant and every "loses all abilities" effect (see `keywordCounterAbilities`).
 */
import type { Ability, Keyword } from '../ast/types';
import { expansionOf } from './derive-keywords';

/**
 * The keywords CR 122.1b lets a counter be, as the engine writes them, by the name a counter of that kind has. The rule also lists decayed
 * (and "variants of those keywords"), which the engine has no keyword for: a counter named so is not run, and the parser refuses to read one
 * (`lower.add-counters`).
 */
export const KEYWORD_COUNTERS: Readonly<Record<string, Keyword>> = {
  flying: { kind: 'flying' },
  'first strike': { kind: 'firstStrike' },
  'double strike': { kind: 'doubleStrike' },
  deathtouch: { kind: 'deathtouch' },
  exalted: { kind: 'exalted' },
  haste: { kind: 'haste' },
  hexproof: { kind: 'hexproof' },
  indestructible: { kind: 'indestructible' },
  lifelink: { kind: 'lifelink' },
  menace: { kind: 'menace' },
  reach: { kind: 'reach' },
  shadow: { kind: 'shadow' },
  trample: { kind: 'trample' },
  vigilance: { kind: 'vigilance' },
};

/** The kind of counter CR 122.1b lists that the engine does not run (a counter of it would do nothing). */
export const UNSUPPORTED_KEYWORD_COUNTERS: readonly string[] = ['decayed'];

/**
 * The keyword abilities the counters of an object give (CR 122.1b), to be added to the abilities it has: a keyword it already has is not added twice
 * (a creature with reach and a reach counter has reach once), except exalted, of which each counter is an instance of its own (CR 702.83b: each instance
 * of exalted triggers separately), with the triggered ability the keyword stands for. The order is that of the keyword table, so the same counters
 * always make the same list.
 *
 * Layer 6 orders its effects by timestamp (CR 613.7), and a counter has one as it is put on (CR 613.7c). The engine keeps no timestamp for a counter,
 * so these keywords come before everything else the layer does: a "loses all abilities" effect takes them away even from a counter put on after it
 * began (`docs/ROADMAP.md`), and what is granted after them is added to them.
 */
export function keywordCounterAbilities(
  counters: Readonly<Record<string, number>>,
  existing: readonly Ability[],
): readonly Ability[] {
  // Most objects have no keyword counter, and `derive` asks for every object.
  if (!Object.keys(counters).some((name) => name in KEYWORD_COUNTERS)) return existing;
  let out: readonly Ability[] = existing;
  for (const [name, keyword] of Object.entries(KEYWORD_COUNTERS)) {
    const count = counters[name] ?? 0;
    if (count <= 0) continue;
    if (keyword.kind === 'exalted') {
      const grant: Ability = { kind: 'keyword', keyword };
      for (let i = 0; i < count; i += 1) out = [...out, grant, ...expansionOf(grant)];
    } else if (!out.some((a) => a.kind === 'keyword' && a.keyword.kind === keyword.kind)) {
      out = [...out, { kind: 'keyword', keyword }];
    }
  }
  return out;
}
