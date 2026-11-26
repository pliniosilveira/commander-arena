// Most Wanted deck, group 2: the second line of Vihaan, Goldwaker, "At the beginning of combat on your turn, you may have Treasures you control become 3/3 Construct Assassin artifact
// creatures in addition to their other types until end of turn." (golden.jsonl, real Oracle text, issue 120). Vihaan stays unsupported: its first line (outlaws have vigilance and haste)
// belongs to another group, so the line is played here on a SYNTHETIC card that holds only it. Pins (numbers looked up with `pnpm rule` in this session): CR 613.1d (type-changing effects,
// layer 4), CR 613.4b (setting power and toughness, layer 7b), CR 205.1b (in addition to other types), CR 611.2c (the objects are fixed as the effect begins), CR 603.2 (triggers),
// CR 608.2d ("you may" is chosen on resolution). Rulings of 2024-04-12: Treasures keep their abilities while they are creatures.
import { readFileSync } from 'node:fs';
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const LINE =
  'At the beginning of combat on your turn, you may have Treasures you control become 3/3 Construct Assassin artifact creatures in addition to their other types until end of turn.';
const ANIMATOR = parsed('SYNTHETIC Treasure Animator', 'Legendary Creature — Dwarf', LINE, {
  manaCost: '{R}{W}{B}',
  power: '3',
  toughness: '3',
});
// A Treasure that is a card, not a token: the filter reads the subtype either way (a token is tested below).
const HOARD = parsed(
  'SYNTHETIC Treasure Hoard',
  'Artifact — Treasure',
  '{T}, Sacrifice ~: Add one mana of any color.',
  { manaCost: '{1}' },
);
const MAKER = parsed('SYNTHETIC Treasure Maker', 'Sorcery', 'Create two Treasure tokens.', {
  manaCost: '{R}',
});
const FILLER = Array.from({ length: 8 }, () => 'Island');

describe('Vihaan, Goldwaker: both lines are read', () => {
  test('the real card is supported once the outlaw line and the Treasure line both read', () => {
    const card = GOLDEN.find((c) => c.name === 'Vihaan, Goldwaker');
    if (card === undefined) throw new Error('Vihaan, Goldwaker is not in the golden corpus');
    const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
  });
});

describe('"you may have Treasures you control become 3/3 Construct Assassin artifact creatures ..." (CR 613.1d, 613.4b, 205.1b)', () => {
  test('is valid; an optional beginning-of-combat trigger on your turn with a group setTypes', () => {
    expect(validateCard(ANIMATOR)).toEqual([]);
    expect(ANIMATOR.faces[0]?.abilities[0]).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'step', step: 'beginCombat', whose: 'you' },
      optional: true,
      effect: {
        kind: 'setTypes',
        objects: { kind: 'each', filter: { subtypes: ['Treasure'], controller: 'you' } },
        types: ['artifact', 'creature'],
        subtypes: ['Construct', 'Assassin'],
        additive: true,
        basePt: { power: 3, toughness: 3 },
        duration: 'untilEndOfTurn',
      },
    });
  });

  const start = (opts: { active?: 0 | 1; seats?: number } = {}) => {
    const { active = 0, seats = 2 } = opts;
    let b = scenario({ seats })
      .define(ANIMATOR)
      .define(HOARD)
      .define(MAKER)
      .seat(0)
      .library(...FILLER)
      .hand(MAKER.name)
      .battlefield(ANIMATOR.name, 'Mountain')
      .battlefield(HOARD.name, { count: 2 })
      .battlefield('Sol Ring')
      .seat(1)
      .library(...FILLER)
      .battlefield(HOARD.name);
    if (seats > 2)
      b = b
        .seat(2)
        .library(...FILLER)
        .battlefield(HOARD.name);
    return b.at('precombatMain', { active, turn: 3 }).build();
  };

  const mine = (nth: number) => ({ name: HOARD.name, seat: 0 as const, nth });

  test('accepted: your Treasures are 3/3 Construct Assassin artifact creatures, keeping Treasure', () => {
    const g = start();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).accept();
    g.expect.pt(mine(0), 3, 3);
    g.expect.pt(mine(1), 3, 3);
    g.expect.derived(mine(0), {
      types: ['artifact', 'creature'],
      subtypes: ['Treasure', 'Construct', 'Assassin'],
    });
    g.expect.invariants();
  });

  test('Treasure tokens too: the filter reads the subtype of a token as of a card', () => {
    const g = start();
    g.act(0).cast(MAKER.name, { pay: true });
    g.passAll();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).accept();
    const tokens = g.find({ name: 'Treasure', zone: 'battlefield', seat: 0 });
    expect(tokens).toHaveLength(2);
    g.expect.pt({ name: 'Treasure', seat: 0, nth: 0 }, 3, 3);
    g.expect.derived(
      { name: 'Treasure', seat: 0, nth: 1 },
      { types: ['artifact', 'creature'], subtypes: ['Treasure', 'Construct', 'Assassin'] },
    );
  });

  test('only your Treasures: another artifact and the opponents Treasures are as they were (CR 611.2c)', () => {
    const g = start({ seats: 3 });
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).accept();
    g.expect.derived('Sol Ring', { types: ['artifact'] });
    for (const seat of [1, 2] as const) {
      g.expect.derived({ name: HOARD.name, seat }, { types: ['artifact'], subtypes: ['Treasure'] });
    }
  });

  test('declined: the Treasures stay what they are', () => {
    const g = start();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).decline();
    g.expect.derived(mine(0), { types: ['artifact'], subtypes: ['Treasure'] });
  });

  test('until end of turn: they are artifacts again on the next turn', () => {
    const g = start();
    g.advanceTo('beginningOfCombat');
    g.passAll();
    g.act(0).accept();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.expect.derived(mine(0), { types: ['artifact'], subtypes: ['Treasure'] });
  });

  test('on your turn only: nothing happens at the beginning of an opponents combat', () => {
    const g = start({ active: 1 });
    g.advanceTo('beginningOfCombat');
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.derived(mine(0), { types: ['artifact'], subtypes: ['Treasure'] });
  });
});
