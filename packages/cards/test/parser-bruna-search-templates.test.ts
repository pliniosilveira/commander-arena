// The Bruna deck program (issue 5), the search templates group (D-260 and following): Search for Glory, Heirloom Blade, Myriad Landscape. The lines are the real Oracle
// text of the acceptance cards of the golden corpus (names replaced by ~) with the nodes the grammar produces, played through applyAction where the engine reads them; the other
// lines are SYNTHETIC siblings and the near misses the grammar must not read.
import { readFileSync } from 'node:fs';
import { applyAction, type CardDefinition } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const PERMANENTS = ['artifact', 'creature', 'enchantment', 'land', 'planeswalker', 'battle'];

describe('Search for Glory: a search for one of several kinds of card, and {S} spent (D-260)', () => {
  const TEXT =
    'Search your library for a snow permanent card, a legendary card, or a Saga card, reveal it, put it into your hand, then shuffle. You gain 1 life for each {S} spent to cast ~.';

  test('reads as a search for the union of the three kinds, then life for the snow mana spent', () => {
    const parsedFace = readAll(TEXT, 'sorcery');
    expect(parsedFace.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        {
          kind: 'search',
          player: { kind: 'you' },
          filter: {
            anyOf: [
              { supertypes: ['snow'], anyOf: PERMANENTS.map((t) => ({ types: [t] })) },
              { supertypes: ['legendary'] },
              { subtypes: ['Saga'] },
            ],
          },
          max: 1,
          destinations: [{ zone: 'hand', count: 1 }],
          reveal: true,
          shuffle: true,
        },
        {
          kind: 'gainLife',
          player: { kind: 'you' },
          amount: { kind: 'manaSpent', snow: true },
        },
      ],
    });
  });

  test('the real card is supported and the golden text is the one tested here', () => {
    const card = cards.find((c) => c.name === 'Search for Glory');
    expect(card?.faces[0]?.oracleText).toContain(TEXT.replace('~', 'this spell'));
    expect(real('Search for Glory').name).toBe('Search for Glory');
  });

  test('two kinds with "or", and a kind that is a plain subtype or type (SYNTHETIC)', () => {
    const face = readAll(
      'Search your library for a creature card or a land card, put it into your hand, then shuffle.',
      'sorcery',
    );
    expect(face.spell?.effect).toMatchObject({
      kind: 'search',
      filter: { anyOf: [{ types: ['creature'] }, { types: ['land'] }] },
    });
  });

  test('"a nonland permanent card" is the permanent types but the land (SYNTHETIC)', () => {
    const face = readAll(
      'Search your library for a nonland permanent card, put it into your hand, then shuffle.',
      'sorcery',
    );
    expect(face.spell?.effect).toMatchObject({
      kind: 'search',
      filter: {
        anyOf: [
          { types: ['artifact'] },
          { types: ['creature'] },
          { types: ['enchantment'] },
          { types: ['planeswalker'] },
          { types: ['battle'] },
        ],
      },
    });
  });

  test('a list without "or" before the last kind, or a kind without its "card", is not read (SYNTHETIC)', () => {
    for (const text of [
      'Search your library for a snow permanent card, a legendary card, a Saga card, put it into your hand, then shuffle.',
      'Search your library for a snow permanent card, legendary card, or a Saga card, put it into your hand, then shuffle.',
      'Search your library for a legendary card and a Saga card, put it into your hand, then shuffle.',
    ]) {
      expect(dropped(text, 'sorcery').reason, text).toBeDefined();
    }
  });

  test('"for each {S}" is read in a spell only of the spell itself (SYNTHETIC)', () => {
    // "it" in a spell may be a target, "{W}" is a color of mana, not the snow symbol.
    expect(
      dropped('You gain 1 life for each {S} spent to cast it.', 'sorcery').reason,
    ).toBeDefined();
    expect(
      dropped('You gain 1 life for each {W} spent to cast ~.', 'sorcery').reason,
    ).toBeDefined();
  });

  test('the amount of any mana spent is read the same way in a spell (SYNTHETIC)', () => {
    const face = readAll('You gain 1 life for each mana spent to cast ~.', 'sorcery');
    expect(face.spell?.effect).toEqual({
      kind: 'gainLife',
      player: { kind: 'you' },
      amount: { kind: 'manaSpent' },
    });
  });

  describe('played with the real card', () => {
    const GLORY = real('Search for Glory');
    // A snow basic land, read from its type line and rules text (CR 205.4g, 305.6).
    const SNOW = parsed('SYNTHETIC Snow Land', 'Basic Snow Land — Plains', '({T}: Add {W}.)');
    const SPRITE = parsed('SYNTHETIC Snow Faerie', 'Snow Creature — Faerie', '', {
      manaCost: '{W}',
      power: '1',
      toughness: '1',
    });
    const FLURRY = parsed('SYNTHETIC Snow Charm', 'Snow Instant', 'You gain 1 life.', {
      manaCost: '{U}',
    });
    const LEGEND = parsed('SYNTHETIC Frost Legend', 'Legendary Creature — Human', '', {
      manaCost: '{1}{W}',
      power: '2',
      toughness: '2',
    });
    const FILLER = Array.from({ length: 10 }, () => 'Island');

    const game = (lands: readonly string[]) =>
      scenario()
        .define(GLORY)
        .define(SNOW)
        .define(SPRITE)
        .define(FLURRY)
        .define(LEGEND)
        .seat(0)
        .hand(GLORY.name)
        .battlefield(...lands)
        .library(SPRITE.name, FLURRY.name, LEGEND.name, ...FILLER)
        .seat(1)
        .library(...FILLER)
        .at('precombatMain', { active: 0, turn: 1 })
        .build();

    test('the snow land is a snow land, and the snow instant is not a snow permanent', () => {
      expect(SNOW.faces[0]?.supertypes).toEqual(['basic', 'snow']);
      expect(FLURRY.faces[0]?.supertypes).toEqual(['snow']);
    });

    test('three snow lands: the search finds a snow creature and three life are gained', () => {
      const g = game([SNOW.name, SNOW.name, SNOW.name]);
      g.act(0).cast(GLORY.name, { pay: true });
      g.passAll();
      g.expect.pending('chooseCards', 0);
      g.act(0).chooseCards(SPRITE.name);
      g.expect.zone(SPRITE.name, 'hand', { seat: 0 });
      g.expect.life(0, 43);
      g.expect.invariants();
    });

    test('Plains pay for it: no life, and the snow instant is never offered', () => {
      const g = game(['Plains', 'Plains', 'Plains']);
      g.act(0).cast(GLORY.name, { pay: true });
      g.passAll();
      g.expect.pending('chooseCards', 0);
      g.act(0).chooseCards(LEGEND.name);
      g.expect.zone(LEGEND.name, 'hand', { seat: 0 });
      g.expect.zone(FLURRY.name, 'library', { seat: 0 });
      g.expect.life(0, 40);
    });
  });
});

