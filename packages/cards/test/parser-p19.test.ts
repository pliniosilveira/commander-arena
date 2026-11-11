// Stage P19 (M6): modal spells and abilities (D-105, D-114; ENGINE_VERSION 19). "Choose one —" and its
// bullets are read through the whole pipeline and compared with the engine AST they must produce; each near
// miss says where it stops or why it is dropped. The real lines are those of reports/template-replay.md
// (the owner's run) where the replay has one ("Choose one — • ~ deals 3 damage to target creature. •
// Destroy target artifact.", "Choose two — • Destroy all artifacts. • Destroy all enchantments. • Destroy all
// creatures with mana value 3 or less. • Destroy all creatures with mana value 4 or greater.", "Choose one or
// more — • Exile all artifacts. ...", "Choose one — • Counter target blue spell. • Destroy target blue
// permanent.", "Choose one or more — • Destroy target artifact. • Destroy target enchantment. • Target
// creature gains hexproof and indestructible until end of turn."); every other line is SYNTHETIC (the
// wordings of docs/MECHANICS.md, "Modal spells and abilities") and no real card is claimed supported here.
// That the engine runs what is lowered is in convert-grammar-engine-p19.test.ts; that a missing engine
// feature is named is in parser-p19-needs.test.ts.
import type { Ability, SpellMode } from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { dropped, type FaceType, read, readAll } from './parser-p5-helpers';

const DRAW = { kind: 'draw', player: { kind: 'you' }, count: 1 } as const;
const GAIN3 = { kind: 'gainLife', player: { kind: 'you' }, amount: 3 } as const;
const CREATURE = { kind: 'object', filter: { zone: 'battlefield', types: ['creature'] } } as const;

const modalSpell = (text: string, type: 'instant' | 'sorcery' = 'instant') => {
  const spell = readAll(text, type).spell;
  if (spell?.modes === undefined) throw new Error(`"${text}" is not a modal spell`);
  return spell;
};

const abilities = (text: string, type: FaceType = 'creature') =>
  readAll(text, type).abilities as Ability[];

describe('the lead line: how many modes are chosen (CR 700.2)', () => {
  test.each([
    ['Choose one —', { min: 1, max: 1 }],
    ['Choose two —', { min: 2, max: 2 }],
    ['Choose one or both —', { min: 1, max: 2 }],
    ['Choose one or more —', { min: 1, max: 3 }],
  ] as const)('%s', (lead, expected) => {
    // "Both" is two modes: only that lead line is given exactly two bullets.
    const bullets =
      lead === 'Choose one or both —'
        ? '• Draw a card.\n• You gain 3 life.'
        : '• Draw a card.\n• You gain 3 life.\n• Scry 1.';
    const spell = modalSpell(`${lead}\n${bullets}`);
    expect(spell.chooseModes).toEqual(expected);
    expect(spell.effect).toBeUndefined();
    expect(spell.targets).toBeUndefined();
  });

  test('the modes are the bullets in printed order, as spells of their own', () => {
    const spell = modalSpell('Choose one —\n• Draw a card.\n• You gain 3 life.');
    expect(spell).toEqual({
      modes: [
        { text: 'Draw a card.', effect: DRAW },
        { text: 'You gain 3 life.', effect: GAIN3 },
      ],
      chooseModes: { min: 1, max: 1 },
    });
  });

  test('a mode is every sentence of its bullet', () => {
    const spell = modalSpell('Choose one —\n• Draw a card. You gain 3 life.\n• Scry 1.');
    expect(spell.modes?.[0]).toEqual({
      text: 'Draw a card. You gain 3 life.',
      effect: { kind: 'sequence', effects: [DRAW, GAIN3] },
    });
  });

  test('the card is named in the text of a mode, where the Oracle text says it', () => {
    const spell = modalSpell(
      'Choose one —\n• ~ deals 3 damage to target creature.\n• Destroy target artifact.',
    );
    expect(spell.modes?.map((m) => m.text)).toEqual([
      'SYNTHETIC Card deals 3 damage to target creature.',
      'Destroy target artifact.',
    ]);
  });

  test.each([
    'Choose three —\n• Draw a card.\n• You gain 3 life.\n• Scry 1.',
    'Choose up to two —\n• Draw a card.\n• You gain 3 life.',
    'Choose any number —\n• Draw a card.\n• You gain 3 life.',
    'Choose X —\n• Draw a card.\n• You gain 3 life.',
    'Choose one at random —\n• Draw a card.\n• You gain 3 life.',
    'Choose one\n• Draw a card.\n• You gain 3 life.',
    'Choose one -\n• Draw a card.\n• You gain 3 life.',
    'Choose up to five {P} worth of modes. You may choose the same mode more than once.\n• {P} — Draw a card.\n• {P}{P} — You gain 3 life.',
  ])('a lead line no rule reads leaves the whole text: %s', (text) => {
    const u = dropped(text, 'instant');
    expect(u).toMatchObject({ reason: 'unrecognised', stoppedAt: text });
  });

  test('"Choose two target creature cards" is not a modal text: no bullet follows', () => {
    const u = dropped(
      'Choose two target creature cards in your graveyard. Sacrifice a creature. If you do, return the chosen cards to the battlefield tapped.',
      'instant',
    );
    expect(u).toMatchObject({ reason: 'unrecognised', closestRule: 'none' });
  });
});

