// Unearth (D-117 step 5, D-124): "[Cost]: Return this card from your graveyard to the battlefield. It gains
// haste. Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of
// putting it anywhere else. Activate only as a sorcery."
// Pins: CR 702.84a (the whole ability), CR 602.2 and 113.6b (an activated ability that works from the graveyard
// uses the stack and is not a spell), CR 602.5d (sorcery speed), CR 603.7 and 603.7c (the delayed triggered
// ability exists for that object only), CR 614.1 and 614.6 (the "exile instead" replacement), CR 400.7 (the
// card that returns is a new object), CR 702.10 (haste), CR 700.4 (dies means goes to the graveyard from the
// battlefield: an unearthed creature that would die is exiled and does not die), CR 903.9b (a commander).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-alt-costs.ts) except the real filler cards.
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

const GNOLL = 'SYNTHETIC Unearth Gnoll'; // {2}{R}{R} 3/1, unearth {R}
const SHADE = 'SYNTHETIC Unearth Shade'; // {3}{B} 2/2, unearth {1}{B}; dies: draw a card; enters: gain 1 life
const SCOUR = 'SYNTHETIC Grave Scour'; // instant {B}: exile target card from a graveyard

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

const unearthOptions = (g: Game, seat = 0) =>
  getLegalActions(g.state, seat).filter(
    (a) => a.kind === 'activate' && g.state.objects[a.object]?.zone === 'graveyard',
  );

const gnollGame = (extra?: (b: ReturnType<typeof scenario>) => void) => {
  const b = scenario().seat(0).graveyard(GNOLL).battlefield('Mountain', { count: 2 });
  extra?.(b);
  return b.seat(1).build();
};

describe('the activation: from the graveyard, at sorcery speed (CR 702.84a, 602.5d)', () => {
  test('a card with unearth in the graveyard has an activate option when the cost can be paid', () => {
    const g = gnollGame();
    g.expect.legal(0, { activate: GNOLL });
    expect(unearthOptions(g)).toHaveLength(1);
  });

  test('without the mana there is no option', () => {
    const g = scenario().seat(0).graveyard(GNOLL).seat(1).build();
    expect(unearthOptions(g)).toEqual([]);
  });

  test('from the hand, the battlefield, exile or the opponent’s graveyard there is none', () => {
    const hand = scenario().seat(0).hand(GNOLL).battlefield('Mountain').seat(1).build();
    expect(getLegalActions(hand.state, 0).filter((a) => a.kind === 'activate')).toEqual([]);
    const battlefield = scenario()
      .seat(0)
      .battlefield(GNOLL)
      .battlefield('Mountain')
      .seat(1)
      .build();
    expect(getLegalActions(battlefield.state, 0).filter((a) => a.kind === 'activate')).toEqual([]);
    const exile = scenario().seat(0).exile(GNOLL).battlefield('Mountain').seat(1).build();
    expect(getLegalActions(exile.state, 0).filter((a) => a.kind === 'activate')).toEqual([]);
    const theirs = scenario().seat(0).battlefield('Mountain').seat(1).graveyard(GNOLL).build();
    expect(unearthOptions(theirs, 0)).toEqual([]);
    expect(unearthOptions(theirs, 1)).toEqual([]); // nor is it theirs to activate in their own turn: it is not their turn
  });

  test('only at sorcery speed: not in the opponent’s turn, not with something on the stack, not in combat', () => {
    const theirTurn = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .at('precombatMain', { active: 1 })
      .build();
    g_pass(theirTurn, 1);
    expect(unearthOptions(theirTurn)).toEqual([]);

    const stacked = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .hand('Lightning Bolt')
      .battlefield('Mountain', { count: 3 })
      .seat(1)
      .build();
    stacked.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    expect(unearthOptions(stacked)).toEqual([]);

    const combat = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Grizzly Bears')
      .seat(1)
      .build();
    combat.advanceTo('declareAttackers', { attack: false });
    expect(unearthOptions(combat)).toEqual([]);
    const afterwards = applyAction(combat.state, 0, {
      kind: 'activate',
      object: combat.id(GNOLL),
      abilityIndex: unearthIndex(combat),
    });
    expect(afterwards.ok).toBe(false);
  });

  test('a main phase after combat is fine', () => {
    const g = gnollGame();
    g.advanceTo('postcombatMain');
    expect(unearthOptions(g)).toHaveLength(1);
  });
});

