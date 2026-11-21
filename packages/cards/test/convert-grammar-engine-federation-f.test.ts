// The Federation Fleet deck, group F (exile, time counters, the command zone and a free cast): the REAL Oracle text of Chronomantic Escape, Temporal Tribulation, Stonespeaker Crystal, Command
// Beacon, Tuvok, Chief Tactical Officer and Cmdr. Troi, Outgoing Empath (the corpus's golden.jsonl, taken from the issue) goes through the grammar as a card with no override, is defined in an
// engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs.
// Pins (rule numbers the repository's own comments already cite; the rules text is not in this worktree, so none is quoted): CR 508.1a and 500.1 (a creature that can't attack a player; "until your
// next turn"), CR 122.1 and 702.62 (time counters and suspend), CR 603.7 and 603.7c (the delayed return), CR 110.2 (under whose control), CR 404.1 and 108.3 (graveyards and owners), CR 903.3 (a
// commander), CR 508.7 (reselecting what an attacker attacks), CR 603.4 (an intervening "if": "during the declare attackers step"), CR 115.1 (a target opponent whose turn it is), CR 608.2g and 118.9
// (a free cast during a resolution), CR 707.10 (a copy of a spell), CR 608.2c ("if they do").
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const ESCAPE = real('Chronomantic Escape');
const TRIBULATION = real('Temporal Tribulation');
const CRYSTAL = real('Stonespeaker Crystal');
const BEACON = real('Command Beacon');
const TUVOK = real('Tuvok, Chief Tactical Officer');
const TROI = real('Cmdr. Troi, Outgoing Empath');

const BEARS = 'Grizzly Bears';
const ELVES = 'Llanowar Elves';
const ANGEL = 'Serra Angel';
const BOLT = 'Lightning Bolt';
const WALKER = 'SYNTHETIC Vanilla Planeswalker'; // loyalty 4
const ISAMARU = 'Isamaru, Hound of Konda';
const FILLER = Array.from({ length: 8 }, () => 'Island');

