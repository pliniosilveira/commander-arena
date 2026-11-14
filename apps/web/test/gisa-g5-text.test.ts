/**
 * The words of group 5 of the Gisa deck (D-478 to D-482) as pure models: the keyword chip of Decayed, the gist of the abilities of the fixtures (a token with decayed for each
 * counter, the sacrifice at end of combat of the keyword's ability, the intervening "if", the life loss of a cycled card, the escaped permanent). Read from the engine's SYNTHETIC
 * cards, so a wording that drifts from the AST fails here. No DOM.
 */
import { type Ability, syntheticCard } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { describe, expect, test } from 'vitest';
import { DECAYED_REMINDER, delayedSacrificeText } from '../src/game/gisa-g5-text';
import { tokenWords } from '../src/game/token-text';
import { keywordName, keywordShort } from '../src/ui/board/keywords';
import { activationLabel, triggerGist } from '../src/ui/decisions/ability-label';

const abilitiesOf = (name: string): readonly Ability[] => {
  const face = syntheticCard(name).faces[0];
  if (face === undefined) throw new Error(`no face for ${name}`);
  return face.abilities;
};

describe('the keyword chip of Decayed', () => {
  test('a short chip, and the reminder text in the tooltip (CR 702.147a)', () => {
    expect(keywordShort('decayed')).toBe('Dec');
    expect(keywordName('decayed')).toBe(`Decayed (${DECAYED_REMINDER})`);
    expect(DECAYED_REMINDER).toBe(
      "This creature can't block. When it attacks, sacrifice it at end of combat.",
    );
  });

  test('a creature with decayed shows the chip, and the "can\'t block" restriction chip with it', () => {
    const g = scenario()
      .seat(0)
      .library('Plains', 'Plains')
      .battlefield('SYNTHETIC Decayed Husk')
      .seat(1)
      .library('Plains', 'Plains')
      .at('precombatMain', { active: 0 })
      .build();
    const husk = g.view(0).battlefield.find((o) => o.name === 'SYNTHETIC Decayed Husk');
    expect(husk?.keywords).toContain('decayed');
    expect(husk?.restrictions).toContain('cantBlock');
  });
});

describe('the sacrifice at end of combat', () => {
  test('the words of the instruction: the creature itself (Decayed), or the blocker of the Ring-bearer', () => {
    expect(delayedSacrificeText('this')).toBe('Sacrifice it at end of combat');
    expect(delayedSacrificeText(undefined)).toBe(
      'Sacrifice the blocking creature at end of combat',
    );
  });

  test('the gist of the trigger the keyword stands for (the node `derive` writes for Decayed)', () => {
    const trigger = {
      kind: 'triggered',
      trigger: { kind: 'attacks', what: { kind: 'this' } },
      effect: { kind: 'delayedSacrifice', of: 'this' },
    } as const;
    expect(triggerGist(trigger as never, undefined)).toBe('Sacrifice it at end of combat');
  });
});

describe('the token and the count of the Corpse Vault', () => {
  const activated = abilitiesOf('SYNTHETIC Corpse Vault').find((a) => a.kind === 'activated');
  if (activated?.kind !== 'activated') throw new Error('no activated ability');

  test('the token is worded with its keyword', () => {
    if (activated.effect.kind !== 'createToken') throw new Error('no token');
    expect(tokenWords(activated.effect.token, false, () => 'it')).toEqual({
      one: '2/2 black Zombie creature token with decayed',
      many: '2/2 black Zombie creature tokens with decayed',
    });
  });

  test('the label of the activation says the token for each counter', () => {
    const label = activationLabel(undefined, { abilityIndex: 2, ability: activated });
    expect(label).toContain('Sacrifice');
    expect(label).toContain('Zombie');
    expect(label).toContain('decayed');
    expect(label).toContain('corpse counter');
  });
});

describe('the end step trigger of the Husk Raiser and the cycling trigger of the Rot Cycler', () => {
  test('the gist of the Husk Raiser says the token and its "if"', () => {
    const trigger = abilitiesOf('SYNTHETIC Husk Raiser').find((a) => a.kind === 'triggered');
    if (trigger?.kind !== 'triggered') throw new Error('no trigger');
    const gist = triggerGist(trigger as never, undefined);
    expect(gist).toContain('Create');
    expect(gist).toContain('Zombie');
    expect(gist).toContain('decayed');
  });

  test('the gist of the Rot Cycler says whose life and how much', () => {
    const trigger = abilitiesOf('SYNTHETIC Rot Cycler').find((a) => a.kind === 'triggered');
    if (trigger?.kind !== 'triggered') throw new Error('no trigger');
    const gist = triggerGist(trigger as never, undefined);
    expect(gist).toContain('lose');
    expect(gist).toContain('Zombie');
  });
});