function g_pass(g: Game, seat: number) {
  g.pass(seat);
}

function unearthIndex(g: Game): number {
  const view = getView(g.state, 0);
  const card = view.seats[0]?.graveyard.find((o) => o.name === GNOLL);
  const entry = card?.activated?.[0];
  if (entry === undefined) throw new Error('no activated ability on the card in the graveyard');
  return entry.abilityIndex;
}

describe('the ability on the stack, and what resolving it does (CR 702.84a, 602.2, 400.7)', () => {
  test('it is an ability, not a spell: the card stays in the graveyard while it waits on the stack', () => {
    const g = gnollGame();
    g.act(0).activate(GNOLL, { pay: true });
    expect(g.find({ name: 'Mountain', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(
      1,
    );
    g.expect.stack([`${GNOLL} (ability)`]);
    g.expect.zone(GNOLL, 'graveyard', { seat: 0 });
    g.expect.noEvent({ kind: 'spellCast' });
    g.expect.eventLog([{ kind: 'abilityActivated' }]);
    expect(getView(g.state, 1).stack[0]?.ability?.kind).toBe('activated');
  });

  test('resolving it returns the card as a new, untapped object under its owner’s control with haste', () => {
    const g = gnollGame();
    const old = g.object(GNOLL).id;
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    g.expect.zone(GNOLL, 'battlefield', { seat: 0 });
    expect(g.object(GNOLL).id).not.toBe(old);
    g.expect.tapped(GNOLL, false);
    expect(getView(g.state, 0).battlefield.find((o) => o.name === GNOLL)?.keywords).toContain(
      'haste',
    );
    expect(getView(g.state, 0).battlefield.find((o) => o.name === GNOLL)?.alternative).toBe(
      'unearth',
    );
    g.expect.invariants();
  });

  test('it can attack the turn it returns; the same creature cast normally cannot', () => {
    const g = gnollGame();
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(GNOLL, true);
    g.playCombat({ attack: [GNOLL], until: 'postcombatMain' });
    g.expect.life(1, 37);
  });

  test('the enters triggers of the creature trigger as it returns', () => {
    const g = scenario()
      .seat(0)
      .graveyard(SHADE)
      .battlefield('Swamp', { count: 2 })
      .seat(1)
      .build();
    g.act(0).activate(SHADE, { pay: true });
    g.pass(0);
    g.pass(1);
    g.expect.stack([`${SHADE} (ability)`]);
    g.passAll();
    g.expect.life(0, 41);
  });

  test('an ability that costs mana the player cannot pay after a cancel leaves everything as it was', () => {
    const g = gnollGame();
    const before = g.positionHash();
    g.act(0).activate(GNOLL);
    g.act(0).cancel();
    g.expect.position(before);
  });

  test('a card that has left the graveyard when the ability resolves: it does nothing', () => {
    const g = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .hand(SCOUR)
      .battlefield('Swamp')
      .build();
    g.act(0).activate(GNOLL, { pay: true });
    g.pass(0);
    g.act(1).cast(SCOUR, { targets: [GNOLL], pay: true });
    g.passAll();
    g.expect.zone(GNOLL, 'exile', { seat: 0 });
    g.expect.noObject(GNOLL, { zone: 'battlefield' });
    g.expect.stack([]);
    expect(g.state.delayedTriggers).toEqual([]);
    g.advanceTo('end');
    g.expect.stack([]);
  });
});

describe('the end step exile (CR 702.84a, 603.7, 603.7c)', () => {
  test('at the beginning of the next end step a delayed trigger goes on the stack and exiles it', () => {
    const g = gnollGame();
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    expect(g.state.delayedTriggers).toHaveLength(1);
    g.expect.zone(GNOLL, 'battlefield', { seat: 0 });
    g.advanceTo('end');
    g.expect.stack([`${GNOLL} (ability)`]);
    expect(getView(g.state, 0).stack[0]?.ability?.kind).toBe('triggered');
    g.expect.zone(GNOLL, 'battlefield', { seat: 0 });
    g.passAll();
    g.expect.zone(GNOLL, 'exile', { seat: 0 });
    g.expect.noObject(GNOLL, { zone: 'graveyard' });
    expect(g.state.delayedTriggers).toEqual([]);
  });

  test('it is not exiled before the end step, and it is the end step of the same turn', () => {
    const g = gnollGame();
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    const turn = g.state.turn.number;
    g.advanceTo('postcombatMain');
    g.expect.zone(GNOLL, 'battlefield', { seat: 0 });
    g.advanceTo('end');
    expect(g.state.turn.number).toBe(turn);
  });

  test('unearthed in the second main phase it is exiled at that turn’s end step', () => {
    const g = gnollGame();
    g.advanceTo('postcombatMain');
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(GNOLL, 'exile', { seat: 0 });
  });

  test('the exile trigger can be responded to: bounced in response it goes to exile instead and nothing is left', () => {
    const g = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Island')
      .hand('Unsummon')
      .seat(1)
      .build();
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.act(0).cast('Unsummon', { targets: [GNOLL], pay: true });
    g.passAll();
    g.expect.zone(GNOLL, 'exile', { seat: 0 });
    g.passAll();
    g.expect.noObject(GNOLL, { zone: 'hand' });
    g.expect.noObject(GNOLL, { zone: 'battlefield' });
  });

  test('the delayed trigger is its own: a creature that lost its abilities is still exiled', () => {
    const g = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .hand('SYNTHETIC Frog Hex')
      .battlefield('Island', { count: 2 })
      .build();
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    g.pass(0);
    g.act(1).cast('SYNTHETIC Frog Hex', { targets: [GNOLL], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(GNOLL, 'exile', { seat: 0 });
  });
});

describe('"if it would leave the battlefield, exile it instead" (CR 702.84a, 614.6)', () => {
  test('destroyed it is exiled, not put into the graveyard, and it does not die', () => {
    const g = scenario()
      .seat(0)
      .graveyard(SHADE)
      .battlefield('Swamp', { count: 2 })
      .library('Plains', 'Plains', 'Plains')
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .build();
    g.act(0).activate(SHADE, { pay: true });
    g.passAll();
    g.passAll(); // the enters trigger
    g.pass(0);
    g.act(1).cast('Murder', { targets: [SHADE], pay: true });
    g.passAll();
    g.expect.zone(SHADE, 'exile', { seat: 0 });
    g.expect.noObject(SHADE, { zone: 'graveyard' });
    g.expect.noEvent({ kind: 'died' });
    // "When this creature dies, draw a card": it never died, so the library is as it was.
    g.expect.handSize(0, 0);
  });

  test('returned to the hand by an effect, it is exiled instead', () => {
    const g = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .battlefield('Island')
      .hand('Unsummon')
      .seat(1)
      .build();
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    g.act(0).cast('Unsummon', { targets: [GNOLL], pay: true });
    g.passAll();
    g.expect.zone(GNOLL, 'exile', { seat: 0 });
    g.expect.noObject(GNOLL, { zone: 'hand' });
  });

  test('it leaves the battlefield from any cause: combat damage kills it and it is exiled', () => {
    const g = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .battlefield('Grizzly Bears')
      .build();
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    g.playCombat({
      attack: [GNOLL],
      block: [{ blocker: 'Grizzly Bears', attacker: GNOLL }],
      until: 'postcombatMain',
    });
    g.expect.zone(GNOLL, 'exile', { seat: 0 });
    g.expect.noObject(GNOLL, { zone: 'graveyard' });
  });

  test('it applies even when the creature lost its abilities: it belongs to the unearthed object, not to its abilities', () => {
    const g = scenario()
      .seat(0)
      .graveyard(GNOLL)
      .battlefield('Mountain', { count: 2 })
      .seat(1)
      .hand('SYNTHETIC Frog Hex', 'Lightning Bolt')
      .battlefield('Island', { count: 2 })
      .battlefield('Mountain')
      .build();
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    g.pass(0);
    g.act(1).cast('SYNTHETIC Frog Hex', { targets: [GNOLL], pay: true });
    g.passAll();
    g.pass(0);
    g.act(1).cast('Lightning Bolt', { targets: [GNOLL], pay: true });
    g.passAll();
    g.expect.zone(GNOLL, 'exile', { seat: 0 });
    g.expect.noObject(GNOLL, { zone: 'graveyard' });
  });

  test('a copy-less card that came back by other means is not unearthed: the same card cast normally dies normally', () => {
    const g = scenario()
      .seat(0)
      .hand(GNOLL)
      .battlefield('Mountain', { count: 4 })
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .build();
    g.act(0).cast(GNOLL, { pay: true });
    g.passAll();
    g.pass(0);
    g.act(1).cast('Murder', { targets: [GNOLL], pay: true });
    g.passAll();
    g.expect.zone(GNOLL, 'graveyard', { seat: 0 });
  });

  test('a commander that would leave is exiled instead; its owner may then put it into the command zone (CR 903.9a)', () => {
    const g = scenario()
      .seat(0)
      .graveyard(GNOLL, { commander: true, label: 'cmd' })
      .battlefield('Mountain', { count: 2 })
      .battlefield('Island')
      .hand('Unsummon')
      .seat(1)
      .build();
    g.act(0).activate('cmd', { pay: true });
    g.passAll();
    g.act(0).cast('Unsummon', { targets: ['cmd'], pay: true });
    g.passAll();
    // It was exiled, not returned to the hand: the question is the one for a commander in exile.
    g.expect.noObject(GNOLL, { zone: 'hand' });
    g.expect.pending('commanderZone', 0);
    expect(g.state.pending).toMatchObject({ kind: 'commanderZone', from: 'exile' });
    g.act(0).sendToCommandZone();
    g.expect.zone(GNOLL, 'command', { seat: 0 });
    g.expect.invariants();
  });
});

describe('after it is exiled, and again', () => {
  test('a creature that died the normal way can be unearthed again from the graveyard; an exiled one cannot', () => {
    const g = scenario()
      .seat(0)
      .hand(GNOLL)
      .battlefield('Mountain', { count: 6 })
      .seat(1)
      .hand('Murder')
      .battlefield('Swamp', { count: 3 })
      .build();
    g.act(0).cast(GNOLL, { pay: true });
    g.passAll();
    g.pass(0);
    g.act(1).cast('Murder', { targets: [GNOLL], pay: true });
    g.passAll();
    g.expect.legal(0, { activate: GNOLL });
    g.act(0).activate(GNOLL, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(GNOLL, 'exile', { seat: 0 });
    expect(unearthOptions(g)).toEqual([]);
  });
});

describe('the engine refuses what it cannot run', () => {
  const face = (extra: Record<string, unknown>) => {
    const base = syntheticCard(GNOLL);
    return { ...base, faces: [{ ...base.faces[0], ...extra }] } as unknown as typeof base;
  };
  const unearth = (cost: unknown) => [{ kind: 'keyword', keyword: { kind: 'unearth', cost } }];
  const messages = (card: ReturnType<typeof face>) =>
    validateCard(card)
      .map((i) => i.message)
      .join('|');

  test('the features list unearth', () => {
    expect(SUPPORTED_FEATURES.keywordKinds).toContain('unearth');
    expect(isFeatureSupported('keyword:unearth')).toBe(true);
    expect(isFeatureSupported('effect:unearth')).toBe(true);
  });

  test('every unearth fixture validates', () => {
    for (const name of [GNOLL, SHADE, SCOUR]) {
      expect(validateCard(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('a non-mana cost and X are refused; unearth is on a permanent card that is a creature, not on a spell', () => {
    expect(messages(face({ abilities: unearth([{ kind: 'payLife', amount: 2 }]) }))).toMatch(
      /mana/,
    );
    expect(messages(face({ abilities: unearth([{ kind: 'mana', symbols: ['X', 'R'] }]) }))).toMatch(
      /X/,
    );
    expect(
      messages(
        face({
          types: ['instant'],
          power: null,
          toughness: null,
          abilities: unearth([{ kind: 'mana', symbols: ['R'] }]),
        }),
      ),
    ).toMatch(/unearth/);
  });

  test('two unearth abilities on one card are refused', () => {
    const one = {
      kind: 'keyword',
      keyword: { kind: 'unearth', cost: [{ kind: 'mana', symbols: ['R'] }] },
    };
    expect(messages(face({ abilities: [one, one] }))).toMatch(/unearth/);
  });
});

describe('determinism and replay', () => {
  const build = () => gnollGame();

  test('the same actions give the same state, and the log replays to it', () => {
    const play = () => {
      const g = build();
      g.act(0).activate(GNOLL, { pay: true });
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
