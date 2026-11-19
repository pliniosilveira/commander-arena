/**
 * The words of group 3 of the Gisa deck (D-484 to D-492) as pure models: the cost of sacrificing two other creatures and X creatures, the optional sacrifice of any number, the label
 * of the minus nine, of Priest of Forgotten Gods and of the X ability, the prompts of the keep question and of the X question, the copies of a spell for each creature sacrificed, the
 * keyword chip of "partner with" (read from the engine's SYNTHETIC cards, so a wording that drifts from the AST fails here). No DOM.
 */
import {
  type Ability,
  type ActivatedAbility,
  type ChooseXDecision,
  type ObjectView,
  syntheticCard,
} from '@commander-arena/engine';
import { describe, expect, test } from 'vitest';
import { activationCostText, additionalCostsText, sacrificeWhat } from '../src/game/cost-text';
import { chipsOf } from '../src/ui/board/keywords';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';
import { choosePermanentPrompt, spellSacrificeWhat } from '../src/ui/decisions/permanents';
import { perXText, xCostAt, xPrompt } from '../src/ui/decisions/x-picker';

const face = (name: string) => {
  const f = syntheticCard(name).faces[0];
  if (f === undefined) throw new Error(`no card ${name}`);
  return f;
};
const activated = (name: string): ActivatedAbility => {
  const a = face(name).abilities.find((x) => x.kind === 'activated');
  if (a?.kind !== 'activated') throw new Error(`no activated ability on ${name}`);
  return a;
};
const creature = { name: 'Creature', types: ['creature'] } as unknown as ObjectView;
const walker = { name: 'Walker', types: ['planeswalker'] } as unknown as ObjectView;

describe('the costs', () => {
  test('two other creatures, X creatures, and "you may sacrifice one or more creatures"', () => {
    expect(sacrificeWhat({ types: ['creature'], other: true }, 2)).toBe('two other creatures');
    expect(sacrificeWhat({ types: ['creature'] }, 1, true)).toBe('X creatures');
    expect(activationCostText(activated('SYNTHETIC Sacrifice Priest').cost)).toBe(
      '{T}, Sacrifice two other creatures',
    );
    expect(activationCostText(activated('SYNTHETIC Sacrifice Demon').cost)).toBe(
      '{B}, Sacrifice X creatures',
    );
    expect(additionalCostsText(face('SYNTHETIC Forbidden Rite').additionalCosts)).toBe(
      'Sacrifice one or more creatures (optional)',
    );
  });
});

describe('the labels of the abilities', () => {
  test('Priest: any number of target players each lose life and sacrifice a creature of their choice, then the mana and the card', () => {
    expect(
      activationLabel(creature, {
        abilityIndex: 0,
        ability: activated('SYNTHETIC Sacrifice Priest'),
      }),
    ).toBe(
      '{T}, Sacrifice two other creatures: Any number of target players each lose 2 life. Any number of target players each sacrifice a creature of their choice. Add {B}{B}. You draw a card',
    );
  });

  test('the X ability: the draw and the life gain of a target player, the counters of the creature', () => {
    const label = activationLabel(creature, {
      abilityIndex: 0,
      ability: activated('SYNTHETIC Sacrifice Demon'),
    });
    expect(label).toContain('{B}, Sacrifice X creatures:');
    expect(label).toContain('draws X cards');
    expect(label).toContain('gains X life');
  });

  test('the minus nine: each opponent chooses a permanent they control of each permanent type and sacrifices the rest', () => {
    expect(
      activationLabel(walker, { abilityIndex: 0, ability: activated('SYNTHETIC Culling Walker') }),
    ).toBe(
      '−9: Each opponent chooses a permanent they control of each permanent type and sacrifices the rest',
    );
  });
});

describe('the cast trigger of the spell that sacrifices any number of creatures', () => {
  const trigger = face('SYNTHETIC Forbidden Rite').abilities[0] as Extract<
    Ability,
    { kind: 'triggered' }
  >;

  test('copy this spell for each creature sacrificed this way, if a permanent was sacrificed', () => {
    const gist = triggerGist(trigger, undefined);
    expect(gist).toContain('Copy this spell for each creature sacrificed this way');
    expect(gist).toContain('you sacrificed one or more permanents to cast it');
  });
});

describe('the prompts', () => {
  const index = new Map<string, ObjectView>();

  test('the keep question of the minus nine names the type and what happens to the rest', () => {
    const decision = {
      purpose: 'spare',
      min: 1,
      max: 1,
      source: 's1',
      legal: [],
      seat: 1,
      spare: { player: 1, type: 'creature', own: true },
    } as never;
    expect(choosePermanentPrompt(decision, index as never)).toBe(
      'Choose a creature you control to keep. You sacrifice every other permanent you control.',
    );
  });

  test('Tragic Arrogance keeps its words', () => {
    const decision = {
      purpose: 'spare',
      min: 1,
      max: 1,
      source: 's1',
      legal: [],
      seat: 0,
      spare: { player: 0, type: 'artifact' },
    } as never;
    expect(choosePermanentPrompt(decision, index as never)).toBe(
      'Choose an artifact you control to keep. Each player then sacrifices all other nonland permanents they control.',
    );
  });

  test('the sacrifice of an activated ability says what it sacrifices and how many', () => {
    const priest = {
      id: 'a1',
      name: 'Priest',
      zone: 'stack',
      abilitySource: 'p1',
      ability: activated('SYNTHETIC Sacrifice Priest'),
    } as unknown as ObjectView;
    const prompt = choosePermanentPrompt(
      { purpose: 'sacrifice', min: 2, max: 2, source: 'a1', forCost: true, legal: [] } as never,
      new Map([['a1', priest]]) as never,
    );
    expect(prompt).toBe('Sacrifice two other creatures to pay for Priest.');
  });

  test('"you may sacrifice one or more creatures" says that none is allowed', () => {
    const rite = {
      id: 'r1',
      name: 'Rite',
      zone: 'stack',
      additionalCosts: face('SYNTHETIC Forbidden Rite').additionalCosts,
    } as unknown as ObjectView;
    expect(
      spellSacrificeWhat({ source: 'o1', min: 0, max: 3 }, new Map([['o1', rite]]) as never),
    ).toBe('any number of creatures (you may choose none)');
  });
});

describe('the X question of "Sacrifice X creatures"', () => {
  const decision: Pick<ChooseXDecision, 'sourceName' | 'purpose' | 'perX' | 'max' | 'cost'> = {
    sourceName: 'Demon',
    purpose: 'ability',
    perX: { mana: 0, life: 0, sacrifice: 1 },
    max: 3,
  };

  test('each point of X sacrifices a permanent', () => {
    expect(perXText(decision)).toBe('Each X costs a sacrificed permanent');
    expect(xPrompt(decision)).toBe(
      "Choose X for Demon's ability. Each X costs a sacrificed permanent; you can afford up to X = 3.",
    );
    expect(xCostAt(decision, 2)).toBe('sacrifice 2 permanents');
    expect(xCostAt(decision, 1)).toBe('sacrifice 1 permanent');
  });
});

describe('the chip of "partner with"', () => {
  test('the name of the card is in the tooltip', () => {
    const chips = chipsOf({
      keywords: ['partnerWith'],
      restrictions: [],
      oracleText:
        'Partner with Regna, the Redeemer (When this creature enters, target player may put Regna into their hand from their library, then shuffle.)',
    } as never);
    expect(chips.map((c) => [c.short, c.full])).toEqual([
      ['Ptn', 'Partner with Regna, the Redeemer'],
    ]);
  });
});
