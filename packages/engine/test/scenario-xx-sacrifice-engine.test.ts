// A sacrifice engine, written with SYNTHETIC cards: the acceptance scenarios of
// docs/proposals/triggered-abilities.md (the first card of M5) and scenario test 18 of SPEC 12.
// Pins: CR 603.2, 603.3, 603.3b (APNAP, each player orders their own), 603.10a, 113.7a,
// CR 701.21 (sacrifice), CR 608.2d (choices on resolution), CR 122.1b (+1/+1 counters).
// SYNTHETIC Sacrifice Dragon: Flying. Whenever this creature enters or attacks, sacrifice another
// permanent. Whenever you sacrifice a permanent, put a +1/+1 counter on it and draw a card.
import { describe, expect, test } from 'vitest';
import { syntheticCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';

const DRAGON = 'SYNTHETIC Sacrifice Dragon';
const FILLER = ['Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains'] as const;

const dragonFace = syntheticCard(DRAGON).faces[0];
const printedPower = Number(dragonFace?.power);
const printedToughness = Number(dragonFace?.toughness);

function resolveTop(g: ScenarioGame): ScenarioGame {
  g.pass();
  return g.pass();
}

function castDragon(g: ScenarioGame) {
  g.act(0).cast(DRAGON, { pay: true });
  resolveTop(g);
}

describe('the sacrifice engine enters', () => {
  test('with one other permanent the choice is automatic, then the second ability pays off', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON)
      .pool('CCCB')
      .battlefield('Forest')
      .library(...FILLER)
      .seat(1)
      .build();
    castDragon(g);
    g.expect.stack([`${DRAGON} (ability)`]);
    resolveTop(g);
    // The enters ability resolved: the Forest was sacrificed without asking.
    g.expect.zone('Forest', 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'permanentsChosen', automatic: true, purpose: 'sacrifice' }]);
    // That sacrifice triggered the second ability, which waits on the stack (CR 603.3).
    g.expect.stack([`${DRAGON} (ability)`]);
    g.expect.counters(DRAGON, {});
    g.expect.handSize(0, 0);
    resolveTop(g);
    g.expect.counters(DRAGON, { '+1/+1': 1 });
    g.expect.handSize(0, 1);
    g.expect.stack([]);
    // Power and toughness come from the card data plus the counter.
    const d = derive(g.state, g.object(DRAGON));
    expect([d.power, d.toughness]).toEqual([printedPower + 1, printedToughness + 1]);
    expect(g.view(0).battlefield.find((o) => o.name === DRAGON)?.power).toBe(printedPower + 1);
  });

  test('with several candidates the controller chooses; the engine never offers the source', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON)
      .pool('CCCB')
      .battlefield('Forest', 'Plains', 'Grizzly Bears')
      .library(...FILLER)
      .seat(1)
      .battlefield('Swamp')
      .build();
    castDragon(g);
    resolveTop(g);
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    const dragon = g.id(DRAGON);
    expect(d.legal).not.toContain(dragon);
    expect(d.legal).toHaveLength(3);
    // The source (a permanent they control) and the opponent's permanent are not legal answers.
    expect(g.act(0).try.action({ kind: 'choosePermanents', objects: [dragon] }).ok).toBe(false);
    expect(
      g.act(0).try.action({ kind: 'choosePermanents', objects: [g.id({ name: 'Swamp' })] }).ok,
    ).toBe(false);
    g.act(0).choosePermanents('Grizzly Bears');
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 0 });
    g.expect.stack([`${DRAGON} (ability)`]);
    g.passAll();
    g.expect.counters(DRAGON, { '+1/+1': 1 });
    g.expect.handSize(0, 1);
  });

  test('with no other permanent nothing happens (CR 608.2d)', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON)
      .pool('CCCB')
      .library(...FILLER)
      .seat(1)
      .build();
    castDragon(g);
    resolveTop(g);
    g.expect.stack([]);
    g.expect.zone(DRAGON, 'battlefield', { seat: 0 });
    g.expect.counters(DRAGON, {});
    g.expect.noEvent({ kind: 'sacrificed' });
    g.expect.pending('priority', 0);
  });

  test('a sacrificed commander goes to the graveyard and may then go to the command zone', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON)
      .pool('CCCB')
      .battlefield('Isamaru, Hound of Konda', { commander: true })
      .library(...FILLER)
      .seat(1)
      .build();
    castDragon(g);
    resolveTop(g);
    // CR 903.9a: the owner is asked at the next state-based action check.
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone('Isamaru, Hound of Konda', 'command', { seat: 0 });
    // The sacrifice still triggered the dragon.
    g.expect.stack([`${DRAGON} (ability)`]);
  });
});

describe('the sacrifice engine attacks', () => {
  test('attacking sacrifices again, and every sacrifice grows it', () => {
    const g = scenario()
      .seat(0)
      .battlefield(DRAGON, 'Forest', 'Plains')
      .library(...FILLER)
      .seat(1)
      .build();
    g.advanceTo('declareAttackers', { attack: false });
    g.act(0).attack(DRAGON);
    g.expect.stack([`${DRAGON} (ability)`]);
    resolveTop(g);
    g.expect.pending('choosePermanent', 0);
    g.act(0).choosePermanents('Forest');
    g.expect.stack([`${DRAGON} (ability)`]);
    g.passAll();
    g.expect.counters(DRAGON, { '+1/+1': 1 });
    g.expect.handSize(0, 1);
    // The attack goes on with the counter it just got (CR 122.1b).
    g.advanceTo('combatDamage');
    g.expect.life(1, 40 - (printedPower + 1));
  });

  test('two sacrifices in one resolution trigger the watcher twice (CR 603.2c)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Land Edict')
      .pool('B')
      .battlefield(DRAGON, 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Land Edict', { pay: true });
    g.passAll();
    g.expect.counters(DRAGON, { '+1/+1': 2 });
    g.expect.handSize(0, 2);
  });
});

