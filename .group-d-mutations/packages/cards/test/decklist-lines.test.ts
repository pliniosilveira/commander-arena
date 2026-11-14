/** Unit tests for the entry scanner rules and name normalization (SPEC 6.1). */
import { describe, expect, test } from 'vitest';
import { frontFaceName, normalizeCardName, parseDecklist } from '../src/decklist/index';

/** Parse one line as the main deck and return its single entry (or the error). */
function one(line: string) {
  const parsed = parseDecklist(line);
  const entry = parsed.sections.main[0] ?? parsed.sections.commander[0];
  return { entry, errors: parsed.errors, parsed };
}

describe('quantity', () => {
  test.each([
    ['1 Sol Ring', 1],
    ['1x Sol Ring', 1],
    ['1X Sol Ring', 1],
    ['1× Sol Ring', 1],
    ['12 Island', 12],
    ['3xIsland', 3],
    ['Sol Ring', 1],
    ['1\tSol Ring', 1],
    ['  4   Forest  ', 4],
  ])('%j has quantity %i', (line, count) => {
    const { entry, errors } = one(line);
    expect(errors).toEqual([]);
    expect(entry?.count).toBe(count);
    expect(entry?.name).toMatch(/^(Sol Ring|Island|Forest)$/);
  });

  test('a name-only line has quantity 1', () => {
    expect(one('Sol Ring').entry).toMatchObject({ name: 'Sol Ring', count: 1, set: null });
  });

  test.each([
    ['0 Sol Ring', 'quantity must be at least 1'],
    ['0x Sol Ring', 'quantity must be at least 1'],
    ['-1 Sol Ring', 'quantity must be a positive whole number'],
    ['1.5 Sol Ring', 'quantity must be a whole number'],
    ['4Lightning Bolt', 'a quantity must be followed by a space and the card name'],
    ['99999 Island', 'quantity 99999 is not a plausible card count'],
    ['1x', 'missing card name'],
    ['2', 'missing card name'],
    ['1 (CMR) 472', 'missing card name'],
    ['1 [Ramp]', 'missing card name'],
    ['1 ---', 'the card name has no letters or digits'],
  ])('%j is an error: %s', (line, message) => {
    const { entry, errors } = one(line);
    expect(entry).toBeUndefined();
    expect(errors).toEqual([{ line: 1, text: line, message }]);
  });
});

describe('set codes, collector numbers and foil markers', () => {
  test('set code and collector number', () => {
    expect(one('1 Sol Ring (CMR) 472').entry).toMatchObject({
      name: 'Sol Ring',
      set: 'cmr',
      collector: '472',
      foil: false,
    });
  });

  test('a set code without a collector number', () => {
    expect(one('1 Sol Ring (CMR)').entry).toMatchObject({ set: 'cmr', collector: null });
  });

  test.each(['123a', '★12', 'T5', '12-3'])('collector number %s as written', (number) => {
    expect(one(`1 Sol Ring (CMR) ${number}`).entry?.collector).toBe(number);
  });

  test.each([
    ['1 Sol Ring (CMR) 472 *F*', true],
    ['1 Sol Ring (CMR) 472 *E*', true],
    ['1 Sol Ring (CMR) 472 *f*', true],
    ['1 Sol Ring (CMR) 472 (F)', true],
    ['1 Sol Ring (CMR) 472 (E)', true],
    ['1 Sol Ring (CMR) 472 (foil)', true],
    ['1 Sol Ring *F*', true],
    ['1 Sol Ring (CMR) 472', false],
  ])('%j has foil %s and the same name', (line, foil) => {
    const { entry, errors } = one(line);
    expect(errors).toEqual([]);
    expect(entry).toMatchObject({ name: 'Sol Ring', foil });
  });

  test('an unknown asterisk marker is ignored', () => {
    expect(one('1 Sol Ring *A*')).toMatchObject({ entry: { name: 'Sol Ring' }, errors: [] });
  });

  test('parentheses that belong to a name stay in the name', () => {
    expect(one('1 B.F.M. (Big Furry Monster)').entry?.name).toBe('B.F.M. (Big Furry Monster)');
  });

  test('decorations glued to the name still split', () => {
    expect(one('1 Sol Ring(CMR)472[Ramp]').entry).toMatchObject({
      name: 'Sol Ring',
      set: 'cmr',
      collector: '472',
      tags: ['Ramp'],
    });
  });

  test('a second set code is an error', () => {
    expect(one('1 Sol Ring (CMR) (C21)').errors[0]?.message).toBe('more than one set code');
  });
});

