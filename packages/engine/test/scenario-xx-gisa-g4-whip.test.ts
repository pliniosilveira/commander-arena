// The Gisa deck (issue 41), group 4: Whip of Erebos' reanimation (D-459): "{2}{B}{B}, {T}: Return target creature card from your graveyard to the battlefield. It gains haste.
// Exile it at the beginning of the next end step. If it would leave the battlefield, exile it instead of putting it anywhere else. Activate only as a sorcery."
// Pins: CR 602.2 and 113.6b (an activated ability uses the stack), CR 602.5d (sorcery speed), CR 400.7 and 400.7j (the card returns as a new object, which "it" names), CR 611.2a and
// 613.1f (an effect with no duration: haste for good), CR 603.7 and 603.7c (a delayed triggered ability about that object only), CR 614.1a and 614.6 (the "exile instead" replacement of
// the object), CR 700.4 (a creature that would die is exiled, so it does not die), CR 903.9a (a commander exiled instead may go to the command zone).
// The card is the SYNTHETIC sibling of the real Whip (src/cards/fixtures/synthetic-gisa-g4.ts), which has the same abilities as the real card; the real one is read by the grammar in
// packages/cards/test/convert-grammar-engine-gisa-g4.test.ts.
import { describe, expect, test } from 'vitest';
import { getView, syntheticCard, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const WHIP = 'SYNTHETIC Grave Whip'; // {2}{B}{B}: creatures you control have lifelink; the reanimation
const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER = 'Giant Spider'; // 2/4
const MURDER = 'Murder'; // instant {1}{B}{B}
const SHADE = 'SYNTHETIC Unearth Shade'; // dies: draw a card; enters: gain 1 life
const SCOUR = 'SYNTHETIC Grave Scour'; // instant {B}: exile target card from a graveyard
const DRESS = 'SYNTHETIC Dress Down'; // instant {1}{U}: target creature loses all abilities until end of turn
const SWAMPS = ['Swamp', 'Swamp', 'Swamp', 'Swamp'] as const;
const LIBRARY = Array.from({ length: 6 }, () => 'Plains');

type Game = ReturnType<ReturnType<typeof scenario>['build']>;

/** The Whip with four Swamps, a creature card in the graveyard and the opponent's Murder ready. */
function whipGame(extra?: (b: ReturnType<typeof scenario>) => void): Game {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .battlefield(WHIP)
    .battlefield(...SWAMPS)
    .graveyard(BEARS, { label: 'card' });
  extra?.(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .battlefield('Swamp', 'Swamp', 'Swamp')
    .hand(MURDER)
    .at('precombatMain', { active: 0 })
    .build();
}

const reanimate = (g: Game) => {
  g.act(0).activate(WHIP, { ability: 1, targets: ['card'], pay: true });
};

describe('the activation: at sorcery speed, with a creature card in your graveyard (CR 602.5d)', () => {
  test('the card is valid and has the abilities of the real one', () => {
    expect(validateCard(syntheticCard(WHIP))).toEqual([]);
  });

  test('it is offered in your main phase with the stack empty, with the mana and a target', () => {
    const g = whipGame();
    g.expect.legal(0, { activate: WHIP, ability: 1 });
  });

  test('not without a creature card in the graveyard, nor for a card that is not a creature', () => {
    const none = scenario()
      .seat(0)
      .battlefield(WHIP)
      .battlefield(...SWAMPS)
      .graveyard('Lightning Bolt')
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    none.expect.illegal(0, { activate: WHIP, ability: 1 });
  });

  test("not from the opponent's graveyard (the target is a card in your graveyard)", () => {
    const g = scenario()
      .seat(0)
      .battlefield(WHIP)
      .battlefield(...SWAMPS)
      .seat(1)
      .graveyard(BEARS)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { activate: WHIP, ability: 1 });
  });

  test('not in the opponent’s turn, not with a spell on the stack, not in combat', () => {
    const theirTurn = scenario()
      .seat(0)
      .battlefield(WHIP)
      .battlefield(...SWAMPS)
      .graveyard(BEARS)
      .seat(1)
      .at('precombatMain', { active: 1 })
      .build();
    theirTurn.pass(1);
    theirTurn.expect.illegal(0, { activate: WHIP, ability: 1 });

    const g = scenario()
      .seat(0)
      .battlefield(WHIP)
      .battlefield(...SWAMPS)
      .battlefield(SPIDER)
      .graveyard(BEARS)
      .seat(1)
      .hand(MURDER)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).pass();
    g.act(1).cast(MURDER, { pay: true, targets: [SPIDER] });
    g.expect.illegal(0, { activate: WHIP, ability: 1 });

    const combat = scenario()
      .seat(0)
      .battlefield(WHIP)
      .battlefield(...SWAMPS)
      .battlefield(SPIDER)
      .graveyard(BEARS)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    combat.advanceTo('declareAttackers', { attack: false });
    combat.expect.illegal(0, { activate: WHIP, ability: 1 });
  });

  test('it taps the Whip and costs {2}{B}{B}: with one Swamp too few there is no option', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WHIP)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .graveyard(BEARS)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.expect.illegal(0, { activate: WHIP, ability: 1 });
  });
});

