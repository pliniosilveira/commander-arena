// Food and Fellowship, group A (life gain): the REAL Oracle text of the golden corpus goes through the grammar with no override and is played through applyAction, so the nodes the
// parser writes are what the engine runs. Stand-ins that gain life are SYNTHETIC (named so). Pins: CR 119.3 (life gain), CR 111.2 (tokens), CR 122.1 (counters), CR 608.2c.
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parsed, parseOnly, spellCard } from './convert-grammar-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

/** The real card of the golden corpus, imported through the grammar only; it must read as supported. */
function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const FILLER = Array.from({ length: 10 }, () => 'Plains');
/** SYNTHETIC: gains the controller 3 life. */
const SIP = parsed('Synthetic Sip', 'Instant', 'You gain 3 life.', { manaCost: '{W}' });
/** SYNTHETIC: gains the controller 2 life. */
const TWO = parsed('Synthetic Two', 'Instant', 'You gain 2 life.', { manaCost: '{W}' });
/** SYNTHETIC: loses the controller 3 life. */
const NICK = parsed('Synthetic Nick', 'Instant', 'You lose 3 life.', { manaCost: '{B}' });

describe('Assemble the Entmoot', () => {
  const entmoot = real('Assemble the Entmoot');
  const start = (hand: readonly string[]) =>
    scenario()
      .define(entmoot)
      .define(SIP)
      .define(NICK)
      .seat(0)
      .battlefield(entmoot.name)
      .battlefield('Plains', 'Swamp', 'Grizzly Bears')
      .hand(...hand)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  const treefolk = (g: ReturnType<typeof start>) =>
    g.state.battlefield
      .map((id) => g.state.objects[id])
      .filter((o) => o?.token?.characteristics.name === 'Treefolk');

  test('the card is valid', () => {
    expect(validateCard(entmoot)).toEqual([]);
  });

  test('sacrificed after gaining 3 life: three tapped 3/3 Treefolk, each with a reach counter', () => {
    const g = start([SIP.name]);
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.expect.life(0, 43);
    g.act(0).activate(entmoot.name);
    g.passAll();
    g.expect.zone(entmoot.name, 'graveyard', { seat: 0 });
    const tokens = treefolk(g);
    expect(tokens).toHaveLength(3);
    for (const t of tokens) {
      expect(t?.tapped).toBe(true);
      expect(t?.counters).toEqual({ reach: 1 });
      expect(t?.token?.characteristics.power).toBe(3);
      expect(t?.token?.characteristics.toughness).toBe(3);
    }
    g.expect.invariants();
  });

  test('life lost the same turn does not reduce the count (ruling 2023-06-16)', () => {
    const g = start([SIP.name, NICK.name]);
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.act(0).cast(NICK.name).pay();
    g.passAll();
    g.expect.life(0, 40);
    g.act(0).activate(entmoot.name);
    g.passAll();
    const tokens = treefolk(g);
    expect(tokens).toHaveLength(3);
    expect(tokens.every((t) => t?.token?.characteristics.power === 3)).toBe(true);
  });

  test('with no life gained, the tokens are 0/0 and die; creatures you control have reach', () => {
    const g = start([]);
    g.expect.derived('Grizzly Bears', { keywords: ['reach'] });
    g.act(0).activate(entmoot.name);
    g.passAll();
    expect(treefolk(g)).toHaveLength(0);
    g.expect.invariants();
  });
});

describe('Field-Tested Frying Pan', () => {
  const pan = real('Field-Tested Frying Pan');
  const start = () =>
    scenario()
      .define(pan)
      .define(SIP)
      .seat(0)
      .hand(pan.name, SIP.name, SIP.name)
      .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Plains', 'Grizzly Bears')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
  const permanents = (g: ReturnType<typeof start>, name: string) =>
    g.state.battlefield
      .map((id) => g.state.objects[id])
      .filter((o) => o?.token?.characteristics.name === name);

  test('the card is valid', () => {
    expect(validateCard(pan)).toEqual([]);
  });

  test('enters with a Food and an attached 1/1 Halfling that grows by the life gained', () => {
    const g = start();
    g.act(0).cast(pan.name).pay();
    g.passAll();
    expect(permanents(g, 'Food')).toHaveLength(1);
    expect(permanents(g, 'Halfling')).toHaveLength(1);
    g.expect.attached(pan.name, 'Halfling');
    g.expect.pt('Halfling', 1, 1);
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.expect.life(0, 43);
    g.expect.pt('Halfling', 4, 4);
    g.expect.pt('Grizzly Bears', 2, 2);
    g.expect.invariants();
  });

  test('each gain is its own trigger with its own amount (CR 603.2c)', () => {
    const g = start();
    g.act(0).cast(pan.name).pay();
    g.passAll();
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.expect.pt('Halfling', 7, 7);
  });

  test('the bonus lasts until end of turn only', () => {
    const g = start();
    g.act(0).cast(pan.name).pay();
    g.passAll();
    g.act(0).cast({ name: SIP.name, nth: 0 }).pay();
    g.passAll();
    g.expect.pt('Halfling', 4, 4);
    g.advanceTo('upkeep', { turn: 'next' });
    g.expect.pt('Halfling', 1, 1);
  });
});

