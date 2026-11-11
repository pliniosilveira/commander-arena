// Stage P7b: the layouts of a stored Scryfall card (D-087). Every card here is SYNTHETIC: Scryfall's
// shape (the name `A // B`, one face per half, `colors` on each face, no mana cost on a back face)
// with invented names and text. The gate reads the engine's registry of layouts at run time, so
// these tests change what the registry says instead of assuming the list.
import { SUPPORTED_FEATURES } from '@commander-arena/engine';
import { afterEach, describe, expect, test } from 'vitest';
import {
  cachedSupport,
  importCard,
  MemorySupportCache,
  PARSER_VERSION,
  resolveLayout,
} from '../src/index';
import { NO_OVERRIDES } from './convert-grammar-helpers';
import { syntheticCard, syntheticFace } from './convert-helpers';
import { creature, instant, multi } from './convert-layout-helpers';

const parse = (card: ReturnType<typeof syntheticCard>) => importCard(card, undefined, NO_OVERRIDES);

describe('the layout gate reads the engine registry', () => {
  const registry = SUPPORTED_FEATURES as unknown as { layouts: readonly string[] };
  const original = registry.layouts;
  afterEach(() => {
    registry.layouts = original;
  });

  const faces = [creature('SYNTHETIC Front'), creature('SYNTHETIC Back', { manaCost: '' })];

  test.each(['split', 'adventure', 'modal_dfc', 'transform'])(
    'the engine lists %s, so the layout carries no reason of its own',
    (layout) => {
      expect(SUPPORTED_FEATURES.layouts).toContain(layout);
      const back =
        layout === 'adventure'
          ? creature('SYNTHETIC Back', { manaCost: '{R}', typeLine: 'Instant — Adventure' })
          : faces[1];
      const resolved = resolveLayout(
        multi(layout, [faces[0] as (typeof faces)[number], back as (typeof faces)[number]]),
      );
      expect(resolved.layout).toBe(layout);
      expect(resolved.faces.map((f) => f.index)).toEqual([0, 1]);
      expect(resolved.reasons).toEqual([]);
    },
  );

  test('a layout the engine stops listing is reported by name, with every face kept', () => {
    registry.layouts = original.filter((l) => l !== 'transform');
    const resolved = resolveLayout(multi('transform', faces));
    expect(resolved.layout).toBe('transform');
    expect(resolved.faces).toHaveLength(2);
    expect(resolved.reasons).toEqual(['layout "transform" is not supported yet']);
  });

  test('a layout the engine starts listing is accepted without a change here', () => {
    registry.layouts = [...original, 'saga'];
    const resolved = resolveLayout(syntheticCard({}, { layout: 'saga' }));
    expect(resolved.layout).toBe('saga');
    expect(resolved.reasons).toEqual([]);
  });

  test('the normal layout is never reported', () => {
    expect(resolveLayout(syntheticCard()).reasons).toEqual([]);
  });

  test.each(['flip', 'meld', 'leveler', 'prototype', 'mutate', 'case', 'battle', 'token'])(
    'the layout %s is not modelled: face 0 as a normal card and a reason naming it',
    (layout) => {
      const resolved = resolveLayout(multi(layout, faces));
      expect(resolved.layout).toBe('normal');
      expect(resolved.faces.map((f) => f.index)).toEqual([0]);
      expect(resolved.reasons).toEqual([`layout "${layout}" is not supported`]);
    },
  );

  test('a supported layout with the wrong number of faces says how many it needs', () => {
    expect(resolveLayout(multi('transform', [faces[0] as (typeof faces)[number]])).reasons).toEqual(
      ['layout "transform" needs 2 face(s), found 1'],
    );
    expect(resolveLayout(multi('adventure', [...faces, ...faces])).reasons).toEqual([
      'layout "adventure" needs 2 face(s), found 4',
    ]);
  });
});

describe('what the engine reports about a split card, as the player is told it', () => {
  const singe = instant('SYNTHETIC Singe', 'SYNTHETIC Singe deals 2 damage to target creature.');
  const mend = instant('SYNTHETIC Mend', 'You gain 4 life.', {
    manaCost: '{1}{W}',
    colors: ['W'],
  });

  test('two readable halves are supported', () => {
    const imported = parse(multi('split', [singe, mend], ['W', 'R']));
    expect(imported.support.unparsed).toEqual([]);
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.layout).toBe('split');
  });

  test('a half the grammar cannot read makes the card unsupported, naming the face', () => {
    const imported = parse(
      multi('split', [singe, { ...mend, oracleText: 'Populate, then draw a card.' }], ['W', 'R']),
    );
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.unparsed.map((u) => u.face)).toEqual([1]);
  });

  test('Fuse is refused, by its line (CR 702.102)', () => {
    const fuse = (text: string) => ({
      ...singe,
      oracleText: `${text}\nFuse (You may cast one or both halves of this card from your hand.)`,
    });
    const imported = parse(multi('split', [fuse(singe.oracleText), mend], ['W', 'R']));
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toMatch(/Fuse/);
  });

  test('Aftermath is refused, by its line (CR 702.127)', () => {
    const aftermath = {
      ...mend,
      typeLine: 'Sorcery',
      oracleText:
        'Aftermath (Cast this spell only from your graveyard. Then exile it.)\nYou gain 4 life.',
    };
    const imported = parse(multi('split', [singe, aftermath], ['W', 'R']));
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toMatch(/Aftermath/);
  });

  test('a split card with permanent halves (a Room) is refused (CR 709.5)', () => {
    const room = (name: string) =>
      syntheticFace({ name, manaCost: '{2}{G}', typeLine: 'Enchantment — Room', colors: ['G'] });
    const imported = parse(multi('split', [room('SYNTHETIC Hall'), room('SYNTHETIC Cellar')]));
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons.join('\n')).toMatch(/Room/);
  });
});

