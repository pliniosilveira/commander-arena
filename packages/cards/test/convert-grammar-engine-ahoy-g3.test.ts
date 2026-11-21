// Ahoy Mateys deck, group 3 (put onto the battlefield tapped and attacking): Kari Zev, Skyship Raider ("Ragavan enters tapped and attacking. Exile that token at end of combat.")
// and Zara, Renegade Recruiter ("look at defending player's hand. You may put a creature card from it onto the battlefield under your control tapped and attacking ... Return that
// creature to its owner's hand at the beginning of the next end step."). The REAL Oracle text of each card (the golden corpus) goes through the grammar with no override, is defined in
// an engine scenario and is played through applyAction. Pins: CR 508.4 (a creature put onto the battlefield attacking was never declared as an attacker), CR 110.5b (tapped),
// CR 110.2a (it enters under the control of the player who put it there), CR 603.7 and 603.7c (a delayed triggered ability about that object), CR 511.2 (end of combat), CR 108.3 (the
// owner's hand), CR 402.3 (a hand is the player's own zone).
import { readFileSync } from 'node:fs';
import {
  type CardDefinition,
  type GameState,
  type ObjectId,
  validateCard,
} from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';

import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { dropped } from './parser-p5-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

/** The name of the card an object is, read from the state the way the web host reads the faces of the cards looked at. */
function nameOf(state: GameState, id: ObjectId): string | undefined {
  const card = state.objects[id]?.card;
  const stored = card === null || card === undefined ? undefined : state.cards[card];
  return stored === undefined ? undefined : state.definitions[stored.definition]?.faces[0]?.name;
}

const LIBRARY = Array.from({ length: 8 }, () => 'Island');
const BEARS = 'Grizzly Bears';
const BOLT = 'Lightning Bolt';

