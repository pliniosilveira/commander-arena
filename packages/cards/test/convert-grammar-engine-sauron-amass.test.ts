// Sauron deck, the amass and excess damage cards (March from the Black Gate, Surrounded by Orcs, Fall of Cair Andros): the REAL Oracle text of each card (the corpus's golden.jsonl)
// goes through the grammar as a card with no override, is defined in an engine scenario and is played through applyAction, so the nodes the parser writes for the real text are what
// the engine runs. Pins: CR 701.47a and 701.47b (amass: the Army chosen is the amassed Army), CR 603.2c and 603.6a (one ability that two events cause), CR 508.1 (the attack
// trigger), CR 120.10 (excess damage), CR 120.2b (noncombat damage), CR 608.2h (power read as the effect resolves), CR 701.17a (mill). The Scryfall rulings are unverified here (the
// sandbox cannot reach Scryfall); the behaviour follows the CR as the code cites it. The near misses of each new phrase are the `rejects` of the rules (`parser-registry.test.ts`).
import { readFileSync } from 'node:fs';
import { type CardDefinition, validateCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { fromGoldenCard, importCard, parseGolden } from '../src/index';
import { NO_OVERRIDES, parseOnly } from './convert-grammar-helpers';
import { syntheticCard } from './convert-helpers';

const GOLDEN = parseGolden(
  readFileSync(new URL('./fixtures/corpus/golden.jsonl', import.meta.url), 'utf8'),
);

function real(name: string): CardDefinition {
  const card = GOLDEN.find((c) => c.name === name);
  if (card === undefined) throw new Error(`${name} is not in the golden corpus`);
  const imported = importCard(fromGoldenCard(card), undefined, NO_OVERRIDES);
  expect(imported.support.unparsed, name).toEqual([]);
  expect(imported.support.reasons, name).toEqual([]);
  expect(imported.support.status, name).toBe('supported');
  return imported.definition;
}

const march = real('March from the Black Gate');
const surrounded = real('Surrounded by Orcs');
const andros = real('Fall of Cair Andros');

const LIBRARY = Array.from({ length: 12 }, () => 'Island');
const BOLT = 'Lightning Bolt';
const BEARS = 'Grizzly Bears';
const ARMY_CARD = 'SYNTHETIC Orc Army Veteran'; // 2/2 Orc Army creature card

const permanentsOf = (g: ReturnType<ReturnType<typeof scenario>['build']>, seat: number) =>
  Object.values(g.state.objects).filter(
    (o) => o.zone === 'battlefield' && o.controller === seat && o.card !== undefined,
  );

describe('every card is valid', () => {
  test.each([march, surrounded, andros])('$name passes validateCard', (card) => {
    expect(validateCard(card)).toEqual([]);
  });
});

describe('what the parser writes', () => {
  test('March from the Black Gate: one ability for each event, sharing the effect', () => {
    const abilities = march.faces[0]?.abilities ?? [];
    expect(abilities.map((a) => (a.kind === 'triggered' ? a.trigger : null))).toEqual([
      { kind: 'entersBattlefield', what: { kind: 'this' } },
      { kind: 'attacks', what: { subtypes: ['Army'], controller: 'you' } },
    ]);
    for (const a of abilities) {
      expect(a.kind === 'triggered' ? a.effect : null).toEqual({
        kind: 'amass',
        subtype: 'Orc',
        count: 1,
      });
    }
  });

  test('Surrounded by Orcs: the amass, then the mill of the amassed Army power', () => {
    expect(surrounded.faces[0]?.spell?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'amass', subtype: 'Orc', count: 3 },
        {
          kind: 'mill',
          player: { kind: 'target', id: 't1' },
          count: { kind: 'powerOf', of: { kind: 'moved' } },
        },
      ],
    });
  });

  test('Fall of Cair Andros: noncombat excess damage to a creature an opponent controls', () => {
    const [first] = andros.faces[0]?.abilities ?? [];
    expect(first).toEqual({
      kind: 'triggered',
      trigger: {
        kind: 'dealtDamage',
        what: { types: ['creature'], controller: 'opponent' },
        noncombat: true,
        excess: true,
      },
      effect: { kind: 'amass', subtype: 'Orc', count: { kind: 'triggerDamage' } },
    });
  });
});