describe('Heirloom Blade: a creature card that shares a creature type with the creature that died (D-261)', () => {
  const TRIGGER =
    'Whenever equipped creature dies, you may reveal cards from the top of your library until you reveal a creature card that shares a creature type with it. Put that card into your hand and the rest on the bottom of your library in a random order.';

  test('reads as an optional dies trigger of the equipped creature that reveals until a card that shares a type', () => {
    const face = readAll(`${TRIGGER}\nEquip {1}`, 'artifact', ['Equipment']);
    expect(face.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'attached' } },
        optional: true,
        effect: {
          kind: 'revealUntil',
          filter: { types: ['creature'], sharesCreatureTypeWith: 'triggerSubject' },
          put: 'hand',
        },
      },
      { kind: 'keyword', keyword: { kind: 'equip', cost: [{ kind: 'mana', symbols: ['1'] }] } },
    ]);
  });

  test('"this creature dies" is the same creature the trigger is about (SYNTHETIC)', () => {
    const face = readAll(TRIGGER.replace('equipped creature', '~'), 'creature');
    expect(JSON.stringify(face.abilities)).toContain('"sharesCreatureTypeWith":"triggerSubject"');
  });

  test('the plain "you may reveal ... until you reveal a creature card" is read as well (SYNTHETIC)', () => {
    const face = readAll(
      'Whenever equipped creature dies, you may reveal cards from the top of your library until you reveal a creature card. Put that card into your hand and the rest on the bottom of your library in a random order.',
      'artifact',
      ['Equipment'],
    );
    expect(face.abilities).toEqual([
      {
        kind: 'triggered',
        trigger: { kind: 'dies', what: { kind: 'attached' } },
        optional: true,
        effect: { kind: 'revealUntil', filter: { types: ['creature'] }, put: 'hand' },
      },
    ]);
  });

  test('where the engine does not read it, the card is not supported: no dies trigger, a spell, another card (SYNTHETIC)', () => {
    for (const [text, type] of [
      [
        'Whenever equipped creature attacks, you may reveal cards from the top of your library until you reveal a creature card that shares a creature type with it. Put that card into your hand and the rest on the bottom of your library in a random order.',
        'artifact',
      ],
      [
        'Reveal cards from the top of your library until you reveal a creature card that shares a creature type with it. Put that card into your hand and the rest on the bottom of your library in a random order.',
        'sorcery',
      ],
      [
        'Whenever equipped creature dies, you may reveal cards from the top of your library until you reveal a land card that shares a creature type with it. Put that card into your hand and the rest on the bottom of your library in a random order.',
        'artifact',
      ],
      [
        'Whenever equipped creature dies, you may reveal cards from the top of your library until you reveal a creature card that shares a land type with it. Put that card into your hand and the rest on the bottom of your library in a random order.',
        'artifact',
      ],
    ] as const) {
      // The grammar reads the words; the engine's validation (`validateCard`) refuses the filter where it has no creature to read, so the card is not supported.
      const imported = parseOnly(
        syntheticCard({
          name: 'SYNTHETIC Odd Card',
          typeLine: type === 'artifact' ? 'Artifact — Equipment' : 'Sorcery',
          oracleText: text,
          manaCost: '{3}',
        }),
      );
      expect(imported.support.status, text).toBe('unsupported');
    }
  });
});

