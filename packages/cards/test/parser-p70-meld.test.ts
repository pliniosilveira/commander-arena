// Stage P70 (D-992, D-996): what the grammar reads of the meld ability and of the combined face of a pair: "if you both own and control ~ and a creature named X, exile them,
// then meld them into Y" (CR 701.42a, 712.4a), "Your opponents can't cast spells with mana value 3 or less." (CR 101.2) and "an Angel or Human creature card" of a graveyard
// (CR 205.3m). The texts are SYNTHETIC or the shapes of real cards; every refusal is a line left unparsed, never half read.
import { describe, expect, test } from 'vitest';
import { convertFace } from '../src/convert/face';
import { syntheticFace } from './convert-helpers';

const read = (text: string, name = 'SYNTHETIC Squire') =>
  convertFace(
    syntheticFace({
      name,
      manaCost: '{2}{W}',
      typeLine: 'Legendary Creature — Human',
      oracleText: text,
      power: '2',
      toughness: '2',
      colors: ['W'],
    }),
    0,
  );

const MELD = (partner: string, result: string, lead = '') =>
  `At the beginning of your end step, if you both own and control ~ and a creature named ${partner}, ${lead}exile them, then meld them into ${result}.`;

describe('the meld ability', () => {
  test('a trigger of the end step with the condition and the effect, whatever the names', () => {
    const c = read(MELD('Graf Rats', 'Chittering Host'));
    expect(c.unparsed).toEqual([]);
    expect(c.face.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'endStep', whose: 'you' },
        interveningIf: { kind: 'ownsAndControlsNamed', name: 'Graf Rats', type: 'creature' },
        effect: { kind: 'meld', partner: 'Graf Rats', result: 'Chittering Host' },
      },
    ]);
  });

  test.each([
    ['Bruna, the Fading Light', 'Brisela, Voice of Nightmares'],
    ['Mishra, Claimed by Gix', 'Mishra, Lost to Phyrexia'],
    ['Titania, Voice of Gaea', 'Titania, Gaea Incarnate'],
  ])('a name with a comma is one name: %s, %s', (partner, result) => {
    const c = read(MELD(partner, result));
    expect(c.unparsed).toEqual([]);
    expect(c.face.abilities[0]).toMatchObject({
      interveningIf: { name: partner },
      effect: { kind: 'meld', partner, result },
    });
  });

  test('the self name is read as "~": the card is named by its own name in the text', () => {
    const c = convertFace(
      syntheticFace({
        name: 'Gisela, the Broken Blade',
        manaCost: '{2}{W}{W}',
        typeLine: 'Legendary Creature — Angel Horror',
        oracleText:
          'At the beginning of your end step, if you both own and control Gisela and a creature named Bruna, the Fading Light, exile them, then meld them into Brisela, Voice of Nightmares.',
        power: '4',
        toughness: '3',
        colors: ['W'],
      }),
      0,
    );
    expect(c.unparsed).toEqual([]);
    expect(c.face.abilities[0]).toMatchObject({ effect: { partner: 'Bruna, the Fading Light' } });
  });

  test.each([
    // Not the whole ability: no condition names the other card, so "them" would be read as nobody.
    [
      'no condition',
      'At the beginning of your end step, exile them, then meld them into Chittering Host.',
    ],
    // The player may not decline: the ability has no "you may".
    [
      '"meld it"',
      'At the beginning of your end step, if you both own and control ~ and a creature named Graf Rats, exile it, then meld it into Chittering Host.',
    ],
    [
      'no "both"',
      'At the beginning of your end step, if you control ~ and a creature named Graf Rats, exile them, then meld them into Chittering Host.',
    ],
    [
      'a count',
      'At the beginning of your end step, if you both own and control ~ and two creatures named Graf Rats, exile them, then meld them into Chittering Host.',
    ],
    [
      'a trailing instruction',
      MELD('Graf Rats', 'Chittering Host').replace(/\.$/, ', then draw a card.'),
    ],
    [
      'a trigger that is not about a step',
      'Whenever ~ attacks, exile them, then meld them into Chittering Host.',
    ],
  ])('is not read: %s', (_why, text) => {
    const c = read(text);
    expect(
      c.face.abilities.filter((a) => a.kind === 'triggered' && a.effect.kind === 'meld'),
    ).toEqual([]);
    expect(c.unparsed.length).toBeGreaterThan(0);
  });

  test('"you may" is the controller\'s choice as the ability resolves (CR 603.5): the effect is the same, the ability optional', () => {
    const c = read(MELD('Graf Rats', 'Chittering Host', 'you may '));
    expect(c.unparsed).toEqual([]);
    expect(c.face.abilities[0]).toMatchObject({ optional: true, effect: { kind: 'meld' } });
  });

  test('the condition is read only as the intervening "if" of a triggered ability', () => {
    const c = read(
      '{T}: Draw a card if you both own and control ~ and a creature named Graf Rats.',
    );
    expect(c.face.abilities).toEqual([]);
    expect(c.unparsed).toHaveLength(1);
  });

  test('as the intervening "if" of another effect it is the condition and nothing else (the meld effect needs it, it does not need the meld effect)', () => {
    const c = read(
      'At the beginning of your end step, if you both own and control ~ and a creature named Graf Rats, you gain 1 life.',
    );
    expect(c.unparsed).toEqual([]);
    expect(c.face.abilities[0]).toMatchObject({
      interveningIf: { kind: 'ownsAndControlsNamed', name: 'Graf Rats', type: 'creature' },
      effect: { kind: 'gainLife' },
    });
  });
});