describe('what resolving it does (CR 400.7, 400.7j, 611.2a, 613.1f)', () => {
  test('it is an ability, not a spell: the card waits in the graveyard while the ability is on the stack', () => {
    const g = whipGame();
    reanimate(g);
    g.expect.stack([`${WHIP} (ability)`]);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.tapped(WHIP, true);
    g.expect.noEvent({ kind: 'spellCast' });
  });

  test('the card returns as a new object under your control, untapped, with haste', () => {
    const g = whipGame();
    const old = g.object('card').id;
    reanimate(g);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.object(BEARS).id).not.toBe(old);
    g.expect.tapped(BEARS, false);
    g.expect.derived(BEARS, { keywords: ['haste', 'lifelink'] });
    g.expect.invariants();
  });

  test('it is not marked as an unearthed permanent: it is exiled by its own effects', () => {
    const g = whipGame();
    reanimate(g);
    g.passAll();
    expect(getView(g.state, 0).battlefield.find((o) => o.name === BEARS)?.alternative).toBe(
      undefined,
    );
    expect(g.object(BEARS).exileIfLeaves).toBe(true);
    expect(g.object(BEARS).alt).toBeUndefined();
  });

  test('it can attack the turn it returns, and the lifelink of the Whip counts', () => {
    const g = whipGame();
    reanimate(g);
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEARS, true);
    g.playCombat({ attack: [BEARS], until: 'postcombatMain' });
    g.expect.life(1, 38);
    g.expect.life(0, 42);
  });

  test('the same creature cast normally has no haste and no replacement', () => {
    const g = scenario()
      .seat(0)
      .battlefield(WHIP)
      .battlefield('Forest', 'Forest')
      .hand(BEARS)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers', { attack: false });
    g.expect.canAttack(BEARS, false);
    expect(g.object(BEARS).exileIfLeaves).toBeUndefined();
  });

  test('the enters triggers of the creature trigger as it returns', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WHIP)
      .battlefield(...SWAMPS)
      .graveyard(SHADE, { label: 'card' })
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    reanimate(g);
    g.passAll();
    g.passAll();
    g.expect.life(0, 41);
  });

  test('a card that left the graveyard before the ability resolves: its one target is gone and nothing is returned', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WHIP)
      .battlefield(...SWAMPS)
      .graveyard(BEARS, { label: 'card' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Swamp')
      .hand(SCOUR)
      .at('precombatMain', { active: 0 })
      .build();
    reanimate(g);
    g.act(0).pass();
    g.act(1).cast(SCOUR, { pay: true, targets: ['card'] });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    g.passAll();
    g.expect.stack([]);
    g.expect.invariants();
  });
});

