// The Hashaton deck program (issue 31), group 5 (D-1160 to D-1163, provisional): Eternalize (Champion of Wits), "Whenever you discard a creature card, you may pay {2}{U}. If you
// do, create a tapped token that's a copy of that card, except it's a 4/4 black Zombie." (Hashaton, Scarab's Fist) and "At the beginning of your end step, for each token you
// control of the chosen type that entered this turn, create a token that's a copy of it." (Renewed Solidarity). The lines are the real Oracle text of the acceptance cards of the
// golden corpus, read through the whole pipeline; the other lines are SYNTHETIC siblings and the near misses the grammar must not read. The engine runs what is lowered in
// convert-grammar-engine-hashaton-g5.test.ts.
import { describe, expect, test } from 'vitest';
import { dropped, readAll } from './parser-p5-helpers';

const TRIGGER_SUBJECT = { kind: 'triggerSubject' } as const;

describe('Eternalize (CR 702.129a)', () => {
  test('the real line of Champion of Wits, with its reminder text: the keyword with its cost', () => {
    const parsed = readAll(
      'Eternalize {5}{U}{U} ({5}{U}{U}, Exile this card from your graveyard: Create a token that’s a copy of it, except it’s a 4/4 black Zombie Snake Wizard with no mana cost. Eternalize only as a sorcery.)',
      'creature',
      ['Snake', 'Wizard'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'keyword',
        keyword: { kind: 'eternalize', cost: [{ kind: 'mana', symbols: ['5', 'U', 'U'] }] },
      },
    ]);
  });

  test('other costs (SYNTHETIC)', () => {
    expect(readAll('Eternalize {2}', 'creature').abilities).toEqual([
      {
        kind: 'keyword',
        keyword: { kind: 'eternalize', cost: [{ kind: 'mana', symbols: ['2'] }] },
      },
    ]);
    expect(readAll('Eternalize {4}{B}', 'creature').abilities).toHaveLength(1);
  });

  test('it sits beside the enters trigger of the real card', () => {
    const parsed = readAll(
      'When this creature enters, you may draw cards equal to its power. If you do, discard two cards.\nEternalize {5}{U}{U} ({5}{U}{U}, Exile this card from your graveyard: Create a token that’s a copy of it, except it’s a 4/4 black Zombie Snake Wizard with no mana cost. Eternalize only as a sorcery.)',
      'creature',
      ['Snake', 'Wizard'],
    );
    expect(parsed.abilities).toHaveLength(2);
    expect(parsed.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield' },
      effect: {
        kind: 'sequence',
        effects: [
          {
            kind: 'may',
            effect: { kind: 'draw', count: { kind: 'powerOf', of: { kind: 'this' } } },
          },
          {
            kind: 'conditional',
            condition: { kind: 'didPrevious' },
            effect: { kind: 'discard', count: 2 },
          },
        ],
      },
    });
    expect(parsed.abilities[1]).toMatchObject({ keyword: { kind: 'eternalize' } });
  });

  test.each([
    'Eternalize',
    'Eternalize {X}{U}',
    'Eternalize {U/B}',
    'Eternalize—Pay 2 life.',
    'Eternalize {5}{U}{U}, haste',
    'Eternalize {5}{U}{U} and flying',
    'Eternalized {5}{U}{U}',
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"Whenever you discard a creature card" (CR 701.9a)', () => {
  test('the real trigger and its ability: may pay, then a tapped copy that is a 4/4 black Zombie', () => {
    const parsed = readAll(
      'Whenever you discard a creature card, you may pay {2}{U}. If you do, create a tapped token that’s a copy of that card, except it’s a 4/4 black Zombie.',
      'creature',
      ['Zombie', 'Wizard'],
    );
    expect(parsed.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'discarded', who: 'you', filter: { types: ['creature'] } },
        effect: {
          kind: 'mayPay',
          cost: [{ kind: 'mana', symbols: ['2', 'U'] }],
          effect: {
            kind: 'createToken',
            token: {
              kind: 'copyOf',
              object: TRIGGER_SUBJECT,
              setPt: { power: 4, toughness: 4 },
              setColors: ['B'],
              setCreatureTypes: ['Zombie'],
            },
            count: 1,
            tapped: true,
          },
        },
      },
    ]);
  });

  test('"a card" has no filter; another kind of card, an opponent and a player (SYNTHETIC)', () => {
    const any = readAll('Whenever you discard a card, you gain 1 life.', 'creature');
    expect(any.abilities[0]).toMatchObject({ trigger: { kind: 'discarded', who: 'you' } });
    expect((any.abilities[0] as { trigger: { filter?: unknown } }).trigger.filter).toBeUndefined();
    const land = readAll('Whenever you discard a land card, you gain 1 life.', 'creature');
    expect(land.abilities[0]).toMatchObject({
      trigger: { kind: 'discarded', who: 'you', filter: { types: ['land'] } },
    });
    const art = readAll(
      'Whenever an opponent discards an artifact card, you gain 1 life.',
      'creature',
    );
    expect(art.abilities[0]).toMatchObject({
      trigger: { kind: 'discarded', who: 'opponent', filter: { types: ['artifact'] } },
    });
    const nonland = readAll(
      'Whenever a player discards a nonland card, you gain 1 life.',
      'creature',
    );
    expect(nonland.abilities[0]).toMatchObject({
      trigger: { kind: 'discarded', who: 'any', filter: { notTypes: ['land'] } },
    });
  });

  test('the copy is also read on its own (SYNTHETIC): not tapped, another type line, "~", a target', () => {
    const untapped = readAll(
      'Whenever you discard a creature card, create a token that’s a copy of that card, except it’s a 2/2 white and blue Spirit creature.',
      'creature',
    );
    expect(untapped.abilities[0]).toMatchObject({
      effect: {
        kind: 'createToken',
        token: {
          kind: 'copyOf',
          object: TRIGGER_SUBJECT,
          setPt: { power: 2, toughness: 2 },
          setColors: ['W', 'U'],
          setCreatureTypes: ['Spirit'],
        },
      },
    });
    expect((untapped.abilities[0] as { effect: { tapped?: true } }).effect.tapped).toBeUndefined();
    const spell = readAll(
      'Create a token that’s a copy of target creature, except it’s a 1/1 white Spirit.',
      'sorcery',
    );
    expect(spell.spell?.effect).toMatchObject({
      kind: 'createToken',
      token: {
        kind: 'copyOf',
        object: { kind: 'target', id: 't1' },
        setPt: { power: 1, toughness: 1 },
        setColors: ['W'],
        setCreatureTypes: ['Spirit'],
      },
    });
  });

  test.each([
    // a kind of card of two kinds, a type that is no card kind, the past tense
    'Whenever you discard a creature or land card, you gain 1 life.',
    'Whenever you discard a Zombie card, you gain 1 life.',
    'Whenever you discard creature cards, you gain 1 life.',
    'Whenever you discarded a creature card, you gain 1 life.',
    'Whenever you discard an creature card, you gain 1 life.',
    // an exception that does not say the whole of the copy
    'Whenever you discard a creature card, create a token that’s a copy of that card, except it’s a 4/4.',
    'Whenever you discard a creature card, create a token that’s a copy of that card, except it’s black.',
    'Whenever you discard a creature card, create a token that’s a copy of that card, except it has haste.',
    'Whenever you discard a creature card, create a token that’s a copy of that card, except it’s a 4/4 black Zombie in addition to its other types.',
    'Whenever you discard a creature card, create two tokens that are copies of that card, except they’re 4/4 black Zombies.',
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'creature')).toMatchObject({ reason: 'unrecognised' });
  });
});