describe('Kari Zev, Skyship Raider: a legendary token tapped and attacking, exiled at end of combat', () => {
  const kari = real('Kari Zev, Skyship Raider');

  const attack = () => {
    const g = scenario()
      .define(kari)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(kari.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: kari.name }]);
    g.passAll();
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(kari)).toEqual([]);
  });

  test('attacking creates Ragavan, a legendary 2/1 red Monkey, tapped and attacking, never declared (CR 508.4, 110.5b)', () => {
    const g = attack();
    g.expect.zone('Ragavan', 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped('Ragavan');
    g.expect.pt('Ragavan', 2, 1);
    g.expect.derived('Ragavan', {
      subtypes: ['Monkey'],
      colors: ['R'],
      supertypes: ['legendary'],
    });
    g.expect.combat({ attackers: [kari.name, 'Ragavan'], unblocked: [kari.name, 'Ragavan'] });
    g.expect.invariants();
  });

  test('both deal damage: first strike 1 and then 2 from the token', () => {
    const g = attack();
    g.advanceTo('endOfCombat');
    g.expect.life(1, 37);
  });

  test('the token is exiled at the beginning of the end of combat step (CR 511.2, 603.7)', () => {
    const g = attack();
    g.expect.zone('Ragavan', 'battlefield', { count: 1 });
    g.advanceTo('endOfCombat');
    g.passAll();
    g.expect.zone('Ragavan', 'battlefield', { count: 0 });
    g.expect.zone(kari.name, 'battlefield', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test.each([
    [
      'another state',
      'Whenever ~ attacks, create Ragavan, a legendary 2/1 red Monkey creature token. Ragavan enters attacking.',
    ],
    [
      'a different name in the second sentence',
      'Whenever ~ attacks, create Ragavan, a legendary 2/1 red Monkey creature token. Kari enters tapped and attacking.',
    ],
    [
      'the end of the next end step',
      'Whenever ~ attacks, create Ragavan, a legendary 2/1 red Monkey creature token. Ragavan enters tapped and attacking. Exile that token at the end of the next end step.',
    ],
    [
      'an attack of another creature',
      'Whenever a creature you control attacks, create Ragavan, a legendary 2/1 red Monkey creature token. Ragavan enters tapped and attacking.',
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});

describe("Zara, Renegade Recruiter: a creature from the defending player's hand, tapped and attacking", () => {
  const zara = real('Zara, Renegade Recruiter');

  const build = (...theirHand: readonly string[]) =>
    scenario()
      .define(zara)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(zara.name)
      .seat(1)
      .library(...LIBRARY)
      .hand(...theirHand)
      .at('precombatMain', { active: 0 })
      .build();

  const attack = (...theirHand: readonly string[]) => {
    const g = build(...theirHand);
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: zara.name }]);
    g.passAll();
    return g;
  };

  test('the card is valid', () => {
    expect(validateCard(zara)).toEqual([]);
  });

  test('the controller is asked, and only the creature cards of that hand can be chosen (CR 608.2d, 402.3)', () => {
    const g = attack(BEARS, BOLT);
    g.expect.pending('chooseCards', 0);
    const shown = g.view(0).pendingCards ?? [];
    expect(shown.map((o) => o.name)).toEqual([BEARS]);
  });

  test('the whole hand is looked at, not only the creature cards (CR 402.3)', () => {
    const g = attack(BEARS, BOLT);
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the choice of a card');
    const names = (d.looked ?? []).map((id) => nameOf(g.state, id));
    expect(names.sort()).toEqual([BEARS, BOLT].sort());
    expect(d.legal).toHaveLength(1);
  });

  test('the creature enters under the control of Zara’s controller, tapped and attacking, never declared (CR 508.4, 110.2a, 110.5b)', () => {
    const g = attack(BEARS, BOLT);
    g.act(0).chooseCards({ name: BEARS, seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 1 });
    g.expect.tapped(BEARS);
    g.expect.combat({ attackers: [zara.name, BEARS] });
    g.expect.zone(BOLT, 'hand', { seat: 1, count: 1 });
    g.expect.invariants();
  });

  test('it returns to its owner’s hand at the beginning of the next end step (CR 603.7c, 108.3)', () => {
    const g = attack(BEARS);
    g.act(0).chooseCards({ name: BEARS, seat: 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 1, count: 1 });
    g.expect.zone(BEARS, 'battlefield', { count: 0 });
    g.expect.invariants();
  });

  test('declining puts nothing onto the battlefield and nothing returns later', () => {
    const g = attack(BEARS);
    g.act(0).chooseCards();
    g.expect.zone(BEARS, 'battlefield', { count: 0 });
    g.expect.zone(BEARS, 'hand', { seat: 1, count: 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'hand', { seat: 1, count: 1 });
  });

  test('a hand with no creature card is still shown, and nothing can be chosen (CR 402.3)', () => {
    const g = attack(BOLT);
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error('expected the hand to be shown');
    expect(d).toMatchObject({ seat: 0, min: 0, max: 0, legal: [] });
    expect((d.looked ?? []).map((id) => nameOf(g.state, id))).toEqual([BOLT]);
    g.act(0).chooseCards();
    g.expect.zone(BOLT, 'hand', { seat: 1, count: 1 });
    g.expect.combat({ attackers: [zara.name] });
    g.advanceTo('end');
    g.expect.zone(BOLT, 'hand', { seat: 1, count: 1 });
  });

  test('an empty hand shows nothing and asks nothing', () => {
    const g = attack();
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    g.expect.combat({ attackers: [zara.name] });
  });

  test('the creature attacks the player or a planeswalker that player controls, as its controller chooses (CR 508.4)', () => {
    const PW = 'SYNTHETIC Vanilla Planeswalker';
    const g = scenario()
      .define(zara)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(zara.name)
      .seat(1)
      .library(...LIBRARY)
      .hand(BEARS)
      .battlefield(PW)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: zara.name }]);
    g.passAll();
    g.act(0).chooseCards({ name: BEARS, seat: 1 });
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the choice of what to attack');
    expect(d).toMatchObject({ seat: 0, purpose: 'attackTarget' });
    expect(d.options).toHaveLength(2);
    g.act(0).chooseOption(`permanent:${g.object(PW).id}`);
    g.expect.combat({ attackers: [zara.name, BEARS] });
    g.expect.invariants();
  });

  test('the card is on the battlefield only after the choice: Zara’s own hand is not looked at', () => {
    const g = build(BEARS);
    g.expect.zone(BEARS, 'hand', { seat: 1, count: 1 });
  });

  test.each([
    [
      'a land card',
      "Whenever ~ attacks, look at defending player's hand. You may put a land card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control. Return that creature to its owner's hand at the beginning of the next end step.",
    ],
    [
      'another player’s hand',
      "Whenever ~ attacks, look at target player's hand. You may put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control.",
    ],
    [
      'no "may"',
      "Whenever ~ attacks, look at defending player's hand. Put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control.",
    ],
    [
      'a return at your next end step',
      "Whenever ~ attacks, look at defending player's hand. You may put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control. Return that creature to its owner's hand at the beginning of your next end step.",
    ],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });

  test('a creature that is not an attack trigger’s is refused: another trigger does not read the sentence', () => {
    expect(
      dropped(
        "When ~ enters, look at defending player's hand. You may put a creature card from it onto the battlefield under your control tapped and attacking that player or a planeswalker they control.",
        'creature',
      ),
    ).toBeDefined();
  });
});
