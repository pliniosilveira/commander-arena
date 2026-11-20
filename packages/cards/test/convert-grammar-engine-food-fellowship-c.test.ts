// The Food and Fellowship deck, group C (Tales of Middle-earth Commander): the REAL cards of the golden corpus (real Oracle text, `fixtures/corpus/golden.jsonl`) read through the grammar only,
// defined in an engine scenario and played through applyAction: Feasting Hobbit (Devour Food 3; creatures with lesser power can't block it), Landroval, Horizon Witness, Frodo,
// Adventurous Hobbit, Call for Unity (Revolt) and Murmuring Bosk (reveal a Treefolk). Cards that are not real (a Food, a Treefolk, a life gain) are SYNTHETIC.
// Rulings used (Scryfall, read from the owner's file): the comparison of power is made only as blockers are declared (Feasting Hobbit); a permanent that left the battlefield for any
// reason, a token included, satisfies revolt, and it counts once however many left (Call for Unity); the Ring tempts once, however much life was gained (Frodo).
import { readFileSync } from 'node:fs';
import {
  type Action,
  applyAction,
  type CardDefinition,
  getLegalActions,
} from '@commander-arena/engine';
import { type ScenarioGame, scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import {
  fromGoldenCard,
  type GoldenCard,
  importCard,
  parseGolden,
  type StoredFace,
} from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const cards: readonly GoldenCard[] = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = cards.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

/** A SYNTHETIC card read through the same grammar. */
function synthetic(face: Partial<StoredFace> & { name: string }): CardDefinition {
  const imported = importCard(syntheticCard(face), undefined, NO_OVERRIDES);
  expect(imported.support.status, face.name).toBe('supported');
  return imported.definition;
}

const HOBBIT = real('Feasting Hobbit');
const LANDROVAL = real('Landroval, Horizon Witness');
const FRODO = real('Frodo, Adventurous Hobbit');
const UNITY = real('Call for Unity');
const BOSK = real('Murmuring Bosk');
const SNACK = synthetic({
  name: 'SYNTHETIC Snack',
  manaCost: '{1}',
  typeLine: 'Artifact — Food',
  colors: [],
});
const ENT = synthetic({
  name: 'SYNTHETIC Ent',
  manaCost: '{2}{G}',
  typeLine: 'Creature — Treefolk',
  power: '3',
  toughness: '3',
  colors: ['G'],
});
const SALVE = synthetic({
  name: 'SYNTHETIC Salve',
  manaCost: '{W}',
  typeLine: 'Sorcery',
  oracleText: 'You gain 3 life.',
  colors: ['W'],
});

const FILLER = Array.from({ length: 12 }, () => 'Island');
const BEARS = 'Grizzly Bears'; // 2/2
const GOBLIN = 'Raging Goblin'; // 1/1
const SPIDER = 'Giant Spider'; // 2/4 reach
const ANGEL = 'Serra Angel'; // 4/4 flying

type Builder = ReturnType<typeof scenario>;
const on = (...defs: CardDefinition[]): Builder => {
  const b = scenario().seat(0);
  for (const d of defs) b.define(d);
  return b;
};
const both = (b: Builder, theirs: (o: Builder) => Builder = (o) => o): Builder =>
  theirs(
    b
      .library(...FILLER)
      .seat(1)
      .library(...FILLER),
  ).seat(0);

describe('Murmuring Bosk (as it enters, you may reveal a Treefolk card from your hand; if you don’t, it enters tapped)', () => {
  const game = (hand: string[]) =>
    both(on(BOSK, ENT).hand(BOSK.name, ...hand))
      .at('precombatMain', { active: 0, turn: 1 })
      .build();

  test('revealing a Treefolk: the land enters untapped and the card stays in the hand (CR 701.20a)', () => {
    const g = game([ENT.name]);
    g.act(0).playLand(BOSK.name);
    g.act(0).accept();
    g.expect.tapped(BOSK.name, false);
    g.expect.zone(ENT.name, 'hand', { seat: 0 });
  });

  test('declining: it enters tapped', () => {
    const g = game([ENT.name]);
    g.act(0).playLand(BOSK.name);
    g.act(0).decline();
    g.expect.tapped(BOSK.name, true);
  });

  test('with no Treefolk card in hand nothing is asked and it enters tapped', () => {
    const g = game([BEARS]);
    g.act(0).playLand(BOSK.name);
    g.expect.tapped(BOSK.name, true);
  });

  test('it is a Forest: it taps for {G}; its other ability makes {W} or {B} and deals 1 damage to you', () => {
    const g = both(on(BOSK).battlefield(BOSK.name))
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).tapForMana(BOSK.name, { ability: 2, color: 'W' });
    g.expect.pool(0, { W: 1 });
    g.expect.life(0, 39);
  });
});