describe('"for each token you control of the chosen type that entered this turn, create a token that\'s a copy of it" (CR 707.2, 111.4)', () => {
  const REAL =
    'As this enchantment enters, choose a creature type.\nCreatures you control of the chosen type get +1/+0.\nAt the beginning of your end step, for each token you control of the chosen type that entered this turn, create a token that’s a copy of it.';

  test('the real card: the choice, the lord and the end step ability', () => {
    const parsed = readAll(REAL, 'enchantment');
    expect(parsed.abilities).toEqual([
      { kind: 'replacement', replacement: { kind: 'asEntersChoose', what: 'creatureType' } },
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { types: ['creature'], controller: 'you', chosenType: true },
          },
          power: 1,
          toughness: 0,
        },
      },
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        effect: {
          kind: 'createCopies',
          objects: {
            kind: 'each',
            filter: { token: true, controller: 'you', chosenType: true, enteredThisTurn: true },
          },
        },
      },
    ]);
  });

  test('with only some of the words (SYNTHETIC)', () => {
    const entered = readAll(
      'At the beginning of your end step, for each token you control that entered this turn, create a token that’s a copy of it.',
      'enchantment',
    );
    expect(entered.abilities[0]).toMatchObject({
      effect: {
        kind: 'createCopies',
        objects: { filter: { token: true, controller: 'you', enteredThisTurn: true } },
      },
    });
    const chosen = readAll(
      'At the beginning of your end step, for each token you control of the chosen type, create a token that’s a copy of it.',
      'enchantment',
    );
    expect(chosen.abilities[0]).toMatchObject({
      effect: { objects: { filter: { token: true, controller: 'you', chosenType: true } } },
    });
  });

  test.each([
    'At the beginning of your end step, for each token you control of the chosen type that entered this turn, create a token that’s a copy of that token.',
    'At the beginning of your end step, for each token you control of the chosen type that entered this turn, create two tokens that are copies of it.',
    'At the beginning of your end step, for each token an opponent controls, create a token that’s a copy of it.',
    'At the beginning of your end step, for each creature you control that entered this turn, create a token that’s a copy of it.',
    'At the beginning of your end step, for each token you control of the chosen type that entered this turn, create a token that’s a copy of it, except it has haste.',
  ])('is not read: %s', (text) => {
    expect(dropped(text, 'enchantment')).toMatchObject({ reason: 'unrecognised' });
  });
});