describe('"Your opponents can\'t cast spells with mana value 3 or less."', () => {
  const brisela = (text: string) =>
    convertFace(
      syntheticFace({
        name: 'SYNTHETIC Titan',
        manaCost: '',
        typeLine: 'Legendary Creature — Giant',
        oracleText: text,
        power: '9',
        toughness: '10',
        colors: ['W'],
      }),
      1,
    );

  test.each([
    ["Your opponents can't cast spells with mana value 3 or less.", { cmp: 'atMost', value: 3 }],
    [
      'Your opponents can’t cast spells with mana value 4 or greater.',
      { cmp: 'atLeast', value: 4 },
    ],
    ["Your opponents can't cast spells with mana value 2 or more.", { cmp: 'atLeast', value: 2 }],
    ["Your opponents can't cast spells with mana value 0.", { cmp: 'equal', value: 0 }],
  ])('%s', (text, compare) => {
    const c = brisela(text);
    expect(c.unparsed).toEqual([]);
    expect(c.face.abilities).toEqual([
      {
        kind: 'static',
        static: { kind: 'opponentsCantCastSpells', spells: { manaValue: compare } },
      },
    ]);
  });

  test.each([
    "Your opponents can't cast creature spells with mana value 3 or less.",
    "Each opponent can't cast spells with mana value 3 or less.",
    "Your opponents can't cast spells with mana value three or less.",
    "Your opponents can't cast spells with mana value X or less.",
    "Your opponents can't cast spells with mana value 3 or less during your turn.",
    "You can't cast spells with mana value 3 or less.",
    "Your opponents can't cast spells with mana value 3 or less and you draw a card.",
  ])('is not read: %s', (text) => {
    const c = brisela(text);
    expect(c.face.abilities).toEqual([]);
    expect(c.unparsed).toHaveLength(1);
  });
});

describe('"an Angel or Human creature card" of a graveyard', () => {
  const spell = (noun: string) =>
    convertFace(
      syntheticFace({
        name: 'SYNTHETIC Rite',
        manaCost: '{2}{W}',
        typeLine: 'Sorcery',
        oracleText: `Return ${noun} from your graveyard to your hand.`,
        colors: ['W'],
      }),
      0,
    );

  test('a choice of two creature types and a card type: the card has either type', () => {
    const c = spell('target Angel or Human creature card');
    expect(c.unparsed).toEqual([]);
    expect(JSON.stringify(c.face.spell)).toContain(
      '"anyOf":[{"subtypes":["Angel"]},{"subtypes":["Human"]}]',
    );
    expect(JSON.stringify(c.face.spell)).toContain('"types":["creature"]');
  });

  test('three types, in the English way', () => {
    const c = spell('target Angel, Human, or Cleric creature card');
    expect(c.unparsed).toEqual([]);
    expect(JSON.stringify(c.face.spell)).toContain('{"subtypes":["Cleric"]}');
  });

  test.each([
    ['no card type', 'target Angel or Human card'],
    ['a card type that is not creature', 'target Angel or Human land card'],
    ['a plural', 'all Angel or Human creature cards'],
    ['a type that is not a creature type', 'target Aura or Equipment creature card'],
    ['one name twice', 'target Angel or Angel creature card'],
  ])('is not read: %s', (_why, noun) => {
    expect(spell(noun).unparsed).toHaveLength(1);
  });
});
