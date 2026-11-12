// How a pair ends and what the checks on resolution see (D-285, D-286), CR 702.95: 702.95c (as the ability resolves, both must still be creatures on the
// battlefield under the control of its controller, and unpaired), 702.95d (one partner only), 702.95e (a pair ends when either leaves the battlefield, changes
// controller or stops being a creature), 603.4 (the intervening "if" again on resolution), 400.7 (a new object is unpaired), 702.26b and 702.26d (phasing is not
// a zone change or a change of control, and the pair survives it), 603.6a (creatures that enter together), 603.3b (ordering of triggers), 707.2 (a copy
// copies no designation), 701.42a and 712.4a (a melded permanent is one creature).
// Cards are SYNTHETIC (soulbond: src/cards/fixtures/synthetic-soulbond.ts; spells: synthetic-layers.ts, synthetic-control.ts, synthetic-meld.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { applyAction, getLegalActions, getView } from '../src/index';
import { partnerOf } from '../src/rules/pairing';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { settle } from './meld-helpers';
import { choosePermanentDecision } from './pending-helpers';

const SQUIRE = 'SYNTHETIC Soulbound Squire';
const BEARS = 'Grizzly Bears';
const SERRA = 'Serra Angel';
const RUST = 'SYNTHETIC Rust Touch'; // {U} target creature becomes an artifact until end of turn
const FLICKER = 'SYNTHETIC Flicker Spell'; // {1}{U}
const BORROW = 'SYNTHETIC Borrow Creature'; // {1}{R} gain control of target creature until end of turn
const UNSUMMON = 'Unsummon';
const MURDER = 'Murder';
const BOLT = 'Lightning Bolt';
const WRATH = 'SYNTHETIC Pair Wrath';
const MASS_RETURN = 'SYNTHETIC Pair Reunion';
const LIBRARY = ['Island', 'Island', 'Island', 'Island'] as const;