describe('Prize Pig', () => {
  const pig = real('Prize Pig');
  const start = (options: { tapped: boolean }) =>
    scenario()
      .define(pig)
      .define(SIP)
      .define(TWO)
      .seat(0)
      .battlefield(pig.name, { tapped: options.tapped })
      .battlefield('Plains', 'Plains', 'Plains')
      .hand(SIP.name, TWO.name)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(pig)).toEqual([]);
  });

  test('two life gains below three counters leave the counters and the tap', () => {
    const g = start({ tapped: true });
    g.act(0).cast(TWO.name).pay();
    g.passAll();
    g.expect.counters(pig.name, { ribbon: 2 });
    g.expect.tapped(pig.name, true);
  });

  test('three counters are removed and the Pig untaps (the counters of every gain add up)', () => {
    const g = start({ tapped: true });
    g.act(0).cast(TWO.name).pay();
    g.passAll();
    g.act(0).cast(SIP.name).pay();
    g.passAll();
    // 2 + 3 = 5 ribbon counters: three or more, so all of them come off.
    g.expect.counters(pig.name, {});
    g.expect.tapped(pig.name, false);
    g.expect.invariants();
  });

  test('already untapped, the counters still come off (ruling 2023-06-16)', () => {
    const g = start({ tapped: false });
    g.act(0).cast(SIP.name).pay();
    g.passAll();
    g.expect.counters(pig.name, {});
    g.expect.tapped(pig.name, false);
  });

  test('the Pig taps for one mana of any color', () => {
    const g = start({ tapped: false });
    g.act(0).tapForMana(pig.name, { color: 'G' });
    g.expect.tapped(pig.name, true);
    g.expect.pool(0, 'G');
  });
});

describe('Crypt Incursion', () => {
  const incursion = real('Crypt Incursion');
  const start = () =>
    scenario()
      .define(incursion)
      .seat(0)
      .hand(incursion.name)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .graveyard('Grizzly Bears', { label: 'mineBears' })
      .library(...FILLER)
      .seat(1)
      .graveyard('Grizzly Bears', { label: 'bears1' })
      .graveyard('Grizzly Bears', { label: 'bears2' })
      .graveyard('Island', { label: 'island' })
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(incursion)).toEqual([]);
  });

  test('exiles only the creature cards of the chosen graveyard and gains 3 life for each', () => {
    const g = start();
    g.act(0).cast(incursion.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.object('bears1').zone).toBe('exile');
    expect(g.object('bears2').zone).toBe('exile');
    expect(g.object('island').zone).toBe('graveyard');
    expect(g.object('mineBears').zone).toBe('graveyard');
    g.expect.life(0, 46);
    g.expect.invariants();
  });

  test('may target its own controller; an empty graveyard gains nothing', () => {
    const g = start();
    g.act(0).cast(incursion.name, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    expect(g.object('mineBears').zone).toBe('exile');
    g.expect.life(0, 43);
    const none = scenario()
      .define(incursion)
      .seat(0)
      .hand(incursion.name)
      .battlefield('Swamp', 'Swamp', 'Swamp')
      .library(...FILLER)
      .seat(1)
      .graveyard('Island')
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();
    none.act(0).cast(incursion.name, { targets: [{ player: 1 }], pay: true });
    none.passAll();
    none.expect.life(0, 40);
  });
});

