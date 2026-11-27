// Animated Army deck, the put-from-hand group: Kodama of the East Tree ("Whenever another permanent you control enters, if it wasn't put onto the battlefield with this ability, you may
// put a permanent card with equal or lesser mana value from your hand onto the battlefield."), read by the grammar and run by the engine. The first block parses the REAL Oracle text
// from the golden corpus, whole; the rest are SYNTHETIC cards whose ability is the real line (the name replaced), played through `applyAction` with the scenario DSL. Every synthetic
// name starts with "SYNTHETIC". Pins: CR 603.2 and 603.6a (one trigger for each permanent that enters, tokens and lands too), CR 603.4 (the intervening "if" is read as the permanent
// enters and as the ability resolves), CR 400.7 (a permanent remembers which object's ability put it onto the battlefield; two copies of the ability are two abilities), CR 202.3 and
// 202.3e (the mana value of the permanent, an {X} in a cost counts as 0 on the battlefield and in the hand), CR 608.2d ("you may": the player chooses a card, or none).
import { readFileSync } from 'node:fs';
import { type CardDefinition, type ObjectId, validateCard } from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { dropped, readAll } from './parser-p5-helpers';

const GOLDEN: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

const LINE =
  "Whenever another permanent you control enters, if it wasn't put onto the battlefield with this ability, you may put a permanent card with equal or lesser mana value from your hand onto the battlefield.";
const FILLER = Array.from({ length: 12 }, () => 'Mountain');

describe('the real card, whole', () => {
  const card = GOLDEN.find((c) => c.name === 'Kodama of the East Tree');
  if (card === undefined) throw new Error('Kodama of the East Tree is not in the golden corpus');
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);

  test('is supported and valid, with reach and partner', () => {
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(validateCard(imported.definition)).toEqual([]);
    const kinds = imported.definition.faces[0]?.abilities.map((a) =>
      a.kind === 'keyword' ? a.keyword.kind : a.kind,
    );
    expect(kinds).toEqual(['reach', 'triggered', 'partner']);
  });
});

describe('the grammar reads the line', () => {
  test('lowers to a choice from the hand limited by the permanent that entered', () => {
    const [ability] = readAll(LINE, 'creature').abilities;
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { other: true, controller: 'you' } },
      effect: {
        kind: 'moveToZone',
        objects: {
          kind: 'choose',
          filter: {
            zone: 'hand',
            manaValueAtMost: { kind: 'manaValueOf', of: { kind: 'triggerSubject' } },
          },
        },
        to: 'battlefield',
        putWithSource: true,
      },
      optional: true,
      interveningIf: {
        kind: 'not',
        term: { kind: 'subjectMatches', filter: { putWithSource: true } },
      },
    });
  });

  test.each([
    ['the permanent itself', LINE.replace('another permanent', 'this creature')],
    ['another ability', LINE.replace('with this ability', 'with that ability')],
    ['the library', LINE.replace('from your hand', 'from your library')],
  ])('%s is not read', (_what, text) => {
    expect(dropped(text, 'creature')).toBeDefined();
  });
});

