// The Danitha deck (issue 26), group 4 (D-416 to D-420): the REAL Oracle text of Boar Umbra, Hyena Umbra, Lion Umbra, Spider Umbra and Golden-Tail Trainer (the corpus's golden.jsonl,
// taken from the issue) goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real
// text are what the engine runs. The helper cards are real or SYNTHETIC fixtures. Pins: CR 702.89a (Umbra armor), CR 704.5g (lethal damage destroys), CR 700.9 (modified), CR 303.4a (enchant),
// CR 601.2f (cost reductions), CR 508.1 (an attack triggers), CR 611.2c (the group a resolving effect pumps is fixed as it resolves).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const BEARS = 'Grizzly Bears'; // 2/2
const SPIDER_CARD = 'Giant Spider'; // 2/4
const ELVES = 'Llanowar Elves'; // 1/1
const BOLT = 'Lightning Bolt';
const MURDER = 'Murder';
const LIBRARY = Array.from({ length: 8 }, () => 'Plains');

const boar = real('Boar Umbra');
const hyena = real('Hyena Umbra');
const lion = real('Lion Umbra');
const spider = real('Spider Umbra');
const trainer = real('Golden-Tail Trainer');

describe('the four Umbra Auras: Enchant creature, a bonus, Umbra armor', () => {
  test('every card is valid and its AST is the engine shape', () => {
    for (const card of [boar, hyena, lion, spider, trainer]) expect(validateCard(card)).toEqual([]);
    for (const card of [boar, hyena, spider, lion]) {
      expect(card.faces[0]?.abilities).toContainEqual({
        kind: 'replacement',
        replacement: { kind: 'umbraArmor' },
      });
    }
  });

  /** Seat 0 has a Bears with the Aura attached and seat 1 holds a Bolt (3 damage) and a Murder. */
  const attached = (
    aura: CardDefinition,
    extra: (b: ReturnType<typeof scenario>) => void = () => {},
  ) => {
    const s = scenario()
      .define(aura)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(aura.name, { attachedTo: 'bears' });
    extra(s);
    return s
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Mountain', 'Swamp', 'Swamp', 'Swamp')
      .hand(BOLT, MURDER)
      .build();
  };

  test.each([
    ['Boar Umbra', boar, 5, 5, []],
    ['Hyena Umbra', hyena, 3, 3, ['firstStrike']],
    ['Spider Umbra', spider, 3, 3, ['reach']],
  ] as const)(
    '%s gives its bonus to the enchanted creature',
    (_name, aura, power, toughness, keywords) => {
      const g = attached(aura);
      g.expect.pt('bears', power, toughness);
      g.expect.derived('bears', { keywords });
    },
  );

  test('Spider Umbra: Lightning Bolt is lethal to the enchanted 3/3, Umbra armor replaces the destruction', () => {
    const g = attached(spider);
    g.act(0).pass();
    g.act(1).cast(BOLT, { targets: ['bears'], pay: true });
    g.passAll();
    // 3 damage on a 3/3 is lethal: Umbra armor removes it, destroys the Aura, and the creature stays as a 2/2.
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.damage('bears', 0);
    g.expect.zone(spider.name, 'graveyard', { seat: 0 });
    g.expect.pt('bears', 2, 2);
    g.expect.invariants();
  });

  test('Boar Umbra: Murder destroys nothing; the second Murder kills the creature', () => {
    const g = scenario()
      .define(boar)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears' })
      .battlefield(boar.name, { attachedTo: 'bears' })
      .seat(1)
      .library(...LIBRARY)
      .battlefield('Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp', 'Swamp')
      .hand(MURDER, MURDER)
      .build();
    g.act(0).pass();
    g.act(1).cast(`${MURDER}[0]`, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(boar.name, 'graveyard', { seat: 0 });
    g.act(0).pass();
    g.act(1).cast(`${MURDER}[0]`, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
  });

  test('Hyena Umbra: cast from the hand it enters on the target and the creature has first strike', () => {
    const g = scenario()
      .define(hyena)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, 'Plains')
      .hand(hyena.name)
      .seat(1)
      .library(...LIBRARY)
      .build();
    g.act(0).cast(hyena.name, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.attached(hyena.name, BEARS);
    g.expect.derived(BEARS, { keywords: ['firstStrike'] });
  });
});

describe('Lion Umbra: Enchant modified creature, +3/+3, reach and vigilance, Umbra armor', () => {
  const start = () =>
    scenario()
      .define(lion)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 1 } })
      .battlefield(SPIDER_CARD, { label: 'plain' })
      .battlefield('Forest', 'Forest')
      .hand(lion.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();

  test('its enchant ability names the modified filter', () => {
    expect(lion.faces[0]?.abilities[0]).toEqual({
      kind: 'keyword',
      keyword: { kind: 'enchant', filter: { types: ['creature'], modified: true } },
    });
  });

  test('the only legal target is the creature with a counter; the creature with nothing is not modified', () => {
    const g = start();
    g.act(0).cast(lion.name, {});
    const decision = g.state.pending;
    expect(decision?.kind).toBe('targets');
    if (decision?.kind === 'targets') {
      expect(decision.specs[0]?.legal).toMatchObject([{ kind: 'object', id: g.id('bears') }]);
    }
  });

  test('cast on it: +3/+3 (with the counter), reach and vigilance, and Umbra armor protects it', () => {
    const g = start();
    g.act(0).cast(lion.name, { targets: ['bears'], pay: true });
    g.passAll();
    g.expect.attached(lion.name, 'bears');
    g.expect.pt('bears', 2 + 1 + 3, 2 + 1 + 3);
    g.expect.derived('bears', { keywords: ['reach', 'vigilance'] });
  });
});