describe('the commander widening (CR 700.2, 903.3d)', () => {
  test('"Choose one. If you control a commander as you cast ~, you may choose both instead."', () => {
    const spell = modalSpell(
      'Choose one. If you control a commander as you cast ~, you may choose both instead.\n• Draw a card.\n• You gain 3 life.',
    );
    expect(spell.chooseModes).toEqual({
      min: 1,
      max: 1,
      maxIf: { condition: { kind: 'controlCommander' }, max: 2 },
    });
    expect(spell.modes).toHaveLength(2);
  });

  test('"both" is two modes: three bullets are refused', () => {
    const u = dropped(
      'Choose one. If you control a commander as you cast ~, you may choose both instead.\n• Draw a card.\n• You gain 3 life.\n• Scry 1.',
      'instant',
    );
    expect(u).toMatchObject({ reason: 'notRunnable', closestRule: 'modal.choose-commander' });
  });

  test.each([
    [
      'Choose one. If you control a commander as you cast ~, you may choose all instead.',
      'as you cast ~, you may choose all instead.',
    ],
    [
      'Choose one. If you control a commander, you may choose both instead.',
      ', you may choose both instead.',
    ],
    [
      'Choose two. If you control a commander as you cast ~, you may choose both instead.',
      'Choose two. If you control a commander as you cast ~, you may choose both instead.',
    ],
  ])('another wording is not read: %s', (lead, stoppedAt) => {
    const u = dropped(`${lead}\n• Draw a card.\n• You gain 3 life.`, 'instant');
    expect(u.reason).toBe('unrecognised');
    expect(u.stoppedAt.startsWith(stoppedAt)).toBe(true);
    expect(read(`${lead}\n• Draw a card.\n• You gain 3 life.`, 'instant').spell).toBeNull();
  });
});

describe('the bullets: how many modes (CR 700.2: two or more; the engine: at most eight)', () => {
  test('one bullet is not a choice', () => {
    expect(dropped('Choose one —\n• Draw a card.', 'instant')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'modal.choose',
    });
  });

  test('eight modes are read, nine are not', () => {
    const bullets = (n: number) => Array.from({ length: n }, () => '• Draw a card.').join('\n');
    expect(modalSpell(`Choose one —\n${bullets(8)}`).modes).toHaveLength(8);
    expect(dropped(`Choose one —\n${bullets(9)}`, 'instant')).toMatchObject({
      reason: 'notRunnable',
      closestRule: 'modal.choose',
    });
  });

  test('"choose one or both" says two: three bullets are refused', () => {
    expect(
      dropped('Choose one or both —\n• Draw a card.\n• You gain 3 life.\n• Scry 1.', 'instant'),
    ).toMatchObject({ reason: 'notRunnable', closestRule: 'modal.choose' });
  });
});