describe('Bilbo, Birthday Celebrant', () => {
  const bilbo = real('Bilbo, Birthday Celebrant');
  const start = (life: number) =>
    scenario()
      .define(bilbo)
      .define(SIP)
      .seat(0)
      .life(life)
      .battlefield(bilbo.name)
      .battlefield('Plains', 'Swamp', 'Forest', 'Plains', 'Swamp')
      .hand(SIP.name)
      .library('Grizzly Bears', 'Plains', 'Grizzly Bears', 'Grizzly Bears', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain', { active: 0 })
      .build();

  test('the card is valid', () => {
    expect(validateCard(bilbo)).toEqual([]);
  });

  test('a life gain is one more (CR 614.1a): 3 becomes 4', () => {
    const g = start(20);
    g.act(0).cast(SIP.name).pay();
    g.passAll();
    g.expect.life(0, 24);
  });

  test('the search needs 111 life: refused at 110, offered at 111', () => {
    const g = start(110);
    g.expect.illegal(0, { activate: bilbo.name });
    const rich = start(111);
    rich.expect.legal(0, { activate: bilbo.name });
  });

  test('any number of creature cards go onto the battlefield, Bilbo is exiled, the library is shuffled', () => {
    const g = start(111);
    g.act(0).activate(bilbo.name).pay();
    g.passAll();
    g.expect.pending('chooseCards', 0);
    g.act(0).chooseCards(
      { name: 'Grizzly Bears', zone: 'library', nth: 0 },
      { name: 'Grizzly Bears', zone: 'library', nth: 1 },
    );
    g.expect.zone(bilbo.name, 'exile', { seat: 0 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0, count: 2 });
    g.expect.zone('Grizzly Bears', 'library', { seat: 0, count: 1 });
    g.expect.invariants();
  });

  test('finding none is allowed, and all of them too (CR 701.23b)', () => {
    const none = start(111);
    none.act(0).activate(bilbo.name).pay();
    none.passAll();
    none.act(0).chooseCards();
    none.expect.zone('Grizzly Bears', 'battlefield', { count: 0 });
    const all = start(111);
    all.act(0).activate(bilbo.name).pay();
    all.passAll();
    all.act(0).chooseCards(
      { name: 'Grizzly Bears', zone: 'library', nth: 0 },
      { name: 'Grizzly Bears', zone: 'library', nth: 1 },
      { name: 'Grizzly Bears', zone: 'library', nth: 2 },
    );
    all.expect.zone('Grizzly Bears', 'battlefield', { seat: 0, count: 3 });
  });

  test('a search for any number of cards is invalid with a max other than 1, or with a total mana value', () => {
    const face = bilbo.faces[0];
    const index = face?.abilities.findIndex((a) => a.kind === 'activated') ?? -1;
    const ability = face?.abilities[index];
    if (face === undefined || ability?.kind !== 'activated' || ability.effect.kind !== 'search') {
      throw new Error('Bilbo reads as an activated search');
    }
    expect(ability.effect.anyNumber).toBe(true);
    const mutate = (change: object): CardDefinition => ({
      ...bilbo,
      faces: [
        {
          ...face,
          abilities: face.abilities.map((a, i) =>
            i === index ? { ...ability, effect: { ...ability.effect, ...change } } : a,
          ),
        },
      ],
    });
    expect(validateCard(mutate({ max: 2 })).length).toBeGreaterThan(0);
    expect(validateCard(mutate({ totalManaValue: 6 })).length).toBeGreaterThan(0);
    expect(validateCard(mutate({ destinations: [{ zone: 'hand', count: 1 }] })).length).toBeGreaterThan(0);
  });
});

describe('what the new readings do not take', () => {
  const status = (text: string) => parseOnly(spellCard('Synthetic Probe', text)).support.status;

  test('"each of them" names several tokens; "them" alone and "it" still do not', () => {
    expect(status('Create three 1/1 white Soldier creature tokens. Put a +1/+1 counter on each of them.')).toBe('supported');
    expect(status('Create three 1/1 white Soldier creature tokens. Put a +1/+1 counter on them.')).toBe('unsupported');
    expect(status('Create three 1/1 white Soldier creature tokens. Put a +1/+1 counter on it.')).toBe('unsupported');
  });

  test('"the amount of life you gained" is read in a life gain trigger only', () => {
    expect(status('Draw a card. Target creature gets +X/+X until end of turn, where X is the amount of life you gained.')).toBe('unsupported');
  });

  test('"remove those counters" needs the counters of the sentence condition', () => {
    expect(status('Remove those counters.')).toBe('unsupported');
  });
});
