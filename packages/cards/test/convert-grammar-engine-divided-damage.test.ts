// Damage divided as an ability is put on the stack, and cast triggers that read the spell that caused them: the REAL Oracle text of Dragonlord Atarka, Skarrgan Hellkite,
// Hammerhead Tyrant and Eshki, Temur's Roar (divided-damage-cards.jsonl, the cards of a deck support issue) goes through the grammar as a card with no override, is
// defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what the engine runs. Pins: CR 601.2d,
// 602.2b and 603.3d (the division is announced with the targets, each target gets at least 1), CR 115.1 (any number of targets, one or two), CR 602.5b ("Activate
// only if"), CR 702.136a (Riot), CR 202.3 and 603.3 (the mana value of the spell that caused the trigger), CR 208.1 and 608.2c (its power, as the instruction comes up).
import { readFileSync } from 'node:fs';
import { type CardDefinition, type ChosenTarget, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const CARDS = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = CARDS.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the fixture`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 12 }, () => 'Mountain');
const V11 = 'SYNTHETIC Vanilla 1/1';
const V22 = 'SYNTHETIC Vanilla 2/2';
const V33 = 'SYNTHETIC Vanilla 3/3';
const V55 = 'SYNTHETIC Vanilla 5/5';
const WALKER = 'SYNTHETIC Vanilla Planeswalker';
const LANDS = ['Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Forest'];

describe('Dragonlord Atarka', () => {
  const atarka = real('Dragonlord Atarka');
  const NAME = atarka.name;

  test('the card is valid and its enters ability divides 5 damage among targets of two kinds', () => {
    expect(validateCard(atarka)).toEqual([]);
    const ability = atarka.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    if (ability?.kind !== 'triggered') throw new Error('no trigger');
    const [slot] = ability.targets ?? [];
    expect(slot?.divide).toEqual({ total: 5 });
    expect(slot?.min).toBeUndefined();
    expect(ability.effect).toEqual({ kind: 'dealDividedDamage', to: { kind: 'target', id: 't1' } });
  });

  const game = () =>
    scenario()
      .define(atarka)
      .seat(0)
      .hand(NAME)
      .battlefield(...LANDS, V22)
      .library(...FILLER)
      .seat(1)
      .battlefield(V22, { label: 'a' })
      .battlefield(V33, { label: 'b' })
      .battlefield(WALKER, { label: 'walker' })
      .battlefield('Mountain', { label: 'land' })
      .library(...FILLER)
      .build();

  const pick = (
    g: ReturnType<typeof game>,
    picks: readonly (readonly [string, number])[],
  ): ChosenTarget[] =>
    picks.map(([label, share]) => ({
      kind: 'object' as const,
      id: g.id(label),
      specId: 't1',
      share,
    }));

  test("5 damage divided between a creature and a planeswalker, as the creature's controller's opponent announces", () => {
    const g = game();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.expect.pending('targets', 0);
    g.act(0).choose({
      kind: 'chooseTargets',
      targets: pick(g, [
        ['a', 2],
        ['walker', 3],
      ]),
    });
    g.passAll();
    g.expect.zone(V22, 'graveyard', { seat: 1 });
    g.expect.counters('walker', { loyalty: 1 });
    g.expect.damage('b', 0);
    g.expect.invariants();
  });

  test("only the opponents' creatures and planeswalkers are legal, not the caster's own, a land or a player", () => {
    const g = game();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    const legal = d.specs[0]?.legal.map((t) => (t.kind === 'object' ? t.id : -1)) ?? [];
    expect(legal.sort()).toEqual([g.id('a'), g.id('b'), g.id('walker')].sort());
  });
});

describe('Skarrgan Hellkite', () => {
  const hellkite = real('Skarrgan Hellkite');
  const NAME = hellkite.name;

  test('the card is valid; its ability needs a +1/+1 counter and divides 2 damage among one or two targets', () => {
    expect(validateCard(hellkite)).toEqual([]);
    const ability = hellkite.faces[0]?.abilities.find((a) => a.kind === 'activated');
    if (ability?.kind !== 'activated') throw new Error('no ability');
    expect(ability.targets?.[0]).toMatchObject({
      what: { kind: 'anyTarget' },
      min: 1,
      max: 2,
      divide: { total: 2 },
    });
    expect(ability.activateOnlyIf).toBeDefined();
  });

  const game = () =>
    scenario()
      .define(hellkite)
      .seat(0)
      .hand(NAME)
      .battlefield(...LANDS, 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(V11, { label: 'a' })
      .battlefield(V33, { label: 'b' })
      .library(...FILLER)
      .build();

  test('riot for the counter: 1 damage to a creature and 1 to a player', () => {
    const g = game();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).chooseOption('counter');
    g.passAll();
    g.expect.counters(NAME, { '+1/+1': 1 });
    g.act(0).activate(NAME, { targets: ['a', { player: 1 }], divide: [1, 1], pay: true });
    g.passAll();
    g.expect.zone(V11, 'graveyard', { seat: 1 });
    g.expect.life(1, 39);
    g.expect.invariants();
  });

  test('riot for haste: there is no +1/+1 counter, so the ability cannot be activated (CR 602.5b)', () => {
    const g = game();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).chooseOption('haste');
    g.passAll();
    g.expect.counters(NAME, {});
    expect(g.act(0).try.activate(NAME).ok).toBe(false);
  });

  test('all 2 damage may go to one target, and a division that does not add up is refused', () => {
    const g = game();
    g.act(0).cast(NAME, { pay: true });
    g.passAll();
    g.act(0).chooseOption('counter');
    g.passAll();
    const handle = g.act(0).activate(NAME);
    const bad = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [
        { kind: 'object', id: g.id('b'), specId: 't1', share: 1 },
        { kind: 'player', seat: 1, specId: 't1', share: 2 },
      ],
    });
    expect(bad.ok).toBe(false);
    handle.targets(['b'], [2]).pay();
    g.passAll();
    g.expect.damage('b', 2);
  });
});

describe('Hammerhead Tyrant', () => {
  const tyrant = real('Hammerhead Tyrant');
  const NAME = tyrant.name;

  test('the card is valid and its target filter reads the mana value of the spell that was cast', () => {
    expect(validateCard(tyrant)).toEqual([]);
    const ability = tyrant.faces[0]?.abilities.find((a) => a.kind === 'triggered');
    if (ability?.kind !== 'triggered') throw new Error('no trigger');
    const what = ability.targets?.[0]?.what;
    expect(what).toMatchObject({
      kind: 'object',
      filter: {
        controller: 'opponent',
        notTypes: ['land'],
        manaValueAtMost: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
      },
    });
    expect(ability.targets?.[0]).toMatchObject({ min: 0, max: 1 });
  });

  const game = () =>
    scenario()
      .define(tyrant)
      .seat(0)
      .hand(V33, V11, V55)
      .battlefield(NAME, 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .battlefield(V11, { label: 'one' })
      .battlefield(V33, { label: 'three' })
      .battlefield(V55, { label: 'five' })
      .battlefield('Mountain', { label: 'land' })
      .library(...FILLER)
      .build();

  test("casting a 3-mana spell returns a permanent of mana value 3 or less to its owner's hand", () => {
    const g = game();
    g.act(0).cast({ name: V33, zone: 'hand' }, { pay: true });
    const d = g.state.pending;
    if (d?.kind !== 'targets') throw new Error('expected targets');
    const legal = (d.specs[0]?.legal ?? []).map((t) => (t.kind === 'object' ? t.id : -1)).sort();
    expect(legal).toEqual([g.id('one'), g.id('three')].sort());
    g.act(0).choose({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id('three'), specId: 't1' }],
    });
    g.passAll();
    g.expect.zone(V33, 'hand', { seat: 1 });
    g.expect.zone(V33, 'battlefield', { seat: 0 });
    g.expect.zone(V55, 'battlefield', { seat: 1 });
    g.expect.invariants();
  });

  test('"up to one": the trigger may have no target', () => {
    const g = game();
    g.act(0).cast({ name: V11, zone: 'hand' }, { pay: true });
    g.act(0).choose({ kind: 'chooseTargets', targets: [] });
    g.passAll();
    g.expect.zone(V11, 'battlefield', { seat: 1 });
    g.expect.zone(V11, 'battlefield', { seat: 0 });
  });
});

describe("Eshki, Temur's Roar", () => {
  const eshki = real("Eshki, Temur's Roar");
  const NAME = eshki.name;
  const ATARKA = real('Dragonlord Atarka');

  test('the card is valid', () => {
    expect(validateCard(eshki)).toEqual([]);
  });

  const game = (hand: readonly string[]) =>
    scenario()
      .define(eshki)
      .define(ATARKA)
      .seat(0)
      .hand(...hand)
      .battlefield(NAME, ...LANDS, 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .build();

  test('a creature spell with power 2: only the +1/+1 counter', () => {
    const g = game([V22]);
    g.act(0).cast(V22, { pay: true });
    g.passAll();
    g.expect.counters(NAME, { '+1/+1': 1 });
    g.expect.handSize(0, 0);
    g.expect.life(1, 40);
  });

  test('power 5: the counter and a card, and no damage', () => {
    const g = game([V55]);
    g.act(0).cast(V55, { pay: true });
    g.passAll();
    g.expect.counters(NAME, { '+1/+1': 1 });
    g.expect.handSize(0, 1);
    g.expect.life(1, 40);
  });

  test("power 8: the counter, a card, and damage equal to Eshki's power (counters included) to each opponent", () => {
    const g = game([V22, ATARKA.name]);
    g.act(0).cast(V22, { pay: true });
    g.passAll();
    g.act(0).cast(ATARKA.name, { pay: true });
    g.passAll();
    // The second trigger put the second counter first: 2/2 with two counters is a 4/4.
    g.expect.counters(NAME, { '+1/+1': 2 });
    g.expect.pt(NAME, 4, 4);
    g.expect.handSize(0, 1);
    g.expect.life(1, 36);
  });

  test('a spell that is not a creature spell does not trigger it', () => {
    const g = game(['Lightning Bolt']);
    g.act(0).cast('Lightning Bolt', { targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.counters(NAME, {});
  });
});
