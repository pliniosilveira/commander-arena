// "Creature spells you cast have demonstrate." (`grantKeywordToSpells`): a static ability of a permanent on the battlefield gives a keyword to the spells its controller casts that a
// filter names, from the moment the spell is on the stack. Pins: CR 702.144a (Demonstrate: "When you cast this spell, you may copy it ...": a triggered ability the spell has as it is
// cast, CR 601.2i, 603.2), CR 702.51a, 702.51b (Convoke: a static ability that functions while the spell is on the stack and applies after the total cost is determined), CR 702.51d
// (instances of convoke are redundant), CR 613.1f (layer 6: an ability given to an object), CR 604.2 (a static ability of a permanent), CR 707.10 (a copy of a spell is not cast: it
// has no demonstrate to trigger), CR 113.7a (a triggered ability on the stack is independent of its source). Cards are SYNTHETIC but for the real Grizzly Bears, Lightning Bolt and
// Llanowar Elves, and SYNTHETIC Demo Bolt (a spell with demonstrate of its own).
import { describe, expect, test } from 'vitest';
import { singleFace } from '../src/cards/fixtures/helpers';
import { type CardDefinition, type GameObject, type Keyword, validateCard } from '../src/index';
import { derive } from '../src/rules/derive';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { confirmOptionalDecision } from './pending-helpers';

const BEARS = 'Grizzly Bears'; // {1}{G} creature
const BOLT = 'Lightning Bolt';
const ELVES = 'Llanowar Elves';
const DEMO = 'SYNTHETIC Demo Bolt'; // {1}{R} sorcery with demonstrate
const WURM = 'SYNTHETIC Convoke Wurm'; // {4}{G}{G} with convoke of its own

/** A SYNTHETIC creature whose static ability gives `keyword` to the creature spells its controller casts. */
function lecturer(name: string, keyword: Keyword): CardDefinition {
  return singleFace({
    name,
    manaCost: ['4', 'W'],
    types: ['creature'],
    subtypes: ['Kor', 'Wizard'],
    colors: ['W'],
    colorIdentity: ['W'],
    power: 3,
    toughness: 3,
    oracleText: 'SYNTHETIC: creature spells you cast have a keyword.',
    abilities: [
      {
        kind: 'static',
        static: {
          kind: 'grantKeywordToSpells',
          what: { types: ['creature'], controller: 'you' },
          keyword: keyword as never,
        },
      },
    ],
  });
}

const DEMONSTRATING = 'SYNTHETIC Demonstrating Lecturer';
const CONVOKING = 'SYNTHETIC Convoking Lecturer';
const DEMO_BEAR_NAME = 'SYNTHETIC Demo Bear';
const DEMO_BEAR = singleFace({
  name: DEMO_BEAR_NAME,
  manaCost: ['1', 'G'],
  types: ['creature'],
  subtypes: ['Bear'],
  colors: ['G'],
  colorIdentity: ['G'],
  power: 2,
  toughness: 2,
  oracleText: 'Demonstrate',
  abilities: [{ kind: 'keyword', keyword: { kind: 'demonstrate' } }],
});
const demonstrating = lecturer(DEMONSTRATING, { kind: 'demonstrate' });
const convoking = lecturer(CONVOKING, { kind: 'convoke' });

const stackKinds = (g: ScenarioGame): string[] =>
  g.state.stack.map((id) => (g.state.objects[id] as GameObject).stack?.kind ?? '?');

const copies = (g: ScenarioGame): GameObject[] =>
  g.state.stack
    .map((id) => g.state.objects[id])
    .filter((o): o is GameObject => o?.copyOf !== undefined);

const keywordsOf = (g: ScenarioGame, name: string, zone: 'stack' | 'hand' = 'stack') =>
  derive(g.state, g.object({ name, zone, seat: 0 })).abilities.flatMap((a) =>
    a.kind === 'keyword' ? [a.keyword.kind] : [],
  );

describe('the cards are valid', () => {
  test('both SYNTHETIC cards pass validateCard', () => {
    expect(validateCard(demonstrating)).toEqual([]);
    expect(validateCard(convoking)).toEqual([]);
  });
});

