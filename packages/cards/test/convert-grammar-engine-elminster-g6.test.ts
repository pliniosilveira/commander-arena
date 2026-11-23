// "Twice X" and "X target ..." in a mode (the Elminster deck, group 6): Heliod's Intervention, "Choose one — • Destroy X target artifacts and/or enchantments. • Target player gains twice X
// life." The grammar reads "twice X" as the engine's `multiple` of `x`, and a mode of a spell that announces an X may take as many targets as that X (CR 601.2b: the modes are chosen,
// then X is announced, then the targets, CR 601.2c). SYNTHETIC cards carry the real line under a made-up name; each is run through `applyAction` with the scenario DSL.
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { parsed, parseOnly, spellCard } from './convert-grammar-helpers';

const TEXT =
  'Choose one —\n• Destroy X target artifacts and/or enchantments.\n• Target player gains twice X life.';
const NAME = 'SYNTHETIC Parsed Intervention';
const SPELL = parsed(NAME, 'Instant', TEXT, { manaCost: '{X}{W}{W}', colors: ['W'] });

const base = () =>
  scenario()
    .define(SPELL)
    .seat(0)
    .hand(NAME)
    .battlefield('Plains', 'Plains', 'Plains', 'Plains', 'Plains')
    .seat(1)
    .battlefield('Sol Ring', { label: 'ring' })
    .battlefield('Sol Ring', { label: 'ring2' })
    .seat(0)
    .at('precombatMain');

describe('the grammar', () => {
  test('"twice X" is a multiple of X, and a mode takes X targets', () => {
    const spell = SPELL.faces[0]?.spell;
    expect(spell?.x).toBe(true);
    expect(spell?.modes?.[0]?.targets?.[0]).toMatchObject({ countX: true });
    expect(spell?.modes?.[1]?.effect).toMatchObject({
      kind: 'gainLife',
      amount: { kind: 'multiple', factor: 2, of: { kind: 'x' } },
    });
  });

  test('"twice X" is read for losing life too, and nothing else of its shape', () => {
    const ok = parseOnly(spellCard('SYNTHETIC Twice Lose', 'You lose twice X life.'));
    expect(ok.support.unparsed).toEqual([]);
    for (const text of [
      'You gain twice life.',
      'You gain twice Y life.',
      'You gain three times X life.',
    ]) {
      expect(parseOnly(spellCard('SYNTHETIC Twice Refused', text)).support.status, text).toBe(
        'unsupported',
      );
    }
  });

  test('X targets in a mode of a spell with no X stay refused', () => {
    const text = 'Choose one —\n• Destroy X target artifacts.\n• You gain 2 life.';
    expect(
      parseOnly(spellCard('SYNTHETIC No X', text, { manaCost: '{W}{W}' })).support.status,
    ).toBe('unsupported');
  });
});

describe('the engine runs it', () => {
  test('mode 2: X = 3 gains 6 life for the target player', () => {
    const g = base().build();
    g.act(0).cast(NAME, { modes: [1], x: 3, targets: [{ player: 1 }], pay: true });
    g.passAll();
    g.expect.life(1, 46);
    g.expect.life(0, 40);
  });

  test('mode 2: X = 0 gains nothing', () => {
    const g = base().build();
    g.act(0).cast(NAME, { modes: [1], x: 0, targets: [{ player: 0 }], pay: true });
    g.passAll();
    g.expect.life(0, 40);
  });

  test('mode 1: X = 2 destroys the two chosen permanents', () => {
    const g = base().build();
    g.act(0).cast(NAME, { modes: [0], x: 2, targets: ['ring', 'ring2'], pay: true });
    g.passAll();
    g.expect.noObject('Sol Ring', { zone: 'battlefield' });
  });

  test('mode 1: the X offered never exceeds the legal targets there are', () => {
    const g = base().build();
    g.act(0).cast(NAME, { modes: [0] });
    const xs = g.legalActions(0).flatMap((a) => (a.kind === 'chooseX' ? [a.value] : []));
    expect(Math.max(...xs)).toBe(2);
  });

  test('mode 2 is not limited by the artifacts and enchantments there are', () => {
    const g = base().build();
    g.act(0).cast(NAME, { modes: [1] });
    const xs = g.legalActions(0).flatMap((a) => (a.kind === 'chooseX' ? [a.value] : []));
    expect(Math.max(...xs)).toBeGreaterThan(2);
  });
});
