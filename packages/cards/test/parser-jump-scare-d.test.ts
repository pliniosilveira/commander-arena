// The Jump Scare! deck (issue 108), group D, at the grammar: "that many" in a trigger of damage dealt to the permanent (CR 120.3, 603.2g), the additional cost of exiling cards of a kind from the
// caster's graveyard (CR 118.8, 601.2b, 406.1), and the three sentences of Disorienting Choice (CR 115.1, 608.2d, 701.13, 701.23). The engine runs them in convert-grammar-engine-jump-scare-d.test.ts.
import { describe, expect, test } from 'vitest';
import { read, readAll } from './parser-p5-helpers';

describe('"Whenever ~ is dealt damage, draw that many cards."', () => {
  test('"that many" is the damage the trigger is about', () => {
    const face = readAll('Whenever ~ is dealt damage, draw that many cards.', 'creature');
    expect(face.abilities).toMatchObject([
      {
        kind: 'triggered',
        trigger: { kind: 'dealtDamage', what: { kind: 'this' } },
        effect: { kind: 'draw', count: { kind: 'triggerDamage' } },
      },
    ]);
  });

  test('"that many" after another instruction may count what it did: still not read', () => {
    expect(
      read('Whenever ~ is dealt damage, mill two cards, then draw that many cards.', 'creature')
        .unparsed,
    ).not.toEqual([]);
  });
});

describe('"As an additional cost to cast ~, exile three creature cards from your graveyard."', () => {
  test('is the face’s additional cost: three creature cards of the caster’s graveyard', () => {
    const face = readAll(
      'As an additional cost to cast ~, exile three creature cards from your graveyard.',
      'creature',
    );
    expect(face.additionalCosts).toEqual([
      { kind: 'exileFromGraveyard', filter: { types: ['creature'] }, count: 3 },
    ]);
  });

  test('a card of any kind, and one card', () => {
    const face = readAll(
      'As an additional cost to cast ~, exile a card from your graveyard.',
      'sorcery',
    );
    expect(face.additionalCosts).toEqual([{ kind: 'exileFromGraveyard', filter: {}, count: 1 }]);
  });

  test.each([
    // X is announced for an ability's cost only.
    'As an additional cost to cast ~, exile X cards from your graveyard.',
    'As an additional cost to cast ~, exile three creature cards from an opponent’s graveyard.',
    'As an additional cost to cast ~, you may exile three creature cards from your graveyard.',
    'As an additional cost to cast ~, exile three creature cards from your graveyard or pay {3}.',
  ])('%s is not read', (text) => {
    expect(read(text, 'creature').unparsed).not.toEqual([]);
  });
});

describe('Disorienting Choice: the three sentences are one instruction', () => {
  const TEXT =
    'For each opponent, choose up to one target artifact or enchantment that player controls. For each permanent chosen this way, its controller may exile it. Then if one or more of the chosen permanents are still on the battlefield, you search your library for up to that many land cards, put them onto the battlefield tapped, then shuffle.';

  test('reads as a slot of at most one target for each opponent, a may-exile by the controllers, and a conditional search', () => {
    const face = readAll(TEXT, 'sorcery');
    expect(face.spell?.targets).toEqual([
      {
        id: 't1',
        onePerOpponent: true,
        what: {
          kind: 'object',
          filter: {
            controller: 'opponent',
            zone: 'battlefield',
            anyOf: [{ types: ['artifact'] }, { types: ['enchantment'] }],
          },
        },
      },
    ]);
    expect(face.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'controllersMayExile', objects: { kind: 'target', id: 't1' } },
        {
          kind: 'conditional',
          condition: { kind: 'thisWayAtLeast', what: 'chosenStillOnBattlefield', count: 1 },
          effect: {
            kind: 'search',
            player: { kind: 'you' },
            filter: { types: ['land'] },
            maxAmount: { kind: 'thisWay', what: 'chosenStillOnBattlefield' },
            destinations: [{ zone: 'battlefield', tapped: true, count: 'rest' }],
            shuffle: true,
          },
        },
      ],
    });
  });

  test.each([
    TEXT.replace('may exile it', 'may destroy it'),
    TEXT.replace('land cards', 'basic land cards'),
    TEXT.replace('tapped, then shuffle', 'tapped'),
    TEXT.replace('choose up to one target', 'choose one target'),
  ])('a variation is not read: %s', (text) => {
    expect(read(text, 'sorcery').unparsed).not.toEqual([]);
  });
});
