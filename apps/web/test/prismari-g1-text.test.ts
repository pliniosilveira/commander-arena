/**
 * The words of group 1 of the Prismari deck (D-624 to D-631) as pure models: the abilities that populate, copy tokens, give the copies haste and remove them at the end step (the
 * delayed group sentence about the tokens made), the amount "1 plus the instants and sorceries you cast this turn", the cast trigger with "from your hand", the batch trigger of
 * "one or more creature tokens you control deal combat damage to a player", the permanent that becomes a copy except it has myriad, and the strive line. Read from the engine's
 * SYNTHETIC cards, so a wording that drifts from the AST fails here. No DOM.
 */
import {
  type Ability,
  type CardDefinition,
  type StackAbility,
  syntheticCard,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { lordWordings } from '../src/game/static-text';
import { triggerWording } from '../src/game/trigger-text';
import { triggerGist } from '../src/ui/decisions/ability-label';

const faceOf = (card: CardDefinition) => {
  const face = card.faces[0];
  if (face === undefined) throw new Error(`${card.name} has no face`);
  return face;
};

const triggers = (name: string) =>
  faceOf(syntheticCard(name)).abilities.filter(
    (a): a is Ability & { kind: 'triggered' } => a.kind === 'triggered',
  );

const gist = (name: string, n = 0): string => {
  const trigger = triggers(name)[n];
  if (trigger === undefined) throw new Error(`${name} has no trigger ${n}`);
  return triggerGist(
    trigger as unknown as StackAbility,
    {
      types: faceOf(syntheticCard(name)).types,
    } as never,
  );
};

const when = (name: string, n = 0): string | null => {
  const trigger = triggers(name)[n];
  if (trigger === undefined) throw new Error(`${name} has no trigger ${n}`);
  return triggerWording(trigger.trigger, { self: name });
};

test('populate and the delayed sacrifice of the token made (CR 701.36, 603.7)', () => {
  const words = gist('SYNTHETIC Iteration Engine');
  expect(words).toContain('Populate');
  expect(words).toContain('haste');
  expect(words).toContain('sacrifice it');
});

test('copies of a creature, with X of them and the exile at the end step (CR 707.2, 603.7)', () => {
  const words = gist('SYNTHETIC Flame Dancer');
  expect(words).toContain('copies of another target creature you control');
  expect(words).toContain('exile it');
  expect(words).toContain('1 plus the number of instant and sorcery spells you');
});

test('tapped and attacking copies of each token that entered this turn (CR 508.4)', () => {
  expect(gist('SYNTHETIC Storm Singer')).toContain('tapped and attacking');
});

test('the token chosen and the tokens that become copies of it (CR 707.9)', () => {
  const words = gist('SYNTHETIC Myr Tinker');
  expect(words).toContain('choose a token you control');
  expect(words).toContain('becomes a copy of');
});

test('the permanent that becomes a copy of a creature, except it has myriad (CR 707.9b)', () => {
  const words = gist('SYNTHETIC Mud Morph');
  expect(words).toContain('becomes a copy of');
  expect(words).toContain('nonlegendary');
});

test('"from your hand" and the batch trigger of the prepared cards (CR 722.3)', () => {
  expect(when('SYNTHETIC Focus Mage // Brain Surge')).toBe(
    'Whenever you cast an instant or sorcery with mana value 5 or greater from your hand',
  );
  expect(when('SYNTHETIC Sky Painter // Gift Spell', 1)).toBe(
    'Whenever one or more creature tokens you control deal combat damage to a player',
  );
});

test('Strive: the cost of each target beyond the first (CR 601.2f, 207.2c)', () => {
  const face = faceOf(syntheticCard('SYNTHETIC Twin Blaze'));
  const lines = lordWordings(face.abilities, { noun: 'sorcery' });
  expect(lines).toEqual([
    'Strive — This spell costs {2}{R} more to cast for each target beyond the first.',
  ]);
});
