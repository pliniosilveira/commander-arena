// Flashback (CR 702.34): "You may cast this card from your graveyard if the resulting spell is an
// instant or sorcery spell by paying [cost] rather than paying its mana cost. If the flashback cost
// was paid, exile this card instead of putting it anywhere else any time it would leave the stack."
// Pins: CR 702.34a (Flashback), CR 118.9 and 118.9a (alternative costs: one at a time, announced
// as the spell is cast), CR 118.9d (additional costs, here kicker, apply to the alternative cost),
// CR 601.2b-f (casting), CR 608.2b (a spell whose targets are all illegal does not resolve, and goes
// to the graveyard, here exile), CR 701.6 (a countered spell goes to the graveyard, here exile),
// CR 117.1a (sorcery timing). Cards are SYNTHETIC (src/cards/fixtures).
import { describe, expect, test } from 'vitest';
import {
  type Action,
  applyAction,
  checkInvariants,
  getLegalActions,
  getView,
  stateHash,
} from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';

const SLAY = 'SYNTHETIC Flash Slay'; // {B} instant, destroy target creature; flashback {2}{B}
const STUDY = 'SYNTHETIC Flash Study'; // {1}{U} sorcery, draw; flashback {4}{U}
const GAIN = 'SYNTHETIC Flash Gain'; // {W} instant, gain 3; flashback {1}{W}
const KICK = 'SYNTHETIC Kick Flash'; // {R} sorcery; kicker {1}; flashback {2}{R}

const flashbackOptions = (g: ScenarioGame, seat: 0 | 1 = 0): Action[] =>
  getLegalActions(g.state, seat).filter(
    (a) => a.kind === 'castSpell' && a.alternative === 'flashback',
  );

