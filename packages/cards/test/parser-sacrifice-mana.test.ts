// Issue 258 (D-583 to D-587): the line of Radiant Lotus, "{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color for each artifact
// sacrificed this way." (the parenthesis "(Activate only as an instant.)" is reminder text and leaves the line), through the whole pipeline, the near misses the grammar must not
// read, and the features each lowering needs. The engine runs what is lowered in convert-grammar-engine-sacrifice-mana.test.ts.
import { syntheticCard } from '@commander-arena/engine';
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { dropped, read, readAll, withoutFeature } from './parser-p5-helpers';

const LINE =
  '{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way.';

const COLORS = [
  ['W', 'white'],
  ['U', 'blue'],
  ['B', 'black'],
  ['R', 'red'],
  ['G', 'green'],
] as const;

/** The expected `chooseOne` of the five colors: `count` mana of the color for each of `times`, to the target `slot`. */
const chooseColor = (count: number, times: unknown, slot = 't1') => ({
  kind: 'chooseOne',
  options: COLORS.map(([color, label]) => ({
    label,
    effect: {
      kind: 'addMana',
      mana: {
        kind: 'fixed',
        mana: Array.from({ length: count }, () => color),
        ...(times === undefined ? {} : { times }),
      },
      player: { kind: 'target', id: slot },
    },
  })),
});

const ARTIFACTS_COST = {
  kind: 'sacrifice',
  what: { types: ['artifact'] },
  anyNumber: true,
  atLeastOne: true,
};
const COUNT = { kind: 'sacrificedAsCost' };

