// Overload (D-117 step 1, D-121): "You may choose to pay [cost] rather than pay this spell's mana cost",
// and "if you chose to pay this spell's overload cost, change its text by replacing all instances of the
// word 'target' with the word 'each'".
// Pins: CR 702.96a (the two abilities; casting for the overload cost follows 601.2b and 601.2f-h),
// CR 702.96b (the spell requires no targets and may affect objects that could not be chosen), CR
// 702.96c / 612 (a text change, so it is the same spell), CR 118.9a (only one alternative cost applies),
// CR 118.9d (commander tax and other additional costs still apply), CR 601.2b (the alternative cost is
// announced as the spell is cast), CR 903.8 (commander tax), CR 702.11b (hexproof stops only targeting),
// CR 115.1 (targeting). Cards are SYNTHETIC (src/cards/fixtures/synthetic-alt-costs.ts).
import { describe, expect, test } from 'vitest';
import { overloadedText } from '../src/ast/overload';
import {
  applyAction,
  getLegalActions,
  getView,
  isFeatureSupported,
  type SpellText,
  SUPPORTED_FEATURES,
  stateHash,
  syntheticCard,
  validateCard,
} from '../src/index';
import { scenario } from '../src/testing/index';

const BOLT = 'SYNTHETIC Overload Bolt'; // {1}{R}, 3 damage to target creature an opponent controls; overload {3}{R}{R}
const BOUNCE = 'SYNTHETIC Overload Bounce'; // {1}{U}, bounce target nonland permanent you don't control; overload {3}{U}{U}
const SAP = 'SYNTHETIC Overload Sap'; // {1}{B} sorcery, -2/-2 and gain 1; overload {3}{B}{B}
const PING = 'SYNTHETIC Overload Ping'; // {2}{R} sorcery, 2 damage to target creature; overload {4}{R}{R}
const GATED = 'SYNTHETIC Overload Gated'; // {2}{R}, overload {1}{R} only with a commander

const overloadOptions = (g: ReturnType<ReturnType<typeof scenario>['build']>, seat = 0) =>
  getLegalActions(g.state, seat).filter(
    (a) => a.kind === 'castSpell' && a.alternative === 'overload',
  );

describe('the choice at the first casting step (CR 601.2b, 118.9a)', () => {
  test('with both costs affordable the ordinary cast and the overload cast are separate options', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.expect.legal(0, { cast: BOLT });
    g.expect.legal(0, { cast: BOLT, alternative: 'overload' });
    expect(overloadOptions(g)).toHaveLength(1);
  });

  test('only the ordinary cast is offered when the overload cost cannot be paid', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.expect.legal(0, { cast: BOLT });
    g.expect.illegal(0, { cast: BOLT, alternative: 'overload' });
    expect(overloadOptions(g)).toEqual([]);
  });

  test('only the overload cast is offered when the ordinary cost cannot be paid', () => {
    // The gated overload {1}{R} is cheaper than the ordinary {2}{R}: two Mountains pay only that.
    const g = scenario()
      .seat(0)
      .hand(GATED)
      .battlefield('Grizzly Bears', { commander: true })
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    g.expect.illegal(0, { cast: GATED });
    g.expect.legal(0, { cast: GATED, alternative: 'overload' });
  });

  test('the condition of the alternative cost is read for the caster (CR 903.3d)', () => {
    const g = scenario()
      .seat(0)
      .hand(GATED)
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    g.expect.legal(0, { cast: GATED });
    g.expect.illegal(0, { cast: GATED, alternative: 'overload' });
  });

  test('a card without an overload cost has no overload option', () => {
    const g = scenario()
      .seat(0)
      .hand('Lightning Bolt')
      .battlefield('Mountain', { count: 6 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.expect.illegal(0, { cast: 'Lightning Bolt', alternative: 'overload' });
  });

  test('the overload option does not exist from a zone the card cannot be cast from', () => {
    // CR 601.2a: casting needs the card in the hand (or command zone): a card in the graveyard has no
    // flashback, so neither the ordinary nor the overload cast is possible.
    const g = scenario()
      .seat(0)
      .graveyard(BOLT)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    expect(g.legalActions(0).filter((a) => a.kind === 'castSpell')).toEqual([]);
    const card = g.find({ name: BOLT, zone: 'graveyard' })[0];
    if (card === undefined) throw new Error('no card');
    const refused = applyAction(g.state, 0, {
      kind: 'castSpell',
      object: card.id,
      alternative: 'overload',
    });
    expect(refused.ok).toBe(false);
    // Exile and library: the same.
    for (const zone of ['exile', 'library'] as const) {
      const b = scenario().seat(0);
      if (zone === 'exile') b.exile(BOLT);
      else b.library(BOLT);
      const other = b.battlefield('Mountain', { count: 5 }).seat(1).build();
      const o = other.find({ name: BOLT, zone })[0];
      if (o === undefined) throw new Error('no card');
      expect(
        applyAction(other.state, 0, { kind: 'castSpell', object: o.id, alternative: 'overload' })
          .ok,
      ).toBe(false);
    }
  });

  test('the free alternative is not an overload: a card without it has no such option', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.expect.illegal(0, { cast: BOLT, alternative: 'free' });
  });
});