const wrath = singleFace({
  name: WRATH,
  manaCost: ['2', 'W'],
  types: ['sorcery'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'SYNTHETIC: destroy all creatures.',
  spell: {
    effect: { kind: 'destroy', objects: { kind: 'each', filter: { types: ['creature'] } } },
  },
});
const reunion = singleFace({
  name: MASS_RETURN,
  manaCost: ['2', 'W'],
  types: ['sorcery'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: 'SYNTHETIC: return all creature cards from your graveyard to the battlefield.',
  spell: {
    effect: {
      kind: 'moveToZone',
      objects: {
        kind: 'each',
        filter: { zone: 'graveyard', owner: { kind: 'you' }, types: ['creature'] },
      },
      to: 'battlefield',
    },
  },
});

const resolveTop = (g: ScenarioGame) => {
  g.pass();
  g.pass();
};

/** The Squire is cast and enters; its ability is on the stack, and seat 0 has priority. */
function pending(extraHand: readonly string[] = []) {
  const g = scenario()
    .seat(0)
    .hand(SQUIRE, ...extraHand)
    .battlefield('Plains', { count: 2 })
    .battlefield('Island', { count: 3 })
    .battlefield('Mountain', { count: 2 })
    .battlefield(BEARS, { label: 'bears' })
    .library(...LIBRARY)
    .seat(1)
    .battlefield('Island', { count: 2 })
    .battlefield('Mountain', { count: 2 })
    .hand(UNSUMMON, BORROW)
    .library(...LIBRARY)
    .at('precombatMain', { active: 0, turn: 3 })
    .build();
  g.act(0).cast(SQUIRE, { pay: true });
  resolveTop(g);
  g.expect.stack([`${SQUIRE} (ability)`]);
  return g;
}

describe('CR 702.95c: both must still qualify as the ability resolves', () => {
  test('the partner was bounced in response: nothing is asked and nobody is paired', () => {
    const g = pending([UNSUMMON]);
    g.act(0).cast(UNSUMMON, { targets: ['bears'], pay: true });
    resolveTop(g); // Unsummon resolves
    resolveTop(g); // the soulbond ability resolves
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.unpaired(SQUIRE);
    g.expect.noEvent({ kind: 'creaturesPaired' });
    g.expect.invariants();
  });

  test('the partner stopped being a creature in response: it is not a candidate, nobody is asked', () => {
    const g = pending([RUST]);
    g.act(0).cast(RUST, { targets: ['bears'], pay: true });
    resolveTop(g);
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.unpaired(SQUIRE);
  });

  test("another player gained control of the partner in response: it is not the controller's candidate", () => {
    const g = pending();
    g.act(0).pass();
    g.act(1).cast(BORROW, { targets: ['bears'], pay: true });
    resolveTop(g);
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.unpaired(SQUIRE);
    g.expect.noEvent({ kind: 'creaturesPaired' });
  });

  test('the soulbond creature itself left in response: nothing is paired', () => {
    const g = pending([UNSUMMON]);
    g.act(0).cast(UNSUMMON, { targets: [SQUIRE], pay: true });
    resolveTop(g);
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.unpaired('bears');
  });

  test('the creature offered when the answer is given is checked once more: an answer outside the list is refused', () => {
    const g = pending();
    resolveTop(g);
    const d = choosePermanentDecision(g);
    const wrong = applyAction(g.state, 0, { kind: 'choosePermanents', objects: [g.id(SQUIRE)] });
    expect(wrong.ok).toBe(false);
    expect(d.legal).toEqual([g.id('bears')]);
  });
});

describe('CR 702.95c: the ability "whenever another creature you control enters" checks the newcomer as it resolves (D-287)', () => {
  // The Squire is on the battlefield and the Bears is cast: the ability that waits on the stack names the Bears as the creature that entered.
  const newcomer = () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS, RUST)
      .battlefield('Forest', { count: 2 })
      .battlefield('Island', { count: 2 })
      .battlefield(SQUIRE, { label: 'sq' })
      .library(...LIBRARY)
      .seat(1)
      .battlefield('Island', { count: 2 })
      .battlefield('Mountain', { count: 2 })
      .hand(BORROW)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    resolveTop(g);
    g.expect.stack([`${SQUIRE} (ability)`]);
    return g;
  };

  test('with nothing in response the newcomer is the one candidate, and the pair is made', () => {
    const g = newcomer();
    resolveTop(g);
    choosePermanentDecision(g);
    g.act(0).choosePermanents(BEARS);
    g.expect.paired(SQUIRE, BEARS);
  });

  test('another player gained control of the newcomer in response: nothing is asked, nobody is paired', () => {
    const g = newcomer();
    g.act(0).pass();
    g.act(1).cast(BORROW, { targets: [BEARS], pay: true });
    resolveTop(g);
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.unpaired(SQUIRE);
    g.expect.noEvent({ kind: 'creaturesPaired' });
    g.expect.invariants();
  });

  test('the newcomer became an artifact in response: nothing is asked, nobody is paired', () => {
    const g = newcomer();
    g.act(0).cast(RUST, { targets: [BEARS], pay: true });
    resolveTop(g);
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.unpaired(SQUIRE);
    g.expect.noEvent({ kind: 'creaturesPaired' });
    g.expect.invariants();
  });
});

