// Smoke tests of the visual editor, loaded from the built bundle.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  setupDom,
  HASS,
  CARDS,
  createEditor,
  stackEditorOf,
  formWith,
  change,
} from "./helpers.mjs";

setupDom();

test("the card has a visual editor", async () => {
  const editor = await customElements.get("stack-in-card").getConfigElement();
  assert.equal(editor.localName, "stack-in-card-editor");
});

test("edits the cards with Home Assistant's stack editor", async () => {
  const { editor } = await createEditor({
    title: "Living room",
    mode: "horizontal",
  });
  const stackEditor = stackEditorOf(editor);
  assert.ok(stackEditor, "the stack editor is not shown");
  // Without the mode, which it would reject
  assert.deepEqual(stackEditor.config, {
    type: "horizontal-stack",
    title: "Living room",
    cards: CARDS,
  });
  assert.equal(stackEditor.hass, HASS);
  assert.deepEqual(stackEditor.lovelace, { views: [] });
  editor.remove();
});

test("keeps the mode when the cards or title change, and drops keep", async () => {
  const { editor, configs } = await createEditor({
    title: "Living room",
    mode: "horizontal",
    keep: { border: true },
  });
  const cards = [...CARDS, { type: "button" }];
  const stackEditor = stackEditorOf(editor);
  stackEditor.dispatchEvent(
    new CustomEvent("config-changed", {
      detail: {
        config: { type: "horizontal-stack", title: "Living room", cards },
      },
      bubbles: true,
      composed: true,
    }),
  );
  // `keep` from the original card does nothing, so it's removed
  assert.deepEqual(configs.at(-1), {
    type: "custom:stack-in-card",
    title: "Living room",
    mode: "horizontal",
    cards,
  });
  assert.equal(configs.length, 1, "the stack editor's event got through");

  // An empty title is removed
  stackEditor.dispatchEvent(
    new CustomEvent("config-changed", {
      detail: { config: { type: "horizontal-stack", title: "", cards } },
    }),
  );
  assert.equal("title" in configs.at(-1), false);
  editor.remove();
});

test("only stores the mode when it's horizontal", async () => {
  const { editor, configs } = await createEditor({});
  const form = formWith(editor, "mode");
  assert.deepEqual(form.data, { mode: "vertical" });

  change(form, { mode: "horizontal" });
  assert.equal(configs.at(-1).mode, "horizontal");
  await editor.updateComplete;
  assert.equal(stackEditorOf(editor).config.type, "horizontal-stack");

  change(form, { mode: "vertical" });
  assert.equal("mode" in configs.at(-1), false);
  editor.remove();
});

// Norwegian, from Home Assistant's own translations
const NB = {
  "ui.panel.lovelace.editor.edit_view.type": "Oppsett",
  "ui.panel.lovelace.editor.card.vertical-stack.name": "Vertikal stabel",
  "ui.panel.lovelace.editor.card.horizontal-stack.name": "Horisontal stabel",
};

const modeLabels = (editor) => {
  const form = formWith(editor, "mode");
  return [
    form.computeLabel({ name: "mode" }),
    ...form.schema[0].selector.select.options.map((o) => o.label),
  ];
};

test("uses Home Assistant's translations, and English without them", async () => {
  const { editor } = await createEditor({}, { ...HASS, localize: () => "" });
  assert.deepEqual(modeLabels(editor), [
    "Layout",
    "Vertical stack",
    "Horizontal stack",
  ]);

  // The editor's translations can load later, with a new localize
  editor.hass = { ...HASS, localize: (key) => NB[key] ?? "" };
  await editor.updateComplete;
  assert.deepEqual(modeLabels(editor), [
    "Oppsett",
    "Vertikal stabel",
    "Horisontal stabel",
  ]);
  editor.remove();
});
