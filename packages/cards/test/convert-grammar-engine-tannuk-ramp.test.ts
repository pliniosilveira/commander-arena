// The Tannuk deck (issue 347), the land-ramp group: the REAL cards of the golden corpus (Planar Engineering, Through the Forest Gate, Worldsoul's Rage, Nahiri's Lithoforming) read
// through the grammar only and played through applyAction. Pins: CR 701.21a (Sacrifice: with fewer permanents than X, all of them), CR 701.23b (a search for a stated quality may find
// fewer), CR 401.2 and 701.24 (look at the top cards, shuffle), CR 608.2d (the player chooses up to X cards of the hand and the graveyard), CR 305.2 and 305.2a (additional land plays),
// CR 614.1c and 614.12 (lands enter tapped this turn), CR 107.3a (the X of the spell).
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  getView,
  type ObjectId,
  validateCard,
  type Zone,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  expect(validateCard(imported.definition), name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');

/** The names of the permanents `seat` controls. */
const onBattlefield = (g: ScenarioGame, seat: 0 | 1): string[] =>
  getView(g.state, seat)
    .battlefield.filter((o) => o.controller === seat)
    .map((o) => o.name);

const count = (names: readonly string[], name: string): number =>
  names.filter((n) => n === name).length;

/** A card of the named zone of seat 0, the `nth` of those with that name. */
const at = (g: ScenarioGame, name: string, zone: Zone, nth = 0): ObjectId =>
  g.id({ name, zone, seat: 0, nth });

/** Answers the pending choice of cards with a reply the engine may refuse: true when it took it. */
const choosesCards = (g: ScenarioGame, ids: readonly ObjectId[]): boolean =>
  g.act(0).try.action({ kind: 'chooseCards', objects: ids }).ok;

/** A library of cards that are not lands and not named in any test. */
const BEARS = Array.from({ length: 30 }, () => 'Grizzly Bears');

describe('Planar Engineering ("Sacrifice two lands. Search your library for four basic land cards, put them onto the battlefield tapped, then shuffle.")', () => {
  const ENGINEERING = real('Planar Engineering');

  test('read as a sacrifice of two lands, then a search for up to four basic lands put tapped, then a shuffle', () => {
    const [spell] = ENGINEERING.faces;
    expect(spell?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'sacrifice', objects: { kind: 'choose', count: 2 } },
        {
          kind: 'search',
          max: 4,
          filter: { supertypes: ['basic'], types: ['land'] },
          destinations: [{ zone: 'battlefield', tapped: true, count: 4 }],
          reveal: false,
          shuffle: true,
        },
      ],
    });
  });

  const game = (library: readonly string[]) =>
    scenario()
      .define(ENGINEERING)
      .seat(0)
      .hand(ENGINEERING.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Swamp', 'Swamp')
      .library(...library)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('two lands are sacrificed, then four basic lands enter tapped and the library is shuffled', () => {
    const g = game(['Mountain', 'Mountain', 'Plains', 'Plains', 'Island', 'Island']);
    g.act(0).cast(ENGINEERING.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(at(g, 'Swamp', 'battlefield', 0), at(g, 'Swamp', 'battlefield', 1));
    g.act(0).chooseCards(
      at(g, 'Mountain', 'library', 0),
      at(g, 'Mountain', 'library', 1),
      at(g, 'Plains', 'library', 0),
      at(g, 'Plains', 'library', 1),
    );
    const lands = onBattlefield(g, 0);
    expect(count(lands, 'Swamp')).toBe(0);
    expect(count(lands, 'Forest')).toBe(4);
    expect(count(lands, 'Mountain')).toBe(2);
    expect(count(lands, 'Plains')).toBe(2);
    for (const land of ['Mountain', 'Plains']) {
      for (const nth of [0, 1]) g.expect.tapped({ name: land, zone: 'battlefield', nth }, true);
    }
    g.expect.librarySize(0, 2);
    g.expect.eventLog(
      [
        { kind: 'librarySearched', seat: 0, found: 4 },
        { kind: 'libraryShuffled', seat: 0 },
      ],
      { since: 0 },
    );
    g.expect.invariants();
  });

  test('the sacrifice is of two lands the player chooses, whichever they are, and goes to the graveyard first', () => {
    const g = game(['Mountain', 'Island']);
    g.act(0).cast(ENGINEERING.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(at(g, 'Swamp', 'battlefield', 0), at(g, 'Forest', 'battlefield', 0));
    expect(g.find({ name: 'Swamp', zone: 'graveyard' })).toHaveLength(1);
    expect(g.find({ name: 'Forest', zone: 'graveyard' })).toHaveLength(1);
    // Neither is in the library to be found: only the Mountain and the Island are there.
    g.expect.librarySize(0, 2);
    g.expect.invariants();
  });

  test('it finds fewer than four when the library has fewer basic lands (CR 701.23b)', () => {
    const g = game(['Mountain', 'Plains', 'Grizzly Bears']);
    g.act(0).cast(ENGINEERING.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(at(g, 'Swamp', 'battlefield', 0), at(g, 'Swamp', 'battlefield', 1));
    g.act(0).chooseCards(at(g, 'Mountain', 'library'), at(g, 'Plains', 'library'));
    const lands = onBattlefield(g, 0);
    expect(count(lands, 'Mountain')).toBe(1);
    expect(count(lands, 'Plains')).toBe(1);
    g.expect.librarySize(0, 1);
    g.expect.invariants();
  });

  test('four cannot be exceeded: a fifth choice is refused', () => {
    const g = game(['Mountain', 'Mountain', 'Plains', 'Plains', 'Island']);
    g.act(0).cast(ENGINEERING.name, { pay: true });
    g.passAll();
    g.act(0).choosePermanents(at(g, 'Swamp', 'battlefield', 0), at(g, 'Swamp', 'battlefield', 1));
    const accepted = choosesCards(g, [
      at(g, 'Mountain', 'library', 0),
      at(g, 'Mountain', 'library', 1),
      at(g, 'Plains', 'library', 0),
      at(g, 'Plains', 'library', 1),
      at(g, 'Island', 'library'),
    ]);
    expect(accepted).toBe(false);
  });
});

describe('Through the Forest Gate ("Look at the top twenty cards of your library, put any number of land cards from among them onto the battlefield tapped, then shuffle. You gain 8 life.")', () => {
  const GATE = real('Through the Forest Gate');

  test('read as a look at the top twenty taking up to twenty lands tapped, a shuffle and 8 life', () => {
    expect(GATE.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        {
          kind: 'lookAtTop',
          count: 20,
          take: { filter: { types: ['land'] }, max: 20, to: 'battlefield', tapped: true },
          rest: 'top',
        },
        { kind: 'shuffle', player: { kind: 'you' } },
        { kind: 'gainLife', amount: 8 },
      ],
    });
  });

  // The top twenty: five lands among fifteen others; two more lands below them that are out of reach.
  const top = [
    'Forest',
    'Island',
    'Island',
    'Mountain',
    'Island',
    'Island',
    'Island',
    'Plains',
    'Island',
    'Island',
    'Swamp',
    'Island',
    'Island',
    'Island',
    'Island',
    'Island',
    'Island',
    'Island',
    'Island',
    'Forest',
  ];
  const game = () =>
    scenario()
      .define(GATE)
      .seat(0)
      .hand(GATE.name)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library(...top, 'Mountain', 'Plains', 'Grizzly Bears')
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the lands among the top twenty enter tapped, the others stay, the library is shuffled and the player gains 8 life', () => {
    const g = game();
    const life = getView(g.state, 0).seats[0]?.life ?? 0;
    g.act(0).cast(GATE.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards(
      at(g, 'Mountain', 'library', 0),
      at(g, 'Plains', 'library', 0),
      at(g, 'Swamp', 'library', 0),
    );
    const lands = onBattlefield(g, 0);
    expect(count(lands, 'Mountain')).toBe(1);
    expect(count(lands, 'Plains')).toBe(1);
    expect(count(lands, 'Swamp')).toBe(1);
    g.expect.tapped({ name: 'Swamp', zone: 'battlefield' }, true);
    g.expect.tapped({ name: 'Plains', zone: 'battlefield' }, true);
    g.expect.tapped({ name: 'Mountain', zone: 'battlefield' }, true);
    g.expect.librarySize(0, 20);
    expect(getView(g.state, 0).seats[0]?.life).toBe(life + 8);
    g.expect.eventLog([{ kind: 'libraryShuffled', seat: 0 }], { since: 0 });
    g.expect.invariants();
  });

  test('any number includes none: the player may put no land and still shuffles and gains life', () => {
    const g = game();
    const life = getView(g.state, 0).seats[0]?.life ?? 0;
    g.act(0).cast(GATE.name, { pay: true });
    g.passAll();
    g.act(0).chooseCards();
    expect(onBattlefield(g, 0)).not.toContain('Mountain');
    g.expect.librarySize(0, 23);
    expect(getView(g.state, 0).seats[0]?.life).toBe(life + 8);
    g.expect.invariants();
  });

  test('a land below the top twenty cannot be chosen', () => {
    const g = game();
    g.act(0).cast(GATE.name, { pay: true });
    g.passAll();
    // The Mountain and the Plains at positions 21 and 22 are not among the cards looked at; the first Mountain in the library is the top one.
    expect(choosesCards(g, [at(g, 'Mountain', 'library', 1)])).toBe(false);
    // The Mountain among the top twenty can be.
    expect(choosesCards(g, [at(g, 'Mountain', 'library', 0)])).toBe(true);
  });
});

