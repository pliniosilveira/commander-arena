// "Whenever another nontoken creature you control dies, you may exile it. If you do, create a token that's a copy of that creature, except it's 1/1 and it's a Nightmare in addition to
// its other types." (Nightmare Shepherd). SYNTHETIC cards: the real Oracle wording on shells that say SYNTHETIC.
// Pins, one for each ruling of 2020-01-24: the token copies the creature as it last existed on the battlefield (CR 608.2h, 707.2: its copiable values, so no counters and no other
// effects, and what a copy was copying); an {X} in its mana cost is 0 (CR 107.3); its enters abilities trigger; a characteristic-defining ability that defines the power and toughness
// is not copied (CR 707.9d); a copy of the token is 1/1 and a Nightmare too (CR 707.9b: the exceptions are copiable values); and "if you do" needs the card to be exiled from the
// graveyard (CR 603.6c: it is looked for only where it went).
import { validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { importCard } from '../src/index';
import { NO_OVERRIDES, parsed } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const TEXT =
  "Flying\nWhenever another nontoken creature you control dies, you may exile it. If you do, create a token that's a copy of that creature, except it's 1/1 and it's a Nightmare in addition to its other types.";
const SHEPHERD = parsed('SYNTHETIC Shepherd', 'Enchantment Creature — Demon', TEXT, {
  manaCost: '{2}{B}{B}',
  power: '4',
  toughness: '4',
});
const CLONE = parsed(
  'SYNTHETIC Mirror Shape',
  'Creature — Shapeshifter',
  // The plain Clone wording is not read by the grammar; this one is, and with X = 0 it is a plain copy.
  'You may have ~ enter as a copy of any creature on the battlefield, except it enters with X additional +1/+1 counters on it.',
  { manaCost: '{X}{3}{U}', power: '0', toughness: '0' },
);
const HYDRA = parsed(
  'SYNTHETIC Counter Hydra',
  'Creature — Hydra',
  '~ enters with X +1/+1 counters on it.',
  { manaCost: '{X}{G}', power: '0', toughness: '0' },
);
const ELEMENTAL = parsed(
  'SYNTHETIC Land Elemental',
  'Creature — Elemental',
  "~'s power and toughness are each equal to the number of lands you control.",
  { manaCost: '{2}{G}', power: '*', toughness: '*' },
);
const HEALER = parsed(
  'SYNTHETIC Entering Healer',
  'Creature — Cleric',
  'When ~ enters, you gain 2 life.',
  { manaCost: '{1}{W}', power: '1', toughness: '3' },
);
const PURGE = parsed('SYNTHETIC Grave Purge', 'Instant', 'Exile target card from a graveyard.', {
  manaCost: '{B}',
});
const BEARS = 'Grizzly Bears';
const ANGEL = 'Serra Angel';
const MURDER = 'Murder';
const ISLANDS = Array.from({ length: 10 }, () => 'Island');
const SWAMPS = Array.from({ length: 8 }, () => 'Swamp');

type Builder = ReturnType<typeof scenario>;
const game = (setup: (b: Builder) => void) => {
  const b = scenario({ seats: 3 });
  for (const card of [SHEPHERD, CLONE, HYDRA, ELEMENTAL, HEALER, PURGE]) b.define(card);
  for (let seat = 0; seat < 3; seat += 1) b.seat(seat).library(...ISLANDS);
  b.seat(0)
    .battlefield(SHEPHERD.name, ...SWAMPS)
    .hand(MURDER, MURDER);
  setup(b);
  return b.at('precombatMain', { active: 0, turn: 3 }).build();
};
type Game = ReturnType<typeof game>;
const tokens = (g: Game) =>
  g.state.battlefield.flatMap((id) => {
    const obj = g.state.objects[id];
    return obj !== undefined && obj.token !== null ? [obj] : [];
  });
/** Seat 0 destroys the creature; the trigger resolves up to its "you may". */
const kill = (g: Game, creature: string) => {
  g.act(0).cast(`${MURDER}[0]`, { targets: [creature], pay: true });
  g.passAll();
};
/** The permanent as every player sees it: its derived name and rules text. */
const seen = (g: Game, id: string) => {
  const view = g.view(0).battlefield.find((o) => o.id === id);
  if (view === undefined) throw new Error(`${id} is not on the battlefield`);
  return view;
};
const theToken = (g: Game) => {
  const [token, ...more] = tokens(g);
  if (token === undefined || more.length > 0) throw new Error(`${tokens(g).length} tokens`);
  return token;
};

describe('the text is read', () => {
  test('a copy with a power and toughness and one more creature type', () => {
    expect(SHEPHERD.faces[0]?.abilities).toMatchObject([
      { kind: 'keyword', keyword: { kind: 'flying' } },
      {
        kind: 'triggered',
        trigger: {
          kind: 'dies',
          what: { types: ['creature'], token: false, other: true, controller: 'you' },
        },
        effect: {
          kind: 'sequence',
          effects: [
            { kind: 'may', effect: { kind: 'exile', objects: { kind: 'triggerSubject' } } },
            {
              kind: 'conditional',
              condition: { kind: 'didPrevious' },
              effect: {
                kind: 'createToken',
                token: {
                  kind: 'copyOf',
                  object: { kind: 'triggerSubject' },
                  setPt: { power: 1, toughness: 1 },
                  addSubtypes: ['Nightmare'],
                },
                count: 1,
              },
            },
          ],
        },
      },
    ]);
    expect(validateCard(SHEPHERD)).toEqual([]);
  });

  test.each([
    // A color, a card type or a keyword among the exceptions is another wording.
    "Whenever another nontoken creature you control dies, create a token that's a copy of that creature, except it's 1/1 and it's a black Nightmare in addition to its other types.",
    "Whenever another nontoken creature you control dies, create a token that's a copy of that creature, except it's 1/1 and it's a Nightmare in addition to its other types and has haste.",
    "Whenever another nontoken creature you control dies, create a token that's a copy of that creature, except it's 1/1 and it's a Nightmare.",
  ])('is not read: %s', (text) => {
    const card = importCard(
      syntheticCard({
        name: 'SYNTHETIC Not Read',
        typeLine: 'Creature — Demon',
        oracleText: text,
        power: '1',
        toughness: '1',
      }),
      undefined,
      NO_OVERRIDES,
    );
    expect(card.support.status).toBe('unsupported');
  });
});

describe("\"you may exile it. If you do, create a token that's a copy of that creature, except it's 1/1 and it's a Nightmare in addition to its other types\"", () => {
  test('accepting exiles the card and makes a 1/1 copy that is also a Nightmare', () => {
    const g = game((b) => b.seat(0).battlefield(BEARS));
    kill(g, BEARS);
    g.expect.pending('confirmOptional', 0);
    g.act(0).accept();
    g.expect.zone(BEARS, 'exile');
    const token = theToken(g);
    expect(token.controller).toBe(0);
    g.expect.pt(token.id, 1, 1);
    g.expect.derived(token.id, {
      types: ['creature'],
      subtypes: ['Bear', 'Nightmare'],
      colors: ['G'],
    });
    expect(seen(g, token.id).name).toBe(BEARS);
    g.expect.invariants();
  });

  test('declining leaves the card in the graveyard and makes no token', () => {
    const g = game((b) => b.seat(0).battlefield(BEARS));
    kill(g, BEARS);
    g.act(0).decline();
    g.expect.zone(BEARS, 'graveyard');
    expect(tokens(g)).toHaveLength(0);
  });

  test('counters and other effects are not copied: the copiable values, as it last was on the battlefield', () => {
    const g = game((b) => b.seat(0).battlefield(BEARS, { counters: { '+1/+1': 3 } }));
    kill(g, BEARS);
    g.act(0).accept();
    const token = theToken(g);
    g.expect.pt(token.id, 1, 1);
    g.expect.counters(token.id, {});
  });

  test('a creature that was copying another: the token is what it copied, not the card that was exiled', () => {
    const g = game((b) => {
      b.seat(0).hand(CLONE.name).battlefield('Island', 'Island', 'Island', 'Island');
      b.seat(1).battlefield(ANGEL);
    });
    g.act(0).cast(CLONE.name, { x: 0, pay: true });
    g.passAll();
    g.act(0).choosePermanents(g.id({ name: ANGEL, zone: 'battlefield', seat: 1 }));
    const copy = g.find({ name: CLONE.name, zone: 'battlefield' });
    expect(copy).toHaveLength(1);
    const [clone] = copy;
    if (clone === undefined) throw new Error('no clone');
    expect(seen(g, clone.id).name).toBe(ANGEL);
    kill(g, clone.id);
    g.act(0).accept();
    // The card that died and was exiled is the Shapeshifter; the token is a Serra Angel.
    g.expect.zone(CLONE.name, 'exile');
    const token = theToken(g);
    expect(seen(g, token.id).name).toBe(ANGEL);
    g.expect.pt(token.id, 1, 1);
    g.expect.derived(token.id, {
      subtypes: ['Angel', 'Nightmare'],
      keywords: ['flying', 'vigilance'],
    });
  });

  test('an {X} in the mana cost of the creature copied is 0: the token enters with no counters', () => {
    const g = game((b) => b.seat(0).battlefield(HYDRA.name, { counters: { '+1/+1': 3 } }));
    kill(g, HYDRA.name);
    g.act(0).accept();
    const token = theToken(g);
    g.expect.counters(token.id, {});
    g.expect.pt(token.id, 1, 1);
    g.expect.derived(token.id, { subtypes: ['Hydra', 'Nightmare'] });
  });

  test('an ability that defines the power and toughness is not copied (CR 707.9d): the token stays 1/1', () => {
    const g = game((b) => b.seat(0).battlefield(ELEMENTAL.name));
    // Eight lands: the Elemental is 8/8.
    g.expect.pt(ELEMENTAL.name, 8, 8);
    kill(g, ELEMENTAL.name);
    g.act(0).accept();
    const token = theToken(g);
    g.expect.pt(token.id, 1, 1);
    // The ability that defined them is not among the token's abilities; more lands change nothing.
    expect(token.token?.abilities).toEqual([]);
  });

  test('the enters abilities of the creature copied trigger for the token', () => {
    const g = game((b) => b.seat(0).battlefield(HEALER.name));
    kill(g, HEALER.name);
    g.act(0).accept();
    g.passAll();
    theToken(g);
    g.expect.life(0, 42);
  });

  test('a copy of the token is 1/1 and a Nightmare too (CR 707.9b)', () => {
    const g = game((b) =>
      b.seat(0).battlefield(ANGEL, 'Island', 'Island', 'Island', 'Island').hand(CLONE.name),
    );
    kill(g, ANGEL);
    g.act(0).accept();
    const token = theToken(g);
    g.act(0).cast(CLONE.name, { x: 0, pay: true });
    g.passAll();
    g.act(0).choosePermanents(token.id);
    const [clone] = g.find({ name: CLONE.name, zone: 'battlefield' });
    if (clone === undefined) throw new Error('no clone');
    expect(seen(g, clone.id).name).toBe(ANGEL);
    g.expect.pt(clone.id, 1, 1);
    g.expect.derived(clone.id, {
      subtypes: ['Angel', 'Nightmare'],
      keywords: ['flying', 'vigilance'],
    });
  });

  test('the card left the graveyard before the ability resolved: nothing is exiled, no token ("if you do")', () => {
    const g = game((b) => {
      b.seat(0).battlefield(BEARS);
      b.seat(2).hand(PURGE.name).battlefield('Swamp');
    });
    g.act(0).cast(`${MURDER}[0]`, { targets: [BEARS], pay: true });
    // Murder resolves, the trigger goes on the stack; seat 2 answers it.
    g.act(0).pass();
    g.act(1).pass();
    g.act(2).pass();
    g.expect.stack([`${SHEPHERD.name} (ability)`]);
    g.act(0).pass();
    g.act(1).pass();
    g.act(2).cast(PURGE.name, { targets: [{ name: BEARS, zone: 'graveyard' }], pay: true });
    g.passAll();
    if (g.state.pending?.kind === 'confirmOptional') g.act(0).accept();
    g.expect.stack([]);
    g.expect.zone(BEARS, 'exile');
    expect(tokens(g)).toHaveLength(0);
  });

  test('a token creature dying does not trigger it (nontoken)', () => {
    const g = game((b) => b.seat(0).battlefield(BEARS));
    kill(g, BEARS);
    g.act(0).accept();
    const token = theToken(g);
    g.act(0).cast(`${MURDER}[0]`, { targets: [token.id], pay: true });
    g.passAll();
    g.expect.pending('priority');
    g.expect.stack([]);
    expect(tokens(g)).toHaveLength(0);
  });

  test("its own death and an opponent's creature dying do not trigger it", () => {
    const g = game((b) => b.seat(1).battlefield(ANGEL));
    kill(g, ANGEL);
    g.expect.pending('priority');
    g.expect.zone(ANGEL, 'graveyard');
    kill(g, SHEPHERD.name);
    g.expect.pending('priority');
    g.expect.zone(SHEPHERD.name, 'graveyard');
    expect(tokens(g)).toHaveLength(0);
  });
});