describe('Radiant Lotus: "{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way."', () => {
  test('the real line: the tap, the sacrifice of one or more artifacts, a target player, and a choice of the five colors of three mana for each artifact sacrificed', () => {
    expect(readAll(LINE, 'artifact').abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }, ARTIFACTS_COST],
        targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
        effect: chooseColor(3, COUNT),
      },
    ]);
  });

  test('it is the ability of the SYNTHETIC Lotus Engine', () => {
    const [ability] = readAll(LINE, 'artifact').abilities;
    expect(ability).toEqual(syntheticCard('SYNTHETIC Lotus Engine').faces[0]?.abilities[0]);
  });

  test('the reminder "(Activate only as an instant.)" is no part of the text and no restriction is added (CR 602.5e: the default timing of an activated ability)', () => {
    const [ability] = readAll(`${LINE} (Activate only as an instant.)`, 'artifact').abilities;
    expect(ability).not.toHaveProperty('timing');
    expect(ability).toMatchObject({ kind: 'activated' });
  });

  test('another number of mana, another kind of permanent and another player (SYNTHETIC)', () => {
    const [ability] = readAll(
      '{T}, Sacrifice one or more creatures: Choose a color. Target opponent adds two mana of the chosen color for each creature sacrificed this way.',
      'artifact',
    ).abilities;
    expect(ability).toEqual({
      kind: 'activated',
      cost: [
        { kind: 'tap' },
        { kind: 'sacrifice', what: { types: ['creature'] }, anyNumber: true, atLeastOne: true },
      ],
      targets: [{ id: 't1', what: { kind: 'player', filter: 'opponent' } }],
      effect: chooseColor(2, COUNT),
    });
  });

  test('"permanents" are any permanents, and "other" leaves the source out (SYNTHETIC)', () => {
    const [ability] = readAll(
      '{T}, Sacrifice one or more other permanents: Choose a color. Target player adds one mana of the chosen color for each permanent sacrificed this way.',
      'artifact',
    ).abilities;
    expect(ability).toMatchObject({
      cost: [
        { kind: 'tap' },
        { kind: 'sacrifice', what: { other: true }, anyNumber: true, atLeastOne: true },
      ],
      effect: chooseColor(1, COUNT),
    });
  });

  test('without "for each" the mana is added once: the number sacrificed is not read (SYNTHETIC)', () => {
    const [ability] = readAll(
      '{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color.',
      'artifact',
    ).abilities;
    expect(ability).toMatchObject({ effect: chooseColor(3, undefined) });
  });

  test('another sentence after the mana is its own instruction, run after the choice (SYNTHETIC)', () => {
    const [ability] = readAll(`${LINE} You gain 1 life.`, 'artifact').abilities;
    expect(ability).toMatchObject({
      effect: {
        kind: 'sequence',
        effects: [chooseColor(3, COUNT), { kind: 'gainLife', player: { kind: 'you' }, amount: 1 }],
      },
    });
  });

  test('the count of the cost is read by other instructions too: "draws a card for each artifact sacrificed this way" (SYNTHETIC)', () => {
    const [ability] = readAll(
      '{T}, Sacrifice one or more artifacts: Target player draws a card for each artifact sacrificed this way.',
      'artifact',
    ).abilities;
    expect(ability).toEqual({
      kind: 'activated',
      cost: [{ kind: 'tap' }, ARTIFACTS_COST],
      targets: [{ id: 't1', what: { kind: 'player', filter: 'any' } }],
      effect: { kind: 'draw', player: { kind: 'target', id: 't1' }, count: COUNT },
    });
    expect(ability).toEqual(syntheticCard('SYNTHETIC Lotus Reader').faces[0]?.abilities[0]);
  });

  test.each([
    // The words name another kind than the cost sacrifices.
    '{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color for each creature sacrificed this way.',
    // A cost of one artifact is no "one or more": nothing says how many were sacrificed this way.
    '{T}, Sacrifice an artifact: Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way.',
    '{T}, Sacrifice two artifacts: Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way.',
    // "You" adds the mana, with no target: that would be a mana ability (CR 605.1a), which is not this shape.
    '{T}, Sacrifice one or more artifacts: Choose a color. You add three mana of the chosen color for each artifact sacrificed this way.',
    '{T}, Sacrifice one or more artifacts: Choose a color. Each player adds three mana of the chosen color for each artifact sacrificed this way.',
    // No color was chosen, or another color is meant.
    '{T}, Sacrifice one or more artifacts: Target player adds three mana of the chosen color for each artifact sacrificed this way.',
    '{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of any color for each artifact sacrificed this way.',
    '{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of that color for each artifact sacrificed this way.',
    '{T}, Sacrifice one or more artifacts: Choose two colors. Target player adds three mana of the chosen color for each artifact sacrificed this way.',
    // Something between the two sentences, or after the mana.
    '{T}, Sacrifice one or more artifacts: Choose a color. You gain 1 life. Target player adds three mana of the chosen color for each artifact sacrificed this way.',
    '{T}, Sacrifice one or more artifacts: Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way and draws a card.',
    '{T}, Sacrifice one or more artifacts: Choose a color. Target player adds X mana of the chosen color for each artifact sacrificed this way.',
    '{T}, Sacrifice one or more artifacts: Choose a color. Target creature adds three mana of the chosen color for each artifact sacrificed this way.',
    '{T}, Sacrifice one or more artifacts: Choose a color. Target player may add three mana of the chosen color for each artifact sacrificed this way.',
    '{T}, Sacrifice one or more artifacts: Choose a color. If you control an artifact, target player adds three mana of the chosen color for each artifact sacrificed this way.',
    // An instruction of the text also sacrifices: "this way" could be either.
    '{T}, Sacrifice one or more artifacts: Choose a color. Sacrifice an artifact. Target player adds three mana of the chosen color for each artifact sacrificed this way.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'artifact');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test.each([
    // "One or more" is not a number of an activated ability's sacrifice of its own permanent, an opponent's or a target.
    '{T}, Sacrifice one or more target artifacts: Draw a card.',
    '{T}, Sacrifice one or more artifacts an opponent controls: Draw a card.',
    '{T}, Sacrifice any number of artifacts: Draw a card.',
    '{T}, Sacrifice one or more: Draw a card.',
  ])('another cost is dropped (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'artifact');
    expect(parsed.abilities, text).toEqual([]);
    expect(parsed.unparsed, text).toHaveLength(1);
  });

  test('it is not a mana ability, nor the cost of a spell or a keyword (SYNTHETIC)', () => {
    expect(read('{T}, Sacrifice one or more artifacts: Add {C}.', 'artifact').abilities).toEqual(
      [],
    );
    const spell = read(
      'Choose a color. Target player adds three mana of the chosen color for each artifact sacrificed this way.',
      'instant',
    );
    expect(spell.spell).toBeNull();
    expect(spell.unparsed).toHaveLength(1);
  });

  test('the sentence "Choose a color." alone, and the mana alone, are reported as a color the engine cannot choose', () => {
    expect(dropped('{T}: Choose a color.', 'artifact').needs).toContain('selector:colorChoice');
    expect(
      dropped(
        '{T}, Sacrifice one or more artifacts: Target player adds three mana of the chosen color.',
        'artifact',
      ).needs,
    ).toContain('selector:colorChoice');
  });

  test('the lowering names the engine feature each part needs', () => {
    for (const ref of [
      'ability:sacrificeOneOrMore',
      'effect:chooseOne',
      'effect:addMana',
      'amount:sacrificedAsCost',
      'cost:sacrifice',
    ]) {
      const missing = withoutFeature(ref, LINE, 'artifact');
      expect(missing, ref).toMatchObject({ reason: 'notRunnable' });
      expect(missing.needs, ref).toContain(ref);
    }
  });
});
