// Group 5 of the Hashaton deck (issue 31, D-382 to D-385): the exceptions of a token copy (CR 707.9), Eternalize (CR 702.129a), the discard trigger that
// names a kind of card with a copy of the card discarded (Hashaton, Scarab's Fist), and "for each token you control of the chosen type that entered this turn, create a token that's
// a copy of it" (Renewed Solidarity).
// Pins: CR 702.129a (Eternalize: the cost, the exile, the copy that is black, 4/4, with no mana cost and a Zombie in addition, sorcery speed), CR 707.9b (what the exception sets is
// part of the copiable values: a copy of the copy has it), CR 707.9d (a characteristic-defining ability of a characteristic the exception gives a value to is not copied; changeling
// is copied for "in addition to its other types"), CR 707.2 and 111.4 (a token that is a copy), CR 701.9a (a discard triggers once for each card, however it comes to be; the card
// is the object in the graveyard, or in exile for madness), CR 608.2h (a card that left is read from its last-known information), CR 118.3 and 608.2c ("you may pay. If you do"),
// CR 205.3d (creature types), CR 613.1d and 613.4 (the +1/+0 of the chosen type), CR 603.2 (a trigger of the end step), CR 400.7 (a token that entered this turn).
// Cards are SYNTHETIC (src/cards/fixtures/synthetic-hashaton-g5.ts) or real fixtures.
import { describe, expect, test } from 'vitest';
import { getView, isFeatureSupported, syntheticCard, validateCard } from '../src/index';
import type { ScenarioGame } from '../src/testing/index';
import { scenario } from '../src/testing/index';

const CHAMPION = 'SYNTHETIC Wit Champion'; // {2}{U} 2/1 Snake Wizard, Eternalize {1}{U}
const RUMMAGER = 'SYNTHETIC Wit Rummager'; // Champion of Wits as a whole: enters, may draw its power, then discard two; Eternalize {1}{U}
const LURKER = 'SYNTHETIC Lurker Eternal'; // */* lands you control, Eternalize {1}{G}
const VOID = 'SYNTHETIC Void Eternal'; // devoid 3/3, Eternalize {1}{B}
const BRUTE = 'SYNTHETIC Shifting Brute'; // changeling 2/2, Eternalize {U}
const AUTOMATON = 'SYNTHETIC Eternal Automaton'; // artifact creature Construct 2/2, Eternalize {2}
const SCARAB = 'SYNTHETIC Scarab Fist'; // legendary 1/3 Zombie Wizard: discard a creature card, may pay {2}{U}, tapped 4/4 black Zombie copy
const WATCHER = 'SYNTHETIC Scarab Watcher'; // discard a land card: gain 2 life
const TIDY = 'SYNTHETIC Tidy Discard'; // {B} sorcery: discard a card
const DOUBLE = 'SYNTHETIC Pair Discard'; // {B} sorcery: discard two cards
const ROT = 'SYNTHETIC Mind Rot'; // {1}{B} sorcery: each opponent discards two cards
const FIEND = 'SYNTHETIC Madness Fiend'; // {3}{B} 4/3, madness {1}{B}
const SCOUR = 'SYNTHETIC Grave Scour'; // {B} instant: exile target card from a graveyard
const MIRROR = 'SYNTHETIC Copy Mirror'; // {4}{R} sorcery: a token copy of each creature a player controls, with haste
const SOWER = 'SYNTHETIC Goblin Sower'; // {R} sorcery: two 1/1 red Goblin tokens
const ECHO = 'SYNTHETIC Solidarity Echo'; // {2}{W} enchantment: Renewed Solidarity's shape
const BEARS = 'Grizzly Bears'; // {1}{G} Bear 2/2
const FILLER = Array.from({ length: 14 }, () => 'Plains');

type Builder = ReturnType<typeof scenario>;

const view = (g: ScenarioGame, name: string, zone: 'battlefield' | 'graveyard' | 'exile') => {
  const v = getView(g.state, 0);
  const objects = zone === 'graveyard' ? (v.seats[0]?.graveyard ?? []) : v[zone];
  return objects.filter((o) => o.name === name);
};