describe('a mode that does not read stops the whole text, and the diagnostic names it', () => {
  test('the first bullet that fails is where reading stopped', () => {
    const u = dropped(
      'Choose one —\n• Draw a card.\n• Fly away to target spell or ability with a single target.\n• You gain 3 life.',
      'instant',
    );
    expect(u.reason).toBe('unrecognised');
    expect(u.stoppedAt.startsWith('Fly away to target spell')).toBe(true);
    // The lines before it are not half-read: nothing becomes the face's spell.
    expect(read('Choose one —\n• Draw a card.\n• Fly away.', 'instant').spell).toBeNull();
  });

  test('a label before a bullet ("Sell Contraband — ...") is not read', () => {
    const u = dropped(
      'Choose one or more —\n• Sell Contraband — Create a Treasure token. You lose 1 life.\n• Buy Information — Draw a card. You lose 2 life.',
      'instant',
    );
    expect(u).toMatchObject({ reason: 'unrecognised', closestRule: 'modal.choose' });
    expect(u.stoppedAt.startsWith('Sell Contraband')).toBe(true);
  });

  test('a mode with "you may" is not read: a mode has no choice of its own in the engine', () => {
    const u = dropped('When ~ enters, choose one —\n• You may draw a card.\n• Scry 1.', 'creature');
    expect(u.reason).toBe('unrecognised');
    expect(u.stoppedAt).toBe('may draw a card.\n• Scry 1.');
    expect(u.recognised).toEqual(['trigger.enters', 'modal.choose', 'noun.player']);
  });
});

describe('real lines of the replay', () => {
  test('"Choose one — • ~ deals 3 damage to target creature. • Destroy target artifact."', () => {
    const spell = modalSpell(
      'Choose one —\n• ~ deals 3 damage to target creature.\n• Destroy target artifact.',
    );
    const modes = spell.modes as readonly SpellMode[];
    expect(modes[0]).toMatchObject({
      targets: [{ id: 't1', what: CREATURE }],
      effect: { kind: 'dealDamage', amount: 3, to: { kind: 'target', id: 't1' } },
    });
    // The ids are unique across the modes (CR 601.2c: the targets are asked together).
    expect(modes[1]).toMatchObject({
      targets: [{ id: 't2' }],
      effect: { kind: 'destroy', objects: { kind: 'target', id: 't2' } },
    });
  });

  test('"Choose two — • Destroy all artifacts. ... mana value 4 or greater."', () => {
    const spell = modalSpell(
      'Choose two —\n• Destroy all artifacts.\n• Destroy all enchantments.\n• Destroy all creatures with mana value 3 or less.\n• Destroy all creatures with mana value 4 or greater.',
      'sorcery',
    );
    expect(spell.chooseModes).toEqual({ min: 2, max: 2 });
    expect(spell.modes).toHaveLength(4);
    expect(spell.modes?.every((m) => m.targets === undefined)).toBe(true);
  });

  test('"Choose one or more — • Exile all artifacts. ... • Exile all graveyards."', () => {
    const spell = modalSpell(
      'Choose one or more —\n• Exile all artifacts.\n• Exile all creatures.\n• Exile all enchantments.\n• Exile all graveyards.',
      'sorcery',
    );
    expect(spell.chooseModes).toEqual({ min: 1, max: 4 });
  });

  test('"Choose one — • Counter target blue spell. • Destroy target blue permanent."', () => {
    const spell = modalSpell(
      'Choose one —\n• Counter target blue spell.\n• Destroy target blue permanent.',
    );
    expect(spell.modes?.map((m) => m.effect.kind)).toEqual(['counter', 'destroy']);
  });

  test('"Choose one or more — • Destroy target artifact. • Destroy target enchantment. • Target creature gains hexproof and indestructible until end of turn."', () => {
    const spell = modalSpell(
      'Choose one or more —\n• Destroy target artifact.\n• Destroy target enchantment.\n• Target creature gains hexproof and indestructible until end of turn.',
    );
    expect(spell.chooseModes).toEqual({ min: 1, max: 3 });
    expect(spell.modes?.map((m) => m.targets?.map((t) => t.id))).toEqual([['t1'], ['t2'], ['t3']]);
  });
});

