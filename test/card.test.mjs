// Smoke tests of the card, loaded from the built bundle.
import assert from "node:assert/strict";
import { test } from "node:test";

import {
  setupDom,
  infoLogs,
  created,
  HASS,
  CARDS,
  wait,
  createCard,
  restyled,
  stackOf,
  rootOf,
  haCardsOf,
} from "./helpers.mjs";

setupDom();

const assertStripped = (haCard, { background = true } = {}) => {
  assert.equal(haCard.style.boxShadow, "none");
  assert.equal(haCard.style.borderRadius, "0px");
  assert.equal(haCard.style.borderStyle, "none", "border");
  if (background) assert.equal(haCard.style.background, "transparent");
};

test("registers the card and logs its version", () => {
  assert.ok(
    customElements.get("stack-in-card"),
    "stack-in-card is not defined",
  );
  assert.ok(
    window.customCards.some((c) => c.type === "stack-in-card"),
    "card is not added to window.customCards",
  );
  assert.ok(
    infoLogs.some(
      (log) => log.includes("Stack In Card") && log.includes("dev"),
    ),
    "no version banner",
  );
});

test("shows three buttons side by side in the card picker", () => {
  const entry = window.customCards.find((c) => c.type === "stack-in-card");
  assert.equal(entry.preview, true);

  const Card = customElements.get("stack-in-card");
  const hass = {
    states: {
      "sensor.temperature": {},
      "light.kitchen": {},
      "switch.heater": {},
      "light.bedroom": {},
      "light.hall": {},
    },
  };
  // The picker passes the entities on the dashboard first, then the rest
  assert.deepEqual(
    Card.getStubConfig(hass, ["light.hall", "sensor.temperature"], []),
    {
      mode: "horizontal",
      cards: [
        { type: "button", entity: "light.hall" },
        { type: "button", entity: "light.kitchen" },
        { type: "button", entity: "switch.heater" },
      ],
    },
  );

  // Buttons with only an icon when there are too few lights and switches
  const stub = Card.getStubConfig({ states: { "light.kitchen": {} } }, [], []);
  assert.equal(stub.cards.length, 3);
  assert.deepEqual(stub.cards[0], { type: "button", entity: "light.kitchen" });
  assert.equal(stub.cards[1].entity, undefined);
  assert.match(stub.cards[1].icon, /^mdi:/);
});

test("rejects configs without cards or with an unknown mode", () => {
  const card = document.createElement("stack-in-card");
  assert.throws(
    () => card.setConfig({ type: "custom:stack-in-card" }),
    /cards/,
  );
  assert.throws(
    () => card.setConfig({ type: "custom:stack-in-card", cards: {} }),
    /cards/,
  );
  assert.throws(
    () => card.setConfig({ cards: CARDS, mode: "diagonal" }),
    /Unknown mode: diagonal/,
  );
});

test("stacks the cards vertically by default, under the title", async () => {
  const card = await createCard({ title: "My stack" });
  const stack = stackOf(card);
  assert.equal(stack.localName, "hui-vertical-stack-card");
  assert.deepEqual(stack.config, { type: "vertical-stack", cards: CARDS });
  assert.equal(
    card.shadowRoot.querySelector("ha-card").getAttribute("header"),
    "My stack",
  );
  card.remove();
});

test("stacks the cards horizontally, without a title", async () => {
  const card = await createCard({ mode: "horizontal" });
  assert.equal(stackOf(card).localName, "hui-horizontal-stack-card");
  assert.equal(
    card.shadowRoot.querySelector("ha-card").hasAttribute("header"),
    false,
  );
  card.remove();
});

test("passes hass to the stack, also when it arrives while the stack is created", async () => {
  const card = document.createElement("stack-in-card");
  card.setConfig({ cards: CARDS });
  document.body.appendChild(card);
  // The card helpers take 5 ms to load
  await wait(1);
  card.hass = HASS;
  await wait(20);
  const stack = stackOf(card);
  assert.equal(stack.hass, HASS);

  const newHass = { states: { "sun.sun": { state: "above_horizon" } } };
  card.hass = newHass;
  assert.equal(stack.hass, newHass);
  card.remove();
});

test("passes preview to the stack", async () => {
  const card = await createCard();
  assert.equal(stackOf(card).preview, false);
  card.preview = true;
  assert.equal(stackOf(card).preview, true);
  card.remove();
});

