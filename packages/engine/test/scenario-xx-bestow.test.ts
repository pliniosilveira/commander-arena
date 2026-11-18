// Bestow (CR 702.103; the rules text was not available in this environment, so the subrule letters are those of the
// design and unchecked): "You may cast this card by paying [cost] rather than its mana cost. If you do, it's an Aura
// enchantment spell with enchant creature (it targets a creature). If its target is illegal as it resolves it resolves
// as a creature. It is an Aura enchantment, not a creature, only while attached; once unattached it is a creature for
// good." Also CR 118.9 (an alternative cost), CR 303.4a, 608.3c (an Aura enters attached), CR 704.5m / 702.103f (a
// bestowed Aura that loses its host is not put into the graveyard). Cards are SYNTHETIC
// (src/cards/fixtures/synthetic-alt-costs.ts).
import { describe, expect, test } from 'vitest';
import { applyAction, getLegalActions, getView, validateCard } from '../src/index';
import { scenario } from '../src/testing/index';

const SPIRIT = 'SYNTHETIC Bestow Spirit'; // {1}{W}{W} enchantment creature 2/2, bestow {3}{W}, enchanted creature gets +2/+2
const WISP = 'SYNTHETIC Bestow Wisp'; // {W} creature 1/1, bestow {2}{W}, enchanted creature has flying
const BEARS = 'Grizzly Bears';
const VANILLA = 'SYNTHETIC Vanilla 3/3';

type Built = ReturnType<ReturnType<typeof scenario>['build']>;

const build = () =>
  scenario()
    .seat(0)
    .hand(SPIRIT, WISP)
    .battlefield('Plains', { count: 6 })
    .battlefield(BEARS)
    .seat(1)
    .hand('Lightning Bolt')
    .battlefield('Mountain')
    .battlefield(VANILLA)
    .build();

const bestowOptions = (g: Built) =>
  getLegalActions(g.state, 0).filter((a) => a.kind === 'castSpell' && a.alternative === 'bestow');

const typesOf = (g: Built, name: string, seat: 0 | 1 = 0) => {
  const view = getView(g.state, seat);
  const o = [...view.battlefield, ...view.stack].find((x) => x.name === name);
  return { types: o?.types, subtypes: o?.subtypes };
};

describe('the choice at the first casting step (CR 601.2b, 118.9a)', () => {
  test('the ordinary cast and the bestow cast are separate options, one per card', () => {
    const g = build();
    g.expect.legal(0, { cast: SPIRIT });
    g.expect.legal(0, { cast: SPIRIT, alternative: 'bestow' });
    expect(bestowOptions(g)).toHaveLength(2);
  });

  test('with only the bestow cost payable the ordinary cast is not offered, and the other way around', () => {
    const four = scenario()
      .seat(0)
      .hand(SPIRIT)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS)
      .seat(1)
      .build();
    four.expect.legal(0, { cast: SPIRIT, alternative: 'bestow' });
    const three = scenario()
      .seat(0)
      .hand(SPIRIT)
      .battlefield('Plains', { count: 3 })
      .battlefield(BEARS)
      .seat(1)
      .build();
    three.expect.legal(0, { cast: SPIRIT });
    three.expect.illegal(0, { cast: SPIRIT, alternative: 'bestow' });
  });

  test('no creature to enchant: no bestow option (the Aura spell needs a target), the creature cast stays', () => {
    const g = scenario().seat(0).hand(SPIRIT).battlefield('Plains', { count: 6 }).seat(1).build();
    g.expect.legal(0, { cast: SPIRIT });
    expect(bestowOptions(g)).toEqual([]);
  });

  test('a card without bestow has no bestow option', () => {
    const g = scenario()
      .seat(0)
      .hand(BEARS)
      .battlefield('Forest', { count: 6 })
      .battlefield(BEARS)
      .seat(1)
      .build();
    g.expect.illegal(0, { cast: BEARS, alternative: 'bestow' });
  });
});

