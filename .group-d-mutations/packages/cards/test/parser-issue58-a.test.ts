import { validateCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

describe('general Pest-deck grammar extensions', () => {
  test('attacking subtype lords lower the combat filter into both static effects', () => {
    const face = readAll('Attacking Goblins you control get +2/+0 and have menace.', 'enchantment');
    expect(face.abilities).toEqual([
      {
        kind: 'static',
        static: {
          kind: 'modifyPt',
          subject: {
            kind: 'filter',
            filter: { subtypes: ['Goblin'], controller: 'you', attacking: true },
          },
          power: 2,
          toughness: 0,
        },
      },
      {
        kind: 'static',
        static: {
          kind: 'grantKeyword',
          subject: {
            kind: 'filter',
            filter: { subtypes: ['Goblin'], controller: 'you', attacking: true },
          },
          keyword: { kind: 'menace' },
        },
      },
    ]);
  });

  test('opponent life threshold, token absence and tapped self-return keep their scopes', () => {
    expect(
      readAll('~ has haste as long as an opponent has 10 or less life.', 'creature').abilities,
    ).toMatchObject([
      {
        condition: { kind: 'lifeTotal', player: 'opponent', compare: { cmp: 'atMost', value: 10 } },
      },
    ]);
    expect(
      readAll(
        'At the beginning of each upkeep, if you don’t control a Goblin creature token, draw a card.',
        'creature',
      ).abilities,
    ).toMatchObject([
      {
        interveningIf: {
          kind: 'not',
          term: {
            kind: 'controlsAtLeast',
            filter: { subtypes: ['Goblin'], types: ['creature'], token: true },
          },
        },
      },
    ]);
    expect(
      readAll('{G}: Return this card from your graveyard to the battlefield tapped.', 'creature')
        .abilities,
    ).toMatchObject([
      {
        functionsIn: 'graveyard',
        effect: { kind: 'moveToZone', objects: { kind: 'this' }, to: 'battlefield', tapped: true },
      },
    ]);
  });

  test('exiled-this-way tests the new object in exile, not an old target', () => {
    const result = readAll(
      'Exile target card from a graveyard. If an artifact card is exiled this way, draw a card.',
    );
    expect(result.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'exile' },
        {
          kind: 'conditional',
          condition: {
            kind: 'objectMatches',
            of: { kind: 'moved' },
            inZone: 'exile',
            filter: { types: ['artifact'] },
          },
        },
      ],
    });
  });

  test.each([
    'If a creature card is exiled this way, draw a card.',
    'Destroy target creature. If a creature card is exiled this way, draw a card.',
    'Exile target card from a graveyard. If a creature card is exiled, draw a card.',
  ])('does not pretend to understand %s', (text) => {
    expect(dropped(text)).toBeDefined();
  });

  test('quoted token rider is attached to the counted token definition and validates', () => {
    const card = parsed(
      'SYNTHETIC Counted Goblin Death',
      'Creature — Goblin',
      'At the beginning of your end step, create a number of 1/1 red Goblin creature tokens equal to the number of +1/+1 counters on ~. They have "When this token dies, you gain 1 life."',
      { power: '1', toughness: '1', manaCost: '{R}' },
    );
    expect(validateCard(card)).toEqual([]);
    expect(card.faces[0]?.abilities).toMatchObject([
      {
        effect: {
          kind: 'createToken',
          count: { kind: 'countersOn', counter: '+1/+1', of: { kind: 'this' } },
          token: {
            definition: {
              abilities: [
                {
                  kind: 'triggered',
                  trigger: { kind: 'dies', what: { kind: 'this' } },
                  effect: { kind: 'gainLife', amount: 1 },
                },
              ],
            },
          },
        },
      },
    ]);
  });
});