describe('Call for Unity (Revolt: at the beginning of your end step, if a permanent left the battlefield under your control this turn, put a unity counter; creatures you control get +1/+1 for each)', () => {
  const UNSUMMON = 'Unsummon';
  const game = (extra: (b: Builder) => Builder = (b) => b) =>
    both(
      extra(
        on(UNITY)
          .life(20)
          .hand(UNSUMMON, { count: 2 })
          .battlefield(UNITY.name)
          .battlefield('Island', { count: 3 })
          .battlefield(BEARS, GOBLIN),
      ),
    )
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const unity = (g: ScenarioGame) => g.object(UNITY.name).counters.unity ?? 0;

  test('with no unity counter it gives nothing', () => {
    const g = game();
    g.expect.pt(BEARS, 2, 2);
  });

  test('a permanent of yours left the battlefield (bounced, not died): a unity counter at the end step, and +1/+1 for each (CR 400.7)', () => {
    const g = game();
    g.act(0).cast({ name: UNSUMMON, nth: 0 }, { targets: [GOBLIN], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    expect(unity(g)).toBe(1);
    g.expect.pt(BEARS, 3, 3);
  });

  test('revolt counts once however many left: two permanents leaving still put one counter', () => {
    const g = game();
    g.act(0).cast({ name: UNSUMMON, nth: 0 }, { targets: [GOBLIN], pay: true });
    g.passAll();
    g.act(0).cast({ name: UNSUMMON, nth: 0 }, { targets: [BEARS], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    expect(unity(g)).toBe(1);
  });

  test('nothing left the battlefield: no counter', () => {
    const g = game();
    g.advanceTo('end');
    g.passAll();
    expect(unity(g)).toBe(0);
    g.expect.pt(BEARS, 2, 2);
  });

  test('a permanent an opponent controlled left: it does not count', () => {
    const g = both(
      on(UNITY)
        .hand(UNSUMMON)
        .battlefield(UNITY.name)
        .battlefield('Island', { count: 3 })
        .battlefield(BEARS),
      (o) => o.battlefield(GOBLIN),
    )
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(UNSUMMON, { targets: [{ name: GOBLIN, seat: 1 }], pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    expect(unity(g)).toBe(0);
  });

  test('the bonus follows the counters on the enchantment, not on the creature: two counters, +2/+2', () => {
    const g = both(
      on(UNITY)
        .battlefield(UNITY.name, { counters: { unity: 2 } })
        .battlefield(BEARS, { counters: { unity: 5 } }),
    )
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.expect.pt(BEARS, 4, 4);
  });
});

describe('Landroval, Horizon Witness (flying; whenever two or more creatures you control attack a player, target attacking creature without flying gains flying until end of turn)', () => {
  const attack = (attackers: string[], theirs: (o: Builder) => Builder = (o) => o) => {
    const g = both(on(LANDROVAL).battlefield(LANDROVAL.name, ...attackers), theirs)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack(attackers);
    return g;
  };

  test('two attackers: the trigger targets an attacker without flying, which flies until end of turn', () => {
    const g = attack([BEARS, GOBLIN]);
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.expect.derived(BEARS, { keywords: ['flying'] });
    // A creature with reach can block a flier; one without it cannot.
  });

  test('the creature given flying can no longer be blocked by a creature without flying or reach', () => {
    const g = attack([BEARS, GOBLIN], (o) => o.battlefield(SPIDER, 'Wall of Stone'));
    g.act(0).chooseTargets(BEARS);
    g.passAll();
    g.advanceTo('declareBlockers');
    const blocked = (blocker: string): boolean =>
      applyAction(g.state, 1, {
        kind: 'declareBlockers',
        blocks: [{ blocker: g.id(blocker), attacker: g.id(BEARS) }],
      }).ok;
    expect(blocked(SPIDER)).toBe(true);
    expect(blocked('Wall of Stone')).toBe(false);
  });

  test('one attacker alone does not trigger it', () => {
    const g = attack([BEARS]);
    expect(g.state.stack).toHaveLength(0);
    g.expect.derived(BEARS, { keywords: [] });
  });

  test('Landroval itself attacking with one other creature counts: two creatures attack', () => {
    const g = both(on(LANDROVAL).battlefield(LANDROVAL.name, BEARS))
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.advanceTo('declareAttackers');
    g.act(0).attack([LANDROVAL.name, BEARS]);
    g.passAll();
    g.expect.derived(BEARS, { keywords: ['flying'] });
  });
});

describe('Frodo, Adventurous Hobbit (vigilance; whenever he attacks, if you gained 3 or more life this turn, the Ring tempts you; then if he is your Ring-bearer and the Ring has tempted you two or more times, draw a card)', () => {
  const game = (level: number, extra: (b: Builder) => Builder = (b) => b) =>
    both(
      extra(
        on(FRODO, SALVE).ring(level).hand(SALVE.name).battlefield('Plains').battlefield(FRODO.name),
      ),
    )
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
  const gainThenAttack = (g: ScenarioGame) => {
    g.act(0).cast(SALVE.name, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(FRODO.name);
    g.passAll();
    return g;
  };

  test('3 life gained, the second tempt, Frodo the Ring-bearer: the Ring tempts you and you draw a card', () => {
    const g = gainThenAttack(game(1));
    g.expect.ringLevel(0, 2);
    g.expect.ringBearer(0, FRODO.name);
    g.expect.handSize(0, 1);
    g.expect.life(0, 43);
  });

  test('the first tempt only: the Ring tempts you but nothing is drawn', () => {
    const g = gainThenAttack(game(0));
    g.expect.ringLevel(0, 1);
    g.expect.handSize(0, 0);
  });

  test('another creature is the Ring-bearer: the Ring tempts you, no card is drawn', () => {
    const g = game(1, (b) => b.battlefield(BEARS));
    g.act(0).cast(SALVE.name, { pay: true });
    g.passAll();
    g.advanceTo('declareAttackers');
    g.act(0).attack(FRODO.name);
    g.passAll();
    g.act(0).choosePermanents(BEARS);
    g.passAll();
    g.expect.ringLevel(0, 2);
    g.expect.ringBearer(0, BEARS);
    g.expect.handSize(0, 0);
  });

  test('less than 3 life gained: the ability does not trigger at all', () => {
    const g = game(1);
    g.advanceTo('declareAttackers');
    g.act(0).attack(FRODO.name);
    g.passAll();
    g.expect.ringLevel(0, 1);
    g.expect.handSize(0, 1); // the unused Salve: nothing was drawn
  });
});

describe('Feasting Hobbit (Devour Food 3; creatures with power less than this creature’s power can’t block it)', () => {
  const cast = (extra: (b: Builder) => Builder) => {
    const g = both(extra(on(HOBBIT, SNACK).hand(HOBBIT.name).battlefield('Forest', { count: 2 })))
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(HOBBIT.name, { pay: true });
    g.passAll();
    return g;
  };

  test('the question lists the Foods you control, not the creatures; none is a legal answer', () => {
    const g = cast((b) => b.battlefield(SNACK.name, { count: 2 }).battlefield(BEARS));
    const d = g.state.pending;
    if (d?.kind !== 'choosePermanent') throw new Error(`pending is ${d?.kind}`);
    expect(d).toMatchObject({ purpose: 'devour', min: 0, max: 2, devourQuality: 'Food' });
    expect(d.legal).toHaveLength(2);
    expect(d.legal).not.toContain(g.id(BEARS));
  });

  test('two Foods sacrificed: it enters with 3 +1/+1 counters for each, an 8/8, and the Foods are gone (CR 702.82a)', () => {
    const g = cast((b) => b.battlefield(SNACK.name, { count: 2 }).battlefield(BEARS));
    g.act(0).choosePermanents({ name: SNACK.name, nth: 0 }, { name: SNACK.name, nth: 1 });
    g.expect.counters(HOBBIT.name, { '+1/+1': 6 });
    g.expect.pt(HOBBIT.name, 8, 8);
    g.expect.noObject(SNACK.name, { zone: 'battlefield' });
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });

  test('none sacrificed: a plain 2/2', () => {
    const g = cast((b) => b.battlefield(SNACK.name));
    g.act(0).choosePermanents();
    g.expect.pt(HOBBIT.name, 2, 2);
    g.expect.zone(SNACK.name, 'battlefield', { seat: 0 });
  });

  test('without a Food nothing is asked, even with creatures to sacrifice', () => {
    const g = cast((b) => b.battlefield(BEARS));
    expect(g.state.pending?.kind).not.toBe('choosePermanent');
    g.expect.pt(HOBBIT.name, 2, 2);
  });

  describe('blocking (CR 509.1b: read as blockers are declared)', () => {
    const canBlock = (g: ScenarioGame, blocker: string, attacker: string): boolean => {
      const action: Action = {
        kind: 'declareBlockers',
        blocks: [{ blocker: g.id(blocker), attacker: g.id(attacker) }],
      };
      const accepted = applyAction(g.state, 1, action).ok;
      expect(
        getLegalActions(g.state, 1).some((a) => JSON.stringify(a) === JSON.stringify(action)),
      ).toBe(accepted);
      return accepted;
    };
    const attacked = (hobbit: { counters?: Record<string, number> } = {}) => {
      const g = both(on(HOBBIT).battlefield(HOBBIT.name, hobbit), (o) =>
        o.battlefield(GOBLIN, BEARS, ANGEL),
      )
        .at('precombatMain', { active: 0, turn: 1 })
        .build();
      g.advanceTo('declareAttackers');
      g.act(0).attack([HOBBIT.name]);
      g.advanceTo('declareBlockers');
      return g;
    };

    test('a creature with less power than the Hobbit can’t block it; one with as much or more can', () => {
      const g = attacked();
      expect(canBlock(g, GOBLIN, HOBBIT.name)).toBe(false);
      expect(canBlock(g, `${BEARS}`, HOBBIT.name)).toBe(true);
      expect(canBlock(g, ANGEL, HOBBIT.name)).toBe(true);
    });

    test('power as it is now: counters on the Hobbit raise the bar', () => {
      const g = attacked({ counters: { '+1/+1': 1 } });
      expect(canBlock(g, BEARS, HOBBIT.name)).toBe(false);
      expect(canBlock(g, ANGEL, HOBBIT.name)).toBe(true);
    });
  });
});
