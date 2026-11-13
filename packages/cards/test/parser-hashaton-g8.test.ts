// The Hashaton deck (issue 31), group 8 (provisional D-1140 to D-1144): Victimize, "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do,
// return the chosen cards to the battlefield tapped.", and Vohar, Vodalian Desecrator, "{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card
// this way, each opponent loses 1 life and you gain 1 life." and "{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. If that
// spell would be put into your graveyard, exile it instead. Activate only as a sorcery.". The first line of each is the real Oracle text of the acceptance card of the golden
// corpus read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-hashaton-g8.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { DECLARED_NEEDS } from '../src/convert/parser/index';
import { BLOCKED } from './blocked-features';
import { read, readAll, withoutFeature } from './parser-p5-helpers';

const T1 = { kind: 'target', id: 't1' } as const;
const YOU = { kind: 'you' } as const;
const TWO_CREATURE_CARDS = {
  id: 't1',
  what: { kind: 'object', filter: { zone: 'graveyard', types: ['creature'], controller: 'you' } },
  min: 2,
  max: 2,
};
const REAL_VICTIMIZE =
  'Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.';

describe('Victimize: "Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped." (CR 115.1, 608.2c, 701.21a)', () => {
  test('the real text: two targets of the spell, the sacrifice, and the return on "if you do"', () => {
    const parsed = readAll(REAL_VICTIMIZE, 'sorcery');
    expect(parsed.spell).toEqual({
      targets: [TWO_CREATURE_CARDS],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'sacrifice', objects: { kind: 'choose', filter: { types: ['creature'] } } },
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: {
              kind: 'moveToZone',
              objects: T1,
              to: 'battlefield',
              controller: 'you',
              tapped: true,
            },
          },
        ],
      },
    });
  });

  test('other counts, types and a return that is not tapped (SYNTHETIC)', () => {
    const three = readAll(
      'Choose three target land cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield.',
      'sorcery',
    );
    expect(three.spell).toMatchObject({
      targets: [
        {
          id: 't1',
          what: { filter: { zone: 'graveyard', types: ['land'], controller: 'you' } },
          min: 3,
          max: 3,
        },
      ],
    });
    expect(JSON.stringify(three.spell)).not.toContain('tapped');
    const artifact = readAll(
      'Choose two target artifact cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.',
      'instant',
    );
    expect(artifact.spell).toMatchObject({
      targets: [{ what: { filter: { types: ['artifact'] } }, min: 2, max: 2 }],
    });
  });

  test.each([
    // the cards: whose graveyard, how many, up to
    'Choose two target creature cards from your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.',
    "Choose two target creature cards in an opponent's graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.",
    'Choose two target creature cards in a graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.',
    'Choose up to two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.',
    // the return: where, which cards
    'Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to your hand.',
    'Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen card to the battlefield tapped.',
    // the sacrifice: a target
    'Choose two target creature cards in your graveyard. Sacrifice target creature. If you do, return the chosen cards to the battlefield tapped.',
    // "the chosen cards" that are not cards of a graveyard
    'Destroy two target creatures. Return the chosen cards to the battlefield tapped.',
    // "those cards" with nothing chosen
    'Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'sorcery');
    expect(parsed.spell ?? undefined).toBeUndefined();
    expect(parsed.unparsed).toHaveLength(1);
  });

  test('without the condition or the sacrifice the sentences say what they say (SYNTHETIC): the cards return whatever happens', () => {
    const always = readAll(
      'Choose two target creature cards in your graveyard. Return the chosen cards to the battlefield tapped.',
      'sorcery',
    );
    expect(always.spell).toMatchObject({
      targets: [TWO_CREATURE_CARDS],
      effect: { kind: 'moveToZone', objects: T1, to: 'battlefield', tapped: true },
    });
    const sacrificeFirst = readAll(
      'Choose two target creature cards in your graveyard. Sacrifice a creature. Return the chosen cards to the battlefield tapped.',
      'sorcery',
    );
    expect(JSON.stringify(sacrificeFirst.spell)).not.toContain('conditional');
  });

  test('"Choose two target creature cards" alone only names the targets: its effect is empty, which the engine does not accept as a card (SYNTHETIC)', () => {
    const parsed = readAll('Choose two target creature cards in your graveyard.', 'sorcery');
    expect(parsed.spell?.effect).toEqual({ kind: 'sequence', effects: [] });
  });
});

