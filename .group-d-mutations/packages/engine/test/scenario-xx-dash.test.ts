// Dash (D-117 step 3, D-121): "You may cast this card by paying [cost] rather than its mana cost", "If this
// spell's dash cost was paid, return the permanent this spell becomes to its owner's hand at the beginning
// of the next end step", and "As long as this permanent's dash cost was paid, it has haste".
// Pins: CR 702.109a (the three abilities; casting for the dash cost follows 601.2b and 601.2f-h), CR 118.9,
// 118.9a, 118.9d (an alternative cost, one per spell, commander tax still applies), CR 603.7 (a delayed
// triggered ability is created as the spell resolves and triggers once, independently of its source's
// abilities), CR 603.7c (it refers to that permanent, not to a new object), CR 400.7 (a permanent that
// changed zones is a new object), CR 702.10 (haste), CR 302.6 (summoning sickness), CR 903.9b (a commander
// returning to a hand may go to the command zone instead). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-alt-costs.ts).
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

const RAIDER = 'SYNTHETIC Dash Raider'; // {2}{R}{R} 3/1, dash {1}{R}
const SCOUT = 'SYNTHETIC Dash Scout'; // {3}{R} 2/2, "when this enters, you gain 1 life", dash {R}

const dashOptions = (g: ReturnType<ReturnType<typeof scenario>['build']>, seat = 0) =>
  getLegalActions(g.state, seat).filter((a) => a.kind === 'castSpell' && a.alternative === 'dash');

/** Both players pass once: the top object of the stack resolves and what it triggered is put on the stack. */
const resolveTop = (g: ReturnType<ReturnType<typeof scenario>['build']>) => {
  g.pass(0);
  g.pass(1);
};

describe('the choice at the first casting step (CR 601.2b, 118.9a)', () => {
  test('both costs affordable: the ordinary cast and the dash cast are separate options', () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 4 }).seat(1).build();
    g.expect.legal(0, { cast: RAIDER });
    g.expect.legal(0, { cast: RAIDER, alternative: 'dash' });
    expect(dashOptions(g)).toHaveLength(1);
  });

  test('with only the dash cost payable, only the dash cast is offered', () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 2 }).seat(1).build();
    g.expect.illegal(0, { cast: RAIDER });
    g.expect.legal(0, { cast: RAIDER, alternative: 'dash' });
  });

  test('with less than the dash cost nothing is offered', () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 1 }).seat(1).build();
    expect(dashOptions(g)).toEqual([]);
  });

  test('a card without dash, or in the graveyard, has no dash option', () => {
    const g = scenario()
      .seat(0)
      .hand('Grizzly Bears')
      .graveyard(RAIDER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    g.expect.illegal(0, { cast: 'Grizzly Bears', alternative: 'dash' });
    const card = g.find({ name: RAIDER, zone: 'graveyard' })[0];
    if (card === undefined) throw new Error('no card');
    expect(
      applyAction(g.state, 0, { kind: 'castSpell', object: card.id, alternative: 'dash' }).ok,
    ).toBe(false);
  });

  test('a dashed creature spell has sorcery timing', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .at('precombatMain', { active: 1 })
      .build();
    g.expect.illegal(0, { cast: RAIDER, alternative: 'dash' });
  });
});

describe('what is paid (CR 702.109a, 118.9)', () => {
  test('the dash cost is paid instead of the mana cost; the view shows both', () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 4 }).seat(1).build();
    const card = getView(g.state, 0).seats[0]?.hand?.[0];
    expect(card?.castCost).toEqual(['2', 'R', 'R']);
    expect(card?.alternativeCosts).toEqual([{ kind: 'dash', cost: ['1', 'R'] }]);
    g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(
      2,
    );
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'dash', commanderTax: 0 }]);
    expect(getView(g.state, 1).stack[0]?.alternative).toBe('dash');
  });

  test('commander tax is paid on top of the dash cost (CR 118.9d, 903.8)', () => {
    const short = scenario()
      .seat(0)
      .commander(RAIDER, { casts: 1, label: 'cmd' })
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .build();
    short.expect.illegal(0, { cast: 'cmd', alternative: 'dash' });
    const g = scenario()
      .seat(0)
      .commander(RAIDER, { casts: 1, label: 'cmd' })
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    g.act(0).cast('cmd', { alternative: 'dash', pay: true });
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'dash', commanderTax: 2 }]);
  });
});

