// Gift (CR 702.174, D-135): "Gift a card" as an optional additional cost chosen as the spell is cast, the opponent's draw before the
// spell's other effects (or as the permanent enters), the condition "if the gift was promised" in a spell and in an enters trigger,
// a target that is chosen only if the gift was promised, and an opponent who sacrifices a creature with the greatest power.
// Pins: CR 702.174a (the gift is an additional cost: "you may choose an opponent"), CR 601.2b (additional costs are chosen as the
// spell is cast, before the targets), CR 702.174b (a permanent: "when this permanent enters, if its gift cost was paid"; an instant or
// sorcery: "if this spell's gift cost was paid"), CR 702.174e (a card: the chosen player draws a card), CR 702.174j (the gift effect
// comes before any other spell ability of the card and does not happen if the spell is countered), CR 702.174k (promised), CR
// 702.174m (targets only if promised), CR 603.4 (an intervening "if"), CR 608.2d (the opponent chooses among tied creatures), CR 701.21.
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-gift.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import type { scenario } from '../src/testing/index';
import { twoSeatGame } from './two-seat-helpers';

const RANGER = 'SYNTHETIC Gifted Ranger';
const REAPER = 'SYNTHETIC Greedy Reaper';
const STUDY = 'SYNTHETIC Gift Study';
const EDICT = 'SYNTHETIC Edict of the Mighty';
const ZOMBIE = 'SYNTHETIC Plain Zombie';
const ANGEL = 'SYNTHETIC Costly Angel'; // 4/4
const GIANT = 'SYNTHETIC Echo Giant'; // 4/4
const BEARS = 'Grizzly Bears'; // 2/2
const RING = 'Sol Ring';

type Builder = ReturnType<typeof scenario>;