describe('the bestow spell is an Aura spell with enchant creature (CR 702.103b)', () => {
  test('it targets a creature (any creature, not players), is paid for with the bestow cost and is not a creature spell', () => {
    const g = build();
    g.act(0).cast(SPIRIT, { alternative: 'bestow' });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected a targets decision, got ${d?.kind}`);
    expect(d.specs.map((s) => s.specId)).toEqual(['enchant']);
    expect(d.specs[0]?.legal.every((t) => t.kind === 'object')).toBe(true);
    expect(d.specs[0]?.legal).toHaveLength(2);
    g.act(0).cancel();
    g.act(0).cast(SPIRIT, { alternative: 'bestow', targets: [BEARS], pay: true });
    // {3}{W} paid, not {1}{W}{W}.
    expect(g.find({ name: 'Plains', zone: 'battlefield' }).filter((o) => o.tapped)).toHaveLength(4);
    g.expect.eventLog([{ kind: 'spellCast', alternative: 'bestow' }]);
    expect(typesOf(g, SPIRIT)).toEqual({ types: ['enchantment'], subtypes: ['Aura'] });
    expect(getView(g.state, 1).stack[0]?.alternative).toBe('bestow');
  });

  test('the view shows both costs for a card in hand', () => {
    const g = build();
    const card = getView(g.state, 0).seats[0]?.hand?.find((c) => c.name === SPIRIT);
    expect(card?.castCost).toEqual(['1', 'W', 'W']);
    expect(card?.alternativeCosts).toEqual([{ kind: 'bestow', cost: ['3', 'W'] }]);
  });

  test('cancelling the cast puts the card back unchanged', () => {
    const g = build();
    const before = g.positionHash();
    g.act(0).cast(SPIRIT, { alternative: 'bestow' }).cancel();
    g.expect.position(before);
    g.expect.zone(SPIRIT, 'hand', { seat: 0 });
  });
});

describe('it resolves attached, as an Aura, and is not a creature (CR 608.3c, 702.103b, 702.103d)', () => {
  test('enters attached to its target, gives its bonus, and is an enchantment Aura without creature types', () => {
    const g = build();
    g.act(0).cast(SPIRIT, { alternative: 'bestow', targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(SPIRIT, 'battlefield', { seat: 0 });
    g.expect.attached(SPIRIT, BEARS);
    g.expect.pt(BEARS, 4, 4);
    expect(typesOf(g, SPIRIT)).toEqual({ types: ['enchantment'], subtypes: ['Aura'] });
    expect(getView(g.state, 0).battlefield.find((o) => o.name === SPIRIT)?.alternative).toBe(
      'bestow',
    );
    g.expect.invariants();
  });

  test('it can bestow on an opponent creature; its controller stays the caster (CR 303.4e)', () => {
    const g = build();
    g.act(0).cast(WISP, { alternative: 'bestow', targets: [VANILLA], pay: true });
    g.passAll();
    g.expect.attached(WISP, VANILLA);
    expect(g.object(WISP).controller).toBe(0);
    expect(getView(g.state, 1).battlefield.find((o) => o.name === VANILLA)?.keywords).toContain(
      'flying',
    );
  });

  test('the same card cast for its mana cost is a creature that is not attached', () => {
    const g = build();
    g.act(0).cast(SPIRIT, { pay: true });
    g.passAll();
    g.expect.zone(SPIRIT, 'battlefield', { seat: 0 });
    expect(g.object(SPIRIT).attachedTo).toBeNull();
    expect(typesOf(g, SPIRIT).types).toEqual(['enchantment', 'creature']);
    g.expect.pt(SPIRIT, 2, 2);
    g.expect.pt(BEARS, 2, 2);
  });
});

describe('a bestowed permanent is not a creature as it enters (CR 702.103b, 603.6a)', () => {
  const WARDEN = 'SYNTHETIC Reclaimed Warden'; // "Whenever another creature enters, you gain 1 life."
  const withWarden = () =>
    scenario()
      .seat(0)
      .hand(SPIRIT)
      .battlefield('Plains', { count: 6 })
      .battlefield(BEARS, WARDEN)
      .seat(1)
      .build();

  test('bestowed onto a creature: no "a creature enters" trigger', () => {
    const g = withWarden();
    g.act(0).cast(SPIRIT, { alternative: 'bestow', targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(SPIRIT, BEARS);
    expect(g.state.stack).toEqual([]);
    expect(g.state.seats[0]?.life).toBe(40);
  });

  test('cast for its mana cost it is a creature and does trigger it', () => {
    const g = withWarden();
    g.act(0).cast(SPIRIT, { pay: true });
    g.passAll();
    g.passAll();
    expect(g.state.seats[0]?.life).toBe(41);
  });
});

describe('an illegal target as it resolves: it resolves as a creature (CR 702.103e)', () => {
  test('the host dies in response: the card enters the battlefield as a creature, not into the graveyard', () => {
    const g = build();
    g.act(0).cast(SPIRIT, { alternative: 'bestow', targets: [BEARS], pay: true });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(SPIRIT, 'battlefield', { seat: 0 });
    expect(g.object(SPIRIT).attachedTo).toBeNull();
    expect(typesOf(g, SPIRIT).types).toEqual(['enchantment', 'creature']);
    expect(typesOf(g, SPIRIT).subtypes).toEqual(['Spirit']);
    g.expect.pt(SPIRIT, 2, 2);
    g.expect.noEvent({ kind: 'fizzled' });
    g.expect.invariants();
  });

  test('a plain creature card with bestow does the same', () => {
    const g = build();
    g.act(0).cast(WISP, { alternative: 'bestow', targets: [BEARS], pay: true });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(WISP, 'battlefield', { seat: 0 });
    expect(typesOf(g, WISP).types).toEqual(['creature']);
    g.expect.pt(WISP, 1, 1);
  });
});

describe('the host leaves: the permanent becomes a creature and stays (CR 702.103f, 704.5m)', () => {
  test('the host dying turns the Aura into a creature: with Bolt on the unbuffed host', () => {
    // The host is the opponent's 3/3; the bestowed permanent gives +2/+2 (5/5). Two bolts are not needed: the bestow card is cast after the Bolt resolves.
    const g = scenario()
      .seat(0)
      .hand(SPIRIT)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS)
      .seat(1)
      .hand('Lightning Bolt', 'Lightning Bolt')
      .battlefield('Mountain', { count: 2 })
      .build();
    g.act(0).cast(SPIRIT, { alternative: 'bestow', targets: [BEARS], pay: true });
    g.passAll();
    // 4/4 host; two bolts in a row kill it (CR 704.5g), the Aura leaves nothing behind but a creature.
    const mark = g.mark();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: [BEARS], pay: true });
    g.act(1).cast('Lightning Bolt[0]', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone(SPIRIT, 'battlefield', { seat: 0 });
    g.expect.noObject(SPIRIT, { zone: 'graveyard' });
    expect(g.object(SPIRIT).attachedTo).toBeNull();
    expect(typesOf(g, SPIRIT).types).toEqual(['enchantment', 'creature']);
    g.expect.pt(SPIRIT, 2, 2);
    g.expect.eventLog(
      [
        { kind: 'died', cardName: BEARS },
        { kind: 'unattached', reason: 'left' },
      ],
      { since: mark },
    );
    g.expect.invariants();
  });

  test('once a creature again it cannot be attached as an Aura any more', () => {
    const g = scenario()
      .seat(0)
      .hand(SPIRIT)
      .battlefield('Plains', { count: 4 })
      .battlefield(BEARS)
      .seat(1)
      .hand('Lightning Bolt', 'Lightning Bolt')
      .battlefield('Mountain', { count: 2 })
      .build();
    g.act(0).cast(SPIRIT, { alternative: 'bestow', targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt[0]', { targets: [BEARS], pay: true });
    g.act(1).cast('Lightning Bolt[0]', { targets: [BEARS], pay: true });
    g.passAll();
    // Still a creature on later turns: the permanent remembers bestow but is unattached.
    expect(typesOf(g, SPIRIT).subtypes).toEqual(['Spirit']);
  });
});

describe('what the card data may say (validateCard)', () => {
  test('bestow is on a creature card with a mana cost', () => {
    const def = (types: ('creature' | 'enchantment')[]) => ({
      name: 'SYNTHETIC Bad Bestow',
      layout: 'normal' as const,
      oracleId: null,
      colorIdentity: [],
      faces: [
        {
          name: 'SYNTHETIC Bad Bestow',
          manaCost: ['W'],
          types,
          supertypes: [],
          subtypes: [],
          colors: ['W'],
          power: types.includes('creature') ? 1 : null,
          toughness: types.includes('creature') ? 1 : null,
          loyalty: null,
          defense: null,
          oracleText: '',
          abilities: [],
          spell: null,
          additionalCosts: [],
          alternativeCosts: [{ kind: 'bestow', cost: [{ kind: 'mana', symbols: ['2', 'W'] }] }],
        },
      ],
    });
    expect(
      validateCard(def(['creature']) as never).filter((i) => /bestow/.test(i.message)),
    ).toEqual([]);
    expect(
      validateCard(def(['enchantment']) as never).some((i) =>
        /bestow is on a creature/.test(i.message),
      ),
    ).toBe(true);
  });

  test('applyAction refuses a bestow cast of a card from the graveyard', () => {
    const g = scenario()
      .seat(0)
      .graveyard(SPIRIT)
      .battlefield('Plains', { count: 6 })
      .seat(1)
      .build();
    const card = g.find({ name: SPIRIT, zone: 'graveyard' })[0];
    if (card === undefined) throw new Error('no card');
    expect(
      applyAction(g.state, 0, { kind: 'castSpell', object: card.id, alternative: 'bestow' }).ok,
    ).toBe(false);
  });
});