describe('targets and pronouns across the modes', () => {
  test('the numbering goes on from mode to mode, and a pronoun means the target of its own mode', () => {
    const spell = modalSpell(
      'Choose one —\n• Tap target creature.\n• Untap target creature. Put a +1/+1 counter on it.',
    );
    expect(spell.modes?.map((m) => m.targets?.map((t) => t.id))).toEqual([['t1'], ['t2']]);
    expect(spell.modes?.[1]?.effect).toEqual({
      kind: 'sequence',
      effects: [
        { kind: 'untap', objects: { kind: 'target', id: 't2' } },
        { kind: 'addCounters', objects: { kind: 'target', id: 't2' }, counter: '+1/+1', count: 1 },
      ],
    });
  });

  test('a pronoun cannot refer to a target of another mode', () => {
    const u = dropped(
      'Choose one —\n• Destroy target creature.\n• Put a +1/+1 counter on it.',
      'instant',
    );
    expect(u).toMatchObject({ reason: 'unboundReference', reference: 'it' });
  });
});

describe('a modal spell is the whole text of its spell', () => {
  test('a modal line beside another spell line is refused, never merged', () => {
    const parsed = read('Choose one —\n• Draw a card.\n• You gain 3 life.\nScry 1.', 'instant');
    expect(parsed.unparsed).toHaveLength(1);
    expect(parsed.unparsed[0]).toMatchObject({ reason: 'notRunnable', ability: 0 });
    // The other line's reading is not the modal spell, which is not built either.
    expect(parsed.spell?.modes).toBeUndefined();
  });

  test('two modal lines are two spells: both are refused', () => {
    const parsed = read(
      'Choose one —\n• Draw a card.\n• Scry 1.\nChoose two —\n• You gain 3 life.\n• Scry 1.',
      'instant',
    );
    expect(parsed.unparsed.map((u) => u.ability)).toEqual([0, 1]);
    expect(parsed.spell).toBeNull();
  });

  test('a permanent has no spell to give modes to', () => {
    const u = dropped('Choose one —\n• Draw a card.\n• You gain 3 life.', 'creature');
    expect(u).toMatchObject({ reason: 'unrecognised', closestRule: 'modal.choose' });
  });

  test.each(['Entwine {2}', 'Spree'])(
    '%s, which puts a cost on a mode, has no rule: the line stays unread',
    (text) => {
      expect(dropped(text, 'instant')).toMatchObject({
        reason: 'unrecognised',
        closestRule: 'none',
      });
    },
  );

  test('Spree: mode costs are lines of their own, unread', () => {
    const parsed = read('Spree\n+ {1} — Draw a card.\n+ {2} — You gain 3 life.', 'instant');
    expect(parsed.unparsed.map((u) => u.text)).toEqual([
      'Spree',
      '+ {1} — Draw a card.',
      '+ {2} — You gain 3 life.',
    ]);
  });
});