describe('Vohar: "{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card this way, each opponent loses 1 life and you gain 1 life." (CR 608.2c, 701.9)', () => {
  const LOOT =
    '{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card this way, each opponent loses 1 life and you gain 1 life.';

  test('the real text: a loot, then the drain on the count of instant and sorcery cards discarded', () => {
    const parsed = readAll(LOOT, 'creature', ['Phyrexian', 'Merfolk', 'Wizard']);
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'draw', player: YOU, count: 1 },
            { kind: 'discard', player: YOU, count: 1 },
            {
              kind: 'conditional',
              condition: { kind: 'thisWayAtLeast', what: 'discardedInstantOrSorcery', count: 1 },
              effect: {
                kind: 'sequence',
                effects: [
                  { kind: 'loseLife', player: { kind: 'eachOpponent' }, amount: 1 },
                  { kind: 'gainLife', player: YOU, amount: 1 },
                ],
              },
            },
          ],
        },
      },
    ]);
  });

  test('another amount of life (SYNTHETIC)', () => {
    const parsed = readAll(
      '{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card this way, each opponent loses 2 life and you gain 2 life.',
      'creature',
      ['Wizard'],
    );
    expect(JSON.stringify(parsed.abilities[0])).toContain('"amount":2');
  });

  test.each([
    // which cards
    '{T}: Draw a card, then discard a card. If you discarded an instant card this way, each opponent loses 1 life and you gain 1 life.',
    '{T}: Draw a card, then discard a card. If you discarded a sorcery or instant card this way, each opponent loses 1 life and you gain 1 life.',
    '{T}: Draw a card, then discard a card. If you discarded two instant or sorcery cards this way, each opponent loses 1 life and you gain 1 life.',
    // not "this way"
    '{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card, each opponent loses 1 life and you gain 1 life.',
    '{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card this turn, each opponent loses 1 life and you gain 1 life.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature', ['Wizard']);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('Vohar: "{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead. Activate only as a sorcery." (CR 601.2, 611.2a, 614.1a, 602.5d)', () => {
  const REAL =
    '{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead. Activate only as a sorcery.';
  const SPELL_CARD = {
    id: 't1',
    what: {
      kind: 'object',
      filter: {
        zone: 'graveyard',
        controller: 'you',
        anyOf: [{ types: ['instant'] }, { types: ['sorcery'] }],
      },
    },
  };

  test('the real text: a cost with a sacrifice, a target, the permission with its rider, at sorcery timing', () => {
    const parsed = readAll(REAL, 'creature', ['Phyrexian', 'Merfolk', 'Wizard']);
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        targets: [SPELL_CARD],
        effect: { kind: 'mayCast', objects: T1, duration: 'untilEndOfTurn', exileInstead: true },
        timing: 'sorcery',
      },
    ]);
  });

  test('without the rider the permission is the old one, with no exile (SYNTHETIC)', () => {
    const parsed = readAll(
      '{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. Activate only as a sorcery.',
      'creature',
      ['Wizard'],
    );
    expect(parsed.abilities[0]).toMatchObject({
      effect: { kind: 'mayCast', objects: T1, duration: 'untilEndOfTurn' },
    });
    expect(JSON.stringify(parsed.abilities[0])).not.toContain('exileInstead');
  });

  test('"until end of turn", a tap cost and no timing (SYNTHETIC)', () => {
    const parsed = readAll(
      '{T}: You may cast target creature card from your graveyard until end of turn. If that spell would be put into your graveyard, exile it instead.',
      'creature',
      ['Wizard'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'activated',
        cost: [{ kind: 'tap' }],
        targets: [
          {
            id: 't1',
            what: {
              kind: 'object',
              filter: { zone: 'graveyard', types: ['creature'], controller: 'you' },
            },
          },
        ],
        effect: { kind: 'mayCast', objects: T1, duration: 'untilEndOfTurn', exileInstead: true },
      },
    ]);
  });

  test('a spell of the same two sentences keeps the rider with the permission (SYNTHETIC)', () => {
    const parsed = readAll(
      'You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead.',
      'sorcery',
    );
    expect(parsed.spell).toEqual({
      targets: [SPELL_CARD],
      effect: { kind: 'mayCast', objects: T1, duration: 'untilEndOfTurn', exileInstead: true },
    });
  });

  test('the rider in a trigger: "you may" there is the ability\'s own question, so it is not this rule (SYNTHETIC)', () => {
    const parsed = read(
      'When this creature enters, you may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead.',
      'creature',
      ['Wizard'],
    );
    expect(JSON.stringify(parsed.abilities)).not.toContain('"mayCast"');
  });

  test.each([
    // the rider: another zone, another outcome, not the spell
    '{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into a graveyard, exile it instead.',
    '{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, put it on the bottom of your library instead.',
    '{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead, then draw a card.',
    '{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. If it would be put into your graveyard, exile it instead.',
    '{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard this turn. Exile it instead.',
    // the permission: whose graveyard, how long, how many
    '{2}, Sacrifice ~: You may cast target instant or sorcery card from a graveyard this turn. If that spell would be put into your graveyard, exile it instead.',
    '{2}, Sacrifice ~: You may cast target instant or sorcery card from your graveyard. If that spell would be put into your graveyard, exile it instead.',
    '{2}, Sacrifice ~: You may cast two target instant or sorcery cards from your graveyard this turn. If that spell would be put into your graveyard, exile it instead.',
    // the rider without a permission
    '{2}, Sacrifice ~: Draw a card. If that spell would be put into your graveyard, exile it instead.',
  ])('another wording is dropped, never half read (SYNTHETIC): %s', (text) => {
    const parsed = read(text, 'creature', ['Wizard']);
    expect(parsed.abilities).toEqual([]);
    expect(parsed.unparsed).toHaveLength(1);
  });
});

