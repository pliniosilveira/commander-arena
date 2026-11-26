// Foreboding Steamboat (Revenant Recon deck): "When this Vehicle enters, each player chooses two nontoken, non-Vehicle creatures they control. Exile them until this Vehicle leaves the
// battlefield." and "Whenever this Vehicle attacks, put a card exiled with it into its owner's graveyard. If you do, investigate." Imported through the grammar (never a fixture), defined in
// an engine scenario and played through applyAction. Every card name starts with "SYNTHETIC"; the wording is that of the real card, taken from the golden corpus.
// Rules pinned: CR 608.2d, 101.4, 610.3, 607.2a, 400.3, 701.16. The rule numbers are unchecked: the rules text was not available to this session.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed } from './convert-grammar-helpers';

const BEARS = 'Grizzly Bears';
const SERRA = 'Serra Angel';
const SPIDER = 'Giant Spider';
const ELVES = 'Llanowar Elves';
const BIG = 'SYNTHETIC Vanilla 3/3';
const FILLER = Array.from({ length: 10 }, () => 'Plains');

const STEAMBOAT = parsed(
  'SYNTHETIC Parsed Steamboat',
  'Artifact — Vehicle',
  "When this Vehicle enters, each player chooses two nontoken, non-Vehicle creatures they control. Exile them until this Vehicle leaves the battlefield.\nWhenever this Vehicle attacks, put a card exiled with it into its owner's graveyard. If you do, investigate.\nCrew 2",
  { manaCost: '{3}{B}{B}', colors: ['B'], power: '5', toughness: '7' },
);
const SHATTER = parsed('SYNTHETIC Parsed Shatter', 'Instant', 'Destroy target artifact.', {
  manaCost: '{1}{B}',
  colors: ['B'],
});

describe('Foreboding Steamboat: the grammar reads the exile as a choice of each player', () => {
  test('two nontoken, non-Vehicle creatures each player controls, until it leaves, linked to it', () => {
    const [enters] = STEAMBOAT.faces[0]?.abilities ?? [];
    expect(enters).toMatchObject({
      kind: 'triggered',
      effect: {
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: {
            types: ['creature'],
            token: false,
            notSubtypes: ['Vehicle'],
            controller: 'you',
          },
          players: { kind: 'eachPlayer' },
          count: 2,
        },
        to: 'exile',
        until: 'sourceLeaves',
        linked: true,
      },
    });
  });
});

describe('Foreboding Steamboat: exile two creatures of each player until it leaves; put one into a graveyard when it attacks', () => {
  /** Three seats; seat 0 casts the Vehicle with a Shatter in hand. Seat 2 controls a single creature, seat 1 three. */
  const board = () =>
    scenario({ seats: 3 })
      .define(STEAMBOAT)
      .define(SHATTER)
      .seat(0)
      .library(...FILLER)
      .hand(STEAMBOAT.name, SHATTER.name)
      .battlefield('Swamp', { count: 7 })
      .battlefield(BEARS, { count: 3 })
      .seat(1)
      .library(...FILLER)
      .battlefield(SPIDER, ELVES, BIG)
      .seat(2)
      .library(...FILLER)
      .battlefield(SERRA)
      .at('precombatMain', { active: 0 })
      .build();

  const enter = () => {
    const g = board();
    g.act(0).cast(STEAMBOAT.name, { pay: true });
    g.passAll();
    // Seat 0 controls three, so it chooses two; seat 1 chooses two of three; seat 2 has one, so it is exiled without asking (CR 608.2d).
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents(`${BEARS}[0]`, `${BEARS}[1]`);
    g.expect.pending('choosePermanent', 1);
    g.act(1).choosePermanents(SPIDER, ELVES);
    return g;
  };

  test('the chosen creatures are exiled, the others stay, and a player with fewer than two exiles what they have', () => {
    const g = enter();
    g.expect.zone(BEARS, 'exile', { seat: 0, count: 2 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 1 });
    g.expect.zone(SPIDER, 'exile', { seat: 1 });
    g.expect.zone(ELVES, 'exile', { seat: 1 });
    g.expect.zone(BIG, 'battlefield', { seat: 1 });
    g.expect.zone(SERRA, 'exile', { seat: 2 });
    g.expect.zone(STEAMBOAT.name, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('when it leaves the battlefield every creature returns under its owner control', () => {
    const g = enter();
    g.act(0).cast(SHATTER.name, { targets: [STEAMBOAT.name], pay: true });
    g.passAll();
    g.expect.zone(STEAMBOAT.name, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 0, count: 3 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.zone(ELVES, 'battlefield', { seat: 1 });
    g.expect.zone(SERRA, 'battlefield', { seat: 2 });
    g.expect.invariants();
  });

  test('when it attacks its controller puts one exiled card into its owner graveyard and investigates', () => {
    const g = enter();
    // Seat 0's next turn: the Vehicle is no longer summoning sick; the remaining Bears crew it.
    g.advanceTo('precombatMain', { turn: g.state.turn.number + 3 });
    g.act(0).activate(STEAMBOAT.name);
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: STEAMBOAT.name, target: { player: 1 } }]);
    g.passAll();
    // The four cards exiled with it are the choice, among several players' cards.
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards({ name: SERRA, zone: 'exile', seat: 2 });
    g.passAll();
    g.expect.zone(SERRA, 'graveyard', { seat: 2 });
    g.expect.zone(BEARS, 'exile', { seat: 0, count: 2 });
    g.expect.zone('Clue', 'battlefield', { seat: 0 });
    g.expect.invariants();
  });
});

describe('Foreboding Steamboat: with nothing exiled with it, attacking does nothing ("If you do")', () => {
  test('no card is put into a graveyard and no Clue is made', () => {
    const g = scenario()
      .define(STEAMBOAT)
      .seat(0)
      .library(...FILLER)
      .battlefield(STEAMBOAT.name)
      .battlefield(BEARS)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).activate(STEAMBOAT.name);
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).declareAttackers([{ attacker: STEAMBOAT.name, target: { player: 1 } }]);
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    expect(g.find({ name: 'Clue' })).toHaveLength(0);
    g.expect.invariants();
  });
});