describe('a modal triggered ability (CR 603.3c, 700.2b)', () => {
  test('"When ~ enters, choose one —": the empty effect, the modes and the trigger', () => {
    const [ability] = abilities(
      'When ~ enters, choose one —\n• You gain 3 life.\n• ~ deals 2 damage to target creature an opponent controls.',
    );
    expect(ability).toMatchObject({
      kind: 'triggered',
      trigger: { kind: 'entersBattlefield', what: { kind: 'this' } },
      effect: { kind: 'sequence', effects: [] },
      chooseModes: { min: 1, max: 1 },
    });
    expect(ability).not.toHaveProperty('targets');
    expect(ability).not.toHaveProperty('optional');
    if (ability?.kind !== 'triggered') throw new Error('not triggered');
    expect(ability.modes?.[0]).toEqual({ text: 'You gain 3 life.', effect: GAIN3 });
    expect(ability.modes?.[1]?.targets?.map((t) => t.id)).toEqual(['t1']);
  });

  test('"Whenever ~ attacks, choose one —"', () => {
    const [ability] = abilities('Whenever ~ attacks, choose one —\n• Draw a card.\n• Scry 1.');
    expect(ability).toMatchObject({ kind: 'triggered', trigger: { kind: 'attacks' } });
  });

  test('"choose two" and "choose one or more" on a trigger', () => {
    expect(
      abilities('When ~ enters, choose two —\n• Draw a card.\n• Scry 1.\n• You gain 3 life.'),
    ).toMatchObject([{ chooseModes: { min: 2, max: 2 } }]);
    expect(abilities('When ~ dies, choose one or more —\n• Draw a card.\n• Scry 1.')).toMatchObject(
      [{ chooseModes: { min: 1, max: 2 } }],
    );
  });

  test('the intervening "if" keeps its own field', () => {
    const [ability] = abilities(
      'When ~ enters, if you control a creature, choose one —\n• Draw a card.\n• Scry 1.',
    );
    expect(ability).toMatchObject({
      kind: 'triggered',
      interveningIf: { kind: 'controlsAtLeast' },
      chooseModes: { min: 1, max: 1 },
    });
  });

  test('"it" in a mode is the object of the trigger', () => {
    const [ability] = abilities(
      'When ~ enters, choose one —\n• Put a +1/+1 counter on it.\n• You gain 2 life.',
    );
    if (ability?.kind !== 'triggered') throw new Error('not triggered');
    expect(ability.modes?.[0]?.effect).toEqual({
      kind: 'addCounters',
      objects: { kind: 'this' },
      counter: '+1/+1',
      count: 1,
    });
  });

  test('"choose up to one —" and the other wordings of the lead line are not read', () => {
    const u = dropped(
      "Whenever you cast a spell, choose up to one —\n• Return target spell you don't control to its owner's hand.\n• Draw a card.",
      'creature',
    );
    expect(u).toMatchObject({ reason: 'unrecognised', slot: 'modal' });
  });

  test('an X in a mode of a trigger has nothing to read it from (CR 107.3j): refused', () => {
    const u = dropped(
      'When ~ enters, choose one —\n• Put X +1/+1 counters on it.\n• You gain 2 life.',
      'creature',
    );
    expect(u.reason).toBe('notRunnable');
  });
});

describe('a modal activated ability (CR 602.2b, 700.2a)', () => {
  test('"{2}, {T}: Choose one —": the costs, the empty effect and the modes', () => {
    const [ability] = abilities(
      '{2}, {T}: Choose one —\n• Draw a card.\n• ~ deals 1 damage to target creature.',
      'artifact',
    );
    expect(ability).toMatchObject({
      kind: 'activated',
      cost: [{ kind: 'mana', symbols: ['2'] }, { kind: 'tap' }],
      effect: { kind: 'sequence', effects: [] },
      chooseModes: { min: 1, max: 1 },
    });
    expect(ability).not.toHaveProperty('targets');
    if (ability?.kind !== 'activated') throw new Error('not activated');
    expect(ability.modes).toHaveLength(2);
  });

  test('an X in a mode needs an X in the cost', () => {
    const withX = abilities(
      '{X}, {T}: Choose one —\n• You gain X life.\n• Draw a card.',
      'artifact',
    );
    expect(withX).toMatchObject([{ kind: 'activated', chooseModes: { min: 1, max: 1 } }]);
    const u = dropped('{T}: Choose one —\n• You gain X life.\n• Draw a card.', 'artifact');
    expect(u.reason).toBe('notRunnable');
  });

  test('a mode that adds mana would make a mana ability, which has no modes: refused', () => {
    const u = dropped('{T}: Choose one —\n• Add {G}.\n• Draw a card.', 'artifact');
    expect(u).toMatchObject({ reason: 'notRunnable' });
  });

  test('a cost of the ability that names ~ and leaves it on the battlefield gives "it" a meaning in a mode', () => {
    const [ability] = abilities(
      'Remove a +1/+1 counter from ~: Choose one —\n• ~ deals 1 damage to any target.\n• You gain 1 life.',
      'creature',
    );
    expect(ability).toMatchObject({ kind: 'activated', chooseModes: { min: 1, max: 1 } });
  });
});