describe('overload with and without legal single targets', () => {
  test('the ordinary cast needs a target; the overload cast does not (CR 702.96b)', () => {
    const g = scenario().seat(0).hand(BOLT).battlefield('Mountain', { count: 5 }).seat(1).build();
    g.expect.illegal(0, { cast: BOLT });
    g.expect.legal(0, { cast: BOLT, alternative: 'overload' });
    g.act(0).cast(BOLT, { alternative: 'overload', pay: true });
    g.expect.stack([BOLT]);
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
  });

  test('with one legal target the overload cast still asks for none and hits it', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast(BOLT, { alternative: 'overload' }).pay();
    // No targets decision: the stage after the alternative cost is the payment, then it is cast.
    g.expect.pending('priority', 0);
    expect(getView(g.state, 0).stack[0]?.targets).toEqual([]);
    g.passAll();
    g.expect.zone('Grizzly Bears', 'graveyard', { seat: 1 });
  });

  test('with several legal targets it affects every one of them and none of the caster’s', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 5 })
      .battlefield('Grizzly Bears', { label: 'mine' })
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'a' })
      .battlefield('Giant Spider', { label: 'b' })
      .battlefield('Llanowar Elves', { label: 'c' })
      .battlefield('Serra Angel', { label: 'big' })
      .build();
    g.act(0).cast(BOLT, { alternative: 'overload', pay: true });
    g.passAll();
    // 3 damage: the Bears (2/2), Spider (2/4: survives with damage), Elves (1/1) die; the Angel (4/4) lives.
    expect(g.object('a').zone).toBe('graveyard');
    expect(g.object('c').zone).toBe('graveyard');
    expect(g.object('b').zone).toBe('battlefield');
    g.expect.damage('b', 3);
    expect(g.object('big').zone).toBe('battlefield');
    g.expect.damage('big', 3);
    expect(g.object('mine').zone).toBe('battlefield');
    g.expect.damage('mine', 0);
    g.expect.invariants();
  });

  test('a filter with no controller hits the caster’s own creatures too ("each creature")', () => {
    const g = scenario()
      .seat(0)
      .hand(PING)
      .battlefield('Mountain', { count: 6 })
      .battlefield('Grizzly Bears', { label: 'mine' })
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'theirs' })
      .build();
    g.act(0).cast(PING, { alternative: 'overload', pay: true });
    g.passAll();
    expect(g.object('mine').zone).toBe('graveyard');
    expect(g.object('theirs').zone).toBe('graveyard');
  });

  test('every instruction that named the target now affects each, and the others are unchanged', () => {
    const g = scenario()
      .seat(0)
      .hand(SAP)
      .battlefield('Swamp', { count: 5 })
      .battlefield('Grizzly Bears', { label: 'mine' })
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'a' })
      .battlefield('Giant Spider', { label: 'b' })
      .build();
    g.act(0).cast(SAP, { alternative: 'overload', pay: true });
    g.passAll();
    expect(g.object('a').zone).toBe('graveyard');
    g.expect.pt('b', 0, 2);
    g.expect.pt('mine', 2, 2);
    g.expect.life(0, 41);
  });

  test('a permanent spell of another kind of target: overload bounces each nonland permanent you do not control', () => {
    const g = scenario()
      .seat(0)
      .hand(BOUNCE)
      .battlefield('Island', { count: 5 })
      .battlefield('Grizzly Bears', { label: 'mine' })
      .seat(1)
      .battlefield('Grizzly Bears', { label: 'a' })
      .battlefield('Giant Spider', { label: 'b' })
      .battlefield('Forest', { label: 'land' })
      .build();
    g.act(0).cast(BOUNCE, { alternative: 'overload', pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand', { seat: 1 });
    g.expect.zone('Giant Spider', 'hand', { seat: 1 });
    expect(g.object('land').zone).toBe('battlefield');
    expect(g.object('mine').zone).toBe('battlefield');
  });
});