/** Casts the discard spell of `seat 0` and lets it resolve; `cards` are chosen when the hand holds a choice. */
const discard = (g: ScenarioGame, spell: string, ...cards: string[]): void => {
  g.act(0).cast(spell, { pay: true });
  g.passAll();
  const d = g.state.pending;
  if (d?.kind === 'discard' || d?.kind === 'chooseCards') g.act(0).chooseCards(...cards);
  g.passAll();
};

/** The permanent of that name of seat 0: a token, whatever the exiled or discarded card of the same name is. */
const bf = (name: string) => ({ name, zone: 'battlefield', seat: 0 }) as const;

const tokens = (g: ScenarioGame, name: string, seat: 0 | 1 = 0) =>
  g.find({ name, zone: 'battlefield', seat }).filter((o) => o.token !== null);

describe('the cards are valid, and the engine runs them', () => {
  test.each([CHAMPION, LURKER, VOID, BRUTE, AUTOMATON, SCARAB, WATCHER, TIDY, DOUBLE, SOWER, ECHO])(
    '%s',
    (name) => {
      expect(validateCard(syntheticCard(name))).toEqual([]);
    },
  );

  test('Eternalize is a supported keyword', () => {
    expect(isFeatureSupported('keyword:eternalize')).toBe(true);
  });
});

