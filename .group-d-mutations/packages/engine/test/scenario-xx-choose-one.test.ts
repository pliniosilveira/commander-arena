// "Create a Food token or a Treasure token" as an instruction (`chooseOne`, D-175): the controller of a resolving spell or ability chooses
// one of the instructions the effect offers, as it resolves.
// Pins: CR 608.2d (a choice an effect gives is made by the player it names, as the effect is applied: not when the spell or ability goes
// on the stack), CR 700.2 (the modes of a modal text are chosen as it is put on the stack: this is not one), CR 603.5 (a triggered
// ability's choice is made as it resolves), CR 608.2b (a spell whose targets are all illegal does not resolve, so asks nothing), CR 111.10
// (predefined tokens).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-choose-one.ts).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import type { Effect } from '../src/index';
import { applyAction, getLegalActions, syntheticCard, validateCard } from '../src/index';
import { twoSeatGame } from './two-seat-helpers';

const RITE = 'SYNTHETIC Fork Rite'; // {1}{G} sorcery: draw a card, gain 3 life, or create a Treasure token
const ALTAR = 'SYNTHETIC Fork Altar'; // {2}{G} enchantment: at your upkeep, a Food token or a Treasure token
const CHARM = 'SYNTHETIC Fork Charm'; // {G} instant: target creature gains flying or gets +2/+2 until end of turn
const BEARS = 'Grizzly Bears'; // 2/2

describe('the cards are valid', () => {
  test.each([RITE, ALTAR, CHARM])('%s', (name) => {
    expect(validateCard(syntheticCard(name))).toEqual([]);
  });
});

describe('a spell that offers three instructions (CR 608.2d)', () => {
  const cast = () => {
    const g = twoSeatGame((b) => b.hand(RITE).battlefield('Forest', 'Forest'));
    g.act(0).cast(RITE, { pay: true });
    return g;
  };

  test('nothing is asked as it is cast: the spell goes on the stack with no choice made (CR 700.2 is for modes)', () => {
    const g = cast();
    g.expect.stack([RITE]);
    g.expect.pending('priority', 0);
  });

  test('as it resolves the controller is asked, with the words of each option in the order given', () => {
    const g = cast();
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the choice of an instruction');
    expect(d).toMatchObject({
      seat: 0,
      purpose: 'effect',
      options: ['draw a card', 'gain 3 life', 'create a Treasure token'],
      sourceName: RITE,
    });
    expect(getLegalActions(g.state, 0).filter((a) => a.kind === 'chooseOption')).toEqual([
      { kind: 'chooseOption', option: 'draw a card' },
      { kind: 'chooseOption', option: 'gain 3 life' },
      { kind: 'chooseOption', option: 'create a Treasure token' },
    ]);
    expect(getLegalActions(g.state, 1)).toEqual([]);
  });

  test('choosing the first draws a card and does none of the others', () => {
    const g = cast();
    g.passAll();
    g.act(0).chooseOption('draw a card');
    g.expect.handSize(0, 1);
    g.expect.life(0, 20);
    expect(g.find({ name: 'Treasure' })).toHaveLength(0);
    g.expect.pending('priority', 0);
  });

  test('choosing the second gains 3 life', () => {
    const g = cast();
    g.passAll();
    g.act(0).chooseOption('gain 3 life');
    g.expect.life(0, 23);
    g.expect.handSize(0, 0);
    expect(g.find({ name: 'Treasure' })).toHaveLength(0);
  });

  test('choosing the third creates a Treasure token', () => {
    const g = cast();
    g.passAll();
    g.act(0).chooseOption('create a Treasure token');
    expect(g.find({ name: 'Treasure' })).toHaveLength(1);
    g.expect.life(0, 20);
    g.expect.handSize(0, 0);
    g.expect.invariants();
  });

  test('an answer that is not one of the options is refused and the question stays', () => {
    const g = cast();
    g.passAll();
    const before = g.state;
    const out = applyAction(before, 0, { kind: 'chooseOption', option: 'draw two cards' });
    expect(out.ok).toBe(false);
    const other = applyAction(before, 1, { kind: 'chooseOption', option: 'gain 3 life' });
    expect(other.ok).toBe(false);
    expect(g.state.pending?.kind).toBe('chooseOption');
  });

  test('the choice is logged as an option chosen, with the words of the option', () => {
    const g = cast();
    g.passAll();
    const mark = g.mark();
    g.act(0).chooseOption('gain 3 life');
    expect(g.eventsSince(mark)).toContainEqual(
      expect.objectContaining({ kind: 'optionChosen', purpose: 'effect', option: 'gain 3 life' }),
    );
  });
});