describe('overload goes through hexproof, shroud and protection (CR 702.96b, 702.11b, 702.18b)', () => {
  test('the ordinary cast cannot target a hexproof creature; the overload cast kills it', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .battlefield('SYNTHETIC Hexproof Bear', { label: 'hex' })
      .battlefield('SYNTHETIC Shroud Bear', { label: 'shroud' })
      .build();
    // CR 702.11b: an opponent's hexproof creature is not a legal target.
    g.expect.illegal(0, { cast: BOLT });
    g.expect.legal(0, { cast: BOLT, alternative: 'overload' });
    g.act(0).cast(BOLT, { alternative: 'overload', pay: true });
    g.passAll();
    expect(g.object('hex').zone).toBe('graveyard');
    expect(g.object('shroud').zone).toBe('graveyard');
  });

  test('no creature became the target of anything (Ward and "becomes the target" see nothing)', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast(BOLT, { alternative: 'overload', pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'becameTarget' });
    g.expect.noEvent({ kind: 'fizzled' });
  });

  test('the only creature goes away in response: the spell has no target to lose, so it does not fizzle', () => {
    // CR 608.2b: a spell fizzles only if all its targets became illegal; this one has none.
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .hand('Unsummon')
      .battlefield('Island')
      .battlefield('Grizzly Bears', { label: 'bear' })
      .build();
    g.act(0).cast(BOLT, { alternative: 'overload', pay: true });
    g.pass(0);
    g.act(1).cast('Unsummon', { targets: ['bear'], pay: true });
    g.passAll();
    g.expect.zone('Grizzly Bears', 'hand', { seat: 1 });
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'fizzled' });
  });
});

describe('what is paid (CR 702.96a, 118.9, 118.9c)', () => {
  test('the overload cost is paid instead of the mana cost, and the view shows both', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 7 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    const card = getView(g.state, 0).seats[0]?.hand?.[0];
    expect(card?.castCost).toEqual(['1', 'R']);
    expect(card?.alternativeCosts).toEqual([{ kind: 'overload', cost: ['3', 'R', 'R'] }]);
    g.act(0).cast(BOLT, { alternative: 'overload', pay: true });
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(
      5,
    );
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'overload', commanderTax: 0 }]);
  });

  test('the stack object says it was overloaded; a card that was not has no such mark', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 7 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast(BOLT, { alternative: 'overload', pay: true });
    expect(getView(g.state, 1).stack[0]?.alternative).toBe('overload');
    const h = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 7 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    h.act(0).cast(BOLT, { targets: ['Grizzly Bears'], pay: true });
    expect(getView(h.state, 1).stack[0]?.alternative).toBeUndefined();
  });

  test('the mana cost on the stack is still the printed one (CR 118.9c)', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 7 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast(BOLT, { alternative: 'overload', pay: true });
    expect(getView(g.state, 1).stack[0]?.manaCost).toEqual(['1', 'R']);
  });

  test('cancelling an overload cast restores everything (CR 733)', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    const before = g.positionHash();
    g.act(0).cast(BOLT, { alternative: 'overload' }).cancel();
    g.expect.position(before);
  });

  test('a counterspell counters an overloaded spell: it goes to the graveyard as any spell does', () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast(BOLT, { alternative: 'overload', pay: true });
    g.pass(0);
    g.act(1).cast('Counterspell', { targets: [BOLT], pay: true });
    g.passAll();
    g.expect.zone(BOLT, 'graveyard', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 1 });
  });
});