describe('Heirloom Blade played from the real card', () => {
  const BLADE = real('Heirloom Blade');
  const small = (name: string, types: string) =>
    parsed(name, `Creature — ${types}`, '', { manaCost: '{1}', power: '2', toughness: '2' });
  const KNIGHT = small('SYNTHETIC Goblin Knight', 'Goblin Knight');
  const SQUIRE = small('SYNTHETIC Human Knight', 'Human Knight');
  const WIZARD = small('SYNTHETIC Lone Wizard', 'Wizard');
  const FILLER = Array.from({ length: 6 }, () => 'Island');

  const game = () =>
    scenario()
      .define(BLADE)
      .define(KNIGHT)
      .define(SQUIRE)
      .define(WIZARD)
      .seat(0)
      .battlefield(KNIGHT.name)
      .battlefield(BLADE.name, { attachedTo: KNIGHT.name })
      .library(WIZARD.name, SQUIRE.name, ...FILLER)
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .library(...FILLER)
      .at('precombatMain', { active: 1, turn: 2 })
      .build();

  test('the equipped creature is destroyed: the Knight is found, the Wizard goes to the bottom', () => {
    const g = game();
    g.act(1).cast('Murder', { targets: [{ name: KNIGHT.name, zone: 'battlefield' }], pay: true });
    g.passAll();
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(SQUIRE.name, 'hand', { seat: 0 });
    g.expect.zone(WIZARD.name, 'library', { seat: 0 });
    g.expect.invariants();
  });

  test('declined: the library is as it was', () => {
    const g = game();
    g.act(1).cast('Murder', { targets: [{ name: KNIGHT.name, zone: 'battlefield' }], pay: true });
    g.passAll();
    g.act(0).decline();
    g.expect.zone(SQUIRE.name, 'library', { seat: 0 });
    g.expect.librarySize(0, 2 + FILLER.length);
  });
});