test("removes shadow, border, radius and spacing right away, background later", async () => {
  const card = await createCard();
  const stack = stackOf(card);
  const haCards = haCardsOf(stack);

  for (const haCard of haCards) assertStripped(haCard, { background: false });
  assert.equal(haCards[0].style.background, "white");
  assert.equal(rootOf(stack).style.gap, "0");
  assert.equal(rootOf(stack).style.padding, "");
  for (const huiCard of stack.cards) {
    assert.equal(huiCard.style.margin, "0px");
    assert.equal(huiCard.firstElementChild.style.margin, "0px");
  }

  await restyled();
  for (const haCard of haCards) assertStripped(haCard);
  card.remove();
});

test("keeps what `keep` asks for", async () => {
  const card = await createCard({
    keep: {
      background: true,
      border: true,
      border_radius: true,
      box_shadow: true,
      margin: true,
    },
  });
  const stack = stackOf(card);
  await restyled();
  for (const haCard of haCardsOf(stack)) {
    assert.equal(haCard.style.boxShadow, "0 2px 2px black");
    assert.equal(haCard.style.borderRadius, "12px");
    assert.equal(haCard.style.borderStyle, "solid");
    assert.equal(haCard.style.background, "white");
  }
  assert.equal(rootOf(stack).style.gap, "8px");
  assert.equal(stack.cards[0].style.margin, "");
  // outer_padding follows margin
  assert.equal(rootOf(stack).style.padding, "8px");
  card.remove();
});

test("outer_padding can be turned off when margin is kept", async () => {
  const card = await createCard({
    keep: { margin: true, outer_padding: false },
  });
  assert.equal(rootOf(stackOf(card)).style.padding, "");
  card.remove();
});

test("keeps the background and border of cards that set the CSS flags", async () => {
  const card = await createCard({
    cards: [
      { type: "test", keep: { background: true, border: true } },
      CARDS[1],
    ],
  });
  await restyled();
  const [flagged, plain] = haCardsOf(stackOf(card));
  assert.equal(flagged.style.background, "white");
  assert.equal(flagged.style.borderStyle, "solid");
  assert.equal(flagged.style.boxShadow, "none");
  assertStripped(plain);
  card.remove();
});

test("styles cards in nested stacks, but not in a nested stack-in-card", async () => {
  const card = await createCard({
    cards: [
      { type: "horizontal-stack", cards: CARDS },
      { type: "custom:stack-in-card", cards: CARDS, keep: { margin: true } },
    ],
  });
  await restyled();
  const [nestedStack, nestedStackInCard] = stackOf(card).cards.map(
    (huiCard) => huiCard.firstElementChild,
  );

  assert.equal(rootOf(nestedStack).style.gap, "0");
  for (const haCard of haCardsOf(nestedStack)) assertStripped(haCard);

  // Styled by its own config, which keeps the margin
  assert.equal(nestedStackInCard.style.margin, "");
  assert.equal(rootOf(stackOf(nestedStackInCard)).style.gap, "8px");
  card.remove();
});

test("reports the size of the stack", async () => {
  const card = await createCard({
    cards: [
      { type: "test", size: 2 },
      { type: "test", size: 3 },
    ],
  });
  assert.equal(await card.getCardSize(), 5);
  card.remove();

  const horizontal = await createCard({
    mode: "horizontal",
    cards: [
      { type: "test", size: 2 },
      { type: "test", size: 3 },
    ],
  });
  assert.equal(await horizontal.getCardSize(), 3);
  horizontal.remove();
});

test("only shows the stack of the latest config", async () => {
  const card = document.createElement("stack-in-card");
  card.setConfig({ cards: CARDS });
  card.setConfig({ cards: CARDS, mode: "horizontal" });
  card.hass = HASS;
  document.body.appendChild(card);
  await wait(20);
  assert.equal(stackOf(card).localName, "hui-horizontal-stack-card");
  card.remove();
});

test("rebuilds the stack on ll-rebuild", async () => {
  const card = await createCard();
  const stack = stackOf(card);
  const count = created.length;
  stack.dispatchEvent(new Event("ll-rebuild"));
  await wait(20);
  await card.updateComplete;

  const rebuilt = stackOf(card);
  assert.notEqual(rebuilt, stack);
  assert.ok(created.length > count, "no new stack was created");
  assert.equal(rebuilt.hass, HASS);
  assert.equal(rootOf(rebuilt).style.gap, "0");
  card.remove();
});