describe('the Adventure face (CR 715.2)', () => {
  const bear = creature('SYNTHETIC Brawler Bear');
  const chop = instant('SYNTHETIC Chop', 'SYNTHETIC Chop deals 2 damage to target creature.', {
    typeLine: 'Instant — Adventure',
  });

  test('an instant with the Adventure subtype after a creature is supported', () => {
    const imported = parse(multi('adventure', [bear, chop], ['R', 'G']));
    expect(imported.support.reasons).toEqual([]);
    expect(imported.support.status).toBe('supported');
    expect(imported.definition.faces[1]?.subtypes).toEqual(['Adventure']);
  });

  test('a sorcery Adventure is supported too', () => {
    const peek = { ...chop, typeLine: 'Sorcery — Adventure', oracleText: 'Draw a card.' };
    expect(parse(multi('adventure', [bear, peek], ['R', 'G'])).support.status).toBe('supported');
  });

  test('a second face that is a creature is refused, naming the face and the layout', () => {
    const imported = parse(multi('adventure', [bear, creature('SYNTHETIC Other')]));
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons).toEqual([
      'layout "adventure": face 1 (SYNTHETIC Other) must be an instant or sorcery with the Adventure subtype',
    ]);
  });

  test('an instant without the Adventure subtype is refused the same way', () => {
    const imported = parse(multi('adventure', [bear, { ...chop, typeLine: 'Instant' }]));
    expect(imported.support.status).toBe('unsupported');
    expect(imported.support.reasons).toEqual([
      'layout "adventure": face 1 (SYNTHETIC Chop) must be an instant or sorcery with the Adventure subtype',
    ]);
  });
});

describe('faces, names, colours and identity', () => {
  const front = creature('SYNTHETIC Moon Cub', {
    oracleText: 'At the beginning of your upkeep, transform SYNTHETIC Moon Cub.',
  });
  const back = creature('SYNTHETIC Moon Beast', {
    manaCost: '',
    typeLine: 'Creature — Wolf Werewolf',
    power: '4',
    toughness: '4',
    colors: ['G'],
    oracleText: 'Trample',
  });
  const card = multi('transform', [front, back]);

  test('the name is the one Scryfall writes, and each face keeps its own', () => {
    const { definition } = parse(card);
    expect(definition.name).toBe('SYNTHETIC Moon Cub // SYNTHETIC Moon Beast');
    expect(definition.faces.map((f) => f.name)).toEqual([
      'SYNTHETIC Moon Cub',
      'SYNTHETIC Moon Beast',
    ]);
  });

  test('a back face has no mana cost and takes its colours from the face (the colour indicator)', () => {
    const { definition } = parse(card);
    expect(definition.faces[1]?.manaCost).toBeNull();
    expect(definition.faces[1]?.colors).toEqual(['G']);
    const indicator = parse(
      multi('transform', [front, { ...back, colors: ['R'] }], ['R', 'G']),
    ).definition;
    expect(indicator.faces[1]?.manaCost).toBeNull();
    expect(indicator.faces[1]?.colors).toEqual(['R']);
  });

  test('the colour identity is the stored one, never recomputed from the faces', () => {
    // A symbol only in a rules text of the back face is in Scryfall's identity: the card says so.
    const stored = multi('transform', [front, { ...back, oracleText: 'Trample' }], ['G', 'R']);
    expect(parse(stored).definition.colorIdentity).toEqual(['G', 'R']);
    expect(parse(multi('transform', [front, back], [])).definition.colorIdentity).toEqual([]);
  });

  test('the layout string is the engine layout, exactly', () => {
    const faces = [front, back];
    for (const layout of ['split', 'adventure', 'modal_dfc', 'transform'] as const) {
      expect(parse(multi(layout, faces)).definition.layout).toBe(layout);
    }
  });

  test('a diagnostic of the back face carries face 1, and an unreadable cost names the face', () => {
    const imported = parse(
      multi('modal_dfc', [
        { ...front, oracleText: 'Vigilance' },
        { ...back, manaCost: '{Z}', oracleText: 'Banding' },
      ]),
    );
    expect(imported.support.unparsed).toMatchObject([{ face: 1, stoppedAt: 'Banding' }]);
    expect(imported.support.reasons.join('\n')).toMatch(/^face 1: /m);
  });
});

describe('the support cache after the layouts landed', () => {
  test('a report computed by the version before is recomputed for a transforming card', async () => {
    const front = creature('SYNTHETIC Moon Cub', { oracleText: 'Vigilance' });
    const back = creature('SYNTHETIC Moon Beast', { manaCost: '', oracleText: 'Trample' });
    const card = multi('transform', [front, back]);
    const cache = new MemorySupportCache();
    await cache.put(card.oracleId, {
      status: 'unsupported',
      parserVersion: PARSER_VERSION - 1,
      source: 'parser',
      unparsed: [],
      reasons: ['layout "transform" is not supported yet'],
    });
    const report = await cachedSupport(cache, card, PARSER_VERSION, NO_OVERRIDES);
    expect(report.status).toBe('supported');
    expect(report.parserVersion).toBe(PARSER_VERSION);
  });
});