describe('both players have triggers (SPEC test 18, CR 603.3b)', () => {
  test('the active player orders theirs and they go on the stack first: the opponent resolves first', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON)
      .pool('CCCB')
      .battlefield('Forest', 'SYNTHETIC Sacrifice Lifegainer')
      .library(...FILLER)
      .seat(1)
      .battlefield('SYNTHETIC Sacrifice Reader')
      .library(...FILLER)
      .build();
    castDragon(g);
    // The enters trigger resolves: seat 0 may sacrifice the Forest or the lifegainer; it keeps
    // the lifegainer, which watches.
    resolveTop(g);
    g.act(0).choosePermanents('Forest');
    // Seat 0 controls the Dragon's watcher and the lifegainer (different abilities): it orders
    // them. Seat 1's reader is alone, so it asks nothing and goes on the stack second.
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(DRAGON, 'SYNTHETIC Sacrifice Lifegainer');
    g.expect.stack([
      'SYNTHETIC Sacrifice Reader (ability)',
      'SYNTHETIC Sacrifice Lifegainer (ability)',
      `${DRAGON} (ability)`,
    ]);
    g.passAll();
    g.expect.life(0, 41);
    g.expect.handSize(1, 1);
    g.expect.counters(DRAGON, { '+1/+1': 1 });
  });

  test('two engines: one player sacrificing does not trigger the other player\'s ("you")', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON)
      .pool('CCCB')
      .battlefield('Forest')
      .library(...FILLER)
      .seat(1)
      .battlefield(DRAGON)
      .library(...FILLER)
      .build();
    castDragon(g);
    resolveTop(g);
    g.passAll();
    g.expect.counters({ name: DRAGON, seat: 0 }, { '+1/+1': 1 });
    g.expect.counters({ name: DRAGON, seat: 1 }, {});
    g.expect.handSize(1, 0);
  });

  test('each player chooses the order of their own triggers, the active player first', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON)
      .pool('CCCB')
      .battlefield('Forest', 'SYNTHETIC Sacrifice Lifegainer', 'SYNTHETIC Sacrifice Reader')
      .library(...FILLER)
      .seat(1)
      .battlefield('SYNTHETIC Sacrifice Reader', 'SYNTHETIC Sacrifice Lifegainer')
      .library(...FILLER)
      .build();
    castDragon(g);
    resolveTop(g);
    // Seat 0 may sacrifice the Forest, the lifegainer or the reader; it gives up the Forest.
    g.act(0).choosePermanents('Forest');
    // Three different abilities of seat 0 wait (the Dragon's, the lifegainer's and the reader's),
    // and two of seat 1's: each player orders their own, the active player first (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(DRAGON, 'SYNTHETIC Sacrifice Lifegainer', 'SYNTHETIC Sacrifice Reader');
    g.expect.pending('orderTriggers', 1);
    g.act(1).orderTriggers('SYNTHETIC Sacrifice Lifegainer', 'SYNTHETIC Sacrifice Reader');
    g.expect.stack([
      'SYNTHETIC Sacrifice Reader (ability)',
      'SYNTHETIC Sacrifice Lifegainer (ability)',
      'SYNTHETIC Sacrifice Reader (ability)',
      'SYNTHETIC Sacrifice Lifegainer (ability)',
      `${DRAGON} (ability)`,
    ]);
  });
});

describe('a triggered ability can be responded to, and its source leaving does not stop it (CR 113.7a)', () => {
  test('the dragon is killed in response to its enters ability: the sacrifice still happens', () => {
    const g = scenario()
      .seat(0)
      .hand(DRAGON)
      .pool('CCCB')
      .battlefield('Forest', 'Plains')
      .library(...FILLER)
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .build();
    castDragon(g);
    g.expect.stack([`${DRAGON} (ability)`]);
    g.pass();
    g.act(1).cast('Murder', { targets: [{ name: DRAGON }], pay: true });
    g.pass();
    g.pass();
    g.expect.zone(DRAGON, 'graveyard', { seat: 0 });
    // The enters ability is still there and resolves: the controller sacrifices another permanent
    // ("another" refers to the source's last-known information, CR 113.7a).
    g.expect.stack([`${DRAGON} (ability)`]);
    resolveTop(g);
    g.expect.pending('choosePermanent', 0);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected choosePermanent');
    expect(d.legal).toHaveLength(2);
    g.act(0).choosePermanents('Plains');
    // The dragon is no longer on the battlefield, so its watcher does not trigger (CR 603.10a
    // looks back at the moment of the sacrifice: the dragon was already gone).
    g.expect.stack([]);
    g.expect.handSize(0, 0);
  });

  test('a dragon sacrificed itself still sees its own sacrifice (CR 603.10a look back)', () => {
    const g = scenario()
      .seat(0)
      .hand('SYNTHETIC Edict')
      .pool('CB')
      .battlefield(DRAGON)
      .library(...FILLER)
      .seat(1)
      .build();
    g.act(0).cast('SYNTHETIC Edict', { pay: true });
    g.passAll();
    g.expect.zone(DRAGON, 'graveyard', { seat: 0 });
    // The watcher looked back at the battlefield as it was: it triggered, and the part of its
    // effect that can still happen did (the counter has nowhere to go, the card is drawn).
    g.expect.handSize(0, 1);
  });
});