describe("Eternalize {1}{U}: \"[Cost], Exile this card from your graveyard: Create a token that's a copy of it, except it's black, it's 4/4, it has no mana cost, and it's a Zombie in addition to its other types. Activate only as a sorcery.\" (CR 702.129a)", () => {
  const start = (card = CHAMPION, lands: readonly string[] = ['Island', 'Island']): ScenarioGame =>
    scenario()
      .seat(0)
      .graveyard(card)
      .battlefield(...lands)
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('there is an option from the graveyard with the mana, at sorcery speed only', () => {
    const g = start();
    g.expect.legal(0, { activate: CHAMPION });
    // Without the mana, none.
    scenario()
      .seat(0)
      .graveyard(CHAMPION)
      .battlefield('Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build()
      .expect.illegal(0, { activate: CHAMPION });
    // In the hand, none.
    scenario()
      .seat(0)
      .hand(CHAMPION)
      .battlefield('Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build()
      .expect.illegal(0, { activate: CHAMPION });
  });

  test('not in combat and not with something on the stack (sorcery speed, CR 602.5d)', () => {
    const g = scenario()
      .seat(0)
      .graveyard(CHAMPION)
      .hand(TIDY)
      .battlefield('Island', 'Island', 'Swamp')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(TIDY, { pay: true });
    g.expect.illegal(0, { activate: CHAMPION });
    const h = scenario()
      .seat(0)
      .graveyard(CHAMPION)
      .battlefield('Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('beginningOfCombat')
      .build();
    h.expect.illegal(0, { activate: CHAMPION });
  });

  test('the card is exiled as the cost, and the token is a black 4/4 copy with no mana cost and the Zombie type besides its own', () => {
    const g = start();
    g.act(0).activate(CHAMPION, { pay: true });
    g.expect.zone(CHAMPION, 'exile', { seat: 0 });
    g.expect.noObject(CHAMPION, { zone: 'graveyard' });
    g.expect.noObject(CHAMPION, { zone: 'battlefield' });
    g.passAll();
    const token = tokens(g, CHAMPION);
    expect(token).toHaveLength(1);
    g.expect.pt(bf(CHAMPION), 4, 4);
    g.expect.derived(bf(CHAMPION), {
      types: ['creature'],
      subtypes: ['Snake', 'Wizard', 'Zombie'],
      colors: ['B'],
    });
    const shown = view(g, CHAMPION, 'battlefield')[0];
    expect(shown?.manaCost).toBeNull();
    expect(shown?.isToken).toBe(true);
    g.expect.invariants();
  });

  test('its mana value is 0 and the exceptions are part of its copiable values: a copy of the token has them (CR 707.9b)', () => {
    const g = scenario()
      .seat(0)
      .graveyard(CHAMPION)
      .hand(MIRROR)
      .battlefield('Island', 'Island', 'Mountain', 'Mountain', 'Mountain', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).activate(CHAMPION, { pay: true });
    g.passAll();
    g.act(0).cast(MIRROR, { targets: [{ player: 0 }], pay: true });
    g.passAll();
    const both = tokens(g, CHAMPION);
    expect(both).toHaveLength(2);
    for (const o of both) {
      const shown = getView(g.state, 0).battlefield.find((v) => v.id === o.id);
      expect(shown?.power).toBe(4);
      expect(shown?.toughness).toBe(4);
      expect(shown?.colors).toEqual(['B']);
      expect(shown?.manaCost).toBeNull();
      expect(shown?.subtypes).toEqual(expect.arrayContaining(['Snake', 'Wizard', 'Zombie']));
    }
  });

  test('a creature whose power and toughness a characteristic-defining ability sets: the token is 4/4 and does not copy the ability (CR 707.9d)', () => {
    const g = start(LURKER, ['Forest', 'Forest', 'Forest', 'Forest']);
    g.act(0).activate(LURKER, { pay: true });
    g.passAll();
    // Four lands: it would be 4/4 anyway, so add lands and see that it does not follow them.
    g.expect.pt(bf(LURKER), 4, 4);
    const g2 = scenario()
      .seat(0)
      .graveyard(LURKER)
      .battlefield('Forest', 'Forest', 'Forest', 'Forest', 'Forest', 'Forest')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g2.act(0).activate(LURKER, { pay: true });
    g2.passAll();
    g2.expect.pt(bf(LURKER), 4, 4);
    g2.expect.derived(bf(LURKER), { colors: ['B'] });
    // The ability is gone from the token: no characteristic-defining ability is among its abilities.
    const kinds = tokens(g2, LURKER)[0]?.token?.abilities.map((a) =>
      a.kind === 'static' ? a.static.kind : a.kind,
    );
    expect(kinds).not.toContain('characteristicPt');
    expect(kinds).toContain('keyword');
  });

  test('a card in the graveyard still has its characteristic-defining power and toughness before it is eternalized (the card is not changed)', () => {
    const g = start(LURKER, ['Forest', 'Forest', 'Forest', 'Forest', 'Forest']);
    expect(view(g, LURKER, 'graveyard')[0]?.power).toBe(5);
    expect(view(g, LURKER, 'graveyard')[0]?.toughness).toBe(5);
  });

  test('devoid is a color-defining ability: the black token does not copy it (CR 707.9d), and the token is black', () => {
    const g = start(VOID, ['Swamp', 'Swamp']);
    g.act(0).activate(VOID, { pay: true });
    g.passAll();
    g.expect.derived(bf(VOID), { colors: ['B'], subtypes: ['Eldrazi', 'Zombie'] });
    g.expect.pt(bf(VOID), 4, 4);
    const abilityKinds = tokens(g, VOID)[0]?.token?.abilities.map((a) =>
      a.kind === 'keyword' ? a.keyword.kind : a.kind,
    );
    expect(abilityKinds).not.toContain('devoid');
  });

  test('changeling is copied: "a Zombie in addition to its other types" keeps a characteristic-defining ability of types (CR 707.9d)', () => {
    const g = start(BRUTE, ['Island']);
    g.act(0).activate(BRUTE, { pay: true });
    g.passAll();
    const shown = view(g, BRUTE, 'battlefield')[0];
    expect(shown?.subtypes).toContain('Zombie');
    expect(shown?.subtypes).toContain('Elf');
    expect(shown?.subtypes).toContain('Human');
  });

  test('an artifact creature keeps its other types: an artifact creature Construct Zombie', () => {
    const g = start(AUTOMATON, ['Island', 'Island']);
    g.act(0).activate(AUTOMATON, { pay: true });
    g.passAll();
    g.expect.derived(bf(AUTOMATON), {
      types: ['artifact', 'creature'],
      subtypes: ['Construct', 'Zombie'],
      colors: ['B'],
    });
  });

  test('the ability is on the stack when the card is exiled: responding does not stop the token (the cost was paid)', () => {
    const g = scenario()
      .seat(0)
      .graveyard(CHAMPION)
      .battlefield('Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .hand(SCOUR)
      .battlefield('Swamp')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).activate(CHAMPION, { pay: true });
    g.expect.zone(CHAMPION, 'exile', { seat: 0 });
    g.passAll();
    expect(tokens(g, CHAMPION)).toHaveLength(1);
  });

  test('it is used once: the card is in exile and the option is gone', () => {
    const g = start();
    g.act(0).activate(CHAMPION, { pay: true });
    g.passAll();
    g.expect.illegal(0, { activate: CHAMPION });
  });
});

describe('Eternalize is refused where the copy would ask a question the token has no step for, and where the keyword cannot work', () => {
  test('an Aura or a land with Eternalize is not implemented', () => {
    const base = syntheticCard(CHAMPION);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const withTypes = (types: readonly string[], more: readonly unknown[] = []) =>
      ({
        ...base,
        faces: [
          {
            ...face,
            types,
            power: null,
            toughness: null,
            abilities: [...face.abilities, ...more],
          },
        ],
      }) as never;
    // A land card with eternalize: the copy would enter without the questions of a land.
    expect(JSON.stringify(validateCard(withTypes(['land'])))).toContain('land or an Aura');
    // An Aura: the copy would enter without saying what it enchants.
    const aura = withTypes(
      ['enchantment'],
      [{ kind: 'keyword', keyword: { kind: 'enchant', filter: { types: ['creature'] } } }],
    );
    expect(JSON.stringify(validateCard(aura))).toContain('land or an Aura');
    // A creature is run.
    expect(validateCard(syntheticCard(CHAMPION))).toEqual([]);
  });

  test('X in the cost, a cost that is not mana, an instant card and two instances are refused by the validator', () => {
    const base = syntheticCard(CHAMPION);
    const face = base.faces[0];
    if (face === undefined) throw new Error('no face');
    const keyword = (cost: unknown) => ({ kind: 'keyword', keyword: { kind: 'eternalize', cost } });
    const withAbilities = (
      abilities: readonly unknown[],
      types: readonly string[] = ['creature'],
    ) => ({ ...base, faces: [{ ...face, types, abilities }] }) as never;
    expect(
      validateCard(withAbilities([keyword([{ kind: 'mana', symbols: ['X', 'U'] }])])).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withAbilities([keyword([{ kind: 'payLife', amount: 2 }])])).length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(withAbilities([keyword([{ kind: 'mana', symbols: ['U'] }])], ['instant']))
        .length,
    ).toBeGreaterThan(0);
    expect(
      validateCard(
        withAbilities([
          keyword([{ kind: 'mana', symbols: ['U'] }]),
          keyword([{ kind: 'mana', symbols: ['1'] }]),
        ]),
      ).length,
    ).toBeGreaterThan(0);
  });
});

describe('the exceptions of a copy are validated (CR 707.9b)', () => {
  const copy = (extra: Record<string, unknown>) => {
    const base = syntheticCard(SCARAB);
    const face = base.faces[0];
    const trigger = face?.abilities[0];
    if (face === undefined || trigger?.kind !== 'triggered' || trigger.effect.kind !== 'mayPay') {
      throw new Error('no trigger');
    }
    const token = (trigger.effect.effect as { token: Record<string, unknown> }).token;
    return {
      ...base,
      faces: [
        {
          ...face,
          abilities: [
            {
              ...trigger,
              effect: {
                ...trigger.effect,
                effect: {
                  ...trigger.effect.effect,
                  token: { ...token, ...extra },
                },
              },
            },
          ],
        },
      ],
    } as never;
  };

  test('the card is valid as written', () => {
    expect(validateCard(copy({}))).toEqual([]);
  });

  test('creature types instead of its own, or in addition to them, not both; a creature type, not a land type', () => {
    expect(validateCard(copy({ addSubtypes: ['Zombie'] })).length).toBeGreaterThan(0);
    expect(validateCard(copy({ setCreatureTypes: [] })).length).toBeGreaterThan(0);
    expect(validateCard(copy({ setCreatureTypes: ['Forest'] })).length).toBeGreaterThan(0);
  });

  test('colors, power and toughness and no mana cost take what the rules give them', () => {
    expect(validateCard(copy({ setColors: ['K'] })).length).toBeGreaterThan(0);
    expect(validateCard(copy({ setColors: ['B', 'B'] })).length).toBeGreaterThan(0);
    expect(validateCard(copy({ setColors: [] }))).toEqual([]);
    expect(validateCard(copy({ setPt: { power: 1.5, toughness: 4 } })).length).toBeGreaterThan(0);
    expect(validateCard(copy({ noManaCost: false })).length).toBeGreaterThan(0);
    expect(validateCard(copy({ noManaCost: true }))).toEqual([]);
  });
});

describe('the discard trigger names the kind of card (CR 701.9a)', () => {
  const trigger = (filter: unknown) => {
    const base = syntheticCard(SCARAB);
    const face = base.faces[0];
    const ability = face?.abilities[0];
    if (face === undefined || ability?.kind !== 'triggered') throw new Error('no trigger');
    return {
      ...base,
      faces: [{ ...face, abilities: [{ ...ability, trigger: { ...ability.trigger, filter } }] }],
    } as never;
  };

  test('a filter of the card kind is valid; a zone, a controller or an owner is refused (the card is read where it went)', () => {
    expect(validateCard(trigger({ types: ['creature'] }))).toEqual([]);
    expect(
      validateCard(trigger({ zone: 'graveyard', types: ['creature'] })).length,
    ).toBeGreaterThan(0);
    expect(validateCard(trigger({ controller: 'you' })).length).toBeGreaterThan(0);
    expect(validateCard(trigger({ owner: 'you' })).length).toBeGreaterThan(0);
  });

  test('a copy of "that card" with no filter on a card that could be an Aura is not implemented', () => {
    // "Whenever you discard a card": that card could be an Aura card, which the copy would have to attach to something (CR 303.4f).
    expect(JSON.stringify(validateCard(trigger(undefined)))).toContain('Aura');
    expect(validateCard(trigger({ types: ['creature'] }))).toEqual([]);
  });
});

const scarabGame = (
  build: (b: Builder) => Builder = (b) => b,
  mana: readonly string[] = ['Island', 'Island', 'Island', 'Swamp', 'Swamp'],
): ScenarioGame =>
  build(
    scenario()
      .seat(0)
      .life(20)
      .hand(TIDY, DOUBLE)
      .battlefield(SCARAB, ...mana)
      .library(...FILLER),
  )
    .seat(1)
    .life(20)
    .library(...FILLER)
    .at('precombatMain')
    .build();

describe('Hashaton: "Whenever you discard a creature card, you may pay {2}{U}. If you do, create a tapped token that\'s a copy of that card, except it\'s a 4/4 black Zombie." (CR 701.9a, 707.9)', () => {
  /** The question of the trigger is open: `mayPay` of {2}{U}. */
  const asked = (g: ScenarioGame): void => {
    const d = g.state.pending;
    expect(d?.kind).toBe('confirmOptional');
    if (d?.kind !== 'confirmOptional') return;
    expect(d.purpose).toBe('mayPay');
    expect(d.cost).toEqual([{ kind: 'mana', symbols: ['2', 'U'] }]);
  };

  /** Discards `card` with the Tidy spell and pays for the copy. */
  const discardAndPay = (card: string, build: (b: Builder) => Builder = (b) => b.hand(card)) => {
    const g = scarabGame(build);
    discard(g, TIDY, card);
    asked(g);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    return g;
  };

  test('discarding a creature card: I am asked; paying {2}{U} makes a tapped 4/4 black Zombie copy, and the card stays in the graveyard', () => {
    const g = discardAndPay(BEARS);
    const token = tokens(g, BEARS);
    expect(token).toHaveLength(1);
    expect(token[0]?.tapped).toBe(true);
    g.expect.pt(bf(BEARS), 4, 4);
    g.expect.derived(bf(BEARS), { types: ['creature'], subtypes: ['Zombie'], colors: ['B'] });
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.invariants();
  });

  test('declining pays nothing and makes nothing', () => {
    const g = scarabGame((b) => b.hand(BEARS));
    discard(g, TIDY, BEARS);
    asked(g);
    g.act(0).decline();
    expect(tokens(g, BEARS)).toHaveLength(0);
    g.expect.tapped(SCARAB, false);
  });

  test('a card that is not a creature card does not trigger it (a land, an instant)', () => {
    for (const card of ['Island', 'Lightning Bolt']) {
      const g = scarabGame((b) => b.hand(card));
      discard(g, TIDY, card);
      expect(g.state.pending?.kind).toBe('priority');
      expect(g.state.stack).toHaveLength(0);
    }
  });

  test('the opponent discarding does not trigger "you discard"', () => {
    const g = scenario()
      .seat(0)
      .hand(ROT)
      .battlefield(SCARAB, 'Swamp', 'Swamp', 'Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .hand(BEARS, 'Llanowar Elves')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(ROT, { pay: true });
    g.passAll();
    expect(g.state.pending?.kind).not.toBe('confirmOptional');
    g.expect.noObject(BEARS, { zone: 'battlefield' });
    g.expect.zone(BEARS, 'graveyard', { seat: 1 });
  });

  test('two creature cards discarded: one question for each, each with its own copy', () => {
    const g = scarabGame(
      (b) => b.hand(BEARS, 'Llanowar Elves'),
      ['Island', 'Island', 'Island', 'Island', 'Island', 'Island', 'Swamp'],
    );
    g.act(0).cast(DOUBLE, { pay: true });
    g.passAll();
    g.act(0).chooseCards(BEARS, 'Llanowar Elves');
    for (let i = 0; i < 6; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'orderTriggers') {
        g.act(0).orderTriggers(0, 1);
      } else if (d?.kind === 'confirmOptional') {
        g.act(0).accept();
        g.act(0).payAuto();
      }
      g.passAll();
    }
    expect(tokens(g, BEARS)).toHaveLength(1);
    expect(tokens(g, 'Llanowar Elves')).toHaveLength(1);
  });

  test('a card with changeling has every creature type; the token is only a Zombie (CR 707.9d)', () => {
    const g = discardAndPay(BRUTE);
    expect(view(g, BRUTE, 'battlefield')[0]?.subtypes).toEqual(['Zombie']);
    g.expect.pt(bf(BRUTE), 4, 4);
  });

  test('a creature with defined power and toughness: the token is 4/4 and has no such ability (CR 707.9d)', () => {
    const g = discardAndPay(LURKER);
    g.expect.pt(bf(LURKER), 4, 4);
    g.expect.derived(bf(LURKER), { colors: ['B'], subtypes: ['Zombie'] });
    const kinds = tokens(g, LURKER)[0]?.token?.abilities.map((a) =>
      a.kind === 'static' ? a.static.kind : a.kind,
    );
    expect(kinds).not.toContain('characteristicPt');
  });

  test('devoid is color-defining: the token is black and does not copy it', () => {
    const g = discardAndPay(VOID);
    g.expect.derived(bf(VOID), { colors: ['B'], subtypes: ['Zombie'] });
  });

  test('an artifact creature keeps the artifact type and loses the Construct type', () => {
    const g = discardAndPay(AUTOMATON);
    g.expect.derived(bf(AUTOMATON), {
      types: ['artifact', 'creature'],
      subtypes: ['Zombie'],
      colors: ['B'],
    });
  });

  test('the mana cost is kept: only what the exception says changes (Eternalize says "no mana cost", Hashaton does not)', () => {
    const g = discardAndPay(BEARS);
    expect(view(g, BEARS, 'battlefield')[0]?.manaCost).toEqual(['1', 'G']);
  });

  test('a legendary card gives a legendary token, and the legend rule applies to the two (CR 704.5j)', () => {
    const g = scarabGame((b) => b.hand(SCARAB));
    discard(g, TIDY, SCARAB);
    asked(g);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    // Two permanents named like the legendary card (the token is legendary too): the controller keeps one.
    expect(g.state.pending?.kind).toBe('choosePermanent');
    expect(
      getView(g.state, 0).battlefield.filter((o) => o.name === SCARAB && o.isToken)[0]?.supertypes,
    ).toEqual(['legendary']);
  });

  test('a card that left the graveyard before the ability resolved is read from its last-known information (CR 608.2h)', () => {
    const g = scenario()
      .seat(0)
      .hand(TIDY, BEARS)
      .battlefield(SCARAB, 'Swamp', 'Island', 'Island', 'Island', 'Island')
      .library(...FILLER)
      .seat(1)
      .hand(SCOUR)
      .battlefield('Swamp')
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(TIDY, { pay: true });
    g.pass();
    g.pass();
    // The trigger is on the stack, and the opponent gets priority after me: exile the card in response.
    expect(g.state.stack.length).toBe(1);
    g.pass(0);
    g.act(1).cast(SCOUR, { targets: [BEARS], pay: true });
    g.passAll();
    g.expect.noObject(BEARS, { zone: 'graveyard' });
    asked(g);
    g.act(0).accept();
    g.act(0).payAuto();
    g.passAll();
    expect(tokens(g, BEARS)).toHaveLength(1);
    g.expect.pt(bf(BEARS), 4, 4);
  });

  test('without the mana nobody is asked (CR 118.3)', () => {
    const g = scarabGame((b) => b.hand(BEARS), ['Swamp']);
    discard(g, TIDY, BEARS);
    expect(g.state.pending?.kind).toBe('priority');
    expect(tokens(g, BEARS)).toHaveLength(0);
  });

  test('a land card discarded triggers the card of the other filter (the filter decides which discards)', () => {
    const g = scenario()
      .seat(0)
      .life(20)
      .hand(TIDY, 'Island')
      .battlefield(WATCHER, 'Swamp')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    discard(g, TIDY, 'Island');
    g.expect.life(0, 22);
  });

  test('madness: the card goes to exile and is still discarded; the copy is made from it', () => {
    const g = scarabGame((b) => b.hand(FIEND));
    discard(g, TIDY, FIEND);
    // The two triggers (madness and the copy) may be ordered; the copy is paid for, the madness cast declined.
    for (let i = 0; i < 8; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'orderTriggers') {
        g.act(0).orderTriggers(0, 1);
      } else if (d?.kind === 'confirmOptional' && d.purpose === 'mayPay') {
        g.act(0).accept();
        g.act(0).payAuto();
      } else if (d?.kind === 'confirmOptional') {
        g.act(0).decline();
      }
      g.passAll();
    }
    expect(tokens(g, FIEND)).toHaveLength(1);
    g.expect.pt(bf(FIEND), 4, 4);
    g.expect.derived(bf(FIEND), { subtypes: ['Zombie'], colors: ['B'] });
  });
});

describe('Champion of Wits feeding Hashaton: enters, draws its power, discards two, and each creature card discarded is asked for', () => {
  const play = (hand: readonly string[], library: readonly string[], lands = 6): ScenarioGame =>
    scenario()
      .seat(0)
      .hand(...hand)
      .battlefield(SCARAB)
      .battlefield('Island', { count: lands })
      .library(...library)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();

  test('two creature cards drawn and discarded: two questions, one paid for, one declined', () => {
    const g = play([RUMMAGER], [BEARS, 'Llanowar Elves', ...FILLER]);
    g.act(0).cast(RUMMAGER, { pay: true });
    g.passAll();
    // "You may draw cards equal to its power."
    g.act(0).accept();
    let paid = false;
    for (let i = 0; i < 8; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'orderTriggers') {
        g.act(0).orderTriggers(0, 1);
      } else if (d?.kind === 'confirmOptional' && d.purpose === 'mayPay') {
        if (paid) {
          g.act(0).decline();
        } else {
          g.act(0).accept();
          g.act(0).payAuto();
          paid = true;
        }
      }
      g.passAll();
    }
    expect(paid).toBe(true);
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    const copies = [BEARS, 'Llanowar Elves'].flatMap((name) => tokens(g, name));
    expect(copies).toHaveLength(1);
    expect(copies[0]?.tapped).toBe(true);
    g.expect.invariants();
  });

  test('the eternalized token draws four (its own power) and the two cards discarded feed Scarab Fist', () => {
    const g = scenario()
      .seat(0)
      .graveyard(RUMMAGER)
      .battlefield(SCARAB)
      .battlefield('Island', { count: 5 })
      .library(BEARS, 'Llanowar Elves', 'Island', 'Island', ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).activate(RUMMAGER, { pay: true });
    g.passAll();
    g.act(0).accept();
    // Four cards drawn: Grizzly Bears, Llanowar Elves and two Islands; two are discarded, the hand deciding which.
    g.expect.handSize(0, 4);
    g.act(0).chooseCards(BEARS, 'Llanowar Elves');
    for (let i = 0; i < 6; i += 1) {
      const d = g.state.pending;
      if (d?.kind === 'orderTriggers') g.act(0).orderTriggers(0, 1);
      else if (d?.kind === 'confirmOptional') g.act(0).decline();
      g.passAll();
    }
    g.expect.zone(BEARS, 'graveyard', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'graveyard', { seat: 0 });
    // The token is a 4/4 black Zombie Snake Wizard.
    g.expect.pt(bf(RUMMAGER), 4, 4);
  });
});