describe('haste while the dash cost was paid (CR 702.109a, 702.10, 302.6)', () => {
  test('a dashed creature can attack the turn it enters; the same creature cast normally cannot', () => {
    const dashed = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    dashed.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    dashed.passAll();
    dashed.advanceTo('declareAttackers', { attack: false });
    dashed.expect.canAttack(RAIDER, true);
    expect(getView(dashed.state, 0).battlefield.find((o) => o.name === RAIDER)?.keywords).toContain(
      'haste',
    );

    const normal = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .build();
    normal.act(0).cast(RAIDER, { pay: true });
    normal.passAll();
    normal.advanceTo('declareAttackers', { attack: false });
    normal.expect.canAttack(RAIDER, false);
  });

  test('it attacks, deals its damage, and is back in the hand at the end step', () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 4 }).seat(1).build();
    g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    g.passAll();
    g.playCombat({ attack: [RAIDER], until: 'postcombatMain' });
    g.expect.life(1, 37);
    g.advanceTo('end');
    g.expect.stack([`${RAIDER} (ability)`]);
    g.passAll();
    g.expect.zone(RAIDER, 'hand', { seat: 0 });
    g.expect.noObject(RAIDER, { zone: 'battlefield' });
    g.expect.invariants();
  });

  test('a creature that lost its abilities loses haste but is still returned (the delayed trigger is its own)', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .hand('SYNTHETIC Frog Hex')
      .battlefield('Island', { count: 2 })
      .build();
    g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    g.passAll();
    // Hex in response is not possible with an empty stack; the opponent does it later in the turn.
    g.pass(0);
    g.act(1).cast('SYNTHETIC Frog Hex', { targets: [RAIDER], pay: true });
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === RAIDER)?.keywords).not.toContain(
      'haste',
    );
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(RAIDER, 'hand', { seat: 0 });
  });
});

describe('the return at the beginning of the next end step (CR 702.109a, 603.7)', () => {
  test('it goes back to its owner’s hand; the trigger is on the stack where it can be responded to', () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 4 }).seat(1).build();
    g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    g.passAll();
    g.expect.zone(RAIDER, 'battlefield', { seat: 0 });
    g.advanceTo('end');
    g.expect.stack([`${RAIDER} (ability)`]);
    expect(getView(g.state, 0).stack[0]?.ability?.kind).toBe('triggered');
    g.expect.zone(RAIDER, 'battlefield', { seat: 0 });
    g.passAll();
    g.expect.zone(RAIDER, 'hand', { seat: 0 });
    expect(g.state.delayedTriggers).toEqual([]);
  });

  test('it is not returned before the end step, and only once', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 6 })
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library('Plains', 'Plains', 'Plains', 'Plains')
      .build();
    g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    g.passAll();
    g.advanceTo('postcombatMain');
    g.expect.zone(RAIDER, 'battlefield', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(RAIDER, 'hand', { seat: 0 });
    expect(g.state.delayedTriggers).toEqual([]);
    // Cast normally on the next turn it is that player's: no delayed trigger is left, the creature stays
    // through the end step of that turn and the one after.
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(RAIDER, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(RAIDER, 'battlefield', { seat: 0 });
  });

  test('the dashed creature does not trigger anything of its own: no sacrifice, no evoke', () => {
    const g = scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 4 }).seat(1).build();
    g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'sacrificed' });
    g.expect.stack([]);
  });

  test('cast in the second main phase it still returns at the end of that turn', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .at('postcombatMain')
      .build();
    g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    g.passAll();
    g.advanceTo('end');
    g.expect.stack([`${RAIDER} (ability)`]);
    g.passAll();
    g.expect.zone(RAIDER, 'hand', { seat: 0 });
  });

  test('an enters trigger of the creature still triggers each time it is dashed', () => {
    const g = scenario().seat(0).hand(SCOUT).battlefield('Mountain', { count: 1 }).seat(1).build();
    g.act(0).cast(SCOUT, { alternative: 'dash', pay: true });
    resolveTop(g);
    g.expect.stack([`${SCOUT} (ability)`]); // "when this enters, you gain 1 life"
    g.passAll();
    g.expect.life(0, 41);
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(SCOUT, 'hand', { seat: 0 });
  });
});

