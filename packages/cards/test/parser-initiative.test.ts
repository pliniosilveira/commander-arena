// "You take the initiative" (CR 726.1, 726.3) and the wordings of Seasoned Dungeoneer through the whole pipeline: what they lower to, the near misses the grammar must drop (never half read), and the
// engine features the lowering needs (a card whose feature is missing is dropped, not guessed). The engine runs the same nodes in convert-grammar-engine-seasoned-dungeoneer.test.ts.
import { describe, expect, test, vi } from 'vitest';

vi.mock('@commander-arena/engine', async (importOriginal) =>
  (await import('./blocked-features')).blockFeatures(
    await importOriginal<typeof import('@commander-arena/engine')>(),
  ),
);

import { read, readAll, withoutFeature } from './parser-p5-helpers';

describe('"you take the initiative" (CR 726.1)', () => {
  test('a creature trigger, a spell and an activated sentence read the effect for one player', () => {
    const [etb] = readAll('When ~ enters, you take the initiative.', 'creature').abilities;
    expect(etb).toEqual({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'takeInitiative', player: { kind: 'you' } },
    });
    expect(readAll('You take the initiative.', 'sorcery').spell?.effect).toEqual({
      kind: 'takeInitiative',
      player: { kind: 'you' },
    });
  });

  test('"target player takes the initiative" names the target', () => {
    const spell = readAll('Target player takes the initiative.', 'sorcery').spell;
    expect(spell?.effect).toEqual({
      kind: 'takeInitiative',
      player: { kind: 'target', id: 't1' },
    });
    expect(spell?.targets).toEqual([{ id: 't1', what: { kind: 'player', filter: 'any' } }]);
  });

  test('it follows another effect in the same ability', () => {
    const [a] = readAll(
      'When ~ enters, you gain 2 life and you take the initiative.',
      'creature',
    ).abilities;
    expect(a?.kind === 'triggered' && a.effect.kind).toBe('sequence');
  });

  test.each([
    'When ~ enters, each opponent takes the initiative.',
    'When ~ enters, any number of target players take the initiative.',
    'When ~ enters, you takes the initiative.',
    'When ~ enters, target player take the initiative.',
    'When ~ enters, you take initiative.',
    'When ~ enters, you take the initiatives.',
    'When ~ enters, you take the initiative of the realm.',
  ])('another subject or wording is dropped (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature').unparsed.length).toBeGreaterThan(0);
  });

  test('without effect:takeInitiative in the engine the ability is not read', () => {
    expect(
      withoutFeature('effect:takeInitiative', 'When ~ enters, you take the initiative.').reason,
    ).toBeDefined();
  });
});

describe('"target attacking Cleric, Rogue, Warrior, or Wizard" (CR 508.1k, 205.3m, 115.1)', () => {
  const TEXT =
    'Whenever you attack, target attacking Cleric, Rogue, Warrior, or Wizard gains protection from creatures until end of turn.';

  test('is an attacking creature that is one of the types, with the protection from the card type', () => {
    const [a] = readAll(TEXT, 'creature', ['Human', 'Warrior']).abilities;
    expect(a?.kind === 'triggered' && a.targets).toEqual([
      {
        id: 't1',
        what: {
          kind: 'object',
          filter: {
            zone: 'battlefield',
            attacking: true,
            anyOf: [
              { subtypes: ['Cleric'] },
              { subtypes: ['Rogue'] },
              { subtypes: ['Warrior'] },
              { subtypes: ['Wizard'] },
            ],
          },
        },
      },
    ]);
    expect(a?.kind === 'triggered' && a.effect).toEqual({
      kind: 'grantKeyword',
      objects: { kind: 'target', id: 't1' },
      keyword: { kind: 'protection', from: 'cardType', types: ['creature'] },
      duration: 'untilEndOfTurn',
    });
  });

  test('"It explores." is about the same target', () => {
    const [a] = readAll(`${TEXT} It explores.`, 'creature', ['Human', 'Warrior']).abilities;
    expect(a?.kind === 'triggered' && a.effect).toMatchObject({
      kind: 'sequence',
      effects: [
        { kind: 'grantKeyword' },
        { kind: 'explore', objects: { kind: 'target', id: 't1' } },
      ],
    });
  });

  test.each([
    'Whenever you attack, target attacking Cleric, Rogue, Warrior, and Wizard gains protection from creatures until end of turn.',
    'Whenever you attack, target attacking Cleric, Rogue Warrior, or Wizard gains protection from creatures until end of turn.',
    'Whenever you attack, target attacking Cleric, Rogue, Warrior, or Wizard gains protection from creature until end of turn.',
    'Whenever you attack, target attacking Cleric, Rogue, Warrior, or Wizard gains protection from creatures.',
    'Whenever you attack, target attacking Cleric, Rogue, Warrior, or Wizard gains protection from nonblack creatures until end of turn.',
    'Whenever you attack, target attacking Cleric, Rogue, Warrior, or Wizard gains protection from everything until end of turn.',
  ])('a near miss is dropped (SYNTHETIC): %s', (text) => {
    expect(read(text, 'creature', ['Human', 'Warrior']).unparsed.length).toBeGreaterThan(0);
  });

  test('protection from several card types is read for a target: "from artifacts and from enchantments"', () => {
    const effect = readAll(
      'Target creature gains protection from artifacts and from enchantments until end of turn.',
      'instant',
    ).spell?.effect;
    expect(effect).toMatchObject({
      keyword: { kind: 'protection', from: 'cardType', types: ['artifact', 'enchantment'] },
    });
  });

  test('without keyword:protection in the engine the grant is not read', () => {
    expect(
      withoutFeature('keyword:protection', TEXT, 'creature', ['Human', 'Warrior']).reason,
    ).toBeDefined();
  });
});
