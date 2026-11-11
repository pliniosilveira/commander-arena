// Escape (D-117 step 4, D-124): "You may cast this card from your graveyard by paying [cost] rather than
// paying its mana cost", where the cost is mana and exiling a number of other cards from your graveyard.
// Pins: CR 702.138a (cast from the graveyard for the escape cost, an alternative cost, 601.2b and 601.2f-h),
// CR 702.138b (a spell or permanent "escaped"), 702.138c ("escapes with" counters: a replacement effect as it
// enters), CR 118.9, 118.9a, 118.9d (an alternative cost; additional costs still apply), CR 601.2h (the cost is
// paid, so exiling cards is part of it), CR 903.8 (commander tax only from the command zone), CR 400.7 (a
// card that changed zones is a new object), CR 614.12 (replacement effects as the permanent enters). Cards
// are SYNTHETIC (src/cards/fixtures/synthetic-alt-costs.ts) except the real filler cards.
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

const WRAITH = 'SYNTHETIC Escape Wraith'; // {3}{B} 3/3, escape {B}{B} and three other cards
const BRUTE = 'SYNTHETIC Escape Brute'; // {4}{R} 4/4, escape {R}{R} and two others, escapes with a +1/+1 counter
const TITAN = 'SYNTHETIC Escape Titan'; // {3}{G} 5/5, sacrificed when it enters unless it escaped, escape {G}{G} and one
const PULSE = 'SYNTHETIC Escape Pulse'; // sorcery {1}{B}: each opponent loses 2; escape {B}{B} and two others

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

const escapeOptions = (g: Game, seat = 0) =>
  getLegalActions(g.state, seat).filter(
    (a) => a.kind === 'castSpell' && a.alternative === 'escape',
  );

/** A graveyard of the card to escape and `others` filler cards. */
const FILLER = [
  'Grizzly Bears',
  'Giant Spider',
  'Typhoid Rats',
  'Youthful Knight',
  'Fencing Ace',
  'Raging Goblin',
  'Yargle, Glutton of Urborg',
];
const board = (card: string, others: number, mana = 6, land = 'Swamp') => {
  const b = scenario().seat(0).graveyard(card);
  for (let i = 0; i < others; i += 1) b.graveyard(FILLER[i] ?? 'Grizzly Bears');
  return b.battlefield(land, { count: mana }).seat(1).build();
};

describe('the option: cast from the graveyard with enough other cards (CR 702.138a)', () => {
  test('three other cards and {B}{B}: the escape cast is offered, and the ordinary cast from the graveyard is not', () => {
    const g = board(WRAITH, 3);
    g.expect.legal(0, { cast: WRAITH, alternative: 'escape' });
    expect(escapeOptions(g)).toHaveLength(1);
    // Without the alternative the card cannot be cast from the graveyard.
    const ordinary = applyAction(g.state, 0, { kind: 'castSpell', object: g.id(WRAITH) });
    expect(ordinary.ok).toBe(false);
  });

  test('two other cards are too few; the card itself does not count', () => {
    const g = board(WRAITH, 2);
    expect(escapeOptions(g)).toEqual([]);
    const alone = board(WRAITH, 0);
    expect(escapeOptions(alone)).toEqual([]);
  });

  test('only the cost of the escape matters, not the mana cost: {B}{B} is enough, {B} is not', () => {
    const enough = board(WRAITH, 3, 2);
    expect(escapeOptions(enough)).toHaveLength(1);
    const short = board(WRAITH, 3, 1);
    expect(escapeOptions(short)).toEqual([]);
  });

  test('a card in the hand has no escape option, and neither has a card in exile or in the opponent’s graveyard', () => {
    const hand = scenario()
      .seat(0)
      .hand(WRAITH)
      .graveyard(...FILLER.slice(0, 5))
      .battlefield('Swamp', { count: 6 })
      .seat(1)
      .build();
    expect(escapeOptions(hand)).toEqual([]);
    const card = hand.object(WRAITH);
    expect(
      applyAction(hand.state, 0, { kind: 'castSpell', object: card.id, alternative: 'escape' }).ok,
    ).toBe(false);
    const exile = scenario()
      .seat(0)
      .exile(WRAITH)
      .graveyard(...FILLER.slice(0, 5))
      .battlefield('Swamp', { count: 6 })
      .seat(1)
      .build();
    expect(escapeOptions(exile)).toEqual([]);
    const theirs = scenario()
      .seat(0)
      .graveyard(...FILLER.slice(0, 5))
      .battlefield('Swamp', { count: 6 })
      .seat(1)
      .graveyard(WRAITH)
      .build();
    expect(escapeOptions(theirs, 0)).toEqual([]);
  });

  test('a card without escape in the graveyard has no option', () => {
    const g = board('Serra Angel', 4);
    g.expect.illegal(0, { cast: 'Serra Angel', alternative: 'escape' });
  });

  test('a creature with escape keeps sorcery timing; the sorcery too', () => {
    const g = scenario()
      .seat(0)
      .graveyard(WRAITH, PULSE)
      .graveyard(...FILLER.slice(0, 6))
      .battlefield('Swamp', { count: 6 })
      .seat(1)
      .at('precombatMain', { active: 1 })
      .build();
    expect(escapeOptions(g)).toEqual([]);
  });

  test('the view shows the escape cost and the number of cards on the card in the graveyard', () => {
    const g = board(WRAITH, 3);
    const card = getView(g.state, 0).seats[0]?.graveyard.find((o) => o.name === WRAITH);
    expect(card?.alternativeCosts).toEqual([{ kind: 'escape', cost: ['B', 'B'], exile: 3 }]);
    expect(card?.castCost).toBeUndefined();
  });
});

