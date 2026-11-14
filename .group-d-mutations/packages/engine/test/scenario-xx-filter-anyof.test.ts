// Object filters can say "or": `ObjectFilter.anyOf` (D-063 amendment). "Destroy target artifact or
// enchantment" is one target slot whose legal targets are the artifacts and the enchantments
// (CR 115.1: a target is chosen among the objects the text allows; CR 601.2c: targets are chosen
// while casting; CR 608.2b: they are checked again on resolution). The members of `anyOf` describe
// the object; where to look (the zone) stays on the outer filter.
// All cards are SYNTHETIC (invented for these tests).
import { describe, expect, test } from 'vitest';
import { type CardDefinition, validateCard } from '../src/index';
import { type ScenarioGame, scenario } from '../src/testing/index';
import { singleFaceCard } from './dsl-helpers';
import { nameOf } from './scenario-names';

const ARTIFACT_OR_ENCHANTMENT = [{ types: ['artifact'] }, { types: ['enchantment'] }] as const;

function sorcery(name: string, oracleText: string, spell: CardDefinition['faces'][0]['spell']) {
  return singleFaceCard({
    name,
    manaCost: ['1', 'W'],
    types: ['sorcery'],
    colors: ['W'],
    colorIdentity: ['W'],
    oracleText,
    ...(spell === null ? {} : { spell }),
  });
}

const REND = sorcery('SYNTHETIC Rend', 'SYNTHETIC: destroy target artifact or enchantment.', {
  targets: [
    {
      id: 't1',
      what: {
        kind: 'object',
        filter: { zone: 'battlefield', anyOf: ARTIFACT_OR_ENCHANTMENT },
      },
    },
  ],
  effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
});

const SWEEP = sorcery('SYNTHETIC Sweep', 'SYNTHETIC: destroy each artifact or enchantment.', {
  effect: {
    kind: 'destroy',
    objects: { kind: 'each', filter: { zone: 'battlefield', anyOf: ARTIFACT_OR_ENCHANTMENT } },
  },
});

/** Exile target artifact card or enchantment card from a graveyard (the zone is the outer one). */
const SCOUR = sorcery('SYNTHETIC Scour', 'SYNTHETIC: exile target relic card.', {
  targets: [
    {
      id: 't1',
      what: { kind: 'object', filter: { zone: 'graveyard', anyOf: ARTIFACT_OR_ENCHANTMENT } },
    },
  ],
  effect: { kind: 'exile', objects: { kind: 'target', id: 't1' } },
});

/** The outer fields AND one member: a nonblack creature or an artifact the opponent controls. */
const PICK = sorcery('SYNTHETIC Pick', 'SYNTHETIC: destroy a thing an opponent controls.', {
  targets: [
    {
      id: 't1',
      what: {
        kind: 'object',
        filter: {
          zone: 'battlefield',
          controller: 'opponent',
          anyOf: [{ types: ['creature'], colors: ['G'] }, { types: ['artifact'] }],
        },
      },
    },
  ],
  effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
});

const SHRINE = singleFaceCard({
  name: 'SYNTHETIC Shrine',
  manaCost: ['1', 'W'],
  types: ['enchantment'],
  colors: ['W'],
  colorIdentity: ['W'],
  oracleText: '',
});

function legalNames(g: ScenarioGame): string[] {
  const d = g.state.pending;
  if (d?.kind !== 'targets') throw new Error(`expected a targets decision, got ${d?.kind}`);
  const spec = d.specs[0];
  if (!spec) throw new Error('no target slot');
  return spec.legal.flatMap((t) => (t.kind === 'object' ? [nameOf(g, t.id)] : ['player']));
}

function board() {
  return scenario()
    .define(REND)
    .define(SWEEP)
    .define(SCOUR)
    .define(PICK)
    .define(SHRINE)
    .seat(0)
    .hand('SYNTHETIC Rend', 'SYNTHETIC Sweep', 'SYNTHETIC Scour', 'SYNTHETIC Pick')
    .battlefield('Plains', { count: 2 })
    .battlefield('Grizzly Bears')
    .seat(1)
    .battlefield('Sol Ring', 'SYNTHETIC Shrine', 'Llanowar Elves');
}

