/**
 * The words of group 1 of the Prismari deck (D-624 to D-631) as pure models: the abilities that populate, copy tokens, give the copies haste and remove them at the end step (the
 * delayed group sentence about the tokens made), the amount "1 plus the instants and sorceries you cast this turn", the cast trigger with "from your hand", the batch trigger of
 * "one or more creature tokens you control deal combat damage to a player", the permanent that becomes a copy except it has myriad, and the strive line. Read from the engine's
 * SYNTHETIC cards, so a wording that drifts from the AST fails here. No DOM.
 */
import {
  type Ability,
  type CardDefinition,
  type ChoosePermanentDecision,
  type ObjectView,
  type StackAbility,
  syntheticCard,
} from '@commander-arena/engine';
import { expect, test } from 'vitest';
import { lordWordings } from '../src/game/static-text';
import { triggerWording } from '../src/game/trigger-text';
import { triggerGist } from '../src/ui/decisions/ability-label';
import { angelsBadge, angelsPermanentPrompt } from '../src/ui/decisions/permanents-angels';
import {
  isPopulate,
  POPULATE_BADGE,
  POPULATE_TITLE,
  populateDetail,
  populatePrompt,
} from '../src/ui/decisions/permanents-populate';

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

// The question of populate (CR 701.36a, D-625): a `choosePermanent` of purpose 'populate', worded and badged as its own question, and not as another choice of permanents.
const POPULATE_QUESTION = {
  id: 'd1',
  kind: 'choosePermanent',
  seat: 0,
  purpose: 'populate',
  source: 'o9',
  min: 1,
  max: 1,
  legal: ['o1', 'o2'],
} as unknown as ChoosePermanentDecision;

const tokenView = (id: string, name: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    name,
    types: ['creature'],
    subtypes: [],
    supertypes: [],
    oracleText: '',
    controller: 0,
    owner: 0,
    zone: 'battlefield',
    isToken: true,
    ...extra,
  }) as unknown as ObjectView;

const tokens = new Map<`o${number}`, ObjectView>([
  ['o1', tokenView('o1', 'Soldier')],
  ['o2', tokenView('o2', 'Beast')],
  ['o9', tokenView('o9', 'Iteration Engine', { zone: 'battlefield', isToken: false })],
]);

test('populate: the question names the source and asks for a creature token; the badge and the bar say what a click does', () => {
  expect(isPopulate(POPULATE_QUESTION)).toBe(true);
  expect(populatePrompt(POPULATE_QUESTION, tokens)).toBe(
    'Populate: choose a creature token you control to copy (Iteration Engine).',
  );
  expect(angelsPermanentPrompt(POPULATE_QUESTION, tokens)).toBe(
    populatePrompt(POPULATE_QUESTION, tokens),
  );
  expect(angelsBadge(POPULATE_QUESTION, tokens)).toBe(POPULATE_BADGE);
  expect(populateDetail([], tokens)).toMatch(/^Click a creature token/);
  expect(populateDetail(['o2'], tokens)).toBe(
    'A token that is a copy of Beast will be created. Click it again to take it back.',
  );
  expect([POPULATE_TITLE, populateDetail([], tokens)].join(' ')).not.toMatch(/[Ss]acrifice/);
});

test('populate: another choice of permanents is not worded as populate', () => {
  const amass = { purpose: 'amass', min: 1, max: 1, legal: ['o1'], source: 'o9' } as never;
  expect(isPopulate(amass)).toBe(false);
  expect(angelsBadge(amass, tokens)).not.toBe(POPULATE_BADGE);
});