describe('Gift on a permanent: "When this enters, if its gift cost was paid, the chosen player draws a card"', () => {
  test('promised: the opponent draws as the permanent enters, and the "if the gift was promised" trigger runs', () => {
    const g = twoSeatGame(
      (b) => b.hand(RANGER).battlefield('Forest', { count: 3 }),
      (b) => b.battlefield(RING),
    );
    g.act(0).cast(RANGER, { gift: true, pay: true });
    g.passAll();
    // The gift and the destroy trigger both trigger as it enters: the controller orders them (CR 603.3b).
    g.expect.pending('orderTriggers', 0);
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    g.expect.handSize(1, 1);
    g.expect.zone(RING, 'graveyard', { seat: 1 });
    g.expect.zone(RANGER, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('not promised: nothing is given and the trigger never exists', () => {
    const g = twoSeatGame(
      (b) => b.hand(RANGER).battlefield('Forest', { count: 3 }),
      (b) => b.battlefield(RING),
    );
    g.act(0).cast(RANGER, { gift: false, pay: true });
    g.passAll();
    g.expect.stack([]);
    g.expect.handSize(1, 0);
    g.expect.zone(RING, 'battlefield', { seat: 1 });
  });

  test('promised, but the opponent has nothing to destroy: the gift is still given', () => {
    const g = twoSeatGame((b) => b.hand(RANGER).battlefield('Forest', { count: 3 }));
    g.act(0).cast(RANGER, { gift: true, pay: true });
    g.passAll();
    g.act(0).orderTriggers(0, 1);
    g.passAll();
    // No artifact or enchantment to destroy: that trigger is removed as it goes on the stack, the gift is the other one.
    g.expect.handSize(1, 1);
    g.expect.zone(RANGER, 'battlefield', { seat: 0 });
  });

  test('the question is asked as the spell is cast, naming the opponent; accept, decline or cancel', () => {
    const g = twoSeatGame((b) => b.hand(RANGER).battlefield('Forest', { count: 3 }));
    g.act(0).cast(RANGER);
    g.expect.pending('confirmOptional', 0);
    const d = g.state.pending;
    if (d?.kind !== 'confirmOptional') throw new Error('expected the gift question');
    expect(d.purpose).toBe('gift');
    expect(d.giftTo).toBe(1);
    const kinds = g.legalActions(0).map((a) => a.kind);
    expect(kinds).toEqual(expect.arrayContaining(['acceptOptional', 'declineOptional', 'cancel']));
  });

  test('cancelling the question rewinds the cast (CR 733)', () => {
    const g = twoSeatGame((b) => b.hand(RANGER).battlefield('Forest', { count: 3 }));
    g.act(0).cast(RANGER);
    g.act(0).cancel();
    g.expect.handSize(0, 1);
    g.expect.zone(RANGER, 'hand', { seat: 0 });
    g.expect.tapped('Forest[0]', false);
    g.expect.pending('priority', 0);
  });

  test('the spell cast event says to whom the gift was promised', () => {
    const g = twoSeatGame((b) => b.hand(RANGER).battlefield('Forest', { count: 3 }));
    const mark = g.mark();
    g.act(0).cast(RANGER, { gift: true, pay: true });
    const cast = g.eventsSince(mark).find((e) => e.kind === 'spellCast');
    expect(cast).toMatchObject({ kind: 'spellCast', gift: 1 });
    const plain = twoSeatGame((b) => b.hand(RANGER).battlefield('Forest', { count: 3 }));
    const m2 = plain.mark();
    plain.act(0).cast(RANGER, { gift: false, pay: true });
    expect(plain.eventsSince(m2).find((e) => e.kind === 'spellCast')).not.toHaveProperty('gift');
  });

  test('a card without gift asks nothing', () => {
    const g = twoSeatGame((b) => b.hand(BEARS).battlefield('Forest', { count: 2 }));
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([BEARS]);
  });

  test('the permanent remembers the chosen player: it died with the triggers on the stack, and the gift is still given (CR 113.7a)', () => {
    const g = twoSeatGame(
      (b) => b.hand(RANGER).battlefield('Forest', { count: 3 }),
      (b) => b.hand('Lightning Bolt').battlefield('Mountain'),
    );
    g.act(0).cast(RANGER, { gift: true, pay: true });
    g.passAll();
    g.act(0).orderTriggers(0, 1);
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [RANGER], pay: true });
    g.passAll();
    g.expect.zone(RANGER, 'graveyard', { seat: 0 });
    g.expect.handSize(1, 1);
    g.expect.invariants();
  });
});

describe('Gift on an instant or sorcery: the gift comes first, and only if the spell resolves (CR 702.174j)', () => {
  const study = (extra: (b: Builder) => Builder = (b) => b) =>
    twoSeatGame((b) => extra(b.hand(STUDY).battlefield('Island', { count: 2 })));

  test('promised: the opponent draws, then the spell does the rest, and "if the gift was promised" holds', () => {
    const g = study();
    const mark = g.mark();
    g.act(0).cast(STUDY, { gift: true, pay: true });
    g.passAll();
    g.expect.handSize(1, 1);
    g.expect.handSize(0, 2);
    g.expect.life(0, 22);
    // The gift is given before the spell's other effects.
    const kinds = g
      .eventsSince(mark)
      .filter((e) => e.kind === 'cardDrawn')
      .map((e) => (e.kind === 'cardDrawn' ? e.seat : -1));
    expect(kinds).toEqual([1, 0, 0]);
  });

  test('not promised: no gift and no life', () => {
    const g = study();
    g.act(0).cast(STUDY, { gift: false, pay: true });
    g.passAll();
    g.expect.handSize(1, 0);
    g.expect.handSize(0, 2);
    g.expect.life(0, 20);
  });

  test('a countered spell gives no gift', () => {
    const g = twoSeatGame(
      (b) => b.hand(STUDY).battlefield('Island', { count: 2 }),
      (b) => b.hand('Counterspell').battlefield('Island', { count: 2 }),
    );
    g.act(0).cast(STUDY, { gift: true, pay: true });
    g.act(0).pass();
    g.act(1).cast('Counterspell', { targets: [STUDY], pay: true });
    g.passAll();
    g.expect.handSize(1, 0);
    g.expect.handSize(0, 0);
    g.expect.zone(STUDY, 'graveyard', { seat: 0 });
  });
});

describe('a target chosen only if the gift was promised (CR 702.174m)', () => {
  const reaper = (
    extra: (b: Builder) => Builder = (b) => b,
    theirs: (b: Builder) => Builder = (b) => b,
  ) =>
    twoSeatGame(
      (b) => extra(b.hand(REAPER).graveyard(ZOMBIE).battlefield('Swamp', { count: 3 })),
      (b) => theirs(b.battlefield(ANGEL)),
    );

  test('promised: both targets are chosen; the opponent draws, sacrifices, and the card returns', () => {
    const g = reaper();
    const mark = g.mark();
    g.act(0).cast(REAPER, { gift: true, targets: [{ player: 1 }, ZOMBIE], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(ZOMBIE, 'hand', { seat: 0 });
    g.expect.handSize(1, 1);
    const order = g
      .eventsSince(mark)
      .flatMap((e) =>
        e.kind === 'cardDrawn' ? ['draw'] : e.kind === 'sacrificed' ? ['sacrifice'] : [],
      );
    expect(order).toEqual(['draw', 'sacrifice']);
  });

  test('not promised: only the opponent is targeted, and the card stays in the graveyard', () => {
    const g = reaper();
    g.act(0).cast(REAPER, { gift: false, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(ZOMBIE, 'graveyard', { seat: 0 });
    g.expect.handSize(1, 0);
  });

  test('with no creature card in your graveyard the gift cannot be promised: the question is not asked', () => {
    const g = twoSeatGame(
      (b) => b.hand(REAPER).battlefield('Swamp', { count: 3 }),
      (b) => b.battlefield(ANGEL),
    );
    g.act(0).cast(REAPER);
    g.expect.pending('targets', 0);
    g.act(0).chooseTargets({ player: 1 });
    g.act(0).payAuto();
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.handSize(1, 0);
  });
});

describe('"target opponent sacrifices a creature with the greatest power among creatures they control"', () => {
  const edict = (theirs: (b: Builder) => Builder) =>
    twoSeatGame((b) => b.hand(EDICT).battlefield('Swamp', { count: 3 }), theirs);

  test('the creature with the greatest power is sacrificed, with no choice to make', () => {
    const g = edict((b) => b.battlefield(BEARS).battlefield(ANGEL).battlefield(ZOMBIE));
    g.act(0).cast(EDICT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
    g.expect.zone(ZOMBIE, 'battlefield', { seat: 1 });
  });

  test('tied for the greatest power: the opponent chooses among the tied creatures only', () => {
    const g = edict((b) => b.battlefield(BEARS).battlefield(ANGEL).battlefield(GIANT));
    g.act(0).cast(EDICT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.pending('choosePermanent', 1);
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error('expected a choice');
    expect(d.seat).toBe(1);
    expect([...d.legal].sort()).toEqual([g.id(ANGEL), g.id(GIANT)].sort());
    g.act(1).choosePermanents(GIANT);
    g.expect.zone(GIANT, 'graveyard', { seat: 1 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });

  test('a creature with no power left... the greatest is read as the choice is made, after the effects before it', () => {
    const g = edict((b) => b.battlefield(BEARS));
    g.act(0).cast(EDICT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('an opponent with no creatures sacrifices nothing', () => {
    const g = edict((b) => b);
    g.act(0).cast(EDICT, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.invariants();
  });
});

describe('validation', () => {
  const reasons = (card: ReturnType<typeof syntheticCard>) =>
    validateCard(card).map((i) => i.message);

  test('the synthetic cards are runnable', () => {
    for (const name of [RANGER, REAPER, STUDY, EDICT]) {
      expect(reasons(syntheticCard(name)), name).toEqual([]);
    }
  });

  test('the conditions that read the gift need a gift ability', () => {
    const base = syntheticCard(STUDY);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const bad = { ...base, faces: [{ ...face, abilities: [] }] } as never;
    expect(reasons(bad)).toEqual([expect.stringContaining('need a gift ability')]);
  });

  test('a target that exists only with the gift is used only under the gift condition', () => {
    const base = syntheticCard(REAPER);
    const face = base.faces[0];
    if (face === undefined || face.spell === null) throw new Error('no spell');
    const bad = {
      ...base,
      faces: [
        {
          ...face,
          spell: {
            ...face.spell,
            effect: { kind: 'moveToZone', objects: { kind: 'target', id: 't2' }, to: 'hand' },
          },
        },
      ],
    } as never;
    expect(reasons(bad)).toEqual([expect.stringContaining('exists only if the gift was promised')]);
  });

  test('gift is not on a land, and a face has one', () => {
    const base = syntheticCard(RANGER);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const gift = { kind: 'keyword', keyword: { kind: 'gift', gift: 'card' } };
    const twice = { ...base, faces: [{ ...face, abilities: [gift, gift] }] } as never;
    expect(reasons(twice)).toEqual(
      expect.arrayContaining([expect.stringContaining('more than one gift')]),
    );
    const treasure = {
      ...base,
      faces: [
        { ...face, abilities: [{ kind: 'keyword', keyword: { kind: 'gift', gift: 'food' } }] },
      ],
    } as never;
    expect(reasons(treasure)).toEqual(
      expect.arrayContaining([expect.stringContaining('gift "food" is not supported')]),
    );
  });
});