describe('Golden-Tail Trainer: cost reduction and the modified pump', () => {
  const auras = (extra: (b: ReturnType<typeof scenario>) => void = () => {}) => {
    const s = scenario()
      .define(trainer)
      .define(boar)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(trainer.name, { label: 'trainer' })
      .battlefield(BEARS, { label: 'bears', counters: { '+1/+1': 1 } })
      .battlefield(ELVES, { label: 'elves' });
    extra(s);
    return s
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
  };

  test('Aura spells cost {1} less (its power is 1): Boar Umbra {2}{G} is paid with {1}{G}', () => {
    const g = auras((s) => s.battlefield('Forest', 'Forest').hand(boar.name));
    g.act(0).cast(boar.name, { targets: ['elves'], pay: true });
    g.passAll();
    g.expect.attached(boar.name, 'elves');
  });

  test('without the Trainer the same two lands do not pay for it', () => {
    const g = scenario()
      .define(boar)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(BEARS, 'Forest', 'Forest')
      .hand(boar.name)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0 })
      .build();
    expect(g.act(0).try.cast(boar.name).ok).toBe(false);
  });

  test('when it attacks, the other modified creatures you control get +X/+X, X being its power; the others do not', () => {
    const g = auras((s) => s.battlefield(boar.name, { attachedTo: 'elves' }));
    g.playCombat({ attack: ['trainer'], until: 'declareBlockers' });
    g.passAll();
    // The Trainer is 1/3: X is 1. Bears have a counter, the Elves have an Aura its controller controls: both are modified.
    g.expect.pt('bears', 2 + 1 + 1, 2 + 1 + 1);
    g.expect.pt('elves', 1 + 3 + 1, 1 + 3 + 1);
    g.expect.pt('trainer', 1, 3);
    g.expect.invariants();
  });

  test('a creature that is not modified is not pumped', () => {
    const g = auras();
    g.playCombat({ attack: ['trainer'], until: 'declareBlockers' });
    g.passAll();
    g.expect.pt('elves', 1, 1);
    g.expect.pt('bears', 4, 4);
  });
});