describe('a line whose engine feature is not listed names it (D-068)', () => {
  const CASES = [
    [
      'effect:mayCast',
      '{T}: You may cast target instant or sorcery card from your graveyard this turn. If that spell would be put into your graveyard, exile it instead.',
      'creature',
    ],
    [
      'condition:thisWayAtLeast',
      '{T}: Draw a card, then discard a card. If you discarded an instant or sorcery card this way, you gain 1 life.',
      'creature',
    ],
    ['effect:conditional', REAL_VICTIMIZE, 'sorcery'],
    ['selector:target', REAL_VICTIMIZE, 'sorcery'],
  ] as const;

  test.each(CASES)('without %s', (ref, text, type) => {
    const missing = withoutFeature(ref, text, type, ['Wizard']);
    expect(missing).toMatchObject({ reason: 'notRunnable' });
    expect(missing.needs).toContain(ref);
  });

  test('a blocked line leaves the face with no ability (never half-executed)', () => {
    for (const [ref, text, type] of CASES) {
      BLOCKED.clear();
      BLOCKED.add(ref);
      try {
        const parsed = read(text, type, ['Wizard']);
        expect(parsed.abilities, `${ref}: ${text}`).toEqual([]);
      } finally {
        BLOCKED.clear();
      }
    }
  });

  test('every feature the lowering of this slice names is declared', () => {
    for (const ref of [
      'effect:mayCast',
      'condition:thisWayAtLeast',
      'effect:conditional',
      'selector:target',
    ] as const) {
      expect(DECLARED_NEEDS, ref).toContain(ref);
    }
  });
});
