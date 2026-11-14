// Repeatable modes (D-344, CR 700.2d): "Choose three. You may choose the same mode more than once." The header is read into `ModeChoice.repeatable`; the
// bullets are the ordinary modes (Fiery Confluence, issue 25, a real card of the golden corpus). The engine runs what is lowered in
// convert-grammar-engine-repeatable.test.ts. The other lines are SYNTHETIC siblings and the near misses the grammar must not read.
import { describe, expect, test } from 'vitest';
import { dropped, read, readAll } from './parser-p5-helpers';

const BULLETS =
  '\n• ~ deals 1 damage to each creature.\n• ~ deals 2 damage to each opponent.\n• Destroy target artifact.';
const HEADER = 'Choose three. You may choose the same mode more than once.';

const spellOf = (text: string, type: 'instant' | 'sorcery' = 'sorcery') => {
  const spell = readAll(text, type).spell;
  if (spell === null || spell === undefined) throw new Error(`"${text}" has no spell`);
  return spell;
};

describe('"Choose three. You may choose the same mode more than once." (Fiery Confluence, CR 700.2d)', () => {
  test('the real header: three modes, the same one more than once', () => {
    const spell = spellOf(`${HEADER}${BULLETS}`);
    expect(spell.modes).toHaveLength(3);
    expect(spell.chooseModes).toEqual({ min: 3, max: 3, repeatable: true });
  });

  test('the bullets are the ordinary modes: targets only where a mode has them', () => {
    const spell = spellOf(`${HEADER}${BULLETS}`);
    expect(spell.modes?.[0]?.targets).toBeUndefined();
    expect(spell.modes?.[1]?.targets).toBeUndefined();
    expect(spell.modes?.[2]?.targets).toEqual([
      { id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', types: ['artifact'] } } },
    ]);
  });

  test('"Choose two" with two bullets, and a number of choices above the number of bullets (SYNTHETIC)', () => {
    expect(
      spellOf(
        'Choose two. You may choose the same mode more than once.\n• Draw a card.\n• You gain 3 life.',
      ).chooseModes,
    ).toEqual({ min: 2, max: 2, repeatable: true });
    expect(
      spellOf(
        'Choose five. You may choose the same mode more than once.\n• Draw a card.\n• You gain 3 life.',
      ).chooseModes,
    ).toEqual({ min: 5, max: 5, repeatable: true });
  });

  test('"Choose up to" has a minimum of 0 (SYNTHETIC)', () => {
    expect(
      spellOf(
        'Choose up to three. You may choose the same mode more than once.\n• Draw a card.\n• You gain 3 life.',
      ).chooseModes,
    ).toEqual({ min: 0, max: 3, repeatable: true });
  });

  test('the header on a modal triggered and a modal activated ability (SYNTHETIC)', () => {
    const bullets = '\n• You gain 1 life.\n• Scry 1.';
    const header = 'choose two. You may choose the same mode more than once.';
    expect(readAll(`When ~ enters, ${header}${bullets}`, 'creature').abilities[0]).toMatchObject({
      kind: 'triggered',
      chooseModes: { min: 2, max: 2, repeatable: true },
    });
    expect(
      readAll(`{2}: Choose two. ${header.slice(12)}${bullets}`, 'creature').abilities[0],
    ).toMatchObject({
      kind: 'activated',
      chooseModes: { min: 2, max: 2, repeatable: true },
    });
  });

  test.each([
    'Choose three. You may choose the same mode more than once',
    'Choose three. You may choose the same mode twice.',
    'Choose one. You may choose the same mode more than once.',
    'Choose up to one. You may choose the same mode more than once.',
    'Choose three. You may choose a mode more than once.',
    'Choose X. You may choose the same mode more than once.',
    'Choose eleven. You may choose the same mode more than once.',
    'Choose one or more. You may choose the same mode more than once.',
    'Choose three —',
    'Choose three.',
  ])('another wording is not read: %s', (header) => {
    const text = `${header}${BULLETS}`;
    expect(read(text, 'sorcery').spell).toBeNull();
    expect(dropped(text, 'sorcery').reason).toBe('unrecognised');
  });
});
