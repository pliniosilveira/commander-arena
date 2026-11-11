// Evoke (D-117 step 2, D-121): "You may cast this card by paying [cost] rather than paying its mana cost"
// and "When this permanent enters, if its evoke cost was paid, its controller sacrifices it".
// Pins: CR 702.74a (the two abilities; casting for the evoke cost follows 601.2b and 601.2f-h), CR 118.9
// and 118.9a (an alternative cost, only one per spell), CR 118.9d (commander tax still applies), CR 603.3
// (the sacrifice is a triggered ability: it goes on the stack and can be responded to), CR 603.3b (its
// controller orders it with their other triggers), CR 701.21 (Sacrifice), CR 700.4 (dies), CR 603.6c
// (leaves the battlefield), CR 400.7 (a permanent that changed zones is a new object: a bounced and
// recast creature was not evoked). Cards are SYNTHETIC (src/cards/fixtures/synthetic-alt-costs.ts).
import { describe, expect, test } from 'vitest';
import {
  applyAction,
  getLegalActions,
  getView,
  isFeatureSupported,
  SUPPORTED_FEATURES,
  stateHash,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const DRIFTER = 'SYNTHETIC Evoke Drifter'; // {3}{U} 2/2, ETB draw two; evoke {1}{U}
const REAPER = 'SYNTHETIC Evoke Reaper'; // {3}{B} 3/2, ETB destroy target creature an opponent controls; evoke {1}{B}
const MARTYR = 'SYNTHETIC Evoke Martyr'; // {2}{W} 1/1, dies: you gain 3; evoke {W}
const WISP = 'SYNTHETIC Evoke Wisp'; // {2}{G} 2/1, leaves the battlefield: draw a card; evoke {1}{G}

const evokeOptions = (g: ReturnType<ReturnType<typeof scenario>['build']>, seat = 0) =>
  getLegalActions(g.state, seat).filter((a) => a.kind === 'castSpell' && a.alternative === 'evoke');

/** Both players pass once: the top object of the stack resolves and what it triggered is put on the stack. */
const resolveTop = (g: ReturnType<ReturnType<typeof scenario>['build']>) => {
  g.pass(0);
  g.pass(1);
};

describe('the choice at the first casting step (CR 601.2b, 118.9a)', () => {
  test('both costs affordable: the ordinary cast and the evoke cast are separate options', () => {
    const g = scenario().seat(0).hand(DRIFTER).battlefield('Island', { count: 4 }).seat(1).build();
    g.expect.legal(0, { cast: DRIFTER });
    g.expect.legal(0, { cast: DRIFTER, alternative: 'evoke' });
    expect(evokeOptions(g)).toHaveLength(1);
  });

  test('with only the evoke cost payable, only the evoke cast is offered', () => {
    const g = scenario().seat(0).hand(DRIFTER).battlefield('Island', { count: 2 }).seat(1).build();
    g.expect.illegal(0, { cast: DRIFTER });
    g.expect.legal(0, { cast: DRIFTER, alternative: 'evoke' });
  });

  test('with less than the evoke cost nothing is offered', () => {
    const g = scenario().seat(0).hand(DRIFTER).battlefield('Island', { count: 1 }).seat(1).build();
    g.expect.illegal(0, { cast: DRIFTER, alternative: 'evoke' });
    expect(evokeOptions(g)).toEqual([]);
  });

  test('a creature spell has sorcery timing even when evoked', () => {
    const g = scenario()
      .seat(0)
      .hand(DRIFTER)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .at('precombatMain', { active: 1 })
      .build();
    g.expect.illegal(0, { cast: DRIFTER, alternative: 'evoke' });
  });

  test('a card without evoke has no evoke option; neither does a card in the graveyard', () => {
    const g = scenario()
      .seat(0)
      .hand('Grizzly Bears')
      .graveyard(DRIFTER)
      .battlefield('Island', { count: 4 })
      .seat(1)
      .build();
    g.expect.illegal(0, { cast: 'Grizzly Bears', alternative: 'evoke' });
    const card = g.find({ name: DRIFTER, zone: 'graveyard' })[0];
    if (card === undefined) throw new Error('no card');
    expect(
      applyAction(g.state, 0, { kind: 'castSpell', object: card.id, alternative: 'evoke' }).ok,
    ).toBe(false);
  });

  test('a card in exile or the library cannot be evoked either (CR 601.2a)', () => {
    for (const zone of ['exile', 'library'] as const) {
      const b = scenario().seat(0);
      if (zone === 'exile') b.exile(DRIFTER);
      else b.library(DRIFTER);
      const g = b.battlefield('Island', { count: 4 }).seat(1).build();
      const o = g.find({ name: DRIFTER, zone })[0];
      if (o === undefined) throw new Error('no card');
      expect(
        applyAction(g.state, 0, { kind: 'castSpell', object: o.id, alternative: 'evoke' }).ok,
      ).toBe(false);
    }
  });
});

describe('what is paid (CR 702.74a, 118.9)', () => {
  test('the evoke cost is paid instead of the mana cost; the view shows both', () => {
    const g = scenario().seat(0).hand(DRIFTER).battlefield('Island', { count: 4 }).seat(1).build();
    const card = getView(g.state, 0).seats[0]?.hand?.[0];
    expect(card?.castCost).toEqual(['3', 'U']);
    expect(card?.alternativeCosts).toEqual([{ kind: 'evoke', cost: ['1', 'U'] }]);
    g.act(0).cast(DRIFTER, { alternative: 'evoke', pay: true });
    expect(g.find({ name: 'Island', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(2);
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'evoke', commanderTax: 0 }]);
    expect(getView(g.state, 1).stack[0]?.alternative).toBe('evoke');
  });

  test('cancelling an evoke cast restores everything (CR 733)', () => {
    const g = scenario().seat(0).hand(DRIFTER).battlefield('Island', { count: 4 }).seat(1).build();
    const before = g.positionHash();
    g.act(0).cast(DRIFTER, { alternative: 'evoke' }).cancel();
    g.expect.position(before);
  });

  test('commander tax is paid on top of the evoke cost (CR 118.9d, 903.8)', () => {
    const short = scenario()
      .seat(0)
      .commander(DRIFTER, { casts: 2, label: 'cmd' })
      .battlefield('Island', { count: 5 })
      .seat(1)
      .build();
    // {1}{U} + {2}{2} = six mana.
    expect(getView(short.state, 0).seats[0]?.command[0]?.alternativeCosts).toEqual([
      { kind: 'evoke', cost: ['1', 'U', '2', '2'] },
    ]);
    short.expect.illegal(0, { cast: 'cmd', alternative: 'evoke' });
    const g = scenario()
      .seat(0)
      .commander(DRIFTER, { casts: 2, label: 'cmd' })
      .battlefield('Island', { count: 6 })
      .seat(1)
      .build();
    g.act(0).cast('cmd', { alternative: 'evoke', pay: true });
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'evoke', commanderTax: 4 }]);
    expect(g.find({ name: 'Island', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(6);
  });
});

describe('the sacrifice trigger (CR 702.74a, 603.3)', () => {
  test('an evoked creature enters, and its sacrifice trigger goes on the stack: it can be responded to', () => {
    const g = scenario().seat(0).hand(MARTYR).battlefield('Plains').seat(1).build();
    g.act(0).cast(MARTYR, { alternative: 'evoke', pay: true });
    resolveTop(g); // the spell resolves; the creature enters
    // It is on the battlefield with the sacrifice trigger above nothing else on the stack.
    g.expect.zone(MARTYR, 'battlefield', { seat: 0 });
    g.expect.stack([`${MARTYR} (ability)`]);
    expect(getView(g.state, 0).stack[0]?.ability?.kind).toBe('triggered');
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.zone(MARTYR, 'graveyard', { seat: 0 });
    g.expect.life(0, 43); // it died: "when this creature dies, you gain 3 life"
    g.expect.invariants();
  });

  test('the permanent is marked as evoked while it is on the battlefield', () => {
    const g = scenario().seat(0).hand(MARTYR).battlefield('Plains').seat(1).build();
    g.act(0).cast(MARTYR, { alternative: 'evoke', pay: true });
    resolveTop(g);
    expect(getView(g.state, 1).battlefield.find((o) => o.name === MARTYR)?.alternative).toBe(
      'evoke',
    );
  });

  test('an ordinary cast has no sacrifice trigger: the creature stays', () => {
    const g = scenario().seat(0).hand(MARTYR).battlefield('Plains', { count: 3 }).seat(1).build();
    g.act(0).cast(MARTYR, { pay: true });
    resolveTop(g);
    g.expect.zone(MARTYR, 'battlefield', { seat: 0 });
    g.expect.stack([]);
    expect(
      getView(g.state, 1).battlefield.find((o) => o.name === MARTYR)?.alternative,
    ).toBeUndefined();
    g.passAll();
    g.expect.zone(MARTYR, 'battlefield', { seat: 0 });
  });

  test('the opponent can respond with the trigger on the stack, and the sacrifice still happens', () => {
    const g = scenario()
      .seat(0)
      .hand(MARTYR)
      .battlefield('Plains')
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(0).cast(MARTYR, { alternative: 'evoke', pay: true });
    resolveTop(g);
    g.expect.stack([`${MARTYR} (ability)`]);
    g.pass(0);
    // In response the opponent still sees the creature on the battlefield.
    g.expect.zone(MARTYR, 'battlefield', { seat: 0 });
    g.act(1).cast('Lightning Bolt', { targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.zone(MARTYR, 'graveyard', { seat: 0 });
    g.expect.life(0, 40); // -3 from the Bolt, +3 from the creature dying
  });

  test('the creature is bounced in response: the trigger does nothing and a recast creature is not evoked', () => {
    const g = scenario()
      .seat(0)
      .hand(MARTYR)
      .battlefield('Plains', { count: 4 })
      .battlefield('Island')
      .hand('Unsummon')
      .seat(1)
      .build();
    g.act(0).cast(MARTYR, { alternative: 'evoke', pay: true });
    resolveTop(g);
    g.expect.stack([`${MARTYR} (ability)`]);
    g.act(0).cast('Unsummon', { targets: [MARTYR], pay: true });
    g.passAll(); // Unsummon resolves, then the trigger does nothing
    g.expect.zone(MARTYR, 'hand', { seat: 0 });
    g.expect.noEvent({ kind: 'sacrificed' });
    // Cast again, ordinarily: a new object, never evoked (CR 400.7).
    g.act(0).cast(MARTYR, { pay: true });
    g.passAll();
    g.expect.zone(MARTYR, 'battlefield', { seat: 0 });
    g.expect.stack([]);
  });

  test('the trigger is independent of the creature: it sacrifices even after it lost its abilities', () => {
    const g = scenario()
      .seat(0)
      .hand(MARTYR)
      .battlefield('Plains')
      .seat(1)
      .hand('SYNTHETIC Frog Hex')
      .battlefield('Island', { count: 2 })
      .build();
    g.act(0).cast(MARTYR, { alternative: 'evoke', pay: true });
    resolveTop(g);
    g.expect.stack([`${MARTYR} (ability)`]);
    g.pass(0);
    g.act(1).cast('SYNTHETIC Frog Hex', { targets: [MARTYR], pay: true });
    g.passAll();
    g.expect.zone(MARTYR, 'graveyard', { seat: 0 });
  });
});

describe('with another enters trigger the controller orders them (CR 603.3b)', () => {
  test('both go on the stack: ordering the sacrifice last lets the other resolve while it is on the battlefield', () => {
    const g = scenario()
      .seat(0)
      .hand(DRIFTER)
      .battlefield('Island', { count: 2 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(DRIFTER, { alternative: 'evoke', pay: true });
    g.passAll();
    g.expect.pending('orderTriggers', 0);
    const d = g.state.pending;
    if (d?.kind !== 'orderTriggers') throw new Error('expected an orderTriggers decision');
    expect(d.triggers).toHaveLength(2);
    g.act(0).orderTriggers(1, 0);
    g.expect.stack([`${DRIFTER} (ability)`, `${DRIFTER} (ability)`]);
    g.passAll();
    g.expect.zone(DRIFTER, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 2);
    g.expect.invariants();
  });

  test('either order ends the same: the creature is gone and the other trigger resolved', () => {
    for (const order of [
      [0, 1],
      [1, 0],
    ] as const) {
      const g = scenario()
        .seat(0)
        .hand(DRIFTER)
        .battlefield('Island', { count: 2 })
        .library('Plains', 'Plains', 'Plains')
        .seat(1)
        .build();
      g.act(0).cast(DRIFTER, { alternative: 'evoke', pay: true });
      g.passAll();
      g.act(0).orderTriggers(...order);
      g.passAll();
      g.expect.zone(DRIFTER, 'graveyard', { seat: 0 });
      g.expect.handSize(0, 2);
    }
  });

  test('a targeted enters trigger beside the sacrifice: it still finds its target after the creature is gone', () => {
    const g = scenario()
      .seat(0)
      .hand(REAPER)
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast(REAPER, { alternative: 'evoke', pay: true });
    g.passAll();
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    // The destroy trigger asks for its target as it goes on the stack.
    if (g.state.pending?.kind === 'targets') g.act(0).chooseTargets('Grizzly Bears');
    g.passAll();
    g.expect.zone(REAPER, 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });
});

describe('an evoked creature that leaves the battlefield (CR 603.6c, 700.4)', () => {
  test('a "when this dies" ability triggers off the sacrifice', () => {
    const g = scenario().seat(0).hand(MARTYR).battlefield('Plains').seat(1).build();
    g.act(0).cast(MARTYR, { alternative: 'evoke', pay: true });
    resolveTop(g);
    g.passAll();
    g.expect.life(0, 43);
    // The creature goes to the graveyard (it died), then the sacrifice is reported (CR 701.21).
    g.expect.eventLog([{ kind: 'spellCast' }, { kind: 'died' }, { kind: 'sacrificed' }]);
  });

  test('a "when this leaves the battlefield" ability triggers too', () => {
    const g = scenario()
      .seat(0)
      .hand(WISP)
      .battlefield('Forest', { count: 2 })
      .library('Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(WISP, { alternative: 'evoke', pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(WISP, 'graveyard', { seat: 0 });
    g.expect.handSize(0, 1);
  });

  test('the sacrifice moves it to the graveyard of its owner: a commander may go to the command zone (CR 903.9a)', () => {
    const g = scenario()
      .seat(0)
      .commander(MARTYR, { label: 'cmd' })
      .battlefield('Plains')
      .seat(1)
      .build();
    g.act(0).cast('cmd', { alternative: 'evoke', pay: true });
    g.passAll();
    g.passAll();
    g.expect.zone(MARTYR, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });
});

describe('the engine refuses what it cannot run', () => {
  const face = (extra: Record<string, unknown>) => {
    const base = syntheticCard(DRIFTER);
    return { ...base, faces: [{ ...base.faces[0], ...extra }] } as unknown as typeof base;
  };

  test('the features list evoke', () => {
    expect(SUPPORTED_FEATURES.castAlternatives).toContain('evoke');
    expect(isFeatureSupported('castAlternative:evoke')).toBe(true);
  });

  test('every evoke fixture validates', () => {
    for (const name of [DRIFTER, REAPER, MARTYR, WISP]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('evoke on an instant or a sorcery is refused', () => {
    const issues = validateCard(face({ types: ['sorcery'], power: null, toughness: null }));
    expect(issues.map((i) => i.message).join('|')).toMatch(/permanent/);
  });

  test('a non-mana evoke cost, X and a second evoke are refused', () => {
    const exile = face({
      alternativeCosts: [
        { kind: 'evoke', cost: [{ kind: 'exileFromGraveyard', filter: {}, count: 1 }] },
      ],
    });
    expect(
      validateCard(exile)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/mana only/);
    const x = face({
      alternativeCosts: [{ kind: 'evoke', cost: [{ kind: 'mana', symbols: ['X'] }] }],
    });
    expect(
      validateCard(x)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/X in an alternative cost/);
    const two = face({
      alternativeCosts: [
        { kind: 'evoke', cost: [{ kind: 'mana', symbols: ['U'] }] },
        { kind: 'evoke', cost: [{ kind: 'mana', symbols: ['1', 'U'] }] },
      ],
    });
    expect(
      validateCard(two)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/more than one alternative cost/);
  });
});

describe('determinism and replay', () => {
  const build = () =>
    scenario()
      .seat(0)
      .hand(DRIFTER)
      .battlefield('Island', { count: 2 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .build();

  test('the same actions give the same state, and the log replays to it', () => {
    const play = () => {
      const g = build();
      g.act(0).cast(DRIFTER, { alternative: 'evoke', pay: true });
      g.passAll();
      g.act(0).orderTriggers(1, 0);
      g.passAll();
      return g;
    };
    const a = play();
    const b = play();
    expect(a.hash()).toBe(b.hash());
    let state = build().state;
    for (const { seat, action } of a.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(stateHash(state)).toBe(a.hash());
  });
});
