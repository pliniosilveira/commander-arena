/**
 * The controller of a permanent is derived (CR 613.1b, `rules/control.ts`): the rules read it through `controllerOf`, never from the stored
 * `GameObject.controller` (the player it entered under). This test reads the sources of the engine and fails when one reads the field of an object
 * directly, so a new rule cannot forget a control-changing effect. A raw read that is meant (the last-known information, which was frozen with the
 * effective controller when the object left) says so with the comment `stored controller` on the same line.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const SKIP = new Set([join(SRC, 'rules', 'control.ts'), join(SRC, 'cards'), join(SRC, 'testing')]);

function sources(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (SKIP.has(path)) continue;
    if (statSync(path).isDirectory()) out.push(...sources(path));
    else if (name.endsWith('.ts')) out.push(path);
  }
  return out;
}

/** The names the engine gives to a GameObject (or to its last-known copy) when it reads whose it is. */
const OBJECT_NAMES =
  /\b(obj|object|permanent|target|blocker|attacker|land|host|live|old|created|attachment|subject|tapped|found\.object|src\.object|source\.object|lki\.object)\.controller\b/;

describe('control reads', () => {
  test('no rule reads GameObject.controller directly', () => {
    const offenders: string[] = [];
    for (const file of sources(SRC)) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (OBJECT_NAMES.test(line) && !line.includes('stored controller')) {
            offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`);
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
