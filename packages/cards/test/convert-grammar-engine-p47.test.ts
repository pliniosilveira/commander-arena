// Parsed text is only worth something if the engine runs it as written (stage P47). These tests import the REAL planeswalkers and cards of the owner's golden
// corpus (real Oracle text, `fixtures/corpus/golden.jsonl`) through the grammar only, define them in an engine scenario and play them through applyAction:
// Garruk Wildspeaker, Jace Beleren, Elspeth, Sun's Champion, Gideon, Ally of Zendikar, Vraska, Relic Seeker, Protege's Awakening, Keeper of the Quiet Hour
// and Lavalanche (ENGINE_VERSION 48, D-200 to D-202). Real data, so the names are the cards' own. No ruling of any card could be read (Scryfall is not
// reachable from the sandbox): nothing below rests on one.
import { readFileSync } from 'node:fs';
import { type CardDefinition, getView } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, type GoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';

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

const GARRUK = real('Garruk Wildspeaker');
const JACE_B = real('Jace Beleren');
const ELSPETH = real("Elspeth, Sun's Champion");
const GIDEON = real('Gideon, Ally of Zendikar');
const VRASKA = real('Vraska, Relic Seeker');
const AWAKENING = real("Protege's Awakening");
const KEEPER = real('Keeper of the Quiet Hour');
const LAVALANCHE = real('Lavalanche');
const FILLER = Array.from({ length: 30 }, () => 'Island');
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const SPIDER = 'Giant Spider';

const on = (...defs: CardDefinition[]) => {
  const b = scenario().seat(0);
  for (const d of defs) b.define(d);
  return b
    .library(...FILLER)
    .seat(1)
    .library(...FILLER);
};

describe('Garruk Wildspeaker (+1: Untap two target lands. -1: Create a 3/3 green Beast creature token. -4: Creatures you control get +3/+3 and gain trample until end of turn.)', () => {
  test('enters with 3 loyalty; +1 untaps two lands; -1 makes a Beast', () => {
    const g = on(GARRUK).seat(0).battlefield(GARRUK.name, BEARS, 'Forest', 'Forest').build();
    g.expect.counters(GARRUK.name, { loyalty: 3 });
    g.act(0).tapForMana({ name: 'Forest', nth: 0 });
    g.act(0).tapForMana({ name: 'Forest', nth: 1 });
    g.act(0).activate(GARRUK.name, {
      ability: 0,
      targets: [
        { name: 'Forest', nth: 0 },
        { name: 'Forest', nth: 1 },
      ],
    });
    g.expect.counters(GARRUK.name, { loyalty: 4 });
    g.passAll();
    g.expect.tapped({ name: 'Forest', nth: 0 }, false);
    g.expect.tapped({ name: 'Forest', nth: 1 }, false);

    const beast = on(GARRUK).seat(0).battlefield(GARRUK.name).build();
    beast.act(0).activate(GARRUK.name, { ability: 1 });
    beast.passAll();
    beast.expect.counters(GARRUK.name, { loyalty: 2 });
    const token = getView(beast.state, 0).battlefield.find((o) => o.isToken);
    expect(token).toMatchObject({ name: 'Beast', power: 3, toughness: 3, colors: ['G'] });
  });

  test('-4 (at 5 loyalty) gives the creatures +3/+3 and trample until the end of the turn; with 3 loyalty it is not offered (CR 606.6)', () => {
    const g = on(GARRUK)
      .seat(0)
      .battlefield(GARRUK.name, { counters: { loyalty: 5 } })
      .battlefield(BEARS)
      .build();
    g.act(0).activate(GARRUK.name, { ability: 2 });
    g.passAll();
    g.expect.pt(BEARS, 5, 5);
    expect(g.view(0).battlefield.find((o) => o.name === BEARS)?.keywords).toContain('trample');
    g.expect.counters(GARRUK.name, { loyalty: 1 });
    const low = on(GARRUK).seat(0).battlefield(GARRUK.name).build();
    low.expect.illegal(0, { activate: GARRUK.name, ability: 2 });
  });
});

describe('Jace Beleren (+2: Each player draws a card. -1: Target player draws a card. -10: Target player mills twenty cards.)', () => {
  test('+2: each player draws; -1: the target player draws', () => {
    const g = on(JACE_B).seat(0).battlefield(JACE_B.name).build();
    g.act(0).activate(JACE_B.name, { ability: 0 });
    g.expect.counters(JACE_B.name, { loyalty: 5 });
    g.passAll();
    g.expect.handSize(0, 1);
    g.expect.handSize(1, 1);

    const h = on(JACE_B).seat(0).battlefield(JACE_B.name).build();
    h.act(0).activate(JACE_B.name, { ability: 1, targets: [{ player: 1 }] });
    h.expect.counters(JACE_B.name, { loyalty: 2 });
    h.passAll();
    h.expect.handSize(1, 1);
    h.expect.handSize(0, 0);
  });
});