describe('Kodama: the chain of permanents', () => {
  const kodama = (name: string): CardDefinition =>
    parsed(name, 'Legendary Creature — Spirit', LINE, {
      manaCost: '{4}{G}{G}',
      colors: ['G'],
      power: '6',
      toughness: '6',
    });
  const KODAMA = 'SYNTHETIC Parsed Kodama';
  const OTHER = 'SYNTHETIC Parsed Kodama Twin';
  const k1 = kodama(KODAMA);
  const k2 = kodama(OTHER);
  const soldiers = parsed(
    'SYNTHETIC Parsed Soldier Maker',
    'Sorcery',
    'Create two 1/1 white Soldier creature tokens.',
    { manaCost: '{W}', colors: ['W'] },
  );
  const xBeast = parsed('SYNTHETIC Parsed X Beast', 'Creature — Beast', '', {
    manaCost: '{X}{G}',
    colors: ['G'],
    power: '1',
    toughness: '1',
  });
  const xCard = parsed('SYNTHETIC Parsed X Card', 'Creature — Beast', '', {
    manaCost: '{X}{G}',
    colors: ['G'],
    power: '1',
    toughness: '1',
  });

  const base = (twin: boolean, hand: readonly string[]) => {
    const s = scenario()
      .seat(0)
      .define(k1)
      .define(k2)
      .define(soldiers)
      .define(xBeast)
      .define(xCard)
      .battlefield(KODAMA)
      .battlefield('Forest', { count: 5 })
      .battlefield('Plains', { count: 2 })
      .hand(...hand);
    return (twin ? s.battlefield(OTHER) : s)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  };

  /** The names of the cards of the pending choice, among `names`. */
  const offered = (g: ScenarioGame, names: readonly string[]): string[] => {
    const d = g.state.pending;
    if (d?.kind !== 'chooseCards') throw new Error(`expected chooseCards, got ${d?.kind}`);
    const legal: readonly ObjectId[] = d.legal;
    return names.filter((n) => g.find({ name: n, zone: 'hand' }).some((o) => legal.includes(o.id)));
  };
  /** CR 603.3b: answers the order question when it is asked (the order given) and says how many triggers it listed (0 when it was not asked). */
  const orderedTriggers = (g: ScenarioGame): number => {
    const d = g.state.pending;
    if (d?.kind !== 'orderTriggers') return 0;
    const n = d.triggers.length;
    g.act(0).orderTriggers(...d.triggers.map((_t, i) => i));
    return n;
  };
  /** Resolves the object on the top of the stack: both players pass. */
  const resolveTop = (g: ScenarioGame) => {
    g.act(0).pass();
    g.act(1).pass();
  };
  const onField = (g: ScenarioGame, name: string) =>
    g.find({ name, zone: 'battlefield', seat: 0 }).length;
  const ALL = ['Sol Ring', 'Serra Angel', 'Plains', 'Grizzly Bears', xCard.name];

  test('the card is valid', () => {
    expect(validateCard(k1)).toEqual([]);
  });

  test('a permanent entering offers the cards of equal or lesser mana value; what is put there triggers nothing more', () => {
    const g = base(false, ['Grizzly Bears', 'Sol Ring', 'Serra Angel', 'Plains']);
    g.act(0).cast('Grizzly Bears', { pay: true });
    resolveTop(g);
    expect(onField(g, 'Grizzly Bears')).toBe(1);
    expect(g.state.stack).toHaveLength(1);
    resolveTop(g);
    g.act(0).accept();
    expect(offered(g, ALL)).toEqual(['Sol Ring', 'Plains']);
    g.act(0).chooseCards('Sol Ring');
    expect(onField(g, 'Sol Ring')).toBe(1);
    // CR 400.7, 603.4: the Ring was put there with this ability, so it triggers nothing.
    expect(g.state.stack).toHaveLength(0);
    expect(g.state.pending?.kind).toBe('priority');
    g.expect.invariants();
  });

  test('"you may": declining puts nothing onto the battlefield', () => {
    const g = base(false, ['Grizzly Bears', 'Sol Ring']);
    g.act(0).cast('Grizzly Bears', { pay: true });
    resolveTop(g);
    resolveTop(g);
    g.act(0).decline();
    expect(onField(g, 'Sol Ring')).toBe(0);
    expect(g.find({ name: 'Sol Ring', zone: 'hand' })).toHaveLength(1);
  });

  test('a card above the mana value of the permanent is never offered', () => {
    const g = base(false, ['Grizzly Bears', 'Serra Angel']);
    g.act(0).cast('Grizzly Bears', { pay: true });
    resolveTop(g);
    resolveTop(g);
    // Nothing in the hand has mana value 2 or less: nothing to choose, so nothing is asked.
    expect(g.state.pending?.kind).not.toBe('chooseCards');
    expect(onField(g, 'Serra Angel')).toBe(0);
  });

  test('any other permanent that enters triggers it, a land too: its mana value is 0', () => {
    const g = base(false, ['Plains', 'Plains', 'Sol Ring']);
    g.act(0).playLand('Plains[1]');
    expect(g.state.stack).toHaveLength(1);
    resolveTop(g);
    g.act(0).accept();
    // Only one card of the hand has mana value 0 (the land played came out of it), so there is nothing to choose between: it is put.
    expect(g.state.pending?.kind).toBe('priority');
    expect(g.state.stack).toHaveLength(0);
    expect(g.find({ name: 'Plains', zone: 'battlefield', seat: 0 })).toHaveLength(4);
    expect(g.find({ name: 'Sol Ring', zone: 'hand', seat: 0 })).toHaveLength(1);
  });

  test('two tokens that enter together trigger it once each, and the cards put there trigger nothing', () => {
    const g = base(false, ['SYNTHETIC Parsed Soldier Maker', 'Plains', 'Plains', 'Sol Ring']);
    g.act(0).cast('SYNTHETIC Parsed Soldier Maker', { pay: true });
    resolveTop(g);
    expect(g.find({ name: 'Soldier', zone: 'battlefield', seat: 0 })).toHaveLength(2);
    // CR 603.3b: one trigger for each token, put on the stack in the order the controller gives.
    expect(orderedTriggers(g)).toBe(2);
    expect(g.state.stack).toHaveLength(2);
    resolveTop(g);
    g.act(0).accept();
    expect(offered(g, ALL)).toEqual(['Plains']);
    g.act(0).chooseCards('Plains[1]');
    expect(g.state.stack).toHaveLength(1);
    resolveTop(g);
    g.act(0).accept();
    expect(g.state.stack).toHaveLength(0);
    expect(g.find({ name: 'Plains', zone: 'battlefield', seat: 0 })).toHaveLength(4);
  });

  test('two copies are two abilities: what one put triggers the other, and not itself', () => {
    const g = base(true, ['Grizzly Bears', 'Sol Ring', 'Plains']);
    g.act(0).cast('Grizzly Bears', { pay: true });
    resolveTop(g);
    expect(orderedTriggers(g)).toBe(2);
    expect(g.state.stack).toHaveLength(2);
    // The first trigger to resolve puts the Ring; the permanent it put triggers the other Kodama only: the other trigger for the Bears waits below it.
    resolveTop(g);
    g.act(0).accept();
    g.act(0).chooseCards('Sol Ring');
    expect(g.state.stack).toHaveLength(2);
    // Both triggers now waiting belong to the Kodama that did not put the Ring: the one that did is not triggered by it, the other one is (and still has its own for the Bears).
    const kodamas = [KODAMA, OTHER].map(
      (n) => g.find({ name: n, zone: 'battlefield', seat: 0 })[0]?.id,
    );
    const [ring] = g.find({ name: 'Sol Ring', zone: 'battlefield', seat: 0 });
    const sources = g.state.stack.map((id) => g.state.objects[id]?.stack?.source);
    expect(new Set(sources).size).toBe(1);
    expect(kodamas).toContain(ring?.putWith);
    expect(kodamas).toContain(sources[0]);
    expect(ring?.putWith).not.toBe(sources[0]);
    g.expect.invariants();
  });

  test('an {X} in the cost of the permanent counts as 0 (CR 202.3e), and in a card of the hand too', () => {
    const g = base(false, [xBeast.name, 'Sol Ring', 'Grizzly Bears', xCard.name]);
    g.act(0).cast(xBeast.name, { x: 3, pay: true });
    resolveTop(g);
    resolveTop(g);
    g.act(0).accept();
    expect(offered(g, ALL)).toEqual(['Sol Ring', xCard.name]);
  });
});
