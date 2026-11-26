// The manifest cards of the Jump Scare! deck, group B: "Colorless creatures you control enter with two additional +1/+1 counters on them" (CR 614.1c, 122.6), "if you control no face-down
// permanents" (CR 603.4, 708.2), "Manifest a card from your hand" (CR 701.40a), "face-up nontoken creatures you control gain ..." (CR 611.2c), "put two +1/+1 counters and a trample
// counter on that creature" after manifest dread (CR 608.2c, 400.7j) and "turn that creature face up or put a +1/+1 counter on it" (CR 701.40g, 708.8). The texts are the Oracle wording of the
// cards with the card name written as `~`; the engine's SYNTHETIC cards (packages/engine/src/cards/fixtures/synthetic-manifest-b.ts) say the same in the AST, and the engine tests play them.
import { syntheticCard } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';
import { read, readAll, spellEffect } from './parser-p5-helpers';

const abilitiesOf = (name: string) => syntheticCard(name).faces[0]?.abilities;

const DREAD = {
  kind: 'lookAtTop',
  count: 2,
  take: { filter: {}, max: 1, min: 1, hidden: true, to: 'manifest' },
  rest: 'graveyard',
};

describe('the lowering is what the engine tests play', () => {
  test('colorless creatures enter with counters', () => {
    const def = parsed(
      'SYNTHETIC Colorless Boon',
      'Creature — Beast',
      'Colorless creatures you control enter with two additional +1/+1 counters on them.',
      { power: '6', toughness: '6' },
    );
    expect(def.faces[0]?.abilities).toEqual(abilitiesOf('SYNTHETIC Colorless Boon'));
  });

  test('"if you control no face-down permanents, return ~ to its owner’s hand and manifest dread"', () => {
    const def = parsed(
      'SYNTHETIC Glitch Reader',
      'Creature — Human Wizard',
      'When ~ enters, if you control no face-down permanents, return ~ to its owner’s hand and manifest dread.',
      { power: '2', toughness: '3' },
    );
    expect(def.faces[0]?.abilities).toEqual(abilitiesOf('SYNTHETIC Glitch Reader'));
  });

  test('"Manifest a card from your hand"', () => {
    const def = parsed('SYNTHETIC Hand Scroll', 'Artifact', '{T}: Manifest a card from your hand.');
    expect(def.faces[0]?.abilities).toEqual(abilitiesOf('SYNTHETIC Hand Scroll'));
  });

  test('face-up nontoken creatures gain a triggered ability until end of turn', () => {
    const def = parsed(
      'SYNTHETIC Dread Sacrificer',
      'Creature — Elemental',
      'Sacrifice ~: Until end of turn, face-up nontoken creatures you control gain "When this creature dies, manifest the top card of your library."',
      { power: '4', toughness: '4' },
    );
    expect(def.faces[0]?.abilities).toEqual(abilitiesOf('SYNTHETIC Dread Sacrificer'));
  });

  test('counters on "that creature" after manifest dread', () => {
    const def = parsed(
      'SYNTHETIC Dread Brute',
      'Creature — Beast',
      'When ~ enters, manifest dread, then put two +1/+1 counters and a trample counter on that creature.',
      { power: '3', toughness: '3' },
    );
    expect(def.faces[0]?.abilities).toEqual(abilitiesOf('SYNTHETIC Dread Brute'));
  });

  test('"turn that creature face up or put a +1/+1 counter on it"', () => {
    const def = parsed(
      'SYNTHETIC Unmasking Hall',
      'Enchantment',
      'Whenever a creature you control deals combat damage to a player, turn that creature face up or put a +1/+1 counter on it.',
    );
    expect(def.faces[0]?.abilities).toEqual(abilitiesOf('SYNTHETIC Unmasking Hall'));
  });
});