describe('Worldsoul\'s Rage ("~ deals X damage to any target. Put up to X land cards from your hand and/or graveyard onto the battlefield tapped.")', () => {
  const RAGE = real("Worldsoul's Rage");

  test('read as X damage to any target, then a choice of up to X lands of the hand and graveyard, tapped', () => {
    expect(RAGE.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'dealDamage' },
        {
          kind: 'moveToZone',
          objects: {
            kind: 'choose',
            count: { kind: 'x' },
            optional: true,
            alsoGraveyard: true,
            filter: { zone: 'hand', types: ['land'] },
          },
          to: 'battlefield',
          tapped: true,
        },
      ],
    });
  });

  const game = () =>
    scenario()
      .define(RAGE)
      .seat(0)
      .hand(RAGE.name, 'Forest', 'Mountain', 'Grizzly Bears')
      .graveyard('Plains', 'Swamp', 'Lightning Bolt')
      .battlefield('Mountain', 'Mountain', 'Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('X damage is dealt and up to X lands of the hand and the graveyard enter tapped (X = 3: two from the hand, one from the graveyard)', () => {
    const g = game();
    g.act(0).cast(RAGE.name, { x: 3, targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(getView(g.state, 1).seats[1]?.life).toBe(37);
    g.act(0).chooseCards(
      at(g, 'Forest', 'hand'),
      at(g, 'Mountain', 'hand'),
      at(g, 'Plains', 'graveyard'),
    );
    g.expect.zone('Plains', 'battlefield', { seat: 0 });
    g.expect.tapped('Plains', true);
    g.expect.tapped({ name: 'Mountain', zone: 'battlefield', nth: 2 }, true);
    g.expect.tapped({ name: 'Forest', zone: 'battlefield', nth: 3 }, true);
    g.expect.zone('Swamp', 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
    g.expect.invariants();
  });

  test('no more than X: with X = 1 a second land is refused', () => {
    const g = game();
    g.act(0).cast(RAGE.name, { x: 1, targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(choosesCards(g, [at(g, 'Forest', 'hand'), at(g, 'Plains', 'graveyard')])).toBe(false);
    expect(choosesCards(g, [at(g, 'Plains', 'graveyard')])).toBe(true);
  });

  test('a card that is not a land is not offered: Grizzly Bears of the hand and Lightning Bolt of the graveyard are refused', () => {
    const g = game();
    g.act(0).cast(RAGE.name, { x: 3, targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(choosesCards(g, [at(g, 'Grizzly Bears', 'hand')])).toBe(false);
    expect(choosesCards(g, [at(g, 'Lightning Bolt', 'graveyard')])).toBe(false);
  });

  test('the player may put none', () => {
    const g = game();
    g.act(0).cast(RAGE.name, { x: 2, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.act(0).chooseCards();
    g.expect.zone('Plains', 'graveyard', { seat: 0 });
    g.expect.zone('Forest', 'hand', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Nahiri\'s Lithoforming ("Sacrifice X lands. For each land sacrificed this way, draw a card. You may play X additional lands this turn. Lands you control enter tapped this turn.")', () => {
  const LITHO = real("Nahiri's Lithoforming");

  test('read as a sacrifice of X lands, a draw for each, X additional land plays and lands entering tapped until end of turn', () => {
    expect(LITHO.faces[0]?.spell?.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'sacrifice', objects: { kind: 'choose', count: { kind: 'x' } } },
        { kind: 'draw', count: { kind: 'thisWay', what: 'sacrificed' } },
        { kind: 'additionalLandDropThisTurn', count: { kind: 'x' } },
        {
          kind: 'permanentsEnterTapped',
          permanents: { types: ['land'], controller: 'you' },
          duration: 'untilEndOfTurn',
        },
      ],
    });
  });

  const game = (lands: readonly string[], hand: readonly string[] = []) =>
    scenario()
      .define(LITHO)
      .seat(0)
      .hand(LITHO.name, ...hand)
      .battlefield(...lands)
      .library(...BEARS)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  const handSize = (g: ScenarioGame): number => getView(g.state, 0).seats[0]?.hand?.length ?? 0;

  test('X = 2: two lands are sacrificed, two cards are drawn, two additional lands may be played and they enter tapped', () => {
    const g = game(
      ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Forest', 'Forest'],
      ['Plains', 'Island', 'Swamp', 'Forest'],
    );
    g.act(0).cast(LITHO.name, { x: 2, pay: true });
    g.passAll();
    g.act(0).choosePermanents(at(g, 'Forest', 'battlefield', 0), at(g, 'Forest', 'battlefield', 1));
    // Four cards in the hand (the spell left it): two more are drawn for the two lands.
    expect(handSize(g)).toBe(6);
    expect(g.find({ name: 'Forest', zone: 'graveyard' })).toHaveLength(2);
    // One land play and two additional ones: three lands, all tapped; the fourth is refused (CR 305.2a).
    g.act(0).playLand('Plains');
    g.act(0).playLand('Island');
    g.act(0).playLand('Swamp');
    g.expect.tapped('Plains', true);
    g.expect.tapped({ name: 'Island', zone: 'battlefield', seat: 0 }, true);
    g.expect.tapped('Swamp', true);
    expect(g.act(0).try.playLand('Forest').ok).toBe(false);
    g.expect.invariants();
  });

  test('with fewer lands than X every land is sacrificed, fewer cards are drawn and the additional land plays are still X (the ruling of 2020-09-25)', () => {
    const g = scenario()
      .define(LITHO)
      .seat(0)
      .hand(LITHO.name, 'Plains', 'Island', 'Swamp', 'Forest')
      .battlefield('Mountain', 'Mountain')
      .pool('RRR')
      .library(...BEARS)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(LITHO.name, { x: 3, pay: true });
    g.passAll();
    // Both lands are sacrificed without a question, and two cards are drawn (not three).
    expect(onBattlefield(g, 0)).not.toContain('Mountain');
    expect(handSize(g)).toBe(6);
    // 1 + 3 land plays: all four lands of the hand may be played.
    for (const land of ['Plains', 'Island', 'Swamp', 'Forest']) g.act(0).playLand(land);
    expect(count(onBattlefield(g, 0), 'Plains')).toBe(1);
    g.expect.invariants();
  });

  test('X = 0 sacrifices and draws nothing and adds no land play', () => {
    const g = game(['Mountain', 'Mountain'], ['Plains', 'Island']);
    g.act(0).cast(LITHO.name, { x: 0, pay: true });
    g.passAll();
    expect(handSize(g)).toBe(2);
    g.act(0).playLand('Plains');
    expect(g.act(0).try.playLand('Island').ok).toBe(false);
    g.expect.tapped('Plains', true);
    g.expect.invariants();
  });

  test('the lands of the opponent are not affected: they still enter untapped', () => {
    const g = game(['Mountain', 'Mountain', 'Mountain', 'Mountain'], []);
    g.act(0).cast(LITHO.name, { x: 2, pay: true });
    g.passAll();
    g.act(0).choosePermanents(
      at(g, 'Mountain', 'battlefield', 0),
      at(g, 'Mountain', 'battlefield', 1),
    );
    g.expect.invariants();
  });
});
