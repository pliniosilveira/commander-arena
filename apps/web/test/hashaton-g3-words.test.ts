// The words of the primitives of group 3 of the Hashaton deck program (D-378 to D-380), read from the engine's SYNTHETIC fixtures
// (`synthetic-hashaton-g3.ts`): "Creatures you control can't have -1/-1 counters put on them.", "If you would draw a card except the first one you draw in each of your draw
// steps, draw two cards instead." and "If one or more tokens would be created under your control, twice that many of those tokens are created instead.", and the log line of a
// replaced draw.
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { expect, test } from 'vitest';
import { describeEvent } from '../src/game/describe';
import { drawInsteadWording } from '../src/game/draw-skip-text';
import { lordWordings, replacementWording } from '../src/game/static-text';

const abilitiesOf = (name: string): readonly Ability[] =>
  syntheticCard(name).faces[0]?.abilities ?? [];

const ctx = { noun: 'creature' } as never;

test('creatures you control can not have -1/-1 counters put on them', () => {
  expect(lordWordings(abilitiesOf('SYNTHETIC Counter Ward'), ctx)).toEqual([
    "Creatures you control can't have -1/-1 counters put on them.",
  ]);
});

test('a group of another kind, this creature and the enchanted creature', () => {
  expect(lordWordings(abilitiesOf('SYNTHETIC Loyalty Ward'), ctx)).toEqual([
    "Planeswalkers you control can't have loyalty counters put on them.",
  ]);
  expect(lordWordings(abilitiesOf('SYNTHETIC Lone Ward'), ctx)).toEqual([
    "This creature can't have +1/+1 counters put on it.",
  ]);
  expect(
    lordWordings(abilitiesOf('SYNTHETIC Ward Aura'), {
      noun: 'enchantment',
      subtypes: ['Aura'],
    }),
  ).toEqual(["Enchanted creature can't have +1/+1 counters put on it."]);
});

test('draw two cards instead of a draw, except the first of the draw step', () => {
  const [draw] = abilitiesOf('SYNTHETIC Draw Reign').filter((a) => a.kind === 'replacement');
  if (draw?.kind !== 'replacement') throw new Error('no replacement');
  expect(replacementWording(draw.replacement)).toBe(
    'If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead',
  );
  expect(drawInsteadWording({ kind: 'drawInstead', count: 3, exceptFirstInDrawStep: true })).toBe(
    'If you would draw a card except the first one you draw in each of your draw steps, draw three cards instead',
  );
});

test('twice that many of those tokens', () => {
  const [tokens] = abilitiesOf('SYNTHETIC Token Reign').filter((a) => a.kind === 'replacement');
  if (tokens?.kind !== 'replacement') throw new Error('no replacement');
  expect(replacementWording(tokens.replacement)).toBe(
    'If one or more tokens would be created under your control, twice that many of those tokens are created instead',
  );
});

test('the log line of a replaced draw names the permanent and how many cards are drawn instead', () => {
  const g = scenario().seat(0).battlefield('SYNTHETIC Draw Reign').seat(1).build();
  const source = g.state.battlefield[0];
  if (source === undefined) throw new Error('no permanent');
  const line = (seat: 0 | 1, viewer: 0 | 1) =>
    describeEvent(
      { kind: 'drawReplaced', seat, sources: [source], count: 2 },
      g.state,
      g.state,
      viewer,
    )?.text;
  expect(line(0, 0)).toBe('SYNTHETIC Draw Reign replaces your draw: You draw 2 cards instead.');
  expect(line(0, 1)).toBe(
    "SYNTHETIC Draw Reign replaces opponent's draw: Opponent draws 2 cards instead.",
  );
});

test('the whole card says both lines, in order', () => {
  expect(lordWordings(abilitiesOf('SYNTHETIC Twin Reign'), ctx)).toEqual([
    'If you would draw a card except the first one you draw in each of your draw steps, draw two cards instead.',
    'If one or more tokens would be created under your control, twice that many of those tokens are created instead.',
  ]);
});
