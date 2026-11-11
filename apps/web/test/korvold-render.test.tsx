/**
 * The question of D-175 rendered (the Korvold slice, text and tokens): the dialog that asks which of the instructions an effect offers as it
 * resolves (CR 608.2d). It is drawn from a decision of its own shape, over no game: one button for each instruction, the card's words above
 * them, and no way out (the effect cannot go on before a choice is made).
 */
import type { ChooseOptionDecision } from '@commander-arena/engine';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { NamedOptionDialog } from '../src/ui/decisions/NamedOptionDialog';

const decision = (options: readonly string[]): ChooseOptionDecision =>
  ({
    id: 'd1',
    kind: 'chooseOption',
    seat: 0,
    purpose: 'effect',
    options,
    source: 'o7',
    sourceName: 'SYNTHETIC Provisioner',
    sourceOracleText:
      'Whenever a land you control enters, create a Food token or a Treasure token.',
  }) as unknown as ChooseOptionDecision;

test('the dialog names the card, quotes its text, asks one of the instructions and offers each as a button', () => {
  const html = renderToStaticMarkup(
    <NamedOptionDialog
      d={decision(['create a Food token', 'create a Treasure token'])}
      act={() => {}}
    />,
  );
  expect(html).toContain('aria-label="Choose one"');
  expect(html).toContain('>SYNTHETIC Provisioner</h2>');
  expect(html).toContain(
    'Whenever a land you control enters, create a Food token or a Treasure token.',
  );
  expect(html).toContain(
    'Choose one for SYNTHETIC Provisioner: create a Food token or create a Treasure token.',
  );
  expect(html).toContain('data-option="create a Food token"');
  expect(html).toContain('data-option="create a Treasure token"');
  expect(html).toContain('>Create a Food token</span>');
  expect(html).toContain('>Create a Treasure token</span>');
  expect(html).not.toContain('>Cancel<');
});

test('three instructions, three buttons, in the order given', () => {
  const html = renderToStaticMarkup(
    <NamedOptionDialog
      d={decision(['draw a card', 'gain 3 life', 'create a Treasure token'])}
      act={() => {}}
    />,
  );
  const at = (text: string) => html.indexOf(`>${text}</span>`);
  expect(at('Draw a card')).toBeGreaterThan(0);
  expect(at('Draw a card')).toBeLessThan(at('Gain 3 life'));
  expect(at('Gain 3 life')).toBeLessThan(at('Create a Treasure token'));
});