describe('Renewed Solidarity: "At the beginning of your end step, for each token you control of the chosen type that entered this turn, create a token that\'s a copy of it."', () => {
  const play = (): ScenarioGame => {
    const g = scenario()
      .seat(0)
      .hand(ECHO, SOWER)
      .battlefield('Plains', 'Plains', 'Plains', 'Mountain', 'Mountain')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(ECHO, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Goblin');
    return g;
  };

  test('the +1/+0 for the chosen type, and the tokens that entered this turn are copied at the end step', () => {
    const g = play();
    g.act(0).cast(SOWER, { pay: true });
    g.passAll();
    expect(tokens(g, 'Goblin')).toHaveLength(2);
    for (const o of tokens(g, 'Goblin')) {
      const shown = getView(g.state, 0).battlefield.find((v) => v.id === o.id);
      expect([shown?.power, shown?.toughness]).toEqual([2, 1]);
    }
    g.advanceTo('end');
    g.passAll();
    const goblins = tokens(g, 'Goblin');
    expect(goblins).toHaveLength(4);
    for (const o of goblins) {
      const shown = getView(g.state, 0).battlefield.find((v) => v.id === o.id);
      expect(shown?.power).toBe(2);
      expect(shown?.subtypes).toEqual(['Goblin']);
      expect(shown?.colors).toEqual(['R']);
    }
    g.expect.invariants();
  });

  test('a token of another type, a token of the opponent and a nontoken creature of the type are not copied', () => {
    const g = scenario()
      .seat(0)
      .hand(ECHO, SOWER)
      .battlefield('Plains', 'Plains', 'Plains', 'Mountain', 'Raging Goblin')
      .library(...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(ECHO, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Elf');
    g.act(0).cast(SOWER, { pay: true });
    g.passAll();
    // Goblin tokens and a Goblin card, the chosen type is Elf: nothing is copied.
    g.advanceTo('end');
    g.passAll();
    expect(tokens(g, 'Goblin')).toHaveLength(2);
    g.expect.noObject('Raging Goblin', { zone: 'graveyard' });
    expect(g.find({ name: 'Raging Goblin', zone: 'battlefield', seat: 0 })).toHaveLength(1);
  });

  test('a token that entered in an earlier turn is not copied', () => {
    const g = scenario()
      .seat(0)
      .hand(ECHO, SOWER)
      .battlefield('Plains', 'Plains', 'Plains', 'Mountain', 'Mountain')
      .library(SOWER, ...FILLER)
      .seat(1)
      .library(...FILLER)
      .at('precombatMain')
      .build();
    g.act(0).cast(SOWER, { pay: true });
    g.passAll();
    g.advanceTo('precombatMain', { turn: 'next' });
    g.advanceTo('precombatMain', { turn: 'next' });
    g.act(0).cast(ECHO, { pay: true });
    g.passAll();
    g.act(0).chooseOption('Goblin');
    g.act(0).cast(SOWER, { pay: true });
    g.passAll();
    expect(tokens(g, 'Goblin')).toHaveLength(4);
    g.advanceTo('end');
    g.passAll();
    // Two entered this turn: two copies. The two of the earlier turn are not copied.
    expect(tokens(g, 'Goblin')).toHaveLength(6);
  });

  test('the copies are not copied again (the ability triggered once)', () => {
    const g = play();
    g.act(0).cast(SOWER, { pay: true });
    g.passAll();
    g.advanceTo('end');
    g.passAll();
    g.passAll();
    expect(tokens(g, 'Goblin')).toHaveLength(4);
  });
});