describe("Elspeth, Sun's Champion (+1: three 1/1 Soldiers. -3: Destroy all creatures with power 4 or greater. -7: an emblem)", () => {
  test('+1 makes three 1/1 white Soldier tokens', () => {
    const g = on(ELSPETH).seat(0).battlefield(ELSPETH.name).build();
    g.act(0).activate(ELSPETH.name, { ability: 0 });
    g.passAll();
    const soldiers = getView(g.state, 0).battlefield.filter((o) => o.name === 'Soldier');
    expect(soldiers).toHaveLength(3);
    expect(soldiers[0]).toMatchObject({ power: 1, toughness: 1, colors: ['W'], isToken: true });
    g.expect.counters(ELSPETH.name, { loyalty: 5 });
  });

  test("-3 destroys every creature with power 4 or greater, its controller's and the opponent's, and no smaller one", () => {
    const g = on(ELSPETH)
      .seat(0)
      .battlefield(ELSPETH.name, ANGEL, BEARS)
      .seat(1)
      .battlefield('Serra Angel', SPIDER, 'SYNTHETIC Vanilla 5/5')
      .build();
    g.act(0).activate(ELSPETH.name, { ability: 1 });
    g.passAll();
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
    g.expect.zone(SPIDER, 'battlefield', { seat: 1 });
    g.expect.zone('SYNTHETIC Vanilla 5/5', 'graveyard', { seat: 1 });
    g.expect.counters(ELSPETH.name, { loyalty: 1 });
  });

  test('-7 (at 7 loyalty): the emblem gives the creatures of its player +2/+2 and flying for the rest of the game', () => {
    const h = on(ELSPETH)
      .seat(0)
      .battlefield(BEARS)
      .battlefield(ELSPETH.name, { counters: { loyalty: 7 } })
      .seat(1)
      .battlefield(SPIDER)
      .build();
    h.act(0).activate(ELSPETH.name, { ability: 2 });
    h.passAll();
    h.expect.zone(ELSPETH.name, 'graveyard', { seat: 0 });
    h.expect.pt(BEARS, 4, 4);
    expect(h.view(0).battlefield.find((o) => o.name === BEARS)?.keywords).toContain('flying');
    h.expect.pt(SPIDER, 2, 4);
    const emblem = h.view(0).seats[0]?.command.find((o) => o.emblem === true);
    expect(emblem?.oracleText).toBe('Creatures you control get +2/+2 and have flying.');
  });
});

describe('Gideon, Ally of Zendikar (+1: becomes a 5/5 Human Soldier Ally with indestructible that is still a planeswalker; 0: a 2/2 Knight Ally; -4: an emblem)', () => {
  test('+1: a 5/5 indestructible creature that is still a planeswalker, and damage to him is prevented', () => {
    const g = on(GIDEON)
      .seat(0)
      .battlefield(GIDEON.name)
      .seat(1)
      .hand('Lightning Bolt')
      .battlefield('Mountain')
      .build();
    g.act(0).activate(GIDEON.name, { ability: 0 });
    g.passAll();
    const me = g.view(0).battlefield.find((o) => o.name === GIDEON.name);
    expect(me?.types).toEqual(['planeswalker', 'creature']);
    expect(me?.subtypes).toEqual(['Gideon', 'Human', 'Soldier', 'Ally']);
    expect(me?.power).toBe(5);
    expect(me?.toughness).toBe(5);
    expect(me?.keywords).toContain('indestructible');
    g.expect.counters(GIDEON.name, { loyalty: 5 });
    // A Lightning Bolt at him: all the damage is prevented, the loyalty stays.
    g.pass(0);
    g.act(1).cast('Lightning Bolt', { targets: [GIDEON.name], pay: true });
    g.passAll();
    g.expect.counters(GIDEON.name, { loyalty: 5 });
    g.expect.damage(GIDEON.name, 0);
  });

  test('0: a 2/2 white Knight Ally token; -4: the emblem gives +1/+1', () => {
    const g = on(GIDEON).seat(0).battlefield(GIDEON.name).build();
    g.act(0).activate(GIDEON.name, { ability: 1 });
    g.passAll();
    const knight = getView(g.state, 0).battlefield.find((o) => o.isToken);
    expect(knight).toMatchObject({ name: 'Knight Ally', power: 2, toughness: 2, colors: ['W'] });
    g.expect.counters(GIDEON.name, { loyalty: 4 });
    // The ultimate with the 4 loyalty the walker has: the emblem, and the Knight is a 3/3 with it.
    const h = on(GIDEON).seat(0).battlefield(GIDEON.name, BEARS).build();
    h.act(0).activate(GIDEON.name, { ability: 2 });
    h.passAll();
    h.expect.pt(BEARS, 3, 3);
    h.expect.zone(GIDEON.name, 'graveyard', { seat: 0 });
  });
});

