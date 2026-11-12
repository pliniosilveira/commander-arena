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

/**
 * The field read (`obj.paired`, `old.paired?.with`), read by bracket (`obj['paired']`), destructured (`const { paired } = obj`, also over several lines), written as a
 * property of an object literal (`paired: {`, `paired: undefined`, the shorthand `{ ...o, paired }`) or named as an optional property (`paired?:`). The designation
 * on a line that is only a comment is not a read; a text after the code of a line (`// ...`) is removed first, so a comment cannot hide a read or make one up.
 */
const FIELD =
  /(?:\??\.paired\b|\[\s*['"`]paired['"`]\s*\]|\bpaired\s*\??:|[{,]\s*paired\s*[,}]|\{[^{}]*\bpaired\b[^{}]*\}\s*=[^=>])/;
const COMMENT = /^\s*(?:\/\/|\/?\*)/;

/** The code of the source: whole-line comments and the trailing `// ...` of a line blanked, the lines kept so a position still names its line. */
function code(text: string): string {
  return text
    .split('\n')
    .map((line) => (COMMENT.test(line) ? '' : line.replace(/\s\/\/\s.*$/, '')))
    .join('\n');
}

/** The lines (1-based) of the source's code that read or write the field. */
function fieldLines(text: string): number[] {
  const body = code(text);
  const lines = new Set<number>();
  body.split('\n').forEach((line, i) => {
    if (FIELD.test(line)) lines.add(i + 1);
  });
  // A destructuring pattern over several lines: `const {\n  paired,\n  other,\n} = obj;`.
  for (const m of body.matchAll(/\{[^{}]*\bpaired\b[^{}]*\}\s*=[^=>]/g)) {
    lines.add(body.slice(0, m.index).split('\n').length);
  }
  return [...lines].sort((a, b) => a - b);
}

describe('paired reads', () => {
  test('no file but the owners of the designation reads or writes GameObject.paired', () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      const text = readFileSync(file, 'utf8');
      const rows = text.split('\n');
      for (const n of fieldLines(text)) {
        offenders.push(`${file.slice(SRC.length + 1)}:${n}: ${(rows[n - 1] ?? '').trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  test('the check does catch the patterns it is about', () => {
    const reads = (line: string) => fieldLines(line).length > 0;
    expect(reads('return obj.paired !== undefined && x;')).toBe(true);
    expect(reads('const w = old.paired?.with;')).toBe(true);
    expect(reads("const w = obj['paired'];")).toBe(true);
    expect(reads('const { paired } = obj;')).toBe(true);
    expect(reads('const { id, paired: link } = obj;')).toBe(true);
    expect(reads('const { id, paired, zone } = obj;')).toBe(true);
    expect(reads('const o = { ...obj, paired: undefined };')).toBe(true);
    expect(reads('setObject(state, { ...o, paired: { with: b, by } });')).toBe(true);
    expect(reads('setObject(state, { ...o, paired });')).toBe(true);
    expect(reads('const x = { paired };')).toBe(true);
    expect(reads('const stored = obj.paired; // stored link')).toBe(true);
    expect(reads('const {\n  id,\n  paired,\n} = obj;')).toBe(true);
  });

  test('the check leaves alone what is not the field', () => {
    const reads = (line: string) => fieldLines(line).length > 0;
    expect(reads('const partner = partnerOf(state, obj);')).toBe(false);
    expect(reads('const unpaired = endBrokenPairs(state);')).toBe(false);
    expect(reads("if (c.kind === 'paired') return partnerOf(state, obj) !== null;")).toBe(false);
    expect(reads("const c = { kind: 'paired' };")).toBe(false);
    expect(reads('// the stored link: obj.paired')).toBe(false);
    expect(reads('const x = isPaired(state, obj); // not obj.paired')).toBe(false);
    expect(reads('const { id } = obj;')).toBe(false);
  });
});