describe('what is offered (CR 702.34a)', () => {
  const build = () =>
    scenario().seat(0).graveyard(GAIN).battlefield('Plains', 'Plains').seat(1).build();

  test('a card with flashback in its owner graveyard is cast with the alternative', () => {
    const g = build();
    const id = g.id({ name: GAIN, zone: 'graveyard' });
    expect(flashbackOptions(g)).toEqual([
      { kind: 'castSpell', object: id, alternative: 'flashback' },
    ]);
    // The plain cast of a card in the graveyard is not a play.
    expect(
      g.legalActions(0).some((a) => a.kind === 'castSpell' && a.alternative === undefined),
    ).toBe(false);
    g.expect.legal(0, { cast: GAIN, alternative: 'flashback' });
    expect(g.act(0).try.action({ kind: 'castSpell', object: id }).ok).toBe(false);
  });

  test('applyAction accepts exactly what is listed', () => {
    const g = build();
    const id = g.id({ name: GAIN, zone: 'graveyard' });
    const ok = applyAction(g.state, 0, { kind: 'castSpell', object: id, alternative: 'flashback' });
    expect(ok.ok).toBe(true);
    const plain = applyAction(g.state, 0, { kind: 'castSpell', object: id });
    expect(plain.ok).toBe(false);
  });

  test('not from the hand, whatever the mana: the alternative needs the graveyard', () => {
    const g = scenario().seat(0).hand(GAIN).battlefield('Plains', 'Plains').seat(1).build();
    const id = g.id(GAIN);
    expect(flashbackOptions(g)).toEqual([]);
    const r = applyAction(g.state, 0, { kind: 'castSpell', object: id, alternative: 'flashback' });
    expect(r.ok).toBe(false);
    // A hand cast pays the mana cost, not the flashback cost.
    g.act(0).cast(GAIN, { pay: true });
    expect(g.find({ name: 'Plains', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(1);
  });

  test('not a card without flashback, in either way', () => {
    const g = scenario()
      .seat(0)
      .graveyard('Lightning Bolt')
      .battlefield('Mountain', 'Mountain')
      .seat(1)
      .build();
    const id = g.id({ name: 'Lightning Bolt', zone: 'graveyard' });
    expect(g.legalActions(0).some((a) => a.kind === 'castSpell')).toBe(false);
    for (const alternative of [undefined, 'flashback'] as const) {
      const action: Action =
        alternative === undefined
          ? { kind: 'castSpell', object: id }
          : { kind: 'castSpell', object: id, alternative };
      expect(applyAction(g.state, 0, action).ok, String(alternative)).toBe(false);
    }
  });

  test('not when the flashback cost cannot be paid, and not the opponent graveyard', () => {
    // {4}{U} needs five lands.
    const poor = scenario()
      .seat(0)
      .graveyard(STUDY)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .build();
    expect(flashbackOptions(poor)).toEqual([]);
    const rich = scenario()
      .seat(0)
      .graveyard(STUDY)
      .battlefield('Island', { count: 5 })
      .seat(1)
      .build();
    expect(flashbackOptions(rich)).toHaveLength(1);
    // The owner casts it, nobody else.
    const theirs = scenario()
      .seat(0)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .graveyard(GAIN)
      .build();
    expect(flashbackOptions(theirs, 0)).toEqual([]);
    const id = theirs.id({ name: GAIN, zone: 'graveyard' });
    expect(
      applyAction(theirs.state, 0, { kind: 'castSpell', object: id, alternative: 'flashback' }).ok,
    ).toBe(false);
  });

  test('timing is the card own: a sorcery at sorcery speed, an instant any time', () => {
    const at = (card: string, lands: string[], step: 'precombatMain' | 'upkeep', active: 0 | 1) =>
      scenario()
        .seat(0)
        .graveyard(card)
        .battlefield(...lands)
        .seat(1)
        .at(step, { active, priority: 0 })
        .build();
    const study = ['Island', 'Island', 'Island', 'Island', 'Island'];
    expect(flashbackOptions(at(STUDY, study, 'precombatMain', 0))).toHaveLength(1);
    expect(flashbackOptions(at(STUDY, study, 'upkeep', 0))).toEqual([]);
    expect(flashbackOptions(at(STUDY, study, 'precombatMain', 1))).toEqual([]);
    const slay = ['Swamp', 'Swamp', 'Swamp'];
    const withTarget = (step: 'precombatMain' | 'upkeep', active: 0 | 1) =>
      scenario()
        .seat(0)
        .graveyard(SLAY)
        .battlefield(...slay)
        .seat(1)
        .battlefield('Grizzly Bears')
        .at(step, { active, priority: 0 })
        .build();
    expect(flashbackOptions(withTarget('upkeep', 1))).toHaveLength(1);
    expect(flashbackOptions(withTarget('upkeep', 0))).toHaveLength(1);
  });

  test('a sorcery is not offered while something is on the stack', () => {
    const g = scenario()
      .seat(0)
      .graveyard(STUDY)
      .hand('Lightning Bolt')
      .battlefield('Island', { count: 5 })
      .battlefield('Mountain')
      .seat(1)
      .build();
    expect(flashbackOptions(g)).toHaveLength(1);
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    expect(flashbackOptions(g)).toEqual([]);
  });

  test('a targeted flashback spell needs a legal target', () => {
    const g = scenario()
      .seat(0)
      .graveyard(SLAY)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .build();
    expect(flashbackOptions(g)).toEqual([]);
  });
});

describe('casting with flashback, and exile when it leaves the stack (CR 702.34a)', () => {
  test('pays the flashback cost instead of the mana cost; the spell resolves and is exiled', () => {
    const g = scenario()
      .seat(0)
      .graveyard(GAIN)
      .battlefield('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    const mark = g.mark();
    g.act(0).cast(GAIN, { alternative: 'flashback', pay: true });
    // {1}{W}, not {W}: two lands.
    expect(g.find({ name: 'Plains', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(2);
    g.expect.stack([GAIN]);
    g.expect.zone(GAIN, 'stack');
    g.expect.noObject(GAIN, { zone: 'graveyard' });
    g.expect.eventLog(
      [
        { kind: 'zoneChanged', fromZone: 'graveyard', toZone: 'stack' },
        { kind: 'spellCast', seat: 0, fromZone: 'graveyard', alternative: 'flashback' },
      ],
      { since: mark },
    );
    const view = getView(g.state, 1).stack[0];
    expect(view?.flashback).toBe(true);
    expect(view?.kicked).toBeUndefined();
    g.passAll();
    g.expect.life(0, 43);
    g.expect.zone(GAIN, 'exile');
    g.expect.noObject(GAIN, { zone: 'graveyard' });
    g.expect.invariants();
  });

  test('the whole life of the card: hand, graveyard, flashback, exile, and then it is gone', () => {
    const g = scenario()
      .seat(0)
      .hand(GAIN)
      .battlefield('Plains', 'Plains')
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains')
      .build();
    g.act(0).cast(GAIN, { pay: true });
    g.passAll();
    g.expect.zone(GAIN, 'graveyard', { seat: 0 }); // the first cast does not exile it
    g.expect.life(0, 43);
    expect(flashbackOptions(g)).toEqual([]); // the lands are tapped
    // Next turn.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    expect(flashbackOptions(g)).toHaveLength(1);
    g.act(0).cast(GAIN, { alternative: 'flashback', pay: true });
    g.passAll();
    g.expect.life(0, 46);
    g.expect.zone(GAIN, 'exile');
    expect(g.legalActions(0).some((a) => a.kind === 'castSpell')).toBe(false);
  });

  test('a flashback spell that is countered is exiled, not put in the graveyard (CR 701.6)', () => {
    const g = scenario()
      .seat(0)
      .graveyard(GAIN)
      .battlefield('Plains', 'Plains')
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', 'Island')
      .build();
    g.act(0).cast(GAIN, { alternative: 'flashback', pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [{ name: GAIN, zone: 'stack' }], pay: true });
    g.passAll();
    g.expect.life(0, 40);
    g.expect.zone(GAIN, 'exile');
    g.expect.noObject(GAIN, { zone: 'graveyard' });
    g.expect.zone('Counterspell', 'graveyard', { seat: 1 });
    g.expect.eventLog([{ kind: 'countered' }]);
  });

  test('a flashback spell that fizzles is exiled (CR 608.2b)', () => {
    const g = scenario()
      .seat(0)
      .graveyard(SLAY)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .hand('Unsummon')
      .battlefield('Grizzly Bears', 'Island')
      .build();
    g.act(0).cast(SLAY, { alternative: 'flashback', targets: ['Grizzly Bears'], pay: true });
    g.act(0).pass();
    g.act(1).cast('Unsummon', { targets: ['Grizzly Bears'], pay: true });
    g.passAll();
    g.expect.eventLog([{ kind: 'fizzled' }]);
    g.expect.zone('Grizzly Bears', 'hand', { seat: 1 });
    g.expect.zone(SLAY, 'exile');
    g.expect.noObject(SLAY, { zone: 'graveyard' });
  });

  test('cancelling a flashback cast puts the card back in the graveyard', () => {
    const g = scenario()
      .seat(0)
      .graveyard(SLAY)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    const before = g.positionHash();
    g.act(0).cast(SLAY, { alternative: 'flashback' });
    g.expect.zone(SLAY, 'stack');
    g.act(0).cancel(); // at the targets decision
    g.expect.position(before);
    g.expect.zone(SLAY, 'graveyard', { seat: 0 });
    // And at the payment decision.
    g.act(0).cast(SLAY, { alternative: 'flashback', targets: ['Grizzly Bears'] });
    g.expect.pending('payMana', 0);
    g.act(0).cancel();
    g.expect.position(before);
  });

  test('an instant cast with flashback on the opponent turn works the same way', () => {
    const g = scenario()
      .seat(0)
      .graveyard(SLAY)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .seat(1)
      .battlefield('Serra Angel')
      .at('upkeep', { active: 1, priority: 0 })
      .build();
    g.act(0).cast(SLAY, { alternative: 'flashback', targets: ['Serra Angel'], pay: true });
    g.passAll();
    g.expect.zone('Serra Angel', 'graveyard', { seat: 1 });
    g.expect.zone(SLAY, 'exile');
  });
});

describe('kicker and flashback together (CR 118.9d)', () => {
  const build = (lands: number) =>
    scenario().seat(0).graveyard(KICK).battlefield('Mountain', { count: lands }).seat(1).build();

  test('the kicker cost is added to the flashback cost, and the kicked spell is exiled', () => {
    const g = build(4);
    g.act(0).cast(KICK, { alternative: 'flashback' });
    const q = g.state.pending;
    if (q?.kind !== 'confirmOptional') throw new Error(`expected the question, got ${q?.kind}`);
    expect(q.purpose).toBe('kicker');
    g.act(0).accept();
    const pay = g.state.pending;
    if (pay?.kind !== 'payMana') throw new Error(`expected payMana, got ${pay?.kind}`);
    expect(pay.totalCost).toEqual(['2', 'R', '1']);
    g.act(0).payAuto();
    const view = getView(g.state, 0).stack[0];
    expect(view?.kicked).toBe(true);
    expect(view?.flashback).toBe(true);
    g.passAll();
    g.expect.life(1, 37);
    g.expect.zone(KICK, 'exile');
  });

  test('with only the flashback cost payable it is cast unkicked without a question', () => {
    const g = build(3);
    g.act(0).cast(KICK, { alternative: 'flashback' });
    g.expect.pending('payMana', 0);
    g.act(0).payAuto();
    g.passAll();
    g.expect.life(1, 39);
    g.expect.zone(KICK, 'exile');
  });
});

describe('invariants and replay', () => {
  test('a game with flashback replays to the same state, invariants hold throughout', () => {
    const make = () =>
      scenario()
        .seat(0)
        .graveyard(GAIN, STUDY)
        .battlefield('Plains', 'Plains')
        .battlefield('Island', { count: 3 })
        .library('Plains', 'Plains')
        .seat(1)
        .library('Plains', 'Plains')
        .build();
    const g = make();
    g.act(0).cast(GAIN, { alternative: 'flashback', pay: true });
    g.passAll();
    expect(checkInvariants(g.state)).toEqual([]);
    const replay = make();
    for (const { seat, action } of g.log) replay.choose(seat, action);
    expect(stateHash(replay.state)).toBe(stateHash(g.state));
  });

  test('a flashback object off the stack, or a flashback card without the keyword, is caught', () => {
    const g = scenario().seat(0).graveyard(GAIN).battlefield('Plains', 'Plains').seat(1).build();
    g.act(0).cast(GAIN, { alternative: 'flashback', pay: true });
    const stackId = g.id({ name: GAIN, zone: 'stack' });
    const obj = g.state.objects[stackId];
    if (!obj?.stack) throw new Error('no stack data');
    const broken = {
      ...g.state,
      objects: { ...g.state.objects, [stackId]: { ...obj, stack: { ...obj.stack, kicked: true } } },
    };
    expect(checkInvariants(broken).join(' ')).toContain('is kicked but is not a spell with kicker');
  });
});