describe('the cost: mana and other cards from the graveyard (CR 702.138a, 601.2h)', () => {
  test('more other cards than needed: the caster chooses which are exiled; the card itself is not a candidate', () => {
    const g = board(WRAITH, 5);
    g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
    expect(g.state.casting?.stage).toBe('exile');
    const d = g.state.pending;
    expect(d).toMatchObject({
      kind: 'chooseCards',
      seat: 0,
      purpose: 'exile',
      zone: 'graveyard',
      min: 3,
      max: 3,
      forCost: true,
    });
    if (d?.kind !== 'chooseCards') throw new Error('unreachable');
    expect(d.legal).toHaveLength(5);
    expect(d.legal).not.toContain(g.find({ name: WRAITH, zone: 'stack' })[0]?.id);
    g.act(0).chooseCards('Grizzly Bears', 'Giant Spider', 'Typhoid Rats');
    g.expect.zone('Grizzly Bears', 'exile', { seat: 0 });
    g.expect.zone('Giant Spider', 'exile', { seat: 0 });
    g.expect.zone('Typhoid Rats', 'exile', { seat: 0 });
    g.expect.zone('Youthful Knight', 'graveyard', { seat: 0 });
    g.expect.zone('Fencing Ace', 'graveyard', { seat: 0 });
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'escape', commanderTax: 0 }]);
  });

  test('the mana is paid with the plan, the other cards after it; both are part of the cost', () => {
    const g = board(WRAITH, 5);
    g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
    expect(g.find({ name: 'Swamp', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(2);
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards('Grizzly Bears', 'Giant Spider', 'Typhoid Rats');
    expect(getView(g.state, 1).stack[0]?.alternative).toBe('escape');
    g.expect.invariants();
  });

  test('exactly as many other cards as needed: they are exiled without a question', () => {
    const g = board(WRAITH, 3);
    g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
    g.expect.pending('priority', 0);
    for (const name of ['Grizzly Bears', 'Giant Spider', 'Typhoid Rats']) {
      g.expect.zone(name, 'exile', { seat: 0 });
    }
    expect(getView(g.state, 1).stack[0]?.name).toBe(WRAITH);
  });

  test('a wrong answer is refused: too few, too many, the escaping card itself, a card not in the graveyard', () => {
    const g = board(WRAITH, 5);
    g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
    const ids = (...names: string[]) =>
      names.map((n) => g.object({ name: n, zone: 'graveyard' }).id);
    const spell = g.find({ name: WRAITH, zone: 'stack' })[0]?.id;
    if (spell === undefined) throw new Error('no spell');
    const bad = [
      ids('Grizzly Bears', 'Giant Spider'),
      ids('Grizzly Bears', 'Giant Spider', 'Typhoid Rats', 'Youthful Knight'),
      [spell, ...ids('Grizzly Bears', 'Giant Spider')],
      [
        ...ids('Grizzly Bears', 'Giant Spider'),
        g.find({ name: 'Swamp', zone: 'battlefield' })[0]?.id ?? spell,
      ],
    ];
    for (const objects of bad) {
      expect(applyAction(g.state, 0, { kind: 'chooseCards', objects }).ok).toBe(false);
    }
    expect(
      applyAction(g.state, 0, {
        kind: 'chooseCards',
        objects: ids('Grizzly Bears', 'Giant Spider', 'Typhoid Rats'),
      }).ok,
    ).toBe(true);
  });

  test('cancelling at the question gives back the card, the other cards and the mana', () => {
    const g = board(WRAITH, 5);
    const before = g.positionHash();
    g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
    g.act(0).cancel();
    g.expect.position(before);
    g.expect.zone(WRAITH, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('the other cards are public: the other seat sees what was exiled', () => {
    const g = board(WRAITH, 5);
    g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
    const theirs = getView(g.state, 1);
    expect(theirs.waitingOn).toMatchObject({ seat: 0 });
    g.act(0).chooseCards('Grizzly Bears', 'Giant Spider', 'Typhoid Rats');
    expect(
      getView(g.state, 1)
        .exile.map((o) => o.name)
        .sort(),
    ).toEqual(['Giant Spider', 'Grizzly Bears', 'Typhoid Rats']);
  });

  test('a creature resolves onto the battlefield and remembers that it escaped', () => {
    const g = board(WRAITH, 3);
    g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
    g.passAll();
    g.expect.zone(WRAITH, 'battlefield', { seat: 0 });
    expect(getView(g.state, 0).battlefield.find((o) => o.name === WRAITH)?.alternative).toBe(
      'escape',
    );
    g.expect.invariants();
  });
});

describe('escape twice, and what a spell cast with escape does (CR 702.138a, 400.7)', () => {
  test('a creature that died is in the graveyard again and may escape again', () => {
    const g = scenario()
      .seat(0)
      .graveyard(WRAITH)
      .graveyard(...FILLER.slice(0, 6))
      .battlefield('Swamp', { count: 6 })
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .build();
    g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
    g.act(0).chooseCards('Grizzly Bears', 'Giant Spider', 'Typhoid Rats');
    g.passAll();
    g.expect.zone(WRAITH, 'battlefield', { seat: 0 });
    g.pass(0);
    g.act(1).cast('Murder', { targets: [WRAITH], pay: true });
    g.passAll();
    g.expect.zone(WRAITH, 'graveyard', { seat: 0 });
    // Three other cards are left (three Bears and the Murder: four), so it can escape again.
    g.expect.legal(0, { cast: WRAITH, alternative: 'escape' });
  });

  test('a sorcery cast with escape goes to the graveyard as it resolves (not exiled) and can escape again', () => {
    const g = scenario()
      .seat(0)
      .graveyard(PULSE)
      .graveyard(...FILLER.slice(0, 5))
      .battlefield('Swamp', { count: 6 })
      .seat(1)
      .build();
    g.act(0).cast(PULSE, { alternative: 'escape', pay: true });
    g.act(0).chooseCards('Grizzly Bears', 'Giant Spider');
    g.passAll();
    g.expect.life(1, 38);
    g.expect.zone(PULSE, 'graveyard', { seat: 0 });
    g.expect.noObject(PULSE, { zone: 'exile' });
    g.expect.legal(0, { cast: PULSE, alternative: 'escape' });
  });

  test('a countered spell cast with escape goes to the graveyard', () => {
    const g = scenario()
      .seat(0)
      .graveyard(WRAITH)
      .graveyard(...FILLER.slice(0, 5))
      .battlefield('Swamp', { count: 6 })
      .seat(1)
      .hand('Counterspell')
      .battlefield('Island', { count: 2 })
      .build();
    g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
    g.act(0).chooseCards('Grizzly Bears', 'Giant Spider', 'Typhoid Rats');
    g.pass(0);
    g.act(1).cast('Counterspell', { targets: [WRAITH], pay: true });
    g.passAll();
    g.expect.zone(WRAITH, 'graveyard', { seat: 0 });
    g.expect.noObject(WRAITH, { zone: 'exile' });
  });

  test('a cast that could be cast again later pays the cost again, with other cards each time', () => {
    const g = board(TITAN, 1, 8, 'Forest');
    g.act(0).cast(TITAN, { alternative: 'escape', pay: true });
    g.passAll();
    g.expect.zone(TITAN, 'battlefield', { seat: 0 });
    // One other card was exiled: nothing is left to pay a second escape with.
    expect(g.state.seats[0]?.graveyard).toEqual([]);
  });
});

describe('"escapes with" and "unless it escaped" (CR 702.138b, 702.138c, 614.12)', () => {
  test('a permanent that escaped enters with its counters; the same card cast from the hand does not', () => {
    const escaped = board(BRUTE, 2, 6, 'Mountain');
    escaped.act(0).cast(BRUTE, { alternative: 'escape', pay: true });
    escaped.passAll();
    escaped.expect.counters(BRUTE, { '+1/+1': 1 });
    escaped.expect.pt(BRUTE, 5, 5);

    const cast = scenario()
      .seat(0)
      .hand(BRUTE)
      .battlefield('Mountain', { count: 5 })
      .seat(1)
      .build();
    cast.act(0).cast(BRUTE, { pay: true });
    cast.passAll();
    cast.expect.counters(BRUTE, {});
    cast.expect.pt(BRUTE, 4, 4);
  });

  test('the counters are put on it as it enters: a replacement, not a trigger (nothing goes on the stack)', () => {
    const g = board(BRUTE, 2, 6, 'Mountain');
    g.act(0).cast(BRUTE, { alternative: 'escape', pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.noEvent({ kind: 'abilityTriggered' });
  });

  test('"sacrifice it unless it escaped": cast from the hand it is sacrificed, escaped it stays', () => {
    const hand = scenario().seat(0).hand(TITAN).battlefield('Forest', { count: 4 }).seat(1).build();
    hand.act(0).cast(TITAN, { pay: true });
    hand.pass(0);
    hand.pass(1);
    hand.expect.stack([`${TITAN} (ability)`]);
    hand.passAll();
    hand.expect.zone(TITAN, 'graveyard', { seat: 0 });

    const escaped = board(TITAN, 1, 2, 'Forest');
    escaped.act(0).cast(TITAN, { alternative: 'escape', pay: true });
    escaped.pass(0);
    escaped.pass(1);
    escaped.expect.stack([]);
    escaped.expect.zone(TITAN, 'battlefield', { seat: 0 });
  });

  test('a permanent that escaped and came back is a new object: it did not escape any more', () => {
    const g = scenario()
      .seat(0)
      .graveyard(TITAN)
      .graveyard('Forest')
      .battlefield('Forest', { count: 6 })
      .battlefield('Island')
      .hand('Unsummon')
      .seat(1)
      .build();
    g.act(0).cast(TITAN, { alternative: 'escape', pay: true });
    g.passAll();
    g.act(0).cast('Unsummon', { targets: [TITAN], pay: true });
    g.passAll();
    g.act(0).cast(TITAN, { pay: true });
    g.pass(0);
    g.pass(1);
    g.expect.stack([`${TITAN} (ability)`]);
    expect(getView(g.state, 0).battlefield.find((o) => o.name === TITAN)?.alternative).toBe(
      undefined,
    );
    g.passAll();
    g.expect.zone(TITAN, 'graveyard', { seat: 0 });
  });
});

describe('commander tax is for the command zone only (CR 903.8)', () => {
  test('a commander in the graveyard escapes without tax and is not counted as cast from the command zone', () => {
    const g = scenario()
      .seat(0)
      .graveyard(WRAITH, { commander: true, casts: 2, label: 'cmd' })
      .graveyard(...FILLER.slice(0, 3))
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .build();
    g.expect.legal(0, { cast: 'cmd', alternative: 'escape' });
    g.act(0).cast('cmd', { alternative: 'escape', pay: true });
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'escape', commanderTax: 0 }]);
    expect(Object.values(g.state.commanderCasts).reduce((a, b) => a + b, 0)).toBe(2);
  });

  test('a commander in the command zone cannot escape (it is not in the graveyard)', () => {
    const g = scenario()
      .seat(0)
      .commander(WRAITH, { label: 'cmd' })
      .graveyard(...FILLER.slice(0, 5))
      .battlefield('Swamp', { count: 6 })
      .seat(1)
      .build();
    expect(escapeOptions(g)).toEqual([]);
    expect(
      applyAction(g.state, 0, {
        kind: 'castSpell',
        object: g.id('cmd'),
        alternative: 'escape',
      }).ok,
    ).toBe(false);
  });
});

describe('the engine refuses what it cannot run', () => {
  const face = (extra: Record<string, unknown>) => {
    const base = syntheticCard(WRAITH);
    return { ...base, faces: [{ ...base.faces[0], ...extra }] } as unknown as typeof base;
  };
  const alt = (extra: Record<string, unknown>) => [
    { kind: 'escape', cost: [{ kind: 'mana', symbols: ['B', 'B'] }], exile: 3, ...extra },
  ];
  const messages = (card: ReturnType<typeof face>) =>
    validateCard(card)
      .map((i) => i.message)
      .join('|');

  test('the features list escape and the escaped condition', () => {
    expect(SUPPORTED_FEATURES.castAlternatives).toContain('escape');
    expect(isFeatureSupported('castAlternative:escape')).toBe(true);
    expect(isFeatureSupported('condition:escaped')).toBe(true);
  });

  test('every escape fixture validates', () => {
    for (const name of [WRAITH, BRUTE, TITAN, PULSE]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('a missing or invalid number of cards, a non-mana cost and X are refused', () => {
    expect(messages(face({ alternativeCosts: alt({ exile: 0 }) }))).toMatch(/exile/);
    expect(messages(face({ alternativeCosts: alt({ exile: 1.5 }) }))).toMatch(/exile/);
    expect(messages(face({ alternativeCosts: alt({ exile: undefined }) }))).toMatch(/exile/);
    expect(
      messages(face({ alternativeCosts: alt({ cost: [{ kind: 'payLife', amount: 2 }] }) })),
    ).toMatch(/mana only/);
    expect(
      messages(face({ alternativeCosts: alt({ cost: [{ kind: 'mana', symbols: ['X'] }] }) })),
    ).toMatch(/X in an alternative cost/);
  });

  test('escape on a land, and with delve, is refused', () => {
    expect(messages(face({ types: ['land'], power: null, toughness: null }))).toMatch(
      /escape is on a spell/,
    );
    expect(
      messages(
        face({
          abilities: [{ kind: 'keyword', keyword: { kind: 'delve' } }],
          alternativeCosts: alt({}),
        }),
      ),
    ).toMatch(/delve/);
  });

  test('"exile" is only for escape; the other kinds refuse the field', () => {
    expect(
      messages(
        face({
          alternativeCosts: [{ kind: 'dash', cost: [{ kind: 'mana', symbols: ['R'] }], exile: 2 }],
        }),
      ),
    ).toMatch(/exile/);
  });

  test('the escaped condition and "escapes with" need an escape cost on the face', () => {
    const escapedCondition = {
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      interveningIf: { kind: 'escaped' },
      effect: { kind: 'sacrifice', objects: { kind: 'this' } },
    };
    expect(messages(face({ alternativeCosts: undefined, abilities: [escapedCondition] }))).toMatch(
      /escaped/,
    );
    const counters = {
      kind: 'replacement',
      replacement: { kind: 'entersWithCounters', counter: '+1/+1', count: 1, ifEscaped: true },
    };
    expect(messages(face({ alternativeCosts: undefined, abilities: [counters] }))).toMatch(
      /escape/,
    );
    expect(messages(face({ abilities: [escapedCondition, counters] }))).toBe('');
  });
});

describe('determinism and replay', () => {
  const build = () => board(WRAITH, 5);

  test('the same actions give the same state, and the log replays to it', () => {
    const play = () => {
      const g = build();
      g.act(0).cast(WRAITH, { alternative: 'escape', pay: true });
      g.act(0).chooseCards('Grizzly Bears', 'Giant Spider', 'Typhoid Rats');
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