describe('Myriad Landscape: up to two basic land cards that share a land type (D-262)', () => {
  const TEXT =
    'This land enters tapped.\n{T}: Add {C}.\n{2}, {T}, Sacrifice ~: Search your library for up to two basic land cards that share a land type, put them onto the battlefield tapped, then shuffle.';

  test('reads as a search with the option sharedLandType, paid by {2}, {T} and the sacrifice of the land', () => {
    const face = readAll(TEXT, 'land');
    expect(face.abilities).toEqual([
      { kind: 'replacement', replacement: { kind: 'entersTapped' } },
      { kind: 'mana', cost: [{ kind: 'tap' }], production: { kind: 'fixed', mana: ['C'] } },
      {
        kind: 'activated',
        cost: [
          { kind: 'mana', symbols: ['2'] },
          { kind: 'tap' },
          { kind: 'sacrifice', what: { kind: 'this' } },
        ],
        effect: {
          kind: 'search',
          player: { kind: 'you' },
          filter: { types: ['land'], supertypes: ['basic'] },
          max: 2,
          sharedLandType: true,
          destinations: [{ zone: 'battlefield', tapped: true, count: 2 }],
          reveal: false,
          shuffle: true,
        },
      },
    ]);
  });

  test('without the words there is no option: "up to two basic land cards" is as it was (SYNTHETIC)', () => {
    const face = readAll(
      'Search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle.',
      'sorcery',
    );
    expect(JSON.stringify(face.spell)).not.toContain('sharedLandType');
  });

  test('another count, another kind of card, a creature type or a pronoun is not read (SYNTHETIC)', () => {
    for (const text of [
      'Search your library for a basic land card that share a land type, put it onto the battlefield tapped, then shuffle.',
      'Search your library for up to two creature cards that share a land type, put them into your hand, then shuffle.',
      'Search your library for up to two basic land cards that share a creature type, put them onto the battlefield tapped, then shuffle.',
      'Search your library for up to two basic land cards that share a land type with it, put them onto the battlefield tapped, then shuffle.',
    ]) {
      expect(dropped(text, 'sorcery').reason, text).toBeDefined();
    }
  });

  describe('played with the real card', () => {
    const LANDSCAPE = real('Myriad Landscape');
    const game = (library: readonly string[]) =>
      scenario()
        .define(LANDSCAPE)
        .seat(0)
        .battlefield(LANDSCAPE.name, 'Plains', 'Plains')
        .library(...library)
        .seat(1)
        .library('Island')
        .build();

    test('{2}, {T}, sacrifice: two Forests come onto the battlefield tapped, a Forest and a Plains are refused', () => {
      const g = game(['Forest', 'Plains', 'Forest', 'Island']);
      g.act(0).activate(LANDSCAPE.name, { pay: true });
      g.expect.zone(LANDSCAPE.name, 'graveyard', { seat: 0 });
      g.passAll();
      g.expect.pending('chooseCards', 0);
      const forest = g.find({ name: 'Forest', zone: 'library', seat: 0 });
      const plains = g.find({ name: 'Plains', zone: 'library', seat: 0 });
      const wrong = applyAction(g.state, 0, {
        kind: 'chooseCards',
        objects: [forest[0]?.id, plains[0]?.id].flatMap((id) => (id === undefined ? [] : [id])),
      });
      expect(wrong.ok).toBe(false);
      g.act(0).chooseCards('Forest[0]', 'Forest[1]');
      g.expect.zone('Forest', 'battlefield', { seat: 0, count: 2 });
      g.expect.tapped('Forest[0]', true);
      g.expect.tapped('Forest[1]', true);
      g.expect.invariants();
    });
  });
});