describe("Vraska, Relic Seeker (+2: a 2/2 black Pirate with menace. -3: Destroy target artifact, creature, or enchantment. Create a Treasure token. -10: Target player's life total becomes 1.)", () => {
  test('+2: a Pirate with menace', () => {
    const g = on(VRASKA).seat(0).battlefield(VRASKA.name).build();
    g.act(0).activate(VRASKA.name, { ability: 0 });
    g.passAll();
    const pirate = getView(g.state, 0).battlefield.find((o) => o.isToken);
    expect(pirate).toMatchObject({ name: 'Pirate', power: 2, toughness: 2, colors: ['B'] });
    expect(pirate?.keywords).toContain('menace');
  });

  test('-3: destroys the target and makes a Treasure', () => {
    const g = on(VRASKA).seat(0).battlefield(VRASKA.name).seat(1).battlefield(ANGEL).build();
    g.act(0).activate(VRASKA.name, { ability: 1, targets: [{ name: ANGEL, seat: 1 }] });
    g.passAll();
    g.expect.zone(ANGEL, 'graveyard', { seat: 1 });
    expect(getView(g.state, 0).battlefield.some((o) => o.name === 'Treasure')).toBe(true);
    g.expect.counters(VRASKA.name, { loyalty: 3 });
  });

  test("-10: the target player's life total becomes 1", () => {
    const g = on(VRASKA)
      .seat(0)
      .battlefield(VRASKA.name, { counters: { loyalty: 10 } })
      .build();
    g.act(0).activate(VRASKA.name, { ability: 2, targets: [{ player: 1 }] });
    g.passAll();
    g.expect.life(1, 1);
    g.expect.zone(VRASKA.name, 'graveyard', { seat: 0 });
  });
});

describe("Protege's Awakening and Keeper of the Quiet Hour: Empower Jace", () => {
  test("Protege's Awakening: a blue Jace planeswalker token with six loyalty counters, then a card", () => {
    const g = on(AWAKENING)
      .seat(0)
      .hand(AWAKENING.name)
      .battlefield('Island', 'Island', 'Island', 'Island')
      .build();
    g.act(0).cast(AWAKENING.name, { pay: true });
    g.passAll();
    const jace = getView(g.state, 0).battlefield.find((o) => o.name === 'Jace');
    expect(jace).toMatchObject({
      isToken: true,
      types: ['planeswalker'],
      subtypes: ['Jace'],
      colors: ['U'],
    });
    expect(jace?.counters.loyalty).toBe(6);
    g.expect.handSize(0, 1);
  });

  test('Keeper of the Quiet Hour: two loyalty counters when it enters, on the same token', () => {
    const g = on(KEEPER)
      .seat(0)
      .hand(KEEPER.name)
      .battlefield('Island', 'Island', 'Island')
      .build();
    g.act(0).cast(KEEPER.name, { pay: true });
    g.passAll();
    const jace = getView(g.state, 0).battlefield.find((o) => o.name === 'Jace');
    expect(jace?.counters.loyalty).toBe(2);
    // [-1]: Surveil 1 (the Jace token's own ability).
    g.act(0).activate('Jace', { ability: 0 });
    g.expect.counters('Jace', { loyalty: 1 });
  });
});

describe("Lavalanche (X damage to target player or planeswalker and each creature that player or that planeswalker's controller controls)", () => {
  test('at a planeswalker: the loyalty goes down and the creatures of its controller are dealt the damage', () => {
    const g = on(LAVALANCHE)
      .seat(0)
      .hand(LAVALANCHE.name)
      .battlefield('Swamp', 'Mountain', 'Forest', 'Island', 'Island', BEARS)
      .seat(1)
      .battlefield(JACE_B.name, SPIDER, BEARS)
      .define(JACE_B)
      .build();
    g.act(0).cast(LAVALANCHE.name, { x: 2, targets: [{ name: JACE_B.name, seat: 1 }], pay: true });
    g.passAll();
    g.expect.counters(JACE_B.name, { loyalty: 1 });
    g.expect.life(1, 40);
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
    g.expect.damage(SPIDER, 2);
    g.expect.zone(BEARS, 'battlefield', { seat: 0 });
  });
});
