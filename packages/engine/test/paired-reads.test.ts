/**
 * The pair of a creature is read through `rules/pairing.ts` (CR 702.95b, D-983): the link stored on an object (`GameObject.paired`) can be stale for a moment (the
 * partner left and is a new object, control changed, a member is phased out), and only the readers there know every condition under which it still stands. This test
 * reads the sources of the engine and fails when a file other than those that own the designation reads or writes the field of an object directly. The ones that do:
 * the readers and writers (`rules/pairing.ts`), the state-based action that clears it (`rules/pairing-sba.ts`), the invariant that checks the stored links
 * (`invariants.ts`), the scenario builder that writes them (`testing/assemble.ts`) and the type itself (`state/types.ts`, in a comment).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const OWNERS = new Set([
  join(SRC, 'rules', 'pairing.ts'),
  join(SRC, 'rules', 'pairing-sba.ts'),
  join(SRC, 'invariants.ts'),
  join(SRC, 'testing', 'assemble.ts'),
  join(SRC, 'state', 'types.ts'),
]);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (name.endsWith('.ts') && !OWNERS.has(path)) out.push(path);
  }
  return out;
}

/** The field read (`obj.paired`, `old.paired?.with`) or written as a property of an object literal (`paired: {`). */
const FIELD = /(?:\.paired\b|\bpaired\s*:\s*\{)/;
const COMMENT = /^\s*(?:\/\/|\/?\*)/;

describe('paired reads', () => {
  test('no file but the owners of the designation reads or writes GameObject.paired', () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (FIELD.test(line) && !COMMENT.test(line) && !line.includes('stored link')) {
            offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });

  test('the check does catch the pattern it is about', () => {
    expect(FIELD.test('return obj.paired !== undefined && x;')).toBe(true);
    expect(FIELD.test('const w = old.paired?.with;')).toBe(true);
    expect(FIELD.test('setObject(state, { ...o, paired: { with: b, by } });')).toBe(true);
    expect(FIELD.test('const partner = partnerOf(state, obj);')).toBe(false);
    expect(FIELD.test('const unpaired = endBrokenPairs(state);')).toBe(false);
  });
});