describe('"destroy target artifact or enchantment" (CR 115.1, 601.2c)', () => {
  test('the artifact and the enchantment are offered, the creatures are not', () => {
    const g = board().build();
    g.act(0).cast('SYNTHETIC Rend');
    expect(legalNames(g).sort()).toEqual(['SYNTHETIC Shrine', 'Sol Ring']);
  });

  test('an artifact can be the target and is destroyed', () => {
    const g = board().build();
    g.act(0).cast('SYNTHETIC Rend', { targets: [{ name: 'Sol Ring' }], pay: true });
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    g.expect.zone('SYNTHETIC Shrine', 'battlefield', { seat: 1 });
  });

  test('an enchantment can be the target and is destroyed', () => {
    const g = board().build();
    g.act(0).cast('SYNTHETIC Rend', { targets: [{ name: 'SYNTHETIC Shrine' }], pay: true });
    g.passAll();
    g.expect.zone('SYNTHETIC Shrine', 'graveyard', { seat: 1 });
    g.expect.zone('Sol Ring', 'battlefield', { seat: 1 });
  });

  test('a creature is not a legal target and the cast is refused (CR 601.2c)', () => {
    const g = board().build();
    g.act(0).cast('SYNTHETIC Rend');
    const r = g.act(0).try.action({
      kind: 'chooseTargets',
      targets: [{ kind: 'object', id: g.id('Grizzly Bears'), specId: 't1' }],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/not a legal target/);
  });
});

describe('anyOf on a mass selector and on another zone', () => {
  test('"destroy each artifact or enchantment" takes both and leaves the creatures', () => {
    const g = board().build();
    g.act(0).cast('SYNTHETIC Sweep', { pay: true });
    g.passAll();
    g.expect.zone('Sol Ring', 'graveyard', { seat: 1 });
    g.expect.zone('SYNTHETIC Shrine', 'graveyard', { seat: 1 });
    g.expect.zone('Grizzly Bears', 'battlefield', { seat: 0 });
    g.expect.zone('Llanowar Elves', 'battlefield', { seat: 1 });
  });

  test('the members inherit the zone of the outer filter (a graveyard here)', () => {
    const g = scenario()
      .define(SCOUR)
      .define(SHRINE)
      .seat(0)
      .hand('SYNTHETIC Scour')
      .battlefield('Plains', { count: 2 })
      .graveyard('Sol Ring', 'SYNTHETIC Shrine', 'Grizzly Bears')
      .seat(1)
      .battlefield('Sol Ring')
      .build();
    g.act(0).cast('SYNTHETIC Scour');
    const names = legalNames(g);
    // Two graveyard cards match; the battlefield's Sol Ring and the graveyard's Bears do not.
    expect(names.sort()).toEqual(['SYNTHETIC Shrine', 'Sol Ring']);
  });

  test('outer fields are ANDed with one member: controller opponent, then creature or artifact', () => {
    const g = board().build();
    g.act(0).cast('SYNTHETIC Pick');
    // Seat 1's artifact matches; seat 1's Llanowar Elves is a green creature; the shrine is
    // neither; seat 0's own Bears are excluded by the outer controller field.
    expect(legalNames(g).sort()).toEqual(['Llanowar Elves', 'Sol Ring']);
  });
});

describe('validation of anyOf', () => {
  test('the cards above are valid', () => {
    for (const card of [REND, SWEEP, SCOUR, PICK]) expect(validateCard(card)).toEqual([]);
  });

  test('an empty anyOf is rejected, wherever it appears', () => {
    const empty = sorcery('SYNTHETIC Empty', 'SYNTHETIC: never.', {
      targets: [{ id: 't1', what: { kind: 'object', filter: { zone: 'battlefield', anyOf: [] } } }],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't1' } },
    });
    expect(validateCard(empty).map((i) => `${i.path}: ${i.message}`)).toEqual([
      'faces[0].spell.targets[0].what.filter.anyOf: anyOf must be a non-empty list when present',
    ]);
    const emptyEach = sorcery('SYNTHETIC Empty Each', 'SYNTHETIC: never.', {
      effect: { kind: 'destroy', objects: { kind: 'each', filter: { anyOf: [] } } },
    });
    expect(validateCard(emptyEach).some((i) => i.path.endsWith('.filter.anyOf'))).toBe(true);
  });

  test('a member that sets the zone or the stack kind is rejected, and members are checked', () => {
    const bad = sorcery('SYNTHETIC Bad Member', 'SYNTHETIC: never.', {
      effect: {
        kind: 'destroy',
        objects: {
          kind: 'each',
          filter: { anyOf: [{ zone: 'graveyard' }, { types: ['dragon' as never] }] },
        },
      },
    });
    const messages = validateCard(bad).map((i) => `${i.path}: ${i.message}`);
    expect(messages).toContain(
      'faces[0].spell.effect.objects.filter.anyOf[0].zone: zone is set on the outer filter, not on an anyOf member',
    );
    expect(messages.some((m) => m.includes('anyOf[1].types[0]: unknown card type'))).toBe(true);
  });

  test('a sacrifice choice may not name an opponent inside anyOf either (CR 701.21a)', () => {
    const bad = singleFaceCard({
      name: 'SYNTHETIC Greedy',
      manaCost: ['1'],
      types: ['creature'],
      colors: [],
      colorIdentity: [],
      power: 1,
      toughness: 1,
      oracleText: '',
      abilities: [
        {
          kind: 'triggered',
          trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
          effect: {
            kind: 'sacrifice',
            objects: {
              kind: 'choose',
              filter: { anyOf: [{ types: ['artifact'], controller: 'opponent' }] },
            },
          },
        },
      ],
    });
    expect(
      validateCard(bad).some((i) => i.message.includes('only sacrifice permanents they control')),
    ).toBe(true);
  });
});