describe('the delayed exile at the beginning of the next end step (CR 603.7, 603.7c)', () => {
  test('it goes on the stack as the end step begins and exiles the creature', () => {
    const g = whipGame();
    reanimate(g);
    g.passAll();
    g.advanceTo('end');
    g.expect.stack([`${BEARS} (ability)`]);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.invariants();
  });

  test('activated in the second main phase it exiles the creature at that turn’s end step', () => {
    const g = whipGame();
    g.advanceTo('postcombatMain');
    reanimate(g);
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
  });

  test('once only: the creature is not exiled twice and a new object is not named', () => {
    const g = whipGame();
    reanimate(g);
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    expect(g.state.delayedTriggers).toEqual([]);
  });

  test('the creature that left the battlefield before the end step is a new object: the delayed ability does nothing', () => {
    const g = whipGame();
    reanimate(g);
    g.passAll();
    // Murder: it would die, and is exiled instead, so the delayed ability finds nothing.
    g.act(0).pass();
    g.act(1).cast(MURDER, { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.advanceTo('end');
    // The delayed ability still triggers (it belongs to its controller, CR 603.7d) and finds no such object: it does nothing.
    g.passAll();
    g.expect.stack([]);
    g.expect.zone(BEARS, 'exile', { seat: 0, count: 1 });
    g.expect.noObject(BEARS, { zone: 'graveyard' });
  });

  test('the delayed ability is on the stack, where it can be responded to, and still exiles the creature', () => {
    const g = whipGame();
    reanimate(g);
    g.passAll();
    g.advanceTo('end');
    g.expect.stack([`${BEARS} (ability)`]);
    // The ability on the stack names the object; it still exiles it when it resolves.
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
  });
});

describe('"If it would leave the battlefield, exile it instead of putting it anywhere else" (CR 614.1a, 614.6, 700.4)', () => {
  test('destroyed: exiled, not in the graveyard, and it never dies', () => {
    const g = whipGame();
    reanimate(g);
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(MURDER, { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.noObject(BEARS, { zone: 'graveyard' });
    g.expect.noEvent({ kind: 'died' });
    g.expect.invariants();
  });

  test('a creature with a dies trigger that comes back this way: the trigger does not trigger', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WHIP)
      .battlefield(...SWAMPS)
      .graveyard(SHADE, { label: 'card' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand(MURDER)
      .at('precombatMain', { active: 0 })
      .build();
    reanimate(g);
    g.passAll();
    g.passAll();
    const hand = getView(g.state, 0).seats[0]?.handCount;
    g.act(0).pass();
    g.act(1).cast(MURDER, { pay: true, targets: [SHADE] });
    g.passAll();
    g.expect.zone(SHADE, 'exile', { seat: 0 });
    expect(getView(g.state, 0).seats[0]?.handCount).toBe(hand);
  });

  test('a commander that comes back this way and is exiled is offered the command zone (CR 903.9a)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WHIP)
      .battlefield(...SWAMPS)
      .graveyard(BEARS, { label: 'card', commander: true })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .hand(MURDER)
      .at('precombatMain', { active: 0 })
      .build();
    reanimate(g);
    g.passAll();
    g.act(0).pass();
    g.act(1).cast(MURDER, { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.pending('commanderZone', 0);
    g.act(0).sendToCommandZone();
    g.expect.zone(BEARS, 'command', { seat: 0 });
  });

  test('bounced by an effect: exiled instead of returning to the hand', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WHIP)
      .battlefield(...SWAMPS)
      .graveyard(BEARS, { label: 'card' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Island', 'Island')
      .hand('Unsummon')
      .at('precombatMain', { active: 0 })
      .build();
    reanimate(g);
    g.passAll();
    g.act(0).pass();
    g.act(1).cast('Unsummon', { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.noObject(BEARS, { zone: 'hand' });
  });

  test('a creature that lost all its abilities is still exiled instead and at the end step (it belongs to the object, CR 614.6)', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WHIP)
      .battlefield(...SWAMPS)
      .graveyard(BEARS, { label: 'card' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Island', 'Island')
      .hand(MURDER, DRESS)
      .at('precombatMain', { active: 0 })
      .build();
    reanimate(g);
    g.passAll();
    g.expect.derived(BEARS, { keywords: ['haste', 'lifelink'] });
    g.act(0).pass();
    g.act(1).cast(DRESS, { pay: true, targets: [BEARS] });
    g.passAll();
    // Layer 6 in timestamp order: the effect that took the abilities away is later than the haste the Whip gave and than the lifelink of its static ability.
    g.expect.derived(BEARS, { keywords: [] });
    expect(g.object(BEARS).exileIfLeaves).toBe(true);
    g.act(0).pass();
    g.act(1).cast(MURDER, { pay: true, targets: [BEARS] });
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.expect.noObject(BEARS, { zone: 'graveyard' });
  });

  test('a creature put onto the battlefield some other way is not marked', () => {
    const g = scenario()
      .seat(0)
      .battlefield(BEARS)
      .seat(1)
      .at('precombatMain', { active: 0 })
      .build();
    expect(g.object(BEARS).exileIfLeaves).toBeUndefined();
  });
});

describe('what the validation refuses (D-459)', () => {
  test('exileIfLeaves needs an effect before it that moved the objects, and only names them', () => {
    const base = syntheticCard(WHIP);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = {
      ...base,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'activated' as const,
              cost: [{ kind: 'tap' as const }],
              effect: { kind: 'exileIfLeaves' as const, objects: { kind: 'moved' as const } },
            },
          ],
        },
      ],
    };
    expect(validateCard(bad).map((i) => i.message)).toContain(
      "'moved' needs an exile, destroy or moveToZone effect before it in the sequence",
    );
    const target = {
      ...base,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'activated' as const,
              cost: [{ kind: 'tap' as const }],
              effect: {
                kind: 'exileIfLeaves' as const,
                objects: { kind: 'this' as const },
              },
            },
          ],
        },
      ],
    };
    expect(validateCard(target as never).length).toBeGreaterThan(0);
  });

  test('a delayed exile names the objects an effect before it moved, nothing else', () => {
    const base = syntheticCard(WHIP);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const make = (objects: unknown) => ({
      ...base,
      faces: [
        {
          ...face,
          abilities: [
            {
              kind: 'activated' as const,
              cost: [{ kind: 'tap' as const }],
              targets: [
                {
                  id: 't1',
                  what: {
                    kind: 'object' as const,
                    filter: { zone: 'graveyard' as const, types: ['creature' as const] },
                  },
                },
              ],
              effect: {
                kind: 'sequence' as const,
                effects: [
                  {
                    kind: 'moveToZone' as const,
                    objects: { kind: 'target' as const, id: 't1' },
                    to: 'battlefield' as const,
                  },
                  {
                    kind: 'delayedTrigger' as const,
                    at: { step: 'endStep' as const, whose: 'each' as const },
                    effect: { kind: 'exile' as const, objects },
                  },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(validateCard(make({ kind: 'moved' }) as never)).toEqual([]);
    expect(validateCard(make({ kind: 'target', id: 't1' }) as never).length).toBeGreaterThan(0);
    expect(validateCard(make({ kind: 'this' }) as never).length).toBeGreaterThan(0);
  });
});