describe('Demonstrate given to the creature spells you cast (CR 702.144a, 601.2i, 603.2)', () => {
  const build = () =>
    scenario()
      .define(demonstrating)
      .seat(0)
      .hand(BEARS, BOLT)
      .battlefield(DEMONSTRATING)
      .library('Island', 'Island', 'Island')
      .pool('GGGGRRRR')
      .seat(1)
      .library('Island', 'Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();

  test('a creature spell you cast has demonstrate on the stack: its trigger goes above it', () => {
    const g = build();
    g.act(0).cast(BEARS, { pay: true });
    expect(keywordsOf(g, BEARS)).toContain('demonstrate');
    g.expect.stack([`${BEARS} (ability)`, BEARS]);
    expect(stackKinds(g)).toEqual(['spell', 'ability']);
  });

  test('accepting copies the spell, then the chosen opponent copies it too; each copy becomes a token', () => {
    const g = build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    expect(confirmOptionalDecision(g)).toMatchObject({ seat: 0 });
    g.act(0).accept();
    // CR 702.144a: the controller's copy, then the opponent's, above it.
    expect(copies(g).map((c) => c.controller)).toEqual([0, 1]);
    g.passAll();
    const bears = (seat: 0 | 1) =>
      g.state.battlefield.filter((id) => {
        const o = g.state.objects[id];
        return o !== undefined && o.controller === seat && o.token !== null;
      });
    expect(bears(0)).toHaveLength(1);
    expect(bears(1)).toHaveLength(1);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.invariants();
  });

  test('declining: no copy and the opponent does not copy either', () => {
    const g = build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).decline();
    expect(copies(g)).toHaveLength(0);
    g.expect.stack([BEARS]);
  });

  test('a noncreature spell you cast does not have it', () => {
    const g = build();
    g.act(0).cast(BOLT, { pay: true, targets: [{ player: 1 }] });
    expect(keywordsOf(g, BOLT)).not.toContain('demonstrate');
    g.expect.stack([BOLT]);
  });

  test('a creature spell an opponent casts does not have it', () => {
    const g = scenario()
      .define(demonstrating)
      .seat(0)
      .battlefield(DEMONSTRATING)
      .seat(1)
      .hand(BEARS)
      .pool('GG')
      .library('Island', 'Island')
      .at('precombatMain', { active: 1 })
      .build();
    g.act(1).cast(BEARS, { pay: true });
    expect(derive(g.state, g.object({ name: BEARS, zone: 'stack', seat: 1 })).abilities).toEqual(
      derive(g.state, g.object({ name: BEARS, zone: 'stack', seat: 1 })).abilities.filter(
        (a) => a.kind !== 'keyword' || a.keyword.kind !== 'demonstrate',
      ),
    );
    g.expect.stack([BEARS]);
  });

  test('the card in the hand is not a spell yet: it has no demonstrate there', () => {
    const g = build();
    expect(keywordsOf(g, BEARS, 'hand')).not.toContain('demonstrate');
  });

  test('a copy of a spell is not cast: the copy a demonstrate made has no demonstrate trigger', () => {
    const g = build();
    g.act(0).cast(BEARS, { pay: true });
    g.passAll();
    g.act(0).accept();
    // The original, my copy and the opponent's copy: nothing else was put on the stack, and nothing was cast twice.
    expect(g.state.stack).toHaveLength(3);
    expect(g.state.turnLog.castSpells.filter((c) => c.seat === 0)).toHaveLength(1);
    // CR 707.10: a copy is a creature spell the controller does not cast: the permanent gives it nothing.
    for (const c of copies(g)) {
      expect(
        derive(g.state, c).abilities.some(
          (a) => a.kind === 'keyword' && a.keyword.kind === 'demonstrate',
        ),
      ).toBe(false);
    }
    expect(copies(g)).toHaveLength(2);
  });

  test('a spell that has demonstrate of its own and is given it again triggers twice (each instance is its own trigger)', () => {
    const g = scenario()
      .define(demonstrating)
      .define(DEMO_BEAR)
      .seat(0)
      .hand(DEMO_BEAR_NAME)
      .battlefield(DEMONSTRATING)
      .library('Island', 'Island')
      .pool('GG')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(DEMO_BEAR_NAME, { pay: true });
    g.expect.stack([`${DEMO_BEAR_NAME} (ability)`, `${DEMO_BEAR_NAME} (ability)`, DEMO_BEAR_NAME]);
  });

  test('a noncreature spell with demonstrate of its own keeps just its own trigger', () => {
    const g = scenario()
      .define(demonstrating)
      .seat(0)
      .hand(DEMO)
      .battlefield(DEMONSTRATING)
      .library('Island', 'Island')
      .pool('RRRR')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(DEMO, { pay: true, targets: [{ player: 1 }] });
    g.expect.stack([`${DEMO} (ability)`, DEMO]);
  });

  test('two of them give two instances: two triggers', () => {
    const g = scenario()
      .define(demonstrating)
      .seat(0)
      .hand(BEARS)
      .battlefield(DEMONSTRATING, DEMONSTRATING)
      .library('Island', 'Island')
      .pool('GG')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    g.expect.stack([`${BEARS} (ability)`, `${BEARS} (ability)`, BEARS]);
  });

  test('the grant ends when the permanent leaves, but a trigger already on the stack still resolves (CR 113.7a)', () => {
    const g = scenario()
      .define(demonstrating)
      .seat(0)
      .hand(BEARS)
      .battlefield(DEMONSTRATING)
      .library('Island', 'Island')
      .pool('GG')
      .seat(1)
      .hand(BOLT)
      .battlefield('Mountain')
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(BEARS, { pay: true });
    expect(keywordsOf(g, BEARS)).toContain('demonstrate');
    g.act(0).pass();
    g.act(1).cast(BOLT, {
      pay: true,
      targets: [{ name: DEMONSTRATING, zone: 'battlefield', seat: 0 }],
    });
    g.passAll();
    g.expect.zone(DEMONSTRATING, 'graveyard', { seat: 0 });
    expect(keywordsOf(g, BEARS)).not.toContain('demonstrate');
    // The trigger was put on the stack as the spell was cast: it still asks.
    g.passAll();
    g.act(0).accept();
    expect(copies(g)).toHaveLength(2);
  });
});

