// The Niv-Mizzet deck (issue 25), group 3-b (D-339 to D-343): Veyran, Voice of Duality, the REAL card of the owner's golden corpus read through the grammar only and
// played through applyAction: its magecraft ability and "If you casting or copying an instant or sorcery spell causes a triggered ability of a permanent you
// control to trigger, that ability triggers an additional time." (CR 603.2d). Stand-ins are SYNTHETIC (named so), with invented power and toughness.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  expect(imported.support.unparsed, name).toEqual([]);
  return imported.definition;
}

const FILLER = Array.from({ length: 30 }, () => 'Island');
const VEYRAN = real('Veyran, Voice of Duality');

const SPARK = parsed('SYNTHETIC Spark', 'Instant', '~ deals 1 damage to any target.', {
  manaCost: '{R}',
});
const BEARS = parsed('SYNTHETIC Bears', 'Creature — Bear', '', {
  manaCost: '{1}',
  power: '1',
  toughness: '1',
});
const WATCHER = parsed(
  'SYNTHETIC Spell Watcher',
  'Artifact',
  'Whenever you cast a spell, you gain 1 life.',
  { manaCost: '{1}' },
);
const DRAIN = parsed('SYNTHETIC Storm Drain', 'Sorcery', 'Storm\nEach opponent loses 2 life.', {
  manaCost: '{R}',
});

/** Puts the triggers that need ordering on the stack in their default order and passes until the stack is empty. */
function settle(g: ScenarioGame): void {
  for (let i = 0; i < 40; i += 1) {
    const d = g.state.pending;
    if (d?.kind === 'orderTriggers') {
      g.act(d.seat).orderTriggers(...d.triggers.map((_, index) => index));
    } else if (d?.kind === 'priority' && g.state.stack.length > 0) {
      g.passAll();
    } else {
      return;
    }
  }
}

const size = (g: ScenarioGame, name: string) => {
  const o = getView(g.state, 0).battlefield.find((p) => p.name === name);
  return [o?.power, o?.toughness];
};

describe('Veyran, Voice of Duality', () => {
  test('reads as a magecraft ability and a static additional trigger caused by casting or copying an instant or sorcery spell (CR 603.2d)', () => {
    const abilities = VEYRAN.faces[0]?.abilities ?? [];
    expect(abilities.find((a) => a.kind === 'triggered')).toMatchObject({
      trigger: { kind: 'castSpell', by: 'you', orCopy: true },
    });
    expect(abilities.find((a) => a.kind === 'static')).toMatchObject({
      static: {
        kind: 'doubleTriggers',
        subject: { kind: 'filter', filter: { controller: 'you' } },
        cause: { kind: 'castOrCopySpell', spell: { stackKind: 'spell' } },
      },
    });
  });

  const game = (hand: readonly string[], more: readonly string[] = []) => {
    let b = scenario()
      .define(VEYRAN)
      .define(SPARK)
      .define(BEARS)
      .define(WATCHER)
      .define(DRAIN)
      .seat(0)
      .hand(...hand)
      .battlefield(VEYRAN.name);
    for (const name of more) b = b.battlefield(name);
    return b
      .battlefield('Mountain', { count: 3 })
      .battlefield('Island', { count: 2 })
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  };

  test('its own magecraft triggers twice for an instant: +2/+2 until end of turn, not +1/+1 (Veyran ruling: it is doubled too)', () => {
    const g = game([SPARK.name]);
    g.act(0).cast(SPARK.name, { pay: true, targets: [{ player: 1 }] });
    g.passAll();
    expect(size(g, VEYRAN.name)).toEqual([4, 4]);
    g.expect.invariants();
  });

  test('another permanent that triggers when you cast a spell triggers twice for an instant, once for a creature spell', () => {
    const g = game([SPARK.name, BEARS.name], [WATCHER.name]);
    g.act(0).cast(BEARS.name, { pay: true });
    settle(g);
    expect(g.state.seats[0]?.life).toBe(41);
    expect(size(g, VEYRAN.name)).toEqual([2, 2]);
    g.act(0).cast(SPARK.name, { pay: true, targets: [{ player: 1 }] });
    settle(g);
    expect(g.state.seats[0]?.life).toBe(43);
    expect(size(g, VEYRAN.name)).toEqual([4, 4]);
  });

  test('a copy of a spell put onto the stack causes it too: magecraft triggers twice for the cast and twice for the copy', () => {
    // A creature first, so that Storm makes one copy of the sorcery: the cast (+2/+2) and the copy (+2/+2).
    const g = game([BEARS.name, DRAIN.name]);
    g.act(0).cast(BEARS.name, { pay: true });
    settle(g);
    g.act(0).cast(DRAIN.name, { pay: true });
    settle(g);
    expect(size(g, VEYRAN.name)).toEqual([6, 6]);
    expect(g.state.seats[1]?.life).toBe(36);
    g.expect.invariants();
  });
});