describe('commander tax and additional costs still apply (CR 118.9d, 903.8)', () => {
  test('a commander cast for its overload cost from the command zone pays the tax on top', () => {
    const none = scenario()
      .seat(0)
      .commander(SAP, { casts: 2, label: 'cmd' })
      .battlefield('Swamp', { count: 8 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    // {3}{B}{B} + {2}{2}: nine mana; eight Swamps are one short.
    expect(getView(none.state, 0).seats[0]?.command[0]?.alternativeCosts).toEqual([
      { kind: 'overload', cost: ['3', 'B', 'B', '2', '2'] },
    ]);
    none.expect.illegal(0, { cast: 'cmd', alternative: 'overload' });
    const enough = scenario()
      .seat(0)
      .commander(SAP, { casts: 2, label: 'cmd' })
      .battlefield('Swamp', { count: 9 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    enough.expect.legal(0, { cast: 'cmd', alternative: 'overload' });
    enough.act(0).cast('cmd', { alternative: 'overload', pay: true });
    expect(
      enough.find({ name: 'Swamp', zone: 'battlefield' }).filter((o) => o.tapped),
    ).toHaveLength(9);
    enough.expect.eventLog([{ kind: 'spellCast', alternative: 'overload', commanderTax: 4 }]);
  });

  test('the first cast needs no tax: just the overload cost', () => {
    const g = scenario()
      .seat(0)
      .commander(SAP, { label: 'cmd' })
      .battlefield('Swamp', { count: 5 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).cast('cmd', { alternative: 'overload', pay: true });
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'overload', commanderTax: 0 }]);
  });
});

describe('additional costs are paid with the overload cost (CR 118.9d, 601.2h)', () => {
  const TOLL = 'SYNTHETIC Overload Toll'; // {1}{B} sorcery, discard a card, destroy target creature an opponent controls; overload {3}{B}{B}

  test('the overloaded cast discards a card of the caster’s choice, then destroys each creature', () => {
    const g = scenario()
      .seat(0)
      .hand(TOLL, 'Grizzly Bears', 'Llanowar Elves')
      .battlefield('Swamp', { count: 5 })
      .seat(1)
      .battlefield('Giant Spider', { label: 'a' })
      .battlefield('Serra Angel', { label: 'b' })
      .build();
    g.act(0).cast(TOLL, { alternative: 'overload', pay: true });
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Llanowar Elves');
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    g.passAll();
    expect(g.object('a').zone).toBe('graveyard');
    expect(g.object('b').zone).toBe('graveyard');
    g.expect.zone('Grizzly Bears', 'hand', { seat: 0 });
  });

  test('with nothing to discard the overload cast is not offered, as the ordinary one is not', () => {
    const g = scenario()
      .seat(0)
      .hand(TOLL)
      .battlefield('Swamp', { count: 5 })
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    g.expect.illegal(0, { cast: TOLL });
    g.expect.illegal(0, { cast: TOLL, alternative: 'overload' });
    const other = scenario()
      .seat(0)
      .hand(TOLL, 'Grizzly Bears')
      .battlefield('Swamp', { count: 5 })
      .seat(1)
      .battlefield('Giant Spider')
      .build();
    other.expect.legal(0, { cast: TOLL });
    other.expect.legal(0, { cast: TOLL, alternative: 'overload' });
  });
});

describe('timing is the spell’s own', () => {
  test('a sorcery overloaded is still a sorcery: not on the opponent’s turn', () => {
    const g = scenario()
      .seat(0)
      .hand(SAP)
      .battlefield('Swamp', { count: 5 })
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .battlefield('Grizzly Bears')
      .at('precombatMain', { active: 1 })
      .build();
    // The sorcery is not castable on the opponent's turn.
    g.expect.illegal(0, { cast: SAP, alternative: 'overload' });
  });
});

describe('the engine refuses what it cannot run', () => {
  const face = (extra: Record<string, unknown>) => {
    const base = syntheticCard(BOLT);
    return {
      ...base,
      faces: [{ ...base.faces[0], ...extra }],
    } as unknown as typeof base;
  };

  test('the features list overload', () => {
    expect(SUPPORTED_FEATURES.castAlternatives).toContain('overload');
    expect(isFeatureSupported('castAlternative:overload')).toBe(true);
    expect(isFeatureSupported('castAlternative:free')).toBe(true);
  });

  test('every overload fixture validates', () => {
    for (const name of [BOLT, BOUNCE, SAP, PING, GATED]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('overload on a creature is refused', () => {
    const issues = validateCard(face({ types: ['creature'], power: 2, toughness: 2 }));
    expect(issues.map((i) => i.message).join('|')).toMatch(/instant or a sorcery/);
  });

  test('a player target or an any-target slot cannot be overloaded', () => {
    for (const what of [{ kind: 'player', filter: 'opponent' }, { kind: 'anyTarget' }]) {
      const card = face({
        spell: {
          targets: [{ id: 't1', what }],
          effect: { kind: 'dealDamage', amount: 2, to: { kind: 'target', id: 't1' } },
        },
      });
      expect(
        validateCard(card)
          .map((i) => i.message)
          .join('|'),
      ).toMatch(/cannot change this text/);
    }
  });

  test('a spell with no target, a modal spell and an amount that reads the target are refused', () => {
    const noTarget = face({
      spell: { effect: { kind: 'draw', player: { kind: 'you' }, count: 1 } },
    });
    expect(
      validateCard(noTarget)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/cannot change this text/);
    const reads = face({
      spell: {
        targets: [
          {
            id: 't1',
            what: { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } },
          },
        ],
        effect: {
          kind: 'dealDamage',
          amount: { kind: 'powerOf', of: { kind: 'target', id: 't1' } },
          to: { kind: 'eachOpponent' },
        },
      },
    });
    expect(
      validateCard(reads)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/cannot change this text/);
  });

  test('a target in the graveyard or on the stack cannot be overloaded', () => {
    for (const filter of [
      { zone: 'graveyard', types: ['creature'] },
      { zone: 'stack', stackKind: 'spell' },
    ]) {
      const card = face({
        spell: {
          targets: [{ id: 't1', what: { kind: 'object', filter } }],
          effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
        },
      });
      expect(
        validateCard(card)
          .map((i) => i.message)
          .join('|'),
      ).toMatch(/cannot change this text/);
    }
  });

  test('X, a non-mana cost, a second overload and an unknown kind are structural errors', () => {
    const x = face({
      alternativeCosts: [{ kind: 'overload', cost: [{ kind: 'mana', symbols: ['X', 'R'] }] }],
    });
    expect(
      validateCard(x)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/X in an alternative cost/);
    const life = face({
      alternativeCosts: [{ kind: 'overload', cost: [{ kind: 'payLife', amount: 2 }] }],
    });
    expect(
      validateCard(life)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/mana only/);
    const two = face({
      alternativeCosts: [
        { kind: 'overload', cost: [{ kind: 'mana', symbols: ['3', 'R'] }] },
        { kind: 'overload', cost: [{ kind: 'mana', symbols: ['4', 'R'] }] },
      ],
    });
    expect(
      validateCard(two)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/more than one alternative cost/);
    const unknown = face({ alternativeCosts: [{ kind: 'jumpStart', cost: [] }] });
    expect(
      validateCard(unknown)
        .map((i) => i.message)
        .join('|'),
    ).toMatch(/unknown alternative cost/);
    const missing = face({ alternativeCosts: [{ kind: 'overload' }] });
    expect(validateCard(missing).length).toBeGreaterThan(0);
  });
});

describe('the text change itself (CR 702.96a, 612)', () => {
  const t1 = { kind: 'target', id: 't1' } as const;
  const spec = {
    id: 't1',
    what: {
      kind: 'object',
      filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
    },
  } as const;

  test('target becomes each, with the filter of the slot, and the slots go', () => {
    const text: SpellText = {
      targets: [spec],
      effect: { kind: 'dealDamage', amount: 3, to: t1 },
    };
    expect(overloadedText(text)).toEqual({
      effect: {
        kind: 'dealDamage',
        amount: 3,
        to: {
          kind: 'each',
          filter: { zone: 'battlefield', types: ['creature'], controller: 'opponent' },
        },
      },
    });
  });

  test('a slot with no zone reads as the battlefield', () => {
    const text: SpellText = {
      targets: [{ id: 't1', what: { kind: 'object', filter: { types: ['artifact'] } } }],
      effect: { kind: 'destroy', objects: t1 },
    };
    expect(overloadedText(text)?.effect).toEqual({
      kind: 'destroy',
      objects: { kind: 'each', filter: { types: ['artifact'], zone: 'battlefield' } },
    });
  });

  test('two slots are each replaced by their own filter', () => {
    const text: SpellText = {
      targets: [
        spec,
        { id: 't2', what: { kind: 'object', filter: { zone: 'battlefield', types: ['land'] } } },
      ],
      effect: {
        kind: 'sequence',
        effects: [
          { kind: 'destroy', objects: t1 },
          { kind: 'tap', objects: { kind: 'target', id: 't2' } },
        ],
      },
    };
    const out = overloadedText(text);
    expect(out?.targets).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain('"target"');
    expect(JSON.stringify(out)).toContain('"land"');
  });

  test('the input is not changed', () => {
    const text: SpellText = { targets: [spec], effect: { kind: 'dealDamage', amount: 3, to: t1 } };
    const copy = JSON.stringify(text);
    overloadedText(text);
    expect(JSON.stringify(text)).toBe(copy);
  });
});

describe('determinism and replay', () => {
  const play = () => {
    const g = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .battlefield('Giant Spider')
      .build();
    g.act(0).cast(BOLT, { alternative: 'overload', pay: true });
    g.passAll();
    return g;
  };

  test('the same actions give the same state, and the log replays to it', () => {
    const a = play();
    const b = play();
    expect(a.hash()).toBe(b.hash());
    let state = scenario()
      .seat(0)
      .hand(BOLT)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .battlefield('Giant Spider')
      .build().state;
    for (const { seat, action } of a.log) {
      const r = applyAction(state, seat, action);
      if (!r.ok) throw new Error(r.error);
      state = r.state;
    }
    expect(stateHash(state)).toBe(a.hash());
  });
});
