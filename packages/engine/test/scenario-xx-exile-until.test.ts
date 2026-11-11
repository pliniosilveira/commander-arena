// "For each opponent, exile up to one target nonland permanent that player controls until this enchantment leaves the battlefield" and an Aura
// put onto the battlefield by an effect (D-149).
// Pins: CR 610.3 (an "until" effect: a second one-shot effect returns the object after the event), CR 610.3a and 610.3b (if the event
// already happened as the ability would exile, the object doesn't move), CR 610.3c (it returns under its owner's control), CR 400.7 (a card that
// left exile is a new object: it is not returned), CR 115.1 and 601.2c (a target slot: up to one target for each opponent, controlled by that
// opponent), CR 303.4f and 303.4g (an Aura that enters by an effect: its controller chooses what it enchants; with nothing to enchant it stays).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-until-leaves.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { syntheticCard, validateCard } from '../src/index';
import { targetAnswerError } from '../src/rules/target-choice';
import { scenario } from '../src/testing/index';

const GRASP = 'SYNTHETIC Grasp of Law';
const WARDEN = 'SYNTHETIC Banishing Warden';
const DISPEL = 'SYNTHETIC Dispel Enchantment';
const MIGHTY = 'SYNTHETIC Mighty Aura';
const GUARDIAN = 'SYNTHETIC Guardian Aura';
const RISE = 'SYNTHETIC Rise Again';
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const RING = 'Sol Ring';
const LIBRARY = Array.from({ length: 12 }, () => 'Plains');