describe('face-down and face-up permanents (CR 708.2)', () => {
  test('a count of face-down permanents', () => {
    const face = readAll(
      'When ~ enters, if you control a face-down creature, draw a card.',
      'creature',
    );
    expect(face.abilities).toMatchObject([
      {
        interveningIf: {
          kind: 'controlsAtLeast',
          filter: { types: ['creature'], facing: 'down' },
          count: 1,
        },
      },
    ]);
  });

  test('"you control no face-down permanents" is the count being none', () => {
    const face = readAll(
      'When ~ enters, if you control no face-down permanents, draw a card.',
      'creature',
    );
    expect(face.abilities).toMatchObject([
      {
        interveningIf: {
          kind: 'not',
          term: { kind: 'controlsAtLeast', filter: { facing: 'down' }, count: 1 },
        },
      },
    ]);
  });

  test('a face-up creature in the group of an effect', () => {
    const face = readAll(
      'Sacrifice ~: Until end of turn, face-up creatures you control gain "When this creature dies, draw a card."',
      'creature',
    );
    expect(face.abilities).toMatchObject([
      {
        effect: {
          kind: 'grantAbility',
          objects: { kind: 'each', filter: { types: ['creature'], controller: 'you', facing: 'up' } },
        },
      },
    ]);
  });

  test.each([
    'Exile target face-down creature spell.',
    'Counter target face-up spell.',
    'Destroy target face-down artifact card.',
  ])('not read in a phrase of spells or cards: %s', (text) => {
    expect(read(text, 'instant').unparsed).not.toEqual([]);
  });
});

describe('"that creature" is the creature manifest dread manifested', () => {
  test('one kind of counter', () => {
    const face = readAll(
      'When ~ enters, manifest dread, then put a +1/+1 counter on that creature.',
      'creature',
    );
    expect(face.abilities).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [DREAD, { kind: 'addCounters', objects: { kind: 'moved' }, count: 1 }],
        },
      },
    ]);
  });

  test('two kinds, each with its own count, one after the other', () => {
    const face = readAll(
      'When ~ enters, manifest dread, then put three +1/+1 counters, a flying counter, and two charge counters on it.',
      'creature',
    );
    expect(face.abilities).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [
            DREAD,
            { kind: 'addCounters', objects: { kind: 'moved' }, counter: '+1/+1', count: 3 },
            { kind: 'addCounters', objects: { kind: 'moved' }, counter: 'flying', count: 1 },
            { kind: 'addCounters', objects: { kind: 'moved' }, counter: 'charge', count: 2 },
          ],
        },
      },
    ]);
  });

  test('after anything else it is not read as the manifested creature', () => {
    expect(
      read('When ~ enters, draw a card, then put a +1/+1 counter on that creature.', 'creature')
        .unparsed,
    ).not.toEqual([]);
  });
});

describe('manifest a card from your hand', () => {
  test('as an instruction of a spell', () => {
    expect(spellEffect('Manifest a card from your hand.', 'sorcery')).toEqual({
      kind: 'moveToZone',
      objects: { kind: 'choose', filter: { zone: 'hand', controller: 'you' }, count: 1 },
      to: 'battlefield',
      faceDownAs: 'manifest',
    });
  });

  test.each([
    'Manifest a creature card from your hand.',
    'Manifest two cards from your hand.',
    'Target player manifests a card from their hand.',
    'Manifest a card from your graveyard.',
  ])('stays unread: %s', (text) => {
    expect(read(text, 'sorcery').unparsed).not.toEqual([]);
  });
});

describe('turn that creature face up', () => {
  test('about the creature of a trigger', () => {
    const face = readAll(
      'Whenever a creature you control deals combat damage to a player, turn that creature face up.',
      'enchantment',
    );
    expect(face.abilities).toMatchObject([
      { effect: { kind: 'turnFaceUp', objects: { kind: 'triggerSubject' } } },
    ]);
  });

  test('about the creature manifest dread manifested', () => {
    const face = readAll('When ~ enters, manifest dread, then turn that creature face up.', 'creature');
    expect(face.abilities).toMatchObject([
      {
        effect: {
          kind: 'sequence',
          effects: [DREAD, { kind: 'turnFaceUp', objects: { kind: 'moved' } }],
        },
      },
    ]);
  });

  test.each([
    'Turn target creature face up.',
    'Turn that creature face down.',
    'Whenever a creature you control deals combat damage to a player, turn that creature face up or draw a card.',
  ])('stays unread: %s', (text) => {
    expect(read(text, 'enchantment').unparsed).not.toEqual([]);
  });
});
