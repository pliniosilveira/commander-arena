// Real Soldier data from the corpus; the unmatched token and image answers are SYNTHETIC.
import {
  fromGoldenCard,
  fromSnapshotCard,
  importCard,
  parseGolden,
  parsePreconSnapshot,
} from '@commander-arena/cards';
import { type ObjectView, TOKEN_PRESETS } from '@commander-arena/engine';
import { scenario } from '@commander-arena/engine/testing';
import { createRoot } from 'react-dom/client';
import { GameHost } from '../../src/game/host';
import artifacts from '../../src/precons/snapshots/artifacts.json';
import { createAppStore } from '../../src/store';
import { CardFace } from '../../src/ui/board/CardFace';
import { Tile } from '../../src/ui/board/Tile';
import { StoreProvider } from '../../src/ui/store-context';

export function mount(golden: string): void {
  const entry = parseGolden(golden).find((c) => c.name === "Elspeth, Sun's Champion");
  if (entry === undefined) throw new Error('Soldier maker missing from corpus');
  const card = importCard(fromGoldenCard(entry)).definition;
  const g = scenario()
    .define(card)
    .seat(0)
    .battlefield(card.name)
    .hand('SYNTHETIC Make Treasures')
    .pool('CCRU')
    .library('Plains', 'Plains')
    .seat(1)
    .build();
  g.act(0).activate(card.name, { ability: 0 });
  g.passAll();
  g.act(0).cast('SYNTHETIC Make Treasures', { pay: true });
  g.passAll();
  const soldier = g.view(0).battlefield.find((o) => o.name === 'Soldier');
  const treasure = g.view(0).battlefield.find((o) => o.name === 'Treasure');
  if (soldier === undefined || treasure === undefined) throw new Error('tokens were not made');
  const unknown: ObjectView = {
    ...treasure,
    id: 'o999999',
    name: 'Uncatalogued',
    tokenDefinition: { ...TOKEN_PRESETS.Treasure, name: 'Uncatalogued' },
  };
  // The actual engine stack view of a sacrificed token, after its source has ceased to exist.
  const clue = scenario()
    .seat(0)
    .hand('SYNTHETIC Clue Maker')
    .pool('CCCU')
    .library('Plains', 'Plains')
    .seat(1)
    .build();
  clue.act(0).cast('SYNTHETIC Clue Maker', { pay: true });
  clue.passAll();
  clue.act(0).activate('Clue', { pay: true });
  const ability = clue.view(0).stack[0];
  if (ability === undefined) throw new Error('token ability missing');

  const parsed = parsePreconSnapshot(artifacts);
  if (!parsed.ok) throw new Error(parsed.error);
  const saiStored = parsed.snapshot.cards.find((c) => c.name === 'Sai, Master Thopterist');
  if (saiStored === undefined) throw new Error('Sai missing from artifacts snapshot');
  const sai = importCard(fromSnapshotCard(saiStored)).definition;
  const saiGame = scenario()
    .define(sai)
    .seat(0)
    .battlefield(sai.name)
    .hand('Sol Ring')
    .pool('C')
    .seat(1)
    .build();
  saiGame.act(0).cast('Sol Ring', { pay: true });
  saiGame.passAll();
  const thopter = saiGame.view(0).battlefield.find((o) => o.name === 'Thopter');
  if (thopter === undefined) throw new Error("Sai's Thopter was not made");

  const store = createAppStore({ client: new GameHost({ clock: () => 0 }) });
  const container = document.createElement('main');
  document.body.replaceChildren(container);
  createRoot(container).render(
    <StoreProvider store={{ ...store, getInitialState: store.getState }}>
      {[treasure, soldier, unknown].map((object) => (
        <section key={object.id} data-token-test={object.name}>
          <Tile object={object} w={90} h={120} />
          <CardFace object={object} variant="full" />
        </section>
      ))}
      <section data-token-test="stack">
        <CardFace object={ability} variant="full" />
      </section>
      <section data-token-test="Thopter">
        <Tile object={thopter} w={90} h={120} />
        <CardFace object={thopter} variant="full" />
      </section>
    </StoreProvider>,
  );
}