describe('the cards are valid', () => {
  test.each([GRASP, WARDEN, DISPEL, MIGHTY, GUARDIAN, RISE])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

/** A game where seat 0 has the Grasp in hand and white mana; seat 1 has what `theirs` puts on the battlefield. */
const withGrasp = (
  theirs: readonly string[],
  more: (b: ReturnType<typeof scenario>) => void = () => {},
) => {
  const b = scenario()
    .seat(0)
    .library(...LIBRARY)
    .hand(GRASP, DISPEL)
    .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains');
  more(b);
  return b
    .seat(1)
    .library(...LIBRARY)
    .battlefield(...theirs)
    .build();
};

const castGrasp = (g: ReturnType<typeof withGrasp>) => {
  g.act(0).cast(GRASP, { pay: true });
  g.passAll();
};

describe('the slot: up to one target for each opponent', () => {
  test('the decision has none at least, one at most (one opponent), and says its targets are grouped', () => {
    const g = withGrasp([BEARS, ANGEL, 'Forest']);
    castGrasp(g);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const spec = d.specs[0];
    expect(spec?.min).toBe(0);
    expect(spec?.max).toBe(1);
    expect(spec?.onePerGroup).toBe(true);
    // The two nonland permanents of the opponent; not the land, and not anything of mine.
    expect(spec?.legal.length).toBe(2);
    // Each target says whose it is, which is what "one for each opponent" counts.
    expect(spec?.legal.every((t) => t.kind === 'object' && t.group === 1)).toBe(true);
  });

  test("the Grasp's controller's own permanents and lands are not offered", () => {
    const g = withGrasp([BEARS, 'Forest'], (b) => b.battlefield(ANGEL));
    castGrasp(g);
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error(`expected targets, got ${d?.kind}`);
    const names = (d.specs[0]?.legal ?? []).map((t) =>
      t.kind === 'object' ? g.object(t.id).card : null,
    );
    expect(names.length).toBe(1);
  });

  test('none may be chosen', () => {
    const g = withGrasp([BEARS]);
    castGrasp(g);
    g.act(0).chooseTargets();
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('two targets for one opponent are refused (at most one for each)', () => {
    const g = withGrasp([BEARS, ANGEL]);
    castGrasp(g);
    expect(
      g.act(0).try.action({
        kind: 'chooseTargets',
        targets: [
          { kind: 'object', id: g.id(BEARS), specId: 't1' },
          { kind: 'object', id: g.id(ANGEL), specId: 't1' },
        ],
      }).ok,
    ).toBe(false);
  });
});

describe('"until this enchantment leaves the battlefield"', () => {
  test('the permanent is exiled, and comes back when the Grasp is destroyed', () => {
    const g = withGrasp([BEARS]);
    castGrasp(g);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.act(0).cast(DISPEL, { targets: [GRASP], pay: true });
    g.passAll();
    g.expect.zone(GRASP, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('it returns tapped or not as a new object: the permanent has not been on the battlefield since', () => {
    const g = withGrasp([ANGEL]);
    castGrasp(g);
    g.act(0).chooseTargets(ANGEL);
    g.passAll();
    const exiled = g.id({ name: ANGEL, zone: 'exile' });
    g.act(0).cast(DISPEL, { targets: [GRASP], pay: true });
    g.passAll();
    expect(g.state.objects[exiled]).toBeUndefined();
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });

  test('a noncreature permanent works the same', () => {
    const g = withGrasp([RING]);
    castGrasp(g);
    g.act(0).chooseTargets(RING);
    g.passAll();
    g.expect.zone(RING, 'exile', { seat: 1 });
  });

  test("it returns under its owner's control, not the controller's (CR 610.3c)", () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(GRASP, DISPEL)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .battlefield(BEARS, { controller: 1 })
      .seat(1)
      .library(...LIBRARY)
      .build();
    castGrasp(g as ReturnType<typeof withGrasp>);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 0 });
    g.act(0).cast(DISPEL, { targets: [GRASP], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    expect(g.object(BEARS).controller).toBe(0);
  });

  test('if the Grasp leaves while its ability is on the stack, nothing is exiled (CR 610.3b)', () => {
    const g = withGrasp([BEARS]);
    g.act(0).cast(GRASP, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    // The trigger is on the stack with its target; in response the Grasp is destroyed.
    g.act(0).cast(DISPEL, { targets: [GRASP], pay: true });
    g.passAll();
    g.expect.zone(GRASP, 'graveyard', { seat: 0 });
    g.expect.zone(BEARS, 'battlefield', { seat: 1 });
  });

  test('two Grasps exile one permanent each, and each returns its own', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(GRASP, GRASP, DISPEL)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, ANGEL)
      .build();
    g.act(0).cast(`${GRASP}[0]`, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.act(0).cast(`${GRASP}[0]`, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(ANGEL);
    g.passAll();
    g.expect.zone(BEARS, 'exile', { seat: 1 });
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    g.act(0).cast(DISPEL, { targets: [`${GRASP}[0]`], pay: true });
    g.passAll();
    const back = ['Grizzly Bears', 'Serra Angel'].filter(
      (n) => g.find({ name: n, zone: 'battlefield' }).length === 1,
    );
    expect(back.length).toBe(1);
  });
});

describe('an activated ability: "until this creature leaves the battlefield"', () => {
  const game = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .battlefield(WARDEN, 'Plains', 'Plains', 'Plains', 'Plains')
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ANGEL)
      .build();

  test('the creature is exiled and returns when the Warden dies', () => {
    const g = game();
    g.act(0).activate(WARDEN, { targets: [ANGEL], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'exile', { seat: 1 });
    g.act(0).cast('Lightning Bolt', { targets: [WARDEN], pay: true });
    g.passAll();
    g.expect.zone(WARDEN, 'graveyard', { seat: 0 });
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });

  test('if the Warden leaves in response to its ability, the creature is not exiled', () => {
    const g = game();
    g.act(0).activate(WARDEN, { targets: [ANGEL], pay: true });
    g.act(0).cast('Lightning Bolt', { targets: [WARDEN], pay: true });
    g.passAll();
    g.expect.zone(ANGEL, 'battlefield', { seat: 1 });
  });
});

describe('an Aura returned to the battlefield chooses what it enchants (CR 303.4f)', () => {
  const rise = () =>
    scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(RISE)
      .graveyard(MIGHTY)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', BEARS, ANGEL)
      .seat(1)
      .library(...LIBRARY)
      .build();

  test('with two creatures it asks, and the Aura enters attached to the one chosen', () => {
    const g = rise();
    g.act(0).cast(RISE, { targets: [MIGHTY], pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('auraHost');
    expect(d.seat).toBe(0);
    expect([...d.legal].sort()).toEqual([g.id(BEARS), g.id(ANGEL)].sort());
    g.act(0).choosePermanents(BEARS);
    g.expect.zone(MIGHTY, 'battlefield', { seat: 0 });
    g.expect.attached(MIGHTY, BEARS);
    g.expect.pt(BEARS, 4, 4);
  });

  test('with one legal creature it is chosen without a question', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(RISE)
      .graveyard(MIGHTY)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', BEARS)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(RISE, { targets: [MIGHTY], pay: true });
    g.passAll();
    g.expect.attached(MIGHTY, BEARS);
  });

  test('"enchant creature you control": the opponent\'s creatures are not offered', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(RISE)
      .graveyard(GUARDIAN)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .library(...LIBRARY)
      .battlefield(ANGEL)
      .build();
    g.act(0).cast(RISE, { targets: [GUARDIAN], pay: true });
    g.passAll();
    // Nothing to enchant: the Aura stays in the graveyard (CR 303.4g).
    g.expect.zone(GUARDIAN, 'graveyard', { seat: 0 });
  });

  test('a non-Aura permanent card enters as it always did', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(RISE)
      .graveyard(BEARS)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains')
      .seat(1)
      .build();
    g.act(0).cast(RISE, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('a Grasp that exiled an Aura returns it, and its owner chooses what it enchants', () => {
    const g = scenario()
      .seat(0)
      .library(...LIBRARY)
      .hand(GRASP, DISPEL)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', BEARS, ANGEL)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(MIGHTY, { attachedTo: BEARS })
      .build();
    g.act(0).cast(GRASP, { pay: true });
    g.passAll();
    g.act(0).chooseTargets(MIGHTY);
    g.passAll();
    g.expect.zone(MIGHTY, 'exile', { seat: 1 });
    g.act(0).cast(DISPEL, { targets: [GRASP], pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`expected choosePermanent, got ${d?.kind}`);
    expect(d.purpose).toBe('auraHost');
    expect(d.seat).toBe(1);
    g.choose({ kind: 'choosePermanents', objects: [g.id(ANGEL)] });
    g.expect.attached(MIGHTY, ANGEL);
    g.expect.zone(MIGHTY, 'battlefield', { seat: 1 });
  });
});

describe('one target for each opponent, with several opponents', () => {
  // The scenario has two seats, so the answer check is pinned directly with the decision a three-player game would ask.
  const legal = [
    { kind: 'object' as const, id: 'o1' as never, specId: 't1', group: 1 },
    { kind: 'object' as const, id: 'o2' as never, specId: 't1', group: 1 },
    { kind: 'object' as const, id: 'o3' as never, specId: 't1', group: 2 },
  ];
  const pending = { specs: [{ specId: 't1', min: 0, max: 2, onePerGroup: true as const, legal }] };

  test('one target of each opponent is fine', () => {
    expect(targetAnswerError(pending, [legal[0], legal[2]] as never)).toBeNull();
  });

  test('two targets of one opponent are refused', () => {
    expect(targetAnswerError(pending, [legal[0], legal[1]] as never)).toContain('at most one');
  });

  test('none is fine', () => {
    expect(targetAnswerError(pending, [])).toBeNull();
  });
});