describe('every card is valid', () => {
  test.each([
    ['Chronomantic Escape', ESCAPE],
    ['Temporal Tribulation', TRIBULATION],
    ['Stonespeaker Crystal', CRYSTAL],
    ['Command Beacon', BEACON],
    ['Tuvok, Chief Tactical Officer', TUVOK],
    ['Cmdr. Troi, Outgoing Empath', TROI],
  ] as const)('%s', (_name, card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('Chronomantic Escape: "Until your next turn, creatures can\'t attack you. Exile ~ with three time counters on it."', () => {
  const game = () =>
    scenario()
      .define(ESCAPE)
      .seat(0)
      .hand(ESCAPE.name)
      .library(...FILLER)
      .battlefield('Plains', { count: 6 })
      .seat(1)
      .library(...FILLER)
      .battlefield(BEARS, ELVES)
      .at('precombatMain', { active: 0 })
      .build();

  test('it is exiled with three time counters (suspended), not put into the graveyard (CR 122.1, 702.62)', () => {
    const g = game();
    g.act(0).cast(ESCAPE.name, { pay: true });
    g.passAll();
    g.expect.zone(ESCAPE.name, 'exile', { seat: 0 });
    g.expect.counters(ESCAPE.name, { time: 3 });
    g.expect.noObject(ESCAPE.name, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test("no creature can attack its controller on the opponent's turn (CR 508.1a)", () => {
    const g = game();
    g.act(0).cast(ESCAPE.name, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { turn: 'next', attack: false });
    g.expect.step('declareAttackers', { active: 1 });
    g.expect.illegal(1, { declareAttackers: [{ attacker: BEARS, target: { player: 0 } }] });
    g.expect.illegal(1, { declareAttackers: [{ attacker: ELVES, target: { player: 0 } }] });
    g.expect.invariants();
  });

  test("at the controller's next upkeep the suspend ability removes a time counter, and the restriction is over (CR 500.1)", () => {
    const g = game();
    g.act(0).cast(ESCAPE.name, { pay: true });
    g.passAll();
    // No creature of the opponent can attack, so no attack is declared and the turn goes on.
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 1 });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.step('upkeep', { active: 0 });
    g.passAll();
    g.expect.counters(ESCAPE.name, { time: 2 });
  });
});

describe('Temporal Tribulation: "Exile two target permanents you control. Return those cards to the battlefield under their owner\'s control at the beginning of the next end step."', () => {
  const game = (stolen = false) =>
    scenario()
      .define(TRIBULATION)
      .seat(0)
      .hand(TRIBULATION.name)
      .library(...FILLER)
      .battlefield('Island', { count: 3 })
      .battlefield(BEARS)
      .seat(1)
      .library(...FILLER)
      .battlefield(ELVES, stolen ? { controller: 0 } : {})
      .at('precombatMain', { active: 0 })
      .build();

  test('two permanents you control: exiled when the spell resolves, back in the end step, untapped', () => {
    const g = scenario()
      .define(TRIBULATION)
      .seat(0)
      .hand(TRIBULATION.name)
      .library(...FILLER)
      .battlefield('Island', { count: 3 })
      .battlefield(BEARS, ELVES)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(TRIBULATION.name, { targets: [{ name: BEARS }, { name: ELVES }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ELVES, 'exile', { seat: 0 });
    g.expect.zone(TRIBULATION.name, 'graveyard', { seat: 0 });
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(ELVES, 'battlefield', { seat: 0 });
    g.expect.tapped(BEARS, false);
    g.expect.invariants();
  });

  test("a permanent you control but do not own returns under its OWNER's control (CR 110.2)", () => {
    const g = game(true);
    g.act(0).cast(TRIBULATION.name, { targets: [{ name: BEARS }, { name: ELVES }], pay: true });
    g.passAll();
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Stonespeaker Crystal: "{2}, {T}, Sacrifice this artifact: Exile any number of target players\' graveyards. Draw a card."', () => {
  const game = () =>
    scenario()
      .define(CRYSTAL)
      .seat(0)
      .library(...FILLER)
      .battlefield(CRYSTAL.name)
      .battlefield('Island', { count: 2 })
      .graveyard(BEARS, ELVES)
      .seat(1)
      .library(...FILLER)
      .graveyard(ANGEL, BOLT)
      .at('precombatMain', { active: 0 })
      .build();

  test('the graveyards of the players chosen are exiled (CR 404.1), the artifact is sacrificed and a card is drawn', () => {
    const g = game();
    g.act(0).activate(CRYSTAL.name, { targets: [{ player: 0 }, { player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.zone(ELVES, 'exile', { seat: 0 });
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    g.expect.zone(BOLT, 'exile', { seat: 1 });
    // The artifact was sacrificed as a cost, so it is a card in its owner's graveyard when the effect resolves: it is exiled with the rest of that graveyard.
    g.expect.zone(CRYSTAL.name, 'exile', { seat: 0 });
    g.expect.handSize(0, 1);
    g.expect.invariants();
  });

  test('only the graveyard of the player chosen: the other graveyard is left alone', () => {
    const g = game();
    g.act(0).activate(CRYSTAL.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    g.expect.zone(BOLT, 'exile', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(ELVES, 'graveyard', { seat: 0 });
    g.expect.zone(CRYSTAL.name, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 1);
  });

  test('"any number" includes none: nothing is exiled and the card is still drawn', () => {
    const g = game();
    g.act(0).activate(CRYSTAL.name, { targets: [], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 1);
  });
});

describe('Command Beacon: "{T}, Sacrifice this land: Put your commander into your hand from the command zone."', () => {
  const game = (casts = 0) =>
    scenario()
      .define(BEACON)
      .seat(0)
      .library(...FILLER)
      .battlefield(BEACON.name)
      .commander(ISAMARU, { casts })
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the commander goes from the command zone to the hand and the land is sacrificed (CR 903.3)', () => {
    const g = game();
    g.act(0).activate(BEACON.name);
    g.passAll();
    g.expect.zone(ISAMARU, 'hand', { seat: 0 });
    g.expect.noObject(ISAMARU, { zone: 'command' });
    g.expect.zone(BEACON.name, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the land still taps for {C}: the first ability is a mana ability', () => {
    const g = game();
    g.act(0).tapForMana(BEACON.name);
    g.expect.pool(0, 'C');
  });
});

describe('Tuvok, Chief Tactical Officer: "When ~ enters during the declare attackers step, choose up to two target attacking creatures. For each of them, you may reselect ..."', () => {
  const attacked = () => {
    const g = scenario()
      .define(TUVOK)
      .seat(0)
      .library(...FILLER)
      .battlefield(BEARS, ELVES)
      .seat(1)
      .library(...FILLER)
      .hand(TUVOK.name)
      .battlefield('Island', { count: 3 })
      .battlefield(WALKER)
      .at('precombatMain', { active: 0 })
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: BEARS }, { attacker: ELVES }]);
    g.act(0).pass();
    return g;
  };

  test('flashed in during the declare attackers step, it reselects what each target attacks (CR 508.7)', () => {
    const g = attacked();
    g.act(1).cast(TUVOK.name, { pay: true });
    g.passAll();
    // The trigger targets up to two attacking creatures.
    g.expect.pending('targets', 1);
    g.act(1).chooseTargets({ name: BEARS }, { name: ELVES });
    g.passAll();
    // One question for each target: the planeswalker or the player; the current target is among the options.
    const first = g.state.pending;
    if (first?.kind !== 'chooseOption') throw new Error('expected the choice of what to attack');
    expect(first).toMatchObject({ seat: 1, purpose: 'attackTarget' });
    expect(first.options).toHaveLength(2);
    g.act(1).chooseOption(`permanent:${g.object(WALKER).id}`);
    const second = g.state.pending;
    if (second?.kind !== 'chooseOption') throw new Error('expected the second choice');
    // The second creature keeps attacking the player.
    g.act(1).chooseOption('player:1');
    const attackers = g.state.combat?.attackers ?? [];
    expect(attackers).toHaveLength(2);
    expect(attackers.find((a) => a.object === g.id(BEARS))?.target).toEqual({
      kind: 'permanent',
      object: g.id(WALKER),
    });
    expect(attackers.find((a) => a.object === g.id(ELVES))?.target).toEqual({
      kind: 'player',
      seat: 1,
    });
    g.expect.invariants();
  });

  test('it targets up to two: one attacker, or none, is fine', () => {
    const g = attacked();
    g.act(1).cast(TUVOK.name, { pay: true });
    g.passAll();
    g.act(1).chooseTargets({ name: BEARS });
    g.passAll();
    g.act(1).chooseOption('player:1');
    g.expect.invariants();
  });

  test('cast in another step it does nothing (CR 603.4)', () => {
    const g = scenario()
      .define(TUVOK)
      .seat(0)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .hand(TUVOK.name)
      .battlefield('Island', { count: 3 })
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(TUVOK.name, { pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(TUVOK.name, 'battlefield', { seat: 1 });
  });
});

describe('Cmdr. Troi, Outgoing Empath: "{T}: Target opponent whose turn it is may cast a spell from their hand without paying its mana cost. If they do, ... copy ... If they don\'t, you draw a card."', () => {
  const game = (hand: readonly string[] = [BOLT], activePlayer: 0 | 1 = 1) =>
    scenario()
      .define(TROI)
      .seat(0)
      .life(20)
      .library(...FILLER)
      .battlefield(TROI.name)
      .seat(1)
      .life(20)
      .library(...FILLER)
      .hand(...hand)
      .at('precombatMain', { active: activePlayer, priority: 0 })
      .build();

  test("on its controller's own turn there is no legal target (CR 115.1, 500.1)", () => {
    const g = game([BOLT], 0);
    expect(g.act(0).try.activate(TROI.name).ok).toBe(false);
  });

  test('the opponent casts a spell for free, and the controller copies it, choosing new targets (CR 608.2g, 707.10)', () => {
    const g = game();
    g.act(0).activate(TROI.name, { targets: [{ player: 1 }] });
    g.passAll();
    g.expect.pending('chooseCards', 1);
    g.act(1).chooseCards(BOLT);
    g.act(1).chooseTargets({ player: 0 });
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.passAll();
    g.expect.life(0, 17);
    g.expect.life(1, 17);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('if they cast nothing, the controller draws a card (CR 608.2c)', () => {
    const g = game();
    g.act(0).activate(TROI.name, { targets: [{ player: 1 }] });
    g.passAll();
    g.act(1).chooseCards();
    g.expect.handSize(0, 1);
    g.expect.zone(BOLT, 'hand', { seat: 1 });
    g.expect.invariants();
  });
});
