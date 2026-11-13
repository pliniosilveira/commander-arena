// The Danitha deck (issue 26), group 6 (D-1260, D-1261 provisional): the lines of Kutzil, Malamet Exemplar and Gift of the Viper. The first lines of each block are the real
// Oracle text of the acceptance cards of the golden corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not
// read. The engine runs what is lowered in convert-grammar-engine-danitha-g6.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { dropped, read, readAll, withoutFeature } from './parser-p5-helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const BASE_CREATURES = { types: ['creature'], controller: 'you', powerAboveBase: true } as const;

describe('Kutzil: "one or more creatures you control each with power greater than its base power deals combat damage to a player" (CR 208.4b, 603.2c)', () => {
  const LINE =
    'Whenever one or more creatures you control each with power greater than its base power deals combat damage to a player, draw a card.';

  test('the real line: a batch trigger over the creatures above their base power, and the draw', () => {
    const parsed = readAll(LINE, 'creature');
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'combatDamageBatch', what: BASE_CREATURES, to: 'player' },
        effect: { kind: 'draw', player: { kind: 'you' }, count: 1 },
      },
    ]);
  });

  test('the other line of the card: opponents cannot cast spells during your turn', () => {
    const parsed = readAll("Your opponents can't cast spells during your turn.", 'creature');
    expect(parsed.abilities).toEqual([
      { kind: 'static', static: { kind: 'opponentsCantCastOnYourTurn' } },
    ]);
  });

  test.each([
    [
      'Whenever one or more creatures you control with power greater than its base power deal combat damage to an opponent, you gain 1 life.',
      'opponent',
    ],
    [
      'Whenever one or more creatures you control each with power greater than its base power deals combat damage to a player, draw a card.',
      'player',
    ],
  ])('the same trigger with another wording (SYNTHETIC): %s', (text, to) => {
    const parsed = readAll(text, 'enchantment');
    expect(parsed.abilities[0]).toMatchObject({
      trigger: { kind: 'combatDamageBatch', what: BASE_CREATURES, to },
    });
  });

  test('"with power greater than its base power" on a target (SYNTHETIC)', () => {
    const parsed = readAll('Destroy target creature with power greater than its base power.');
    expect(parsed.spell).toEqual({
      targets: [
        {
          id: 't1',
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', types: ['creature'], powerAboveBase: true },
          },
        },
      ],
      effect: { kind: 'destroy', objects: T1 },
    });
  });

  test('"creature you control with power greater than its base power" and the order of the control words (SYNTHETIC)', () => {
    const parsed = readAll(
      'Destroy target creature you control with power greater than its base power.',
    );
    expect(parsed.spell?.targets?.[0]).toMatchObject({
      what: {
        filter: { types: ['creature'], controller: 'you', powerAboveBase: true },
      },
    });
  });

  test.each([
    // another number, another value
    'Whenever one or more creatures you control each with power greater than 3 deals combat damage to a player, draw a card.',
    'Whenever one or more creatures you control each with power greater than its toughness deals combat damage to a player, draw a card.',
    'Whenever one or more creatures you control each with power greater than that creature’s base power deal combat damage to a player, draw a card.',
    // the words that make a different test
    'Whenever one or more creatures you control each with power less than its base power deal combat damage to a player, draw a card.',
    'Whenever one or more creatures you control each with toughness greater than its base toughness deal combat damage to a player, draw a card.',
    // the wording of the singular and of the plural
    'Whenever a creature you control each with power greater than its base power deals combat damage to a player, draw a card.',
    // damage that is not combat damage, or not to a player
    'Whenever one or more creatures you control each with power greater than its base power deal damage to a player, draw a card.',
    'Whenever one or more creatures you control each with power greater than its base power deals combat damage to a creature, draw a card.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'enchantment');
    expect(parsed.unparsed.length).toBeGreaterThan(0);
    expect(parsed.abilities.filter((a) => a.kind === 'triggered')).toEqual([]);
  });

  test('the line names the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('selector:powerAboveBase', LINE, 'creature');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('selector:powerAboveBase');
    expect(DECLARED_NEEDS).toContain('selector:powerAboveBase');
  });
});

describe('Gift of the Viper: "Put a +1/+1 counter, a reach counter, and a deathtouch counter on target creature." (CR 122.6, 122.1b)', () => {
  const LINE =
    'Put a +1/+1 counter, a reach counter, and a deathtouch counter on target creature. Untap it.';
  const counter = (name: string) => ({
    kind: 'addCounters',
    objects: T1,
    counter: name,
    count: 1,
  });

  test('the real text: one counter of each kind on the target, in the order written, and the untap', () => {
    const parsed = readAll(LINE);
    expect(parsed.spell).toEqual({
      targets: [
        {
          id: 't1',
          what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
        },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          counter('+1/+1'),
          counter('reach'),
          counter('deathtouch'),
          { kind: 'untap', objects: T1 },
        ],
      },
    });
  });

  test.each([
    ['Put a flying counter and a lifelink counter on target creature.', ['flying', 'lifelink']],
    [
      'Put a first strike counter, a double strike counter, and a trample counter on target creature.',
      ['first strike', 'double strike', 'trample'],
    ],
    [
      'Put an exalted counter and a vigilance counter on target creature.',
      ['exalted', 'vigilance'],
    ],
  ])('other lists and the keyword counters of two words (SYNTHETIC): %s', (text, names) => {
    const parsed = readAll(text);
    expect(parsed.spell?.targets).toHaveLength(1);
    expect(parsed.spell?.effect).toEqual({
      kind: 'sequence',
      effects: names.map(counter),
    });
  });

  test('a list on this permanent: both counters go on it (SYNTHETIC)', () => {
    const parsed = readAll(
      'When ~ enters, put a reach counter and a deathtouch counter on ~.',
      'creature',
    );
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'addCounters', objects: { kind: 'this' }, counter: 'reach', count: 1 },
          { kind: 'addCounters', objects: { kind: 'this' }, counter: 'deathtouch', count: 1 },
        ],
      },
    });
  });

  test('one counter with two words of name is read too: "put a first strike counter on target creature" (SYNTHETIC)', () => {
    expect(readAll('Put a first strike counter on target creature.').spell?.effect).toEqual(
      counter('first strike'),
    );
  });

  test.each([
    // a count other than one
    'Put two reach counters and a deathtouch counter on target creature.',
    // a card or a word that is not a counter
    'Put a reach counter and a card on target creature.',
    'Put a reach counter and deathtouch on target creature.',
    // two objects, an object that is not a single noun
    'Put a reach counter and a deathtouch counter on target creature and target land.',
    'Put a reach counter and a deathtouch counter on each creature you control.',
    // another instruction after the list in the same sentence, without a join
    'Put a reach counter and a deathtouch counter on target creature, then it fights.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text);
    expect(parsed.unparsed.length).toBeGreaterThan(0);
    expect(parsed.spell ?? null).toBeNull();
  });

  test('a keyword counter the engine cannot run is dropped, not read as a plain counter (CR 122.1b: decayed)', () => {
    const first = dropped('Put a decayed counter on target creature.');
    expect(first).toMatchObject({ reason: 'notRunnable' });
    const list = read('Put a decayed counter and a reach counter on target creature.');
    expect(list.unparsed.length).toBeGreaterThan(0);
    expect(list.spell ?? null).toBeNull();
  });

  test('the counters name the feature the engine lacks (D-068)', () => {
    const missing = withoutFeature('effect:addCounters', LINE, 'instant');
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain('effect:addCounters');
    expect(DECLARED_NEEDS).toContain('effect:addCounters');
  });
});