describe('when the creature is no longer there (CR 603.7c, 400.7)', () => {
  test('it died: the card stays in the graveyard, and the trigger does nothing', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    g.passAll();
    g.pass(0);
    g.act(1).cast('Lightning Bolt', { targets: [RAIDER], pay: true });
    g.passAll();
    g.expect.zone(RAIDER, 'graveyard', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(RAIDER, 'graveyard', { seat: 0 });
    g.expect.noObject(RAIDER, { zone: 'hand' });
    expect(g.state.delayedTriggers).toEqual([]);
  });

  test('it was bounced earlier: it is in the hand already, and the trigger finds nothing on the battlefield', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 4 })
      .battlefield('Island')
      .hand('Unsummon')
      .seat(1)
      .build();
    g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    g.passAll();
    g.act(0).cast('Unsummon', { targets: [RAIDER], pay: true });
    g.passAll();
    g.expect.zone(RAIDER, 'hand', { seat: 0 });
    g.expect.noObject(RAIDER, { zone: 'battlefield' });
  });

  test('bounced and cast again normally: the new creature stays; the old trigger is not about it', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 6 })
      .battlefield('Island')
      .hand('Unsummon')
      .seat(1)
      .build();
    g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    g.passAll();
    g.act(0).cast('Unsummon', { targets: [RAIDER], pay: true });
    g.passAll();
    g.act(0).cast(RAIDER, { pay: true });
    g.passAll();
    g.expect.zone(RAIDER, 'battlefield', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(RAIDER, 'battlefield', { seat: 0 });
    expect(
      getView(g.state, 0).battlefield.find((o) => o.name === RAIDER)?.alternative,
    ).toBeUndefined();
  });

  test('a countered dash spell creates no delayed trigger', () => {
    const g = scenario()
      .seat(0)
      .hand(RAIDER)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .build();
    g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
    g.pass(0);
    g.act(1).cast('Counterspell', { targets: [RAIDER], pay: true });
    g.passAll();
    g.expect.zone(RAIDER, 'graveyard', { seat: 0 });
    expect(g.state.delayedTriggers).toEqual([]);
  });
});

describe('a commander that is dashed (CR 903.9b)', () => {
  test('returning to the hand lets the owner put it in the command zone instead', () => {
    const g = scenario()
      .seat(0)
      .commander(RAIDER, { label: 'cmd' })
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .build();
    g.act(0).cast('cmd', { alternative: 'dash', pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(RAIDER, 'command', { seat: 0 });
    g.expect.invariants();
  });
});

describe('the engine refuses what it cannot run', () => {
  const face = (extra: Record<string, unknown>) => {
    const base = syntheticCard(RAIDER);
    return { ...base, faces: [{ ...base.faces[0], ...extra }] } as unknown as typeof base;
  };

  test('the features list dash', () => {
    expect(SUPPORTED_FEATURES.castAlternatives).toContain('dash');
    expect(isFeatureSupported('castAlternative:dash')).toBe(true);
  });

  test('every dash fixture validates', () => {
    for (const name of [RAIDER, SCOUT]) expect(validateCard(syntheticCard(name)), name).toEqual([]);
  });

  test('dash on something that is not a creature is refused', () => {
    const issues = validateCard(face({ types: ['artifact'], power: null, toughness: null }));
    expect(issues.map((i) => i.message).join('|')).toMatch(/creature/);
    const spell = validateCard(face({ types: ['sorcery'], power: null, toughness: null }));
    expect(spell.map((i) => i.message).join('|')).toMatch(/creature/);
  });

  test('a non-mana dash cost, X and a second dash are refused', () => {
    const life = face({
      alternativeCosts: [{ kind: 'dash', cost: [{ kind: 'payLife', amount: 2 }] }],
    });
    expect(
      validateCard(life)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/mana only/);
    const x = face({
      alternativeCosts: [{ kind: 'dash', cost: [{ kind: 'mana', symbols: ['X'] }] }],
    });
    expect(
      validateCard(x)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/X in an alternative cost/);
    const two = face({
      alternativeCosts: [
        { kind: 'dash', cost: [{ kind: 'mana', symbols: ['R'] }] },
        { kind: 'dash', cost: [{ kind: 'mana', symbols: ['1', 'R'] }] },
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
    scenario().seat(0).hand(RAIDER).battlefield('Mountain', { count: 4 }).seat(1).build();

  test('the same actions give the same state, and the log replays to it', () => {
    const play = () => {
      const g = build();
      g.act(0).cast(RAIDER, { alternative: 'dash', pay: true });
      g.passAll();
      g.advanceTo('end');
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