describe('March from the Black Gate, played', () => {
  test('it enters (an Orc Army token with a counter), and an Army attacking amasses again', () => {
    const g = scenario()
      .define(march)
      .seat(0)
      .library(...LIBRARY)
      .hand(march.name)
      .battlefield('Swamp', 'Swamp')
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(march.name, { pay: true });
    g.passAll();
    const token = permanentsOf(g, 0).find((o) => o.token !== null);
    expect(token?.counters['+1/+1']).toBe(1);
    // Next turn it attacks: the attack trigger puts a second counter on the same Army.
    const h = scenario()
      .define(march)
      .seat(0)
      .library(...LIBRARY)
      .battlefield(march.name, ARMY_CARD)
      .seat(1)
      .library(...LIBRARY)
      .build();
    h.advanceTo('declareAttackers', { attack: false });
    h.act(0).attack([ARMY_CARD]);
    h.passAll();
    const army = permanentsOf(h, 0).find(
      (o) => o.token === null && o.counters['+1/+1'] !== undefined,
    );
    expect(army?.counters['+1/+1']).toBe(1);
  });
});

describe('Surrounded by Orcs, played', () => {
  test('the amassed Army has 3 counters and the target player mills its power', () => {
    const g = scenario()
      .define(surrounded)
      .seat(0)
      .library(...LIBRARY)
      .hand(surrounded.name)
      .battlefield('Island', 'Island', 'Island', 'Island', ARMY_CARD)
      .seat(1)
      .library(...LIBRARY)
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    g.act(0).cast(surrounded.name, { targets: [{ player: 1 }], pay: true });
    g.passAll();
    expect(g.state.seats[1]?.graveyard).toHaveLength(5);
    expect(g.state.seats[0]?.graveyard).toHaveLength(1);
  });
});

describe('Fall of Cair Andros, played', () => {
  test('damage short of lethal gives nothing, then 1 more is lethal and 2 is the excess (marked damage counts)', () => {
    const g = scenario({ seats: 3 })
      .define(andros)
      .seat(0)
      .library(...LIBRARY)
      .hand(BOLT, BOLT)
      .battlefield('Mountain', 'Mountain', andros.name)
      .seat(1)
      .library(...LIBRARY)
      .battlefield(BEARS, { label: 'a' })
      .seat(2)
      .library(...LIBRARY)
      .battlefield('Giant Spider', { label: 'b' })
      .at('precombatMain', { active: 0, turn: 1 })
      .build();
    // A first Bolt on the 2/4 is 3 damage of 4: no excess, so no amass.
    g.act(0).cast(`${BOLT}[0]`, { targets: ['b'], pay: true });
    g.passAll();
    g.expect.noEvent({ kind: 'tokenCreated' });
    // The second Bolt: 1 more is lethal and 2 is the excess.
    g.act(0).cast(`${BOLT}[0]`, { targets: ['b'], pay: true });
    g.passAll();
    const token = permanentsOf(g, 0).find((o) => o.token !== null);
    expect(token?.counters['+1/+1']).toBe(2);
  });
});

describe('lines that are not read', () => {
  const permanent = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Enchantment',
        typeLine: 'Enchantment',
        manaCost: '{1}',
        oracleText: text,
      }),
    ).support.status;
  const spell = (text: string) =>
    parseOnly(
      syntheticCard({
        name: 'SYNTHETIC Spell',
        typeLine: 'Sorcery',
        manaCost: '{1}',
        oracleText: text,
      }),
    ).support.status;

  test('the same shapes with the real words are supported (the near misses below change one thing each)', () => {
    expect(
      permanent(
        'Whenever a creature an opponent controls is dealt excess damage, amass Orcs X, where X is that excess damage.',
      ),
    ).toBe('supported');
    expect(
      spell("Amass Orcs 2, then target player mills X cards, where X is the amassed Army's power."),
    ).toBe('supported');
  });

  test('"that excess damage" is read only in the body of an excess damage trigger', () => {
    expect(
      permanent(
        'Whenever a creature an opponent controls is dealt damage, amass Orcs X, where X is that excess damage.',
      ),
    ).toBe('unsupported');
    expect(spell('Draw X cards, where X is that excess damage.')).toBe('unsupported');
  });

  test('"the amassed Army" is read only right after an amass', () => {
    expect(spell("Target player mills X cards, where X is the amassed Army's power.")).toBe(
      'unsupported',
    );
    expect(
      spell(
        "Amass Orcs 2, then you gain X life, then target player mills X cards, where X is the amassed Army's power.",
      ),
    ).toBe('unsupported');
  });

  test('a second event that is not an attack is not joined to the first', () => {
    expect(permanent('When ~ enters and whenever an Army you control dies, amass Orcs 1.')).toBe(
      'unsupported',
    );
  });
});