describe('CR 603.4, 702.95d: a second ability finds them paired and does nothing', () => {
  // Two creatures with soulbond and a third entering: the controller has two triggers and orders them.
  const two = () =>
    scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield('Forest', { count: 2 })
      .battlefield(SQUIRE, { label: 'a' })
      .battlefield(SQUIRE, { label: 'b' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('two soulbond creatures and one newcomer: two triggers, the order is asked, the first pairs, the second does nothing', () => {
    const g = two();
    g.act(0).cast(BEARS, { pay: true });
    resolveTop(g);
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.expect.stack([`${SQUIRE} (ability)`, `${SQUIRE} (ability)`]);
    resolveTop(g);
    // The first to resolve asks which creature (the newcomer, here, is the only candidate for either).
    const d = choosePermanentDecision(g);
    expect(d.legal).toEqual([g.id(BEARS)]);
    g.act(0).choosePermanents(BEARS);
    // The Bears is paired with the creature whose ability resolved; the second ability finds it paired (its "if" is false) and asks nothing.
    resolveTop(g);
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.stack).toEqual([]);
    expect(g.find({ name: BEARS }).filter((o) => o.paired !== undefined)).toHaveLength(1);
    g.expect.invariants();
  });

  test('declining the first leaves the second to be asked: the newcomer may still be paired by the other creature', () => {
    const g = two();
    g.act(0).cast(BEARS, { pay: true });
    resolveTop(g);
    g.act(0).orderTriggers(0, 1);
    resolveTop(g);
    g.act(0).choosePermanents();
    resolveTop(g);
    choosePermanentDecision(g);
    g.act(0).choosePermanents(BEARS);
    const bears = g.object(BEARS);
    expect(bears.paired).toBeDefined();
  });

  test('the other order of the two abilities gives the same result: one pair, and the other ability finds them paired (CR 603.4)', () => {
    const g = two();
    g.act(0).cast(BEARS, { pay: true });
    resolveTop(g);
    g.act(0).orderTriggers(1, 0);
    resolveTop(g);
    g.act(0).choosePermanents(BEARS);
    resolveTop(g);
    expect(g.state.stack).toEqual([]);
    expect(g.find({ name: BEARS }).filter((o) => o.paired !== undefined)).toHaveLength(1);
  });
});

describe('creatures that enter together (CR 603.6a)', () => {
  test('a soulbond creature and another creature returned by one spell: both abilities trigger, one pair is formed', () => {
    const g = scenario()
      .define(reunion)
      .seat(0)
      .hand(MASS_RETURN)
      .battlefield('Plains', { count: 3 })
      .graveyard(SQUIRE, BEARS)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(MASS_RETURN, { pay: true });
    resolveTop(g);
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    resolveTop(g);
    choosePermanentDecision(g);
    g.act(0).choosePermanents(BEARS);
    resolveTop(g);
    expect(g.state.stack).toEqual([]);
    g.expect.paired(SQUIRE, BEARS);
    g.expect.invariants();
  });
});

/** A pair on the battlefield: the Squire and the Bears of seat 0 (labels 'sq' and 'bears'), set up as if paired by the keyword. */
function paired(
  extra: { readonly mine?: readonly string[]; readonly theirs?: readonly string[] } = {},
) {
  let b = scenario()
    .define(wrath)
    .seat(0)
    .hand(...(extra.mine ?? []))
    .battlefield('Plains', { count: 3 })
    .battlefield('Island', { count: 3 })
    .battlefield('Swamp', { count: 3 })
    .battlefield('Mountain', { count: 3 })
    .battlefield(SQUIRE, { label: 'sq', pairedWith: 'bears' })
    .battlefield(BEARS, { label: 'bears' })
    .library(...LIBRARY)
    .seat(1)
    .battlefield('Island', { count: 2 })
    .battlefield('Mountain', { count: 2 })
    .library(...LIBRARY);
  if ((extra.theirs ?? []).length > 0) b = b.hand(...(extra.theirs ?? []));
  return b.at('precombatMain', { active: 0, turn: 3 }).build();
}

describe('CR 702.95e: a pair ends when either leaves the battlefield', () => {
  test('the partner dies: the Squire is unpaired (the event says it left), the Squire can be paired again', () => {
    const g = paired({ mine: [BOLT] });
    const bearsId = g.id('bears');
    g.act(0).cast(BOLT, { targets: ['bears'], pay: true });
    resolveTop(g);
    g.expect.unpaired('sq');
    expect(g.object('sq').paired).toBeUndefined(); // the field is cleared with the state-based actions
    g.expect.eventLog([
      { kind: 'died' },
      { kind: 'creaturesUnpaired', a: g.id('sq'), b: bearsId, why: 'left' },
    ]);
    g.expect.invariants();
  });

  test('the soulbond creature dies: the partner is unpaired', () => {
    const g = paired({ mine: [BOLT] });
    g.act(0).cast(BOLT, { targets: ['sq'], pay: true });
    resolveTop(g);
    g.expect.unpaired('bears');
    expect(g.object('bears').paired).toBeUndefined();
  });

  test('bounced and exiled partners: the pair ends, and a partner that returns is a new object, unpaired (CR 400.7)', () => {
    const g = paired({ mine: [FLICKER] });
    const before = g.id('bears');
    g.act(0).cast(FLICKER, { targets: ['bears'], pay: true });
    resolveTop(g);
    expect(g.id(BEARS)).not.toBe(before);
    g.expect.unpaired('sq');
    g.expect.unpaired(BEARS);
    expect(g.object(BEARS).paired).toBeUndefined();
    g.expect.invariants();
  });

  test('both of one pair are destroyed together: nothing is left to be paired, no event, and the state is consistent', () => {
    const g = paired({ mine: [WRATH] });
    g.act(0).cast(WRATH, { pay: true });
    resolveTop(g);
    expect(g.find({ name: SQUIRE, zone: 'battlefield' })).toEqual([]);
    g.expect.noEvent({ kind: 'creaturesUnpaired' });
    g.expect.invariants();
  });
});

describe('CR 702.95e: stops being a creature, or another player gains control', () => {
  test('the partner becomes an artifact: the pair ends with the state-based actions, and it does not come back at end of turn', () => {
    const g = paired({ mine: [RUST] });
    g.act(0).cast(RUST, { targets: ['bears'], pay: true });
    resolveTop(g);
    g.expect.unpaired('sq');
    g.expect.unpaired('bears');
    expect(g.object('bears').paired).toBeUndefined();
    g.expect.eventLog([{ kind: 'creaturesUnpaired', why: 'notCreature' }]);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.unpaired('bears'); // a creature again, and still unpaired
    g.expect.invariants();
  });

  test('the soulbond creature stops being a creature: the same', () => {
    const g = paired({ mine: [RUST] });
    g.act(0).cast(RUST, { targets: ['sq'], pay: true });
    resolveTop(g);
    g.expect.unpaired('sq');
    g.expect.unpaired('bears');
  });

  test('another player gains control of the partner until end of turn: unpaired, and the pair does not return when control does (CR 702.95e)', () => {
    const g = paired({ theirs: [BORROW] });
    g.act(0).pass();
    g.act(1).cast(BORROW, { targets: ['bears'], pay: true });
    resolveTop(g);
    g.expect.unpaired('sq');
    g.expect.eventLog([{ kind: 'creaturesUnpaired', why: 'control' }]);
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.unpaired('sq');
    g.expect.unpaired('bears');
    expect(g.object('bears').paired).toBeUndefined();
    g.expect.invariants();
  });

  test('control of the soulbond creature changes: the same', () => {
    const g = paired({ theirs: [BORROW] });
    g.act(0).pass();
    g.act(1).cast(BORROW, { targets: ['sq'], pay: true });
    resolveTop(g);
    g.expect.unpaired('bears');
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.unpaired('bears');
  });
});

describe('the pair is read through one function: a stale link reads as unpaired', () => {
  test('between the departure and the next state-based-action check the reads already say unpaired', () => {
    const g = paired();
    const stale = { ...g.state, objects: { ...g.state.objects } };
    delete (stale.objects as Record<string, unknown>)[g.id('bears')];
    const sq = stale.objects[g.id('sq')];
    expect(sq?.paired).toBeDefined(); // the field is still there
    expect(sq === undefined ? null : partnerOf(stale, sq)).toBeNull(); // the pair is not
  });

  test('the view shows the partner only while the pair stands', () => {
    const g = paired();
    const sq = g.view(0).battlefield.find((o) => o.id === g.id('sq'));
    expect(sq?.pairedWith).toBe(g.id('bears'));
    // The opponent sees the same pair (public).
    expect(getView(g.state, 1).battlefield.find((o) => o.id === g.id('sq'))?.pairedWith).toBe(
      g.id('bears'),
    );
    const g2 = scenario()
      .seat(0)
      .battlefield(SQUIRE, { label: 'sq' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .build();
    expect(g2.view(0).battlefield[0]?.pairedWith).toBeUndefined();
  });
});

describe('copies, tokens and designations', () => {
  const COPIER = 'SYNTHETIC Pair Copier';
  const copier = singleFace({
    name: COPIER,
    manaCost: ['1'],
    types: ['sorcery'],
    colors: [],
    colorIdentity: [],
    oracleText: "SYNTHETIC: create a token that's a copy of target creature you control.",
    spell: {
      targets: [
        {
          id: 't1',
          min: 1,
          max: 1,
          what: {
            kind: 'object',
            filter: { zone: 'battlefield', controller: 'you', types: ['creature'] },
          },
        },
      ],
      effect: {
        kind: 'createToken',
        token: { kind: 'copyOf', object: { kind: 'target', id: 't1' } },
        count: 1,
      },
    },
  });

  test('a token that copies a paired creature is unpaired, and the original stays paired (CR 707.2: a copy copies no designation)', () => {
    const g = scenario()
      .define(copier)
      .seat(0)
      .hand(COPIER)
      .battlefield('Plains', { count: 3 })
      .battlefield(SQUIRE, { label: 'sq', pairedWith: 'bears' })
      .battlefield(BEARS, { label: 'bears' })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(COPIER, { targets: ['bears'], pay: true });
    resolveTop(g);
    const token = g.find({ name: BEARS, zone: 'battlefield' }).find((o) => o.token !== null);
    expect(token).toBeDefined();
    expect(token?.paired).toBeUndefined();
    g.expect.paired('sq', 'bears');
    g.expect.invariants();
  });
});

describe('the DSL refuses a pairing that could not exist', () => {
  const build = (mine: (b: ReturnType<typeof scenario>) => ReturnType<typeof scenario>) => () =>
    mine(
      scenario()
        .seat(0)
        .library(...LIBRARY)
        .seat(1)
        .library(...LIBRARY),
    ).build();

  test('a pair of one creature and a land, of two controllers, and a third creature are refused', () => {
    expect(
      build((b) =>
        b
          .seat(0)
          .battlefield(SQUIRE, { label: 'sq', pairedWith: 'land' })
          .battlefield('Plains', { label: 'land' }),
      ),
    ).toThrow(/both must be creatures/);
    expect(
      build((b) =>
        b
          .seat(0)
          .battlefield(SQUIRE, { label: 'sq', pairedWith: 'bears' })
          .battlefield(BEARS, { label: 'bears', controller: 1 }),
      ),
    ).toThrow(/one player controls both/);
    expect(
      build((b) =>
        b
          .seat(0)
          .battlefield(SQUIRE, { label: 'sq', pairedWith: 'bears' })
          .battlefield(BEARS, { label: 'bears' })
          .battlefield(SERRA, { label: 'serra', pairedWith: 'bears' }),
      ),
    ).toThrow(/paired twice/);
  });
});

describe('legal actions agree with applyAction, and the game is deterministic', () => {
  test('every answer the soulbond decision lists is accepted', () => {
    const g = pending();
    resolveTop(g);
    const answers = getLegalActions(g.state, 0);
    for (const a of answers) {
      if (a.kind === 'concede') continue;
      expect(applyAction(g.state, 0, a).ok, JSON.stringify(a)).toBe(true);
    }
  });

  test('the same actions give the same state', () => {
    const run = () => {
      const g = pending();
      resolveTop(g);
      g.act(0).choosePermanents('bears');
      return g.hash();
    };
    expect(run()).toBe(run());
  });
});

describe('phasing: the pair survives, and what it gives is switched off meanwhile (CR 702.26b, 702.26d)', () => {
  const PHASE_GUARD = 'SYNTHETIC Phase Guard';
  const phasing = () =>
    scenario()
      .seat(0)
      .battlefield(SQUIRE, { label: 'sq', pairedWith: 'bears' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield('Plains', { count: 4 })
      .battlefield('Swamp', { count: 3 })
      .hand(PHASE_GUARD, SQUIRE)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the partner phases out: the link stays, nobody reads a partner, the state is consistent', () => {
    const g = phasing();
    g.act(0).cast(PHASE_GUARD, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('bears');
    settle(g);
    expect(g.object('bears').zone).toBe('phased');
    expect(g.object('bears').paired).toBeDefined();
    expect(partnerOf(g.state, g.object('sq'))).toBeNull(); // not on the battlefield: it does not exist (CR 702.26b)
    expect(g.view(0).battlefield.find((o) => o.id === g.id('sq'))?.pairedWith).toBeUndefined();
    // The view says the pair stands but is on hold, for the creature that is phased in and for the one that is phased out, so a player is not shown an unpaired creature.
    const survivor = g.view(0).battlefield.find((o) => o.id === g.id('sq'));
    const away = g.view(0).phasedOut?.find((o) => o.id === g.id('bears'));
    expect(survivor?.pairedPhasedOut).toBe(true);
    expect(away?.pairedPhasedOut).toBe(true);
    g.expect.invariants();
  });

  test('a creature of a pair with a phased-out member is still paired: it is not offered to a new soulbond creature (CR 702.95d)', () => {
    const g = phasing();
    g.act(0).cast(PHASE_GUARD, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('bears');
    settle(g);
    // A second Squire enters: the only other creatures are the paired Squire and the Phase Guard itself.
    g.act(0).cast(SQUIRE, { pay: true });
    settle(g);
    const d = g.state.pending;
    if (d?.kind === 'choosePermanent') {
      expect(d.legal).not.toContain(g.id('sq'));
    }
  });

  test("both phase in as its controller's untap step begins: the pair is back", () => {
    const g = phasing();
    g.act(0).cast(PHASE_GUARD, { pay: true });
    g.passAll();
    g.act(0).chooseTargets('bears');
    settle(g);
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    expect(g.object('bears').zone).toBe('battlefield');
    g.expect.paired('sq', 'bears');
    expect(g.view(0).battlefield.find((o) => o.id === g.id('sq'))?.pairedPhasedOut).toBeUndefined();
    g.expect.invariants();
  });
});

describe('a melded permanent is one creature (D-277, CR 701.42a)', () => {
  const DUSK = 'SYNTHETIC Dusk Squire';
  const DAWN = 'SYNTHETIC Dawn Squire';
  const build = () =>
    scenario()
      .seat(0)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn', pairedWith: 'bears' })
      .battlefield(DAWN, { label: 'dawn' })
      .battlefield(BEARS, { label: 'bears' })
      .battlefield('Plains', { count: 2 })
      .battlefield('Swamp', { count: 3 })
      .hand(MURDER)
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();

  test('the pair names the one object of the melded permanent, and it reads as paired', () => {
    const g = build();
    g.expect.paired('dusk', 'bears');
    g.expect.paired('bears', 'dusk');
    g.expect.invariants();
  });

  test('naming the second card of a melded permanent is refused: use the first', () => {
    expect(() =>
      scenario()
        .seat(0)
        .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
        .battlefield(DAWN, { label: 'dawn', pairedWith: 'bears' })
        .battlefield(BEARS, { label: 'bears' })
        .library(...LIBRARY)
        .seat(1)
        .library(...LIBRARY)
        .build(),
    ).toThrow(/second card of a melded permanent/);
  });

  test('a melded permanent is one candidate for a soulbond creature (not two), and can be paired as one creature', () => {
    const g = scenario()
      .seat(0)
      .hand(SQUIRE)
      .battlefield(DUSK, { label: 'dusk', meldedWith: 'dawn' })
      .battlefield(DAWN, { label: 'dawn' })
      .battlefield('Plains', { count: 2 })
      .library(...LIBRARY)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 3 })
      .build();
    g.act(0).cast(SQUIRE, { pay: true });
    resolveTop(g);
    resolveTop(g);
    expect(choosePermanentDecision(g).legal).toEqual([g.id('dusk')]);
    g.act(0).choosePermanents('dusk');
    g.expect.paired(SQUIRE, 'dusk');
    g.expect.invariants();
  });

  test('when the melded permanent leaves it is two new cards, unpaired, and its partner is unpaired', () => {
    const g = build();
    g.act(0).cast(MURDER, { targets: ['dusk'], pay: true });
    settle(g);
    g.expect.unpaired('bears');
    expect(g.find({ name: DUSK }).every((o) => o.paired === undefined)).toBe(true);
    expect(g.find({ name: DAWN }).every((o) => o.paired === undefined)).toBe(true);
    g.expect.invariants();
  });
});