describe('a triggered ability that offers two instructions (CR 603.5, 608.2d)', () => {
  test('at the upkeep the ability resolves and its controller chooses', () => {
    const g = twoSeatGame((b) => b.battlefield(ALTAR));
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.stack([`${ALTAR} (ability)`]);
    g.passAll();
    const d = g.state.pending;
    if (d?.kind !== 'chooseOption') throw new Error('expected the choice of an instruction');
    expect(d).toMatchObject({
      seat: 0,
      purpose: 'effect',
      options: ['a Food token', 'a Treasure token'],
    });
    g.act(0).chooseOption('a Food token');
    expect(g.find({ name: 'Food' })).toHaveLength(1);
    expect(g.find({ name: 'Treasure' })).toHaveLength(0);
  });

  test('each upkeep asks again: the choice is not remembered', () => {
    const g = twoSeatGame((b) => b.battlefield(ALTAR));
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.act(0).chooseOption('a Food token');
    g.advanceTo('upkeep', { turn: 'next' });
    g.advanceTo('upkeep', { turn: 'next' });
    g.passAll();
    g.act(0).chooseOption('a Treasure token');
    expect(g.find({ name: 'Food' })).toHaveLength(1);
    expect(g.find({ name: 'Treasure' })).toHaveLength(1);
  });
});

describe('an option that uses the target of the spell (CR 608.2b)', () => {
  test('the target is chosen as it is cast and the option as it resolves', () => {
    const g = twoSeatGame((b) => b.hand(CHARM).battlefield(BEARS, 'Forest'));
    g.act(0).cast(CHARM, { targets: [BEARS], pay: true });
    g.expect.pending('priority', 0);
    g.passAll();
    g.expect.pending('chooseOption', 0);
    g.act(0).chooseOption('gets +2/+2');
    g.expect.pt(BEARS, 4, 4);
  });

  test('the other option', () => {
    const g = twoSeatGame((b) => b.hand(CHARM).battlefield(BEARS, 'Forest'));
    g.act(0).cast(CHARM, { targets: [BEARS], pay: true });
    g.passAll();
    g.act(0).chooseOption('gains flying');
    g.expect.derived(BEARS, { keywords: ['flying'] });
    g.expect.pt(BEARS, 2, 2);
  });

  test('a spell whose only target left the battlefield is not resolved and asks nothing (CR 608.2b)', () => {
    const g = twoSeatGame(
      (b) => b.hand(CHARM).battlefield(BEARS, 'Forest'),
      (b) => b.hand('Lightning Bolt').battlefield('Mountain'),
    );
    g.act(0).cast(CHARM, { targets: [BEARS], pay: true });
    g.act(0).pass();
    g.act(1).cast('Lightning Bolt', { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    expect(g.state.pending?.kind).not.toBe('chooseOption');
  });
});

describe('validateCard refuses a choice that cannot be answered', () => {
  const draw: Effect = { kind: 'draw', player: { kind: 'you' }, count: 1 };
  const gain: Effect = { kind: 'gainLife', player: { kind: 'you' }, amount: 1 };
  const withOptions = (options: readonly { label: string; effect: Effect }[]) =>
    singleFace({
      name: 'SYNTHETIC Bad Fork',
      manaCost: ['G'],
      types: ['sorcery'],
      colors: ['G'],
      colorIdentity: ['G'],
      oracleText: 'SYNTHETIC',
      spell: { effect: { kind: 'chooseOne', options } },
    });

  test('one option is not a choice', () => {
    const issues = validateCard(withOptions([{ label: 'draw a card', effect: draw }]));
    expect(issues.map((i) => i.message).join('\n')).toContain('two to eight');
  });

  test('two options with the same words cannot be told apart', () => {
    const issues = validateCard(
      withOptions([
        { label: 'one', effect: draw },
        { label: 'one', effect: gain },
      ]),
    );
    expect(issues.map((i) => i.message).join('\n')).toContain('both called "one"');
  });

  test('an option with no words and an option that is not an effect', () => {
    const empty = validateCard(
      withOptions([
        { label: ' ', effect: draw },
        { label: 'gain', effect: gain },
      ]),
    );
    expect(empty.map((i) => i.message).join('\n')).toContain('words shown to the player');
    const broken = validateCard(
      withOptions([
        { label: 'draw', effect: draw },
        { label: 'nothing', effect: { kind: 'nope' } as never },
      ]),
    );
    expect(broken.length).toBeGreaterThan(0);
  });

  test('an option is held to the rules of any effect', () => {
    const issues = validateCard(
      withOptions([
        { label: 'draw', effect: draw },
        {
          label: 'hurt it',
          effect: {
            kind: 'dealDamage',
            amount: 1,
            to: { kind: 'target', id: 'missing' },
          },
        },
      ]),
    );
    expect(issues.length).toBeGreaterThan(0);
  });
});