describe('tags', () => {
  test('bracket category', () => {
    expect(one('1x Sol Ring (cmr) 472 [Ramp]').entry).toMatchObject({
      name: 'Sol Ring',
      set: 'cmr',
      tags: ['Ramp'],
    });
  });

  test('several categories and modifiers', () => {
    expect(one('1x Sol Ring [Ramp, Artifact{noPrice}]').entry?.tags).toEqual(['Ramp', 'Artifact']);
  });

  test('Archidekt caret tags drop the color', () => {
    expect(one('1x Sol Ring (cmr) 472 [Ramp] ^Have,#37d67a^').entry?.tags).toEqual([
      'Ramp',
      'Have',
    ]);
  });

  test('hash tags', () => {
    expect(one('1 Sol Ring #Ramp #Mana').entry).toMatchObject({
      name: 'Sol Ring',
      tags: ['Ramp', 'Mana'],
    });
    expect(one('1 Sol Ring (CMR) 472 #Ramp').entry?.tags).toEqual(['Ramp']);
  });

  test('repeated tags are kept once', () => {
    expect(one('1 Sol Ring [Ramp] #Ramp').entry?.tags).toEqual(['Ramp']);
  });

  test.each([
    ['1 Sol Ring [Ramp', 'unclosed bracket'],
    ['1 Sol Ring ^Ramp', 'unclosed ^ tag group'],
    ['1 Sol Ring *F', 'unclosed * marker'],
    ['1 Sol Ring (CMR', 'unclosed parenthesis'],
    ['1 Sol Ring ()', 'empty parentheses'],
    ['1 Sol Ring]', 'unmatched closing bracket'],
    ['1 Sol Ring (CMR) 472 extra', 'unexpected text "extra" after the card details'],
    ['1 Sol Ring [Ramp] more', 'unexpected text "more" after the card details'],
  ])('%j is an error: %s', (line, message) => {
    expect(one(line).errors).toEqual([{ line: 1, text: line, message }]);
  });
});

describe('commander tags', () => {
  test.each([
    '1 Atraxa *CMDR*',
    '1 Atraxa (C16) 28 *cmdr*',
    '1x Atraxa [Commander{top}]',
    '1x Atraxa [Ramp, Commander]',
    '1 Atraxa #commander',
    '1 Atraxa #Commander',
  ])('%j goes to the commander section', (line) => {
    const parsed = parseDecklist(line);
    expect(parsed.errors).toEqual([]);
    expect(parsed.hasCommanderMarking).toBe(true);
    expect(parsed.sections.commander.map((e) => e.name)).toEqual(['Atraxa']);
    expect(parsed.sections.main).toEqual([]);
  });

  test('without any marking nothing is guessed', () => {
    const parsed = parseDecklist('1 Atraxa, Praetors’ Voice\n1 Sol Ring');
    expect(parsed.hasCommanderMarking).toBe(false);
    expect(parsed.sections.commander).toEqual([]);
    expect(parsed.sections.main).toHaveLength(2);
  });
});

describe('normalizeCardName', () => {
  test.each([
    ['Atraxa, Praetors’ Voice', "Atraxa, Praetors' Voice"],
    ['Atraxa, Praetors‘ Voice', "Atraxa, Praetors' Voice"],
    ['Atraxa, Praetors` Voice', "Atraxa, Praetors' Voice"],
    ['“Ach! Hans, Run!”', '"Ach! Hans, Run!"'],
    ['  Sol   Ring  ', 'Sol Ring'],
    ['Sol Ring\t', 'Sol Ring'],
    ['Sol​ Ring', 'Sol Ring'],
    ['Will‑o’‑the‑Wisp', "Will-o'-the-Wisp"],
    ['Fire/Ice', 'Fire // Ice'],
    ['Fire / Ice', 'Fire // Ice'],
    ['Fire // Ice', 'Fire // Ice'],
    ['Fire /// Ice', 'Fire // Ice'],
    ['Fire///Ice', 'Fire // Ice'],
    ['Who/What/When/Where/Why', 'Who // What // When // Where // Why'],
    ['Delver of Secrets//Insectile Aberration', 'Delver of Secrets // Insectile Aberration'],
    ['Fire // ', 'Fire'],
    ['Lim-Dûl’s Vault', "Lim-Dûl's Vault"],
    ['Lim-Dûl’s Vault', "Lim-Dûl's Vault"],
    ['', ''],
  ])('%j becomes %j', (raw, expected) => {
    expect(normalizeCardName(raw)).toBe(expected);
  });

  test('is idempotent', () => {
    const once = normalizeCardName('  Fire/// Ice’s ');
    expect(normalizeCardName(once)).toBe(once);
  });

  test('parsed lines use the normalized name', () => {
    expect(one('1 Delver of Secrets/Insectile Aberration').entry?.name).toBe(
      'Delver of Secrets // Insectile Aberration',
    );
    expect(one('1 Lim-Dûl’s   Vault').entry?.name).toBe("Lim-Dûl's Vault");
  });
});

describe('frontFaceName', () => {
  test.each([
    ['Fire // Ice', 'Fire'],
    ['Fire/Ice', 'Fire'],
    ['Fire /// Ice', 'Fire'],
    ['Delver of Secrets // Insectile Aberration', 'Delver of Secrets'],
    ['Who // What // When // Where // Why', 'Who'],
    ['Sol Ring', 'Sol Ring'],
    ['Atraxa, Praetors’ Voice', "Atraxa, Praetors' Voice"],
    ['', ''],
  ])('%j gives %j', (name, front) => {
    expect(frontFaceName(name)).toBe(front);
  });
});
