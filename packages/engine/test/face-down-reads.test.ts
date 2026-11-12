/**
 * The face-down status of an object is read through `rules/face-down.ts` (CR 708, D-961): the designation (`GameObject.faceDown`) is what hides a card, and a reader that
 * looked at the card behind an object without asking whether it is face down would name it. This test reads the sources of the engine and fails when a file other than those
 * that own the designation reads or writes the field of an object directly. The ones that do: the readers and writers (`rules/face-down.ts`), the invariant that checks the stored
 * status (`invariants.ts`), the scenario builder that places a face-down permanent (`testing/assemble.ts`, `testing/types.ts`) and the type itself (`state/types.ts`).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const OWNERS = new Set([
  join(SRC, 'rules', 'face-down.ts'),
  join(SRC, 'invariants.ts'),
  join(SRC, 'testing', 'assemble.ts'),
  join(SRC, 'testing', 'types.ts'),
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
 * The field read (`obj.faceDown`, `old.faceDown?.by`), read by bracket, destructured (`const { faceDown } = obj`), or written as an object with the shape of the field
 * (`faceDown: { by, n }`). The `faceDown: true` of a view is another field and is not matched, nor is the `faceDown` of the effect that exiles cards face down (D-187), read
 * as `e.faceDown`, `effect.faceDown` or `instruction.faceDown`, nor a path in a message (`${path}.faceDown`).
 */
const FIELD =
  /(?:(?<!\b(?:e|effect|instruction)|\})\??\.faceDown\b|\[\s*['"`]faceDown['"`]\s*\]|\bfaceDown\s*\??:\s*\{|\{[^{}]*\bfaceDown\b[^{}]*\}\s*=[^=>])/;
const COMMENT = /^\s*(?:\/\/|\/?\*)/;

function code(text: string): string {
  return text
    .split('\n')
    .map((line) => (COMMENT.test(line) ? '' : line.replace(/\s\/\/\s.*$/, '')))
    .join('\n');
}

function fieldLines(text: string): number[] {
  const body = code(text);
  const lines: number[] = [];
  const pattern = new RegExp(FIELD.source, 'g');
  for (let m = pattern.exec(body); m !== null; m = pattern.exec(body)) {
    lines.push(body.slice(0, m.index).split('\n').length);
  }
  return [...new Set(lines)];
}

describe('the face-down designation is read only where it is owned', () => {
  test('no other file of the engine reads or writes it', () => {
    const found: string[] = [];
    for (const path of sources(SRC)) {
      for (const line of fieldLines(readFileSync(path, 'utf8'))) {
        found.push(`${path.slice(SRC.length + 1)}:${line}`);
      }
    }
    expect(found).toEqual([]);
  });

  test('the check sees a read, a write, a bracket read and a destructuring, and not a comment or the view field', () => {
    expect(fieldLines('const x = obj.faceDown;')).toEqual([1]);
    expect(fieldLines('const x = obj?.faceDown?.by;')).toEqual([1]);
    expect(fieldLines("const x = obj['faceDown'];")).toEqual([1]);
    expect(fieldLines('const { faceDown } = obj;')).toEqual([1]);
    expect(fieldLines('const o = { ...a, faceDown: { by, n } };')).toEqual([1]);
    expect(fieldLines('// obj.faceDown is read here')).toEqual([]);
    expect(fieldLines('if (effect.faceDown === true) go();')).toEqual([]);
    expect(fieldLines(['const m = `$', '{path}.faceDown`;'].join(''))).toEqual([]);
    expect(fieldLines('const view = { faceDown: true, name };')).toEqual([]);
    expect(fieldLines('const x = shown.hiddenFace;')).toEqual([]);
  });
});