describe('Convoke given to the creature spells you cast (CR 702.51a, 702.51b)', () => {
  const build = () =>
    scenario()
      .define(convoking)
      .seat(0)
      .hand(BEARS, BOLT)
      .battlefield(CONVOKING, ELVES, ELVES)
      .library('Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();

  test('a creature spell you cast may be paid for by tapping creatures: the question is asked', () => {
    const g = build();
    g.act(0).cast(BEARS);
    expect(g.state.casting?.stage).toBe('payOptions');
    const d = g.state.pending;
    if (d?.kind !== 'choosePayOptions')
      throw new Error(`expected choosePayOptions, got ${d?.kind}`);
    expect(d.mechanism).toBe('convoke');
    expect(d.cost).toEqual(['1', 'G']);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates].slice(0, 2) });
    g.expect.stack([BEARS]);
    g.expect.invariants();
  });

  test('a creature spell with nothing else to pay it can be cast by convoke alone', () => {
    const g = build();
    const legal = g.act(0).try.cast(BEARS);
    expect(legal.ok).toBe(true);
  });

  test('a noncreature spell has no convoke: with no mana it cannot be cast', () => {
    const g = build();
    expect(g.act(0).try.cast(BOLT).ok).toBe(false);
  });

  test('a creature spell an opponent casts has no convoke: with no mana it cannot be cast', () => {
    const g = scenario()
      .define(convoking)
      .seat(0)
      .battlefield(CONVOKING)
      .seat(1)
      .hand(BEARS)
      .battlefield(BEARS, BEARS, BEARS)
      .library('Island', 'Island')
      .at('precombatMain', { active: 1 })
      .build();
    expect(g.act(1).try.cast(BEARS).ok).toBe(false);
  });

  test('a spell with convoke of its own and the grant is asked once (CR 702.51d)', () => {
    const g = scenario()
      .define(convoking)
      .seat(0)
      .hand(WURM)
      .battlefield(CONVOKING, BEARS, BEARS, BEARS, BEARS, BEARS)
      .library('Island', 'Island')
      .seat(1)
      .library('Island', 'Island')
      .at('precombatMain', { active: 0 })
      .build();
    g.act(0).cast(WURM);
    const d = g.state.pending;
    if (d?.kind !== 'choosePayOptions')
      throw new Error(`expected choosePayOptions, got ${d?.kind}`);
    g.act(0).choose({ kind: 'choosePayOptions', objects: [...d.candidates] });
    expect(g.state.pending?.kind).not.toBe('choosePayOptions');
    g.expect.stack([WURM]);
  });
});
