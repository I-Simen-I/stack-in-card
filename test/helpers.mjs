// Shared helpers for the smoke tests: a fake DOM with the built bundle
// loaded, and fake Home Assistant cards shaped like the real ones.
import { readFileSync } from "node:fs";
import { after, before } from "node:test";

import { GlobalRegistrator } from "@happy-dom/global-registrator";

// The card restyles its children after 500 ms
export const RESTYLE_DELAY = 500;

// What the card logs with console.info, like its version banner
export const infoLogs = [];

// Every card config passed to createCardElement
export const created = [];

// Call at the top of every test file; each file runs in its own process.
export const setupDom = () => {
  before(() => {
    GlobalRegistrator.register({ url: "http://localhost:8123/" });
    console.info = (...args) => infoLogs.push(args.join(" "));
    defineFakeCards();
    const bundle = readFileSync(
      new URL("../dist/stack-in-card.js", import.meta.url),
      "utf8",
    );
    new Function(bundle)();
  });

  after(async () => {
    await GlobalRegistrator.unregister();
  });
};

const createCardElement = (config) => {
  created.push(config);
  const tag =
    {
      "vertical-stack": "hui-vertical-stack-card",
      "horizontal-stack": "hui-horizontal-stack-card",
      "custom:stack-in-card": "stack-in-card",
    }[config.type] ?? "test-card";
  const element = document.createElement(tag);
  element.setConfig(config);
  return element;
};

// Defined in the global scope of happy-dom, after it's registered
const defineFakeCards = () => {
  window.loadCardHelpers = () =>
    new Promise((resolve) =>
      setTimeout(() => resolve({ createCardElement }), 5),
    );

  customElements.define("ha-card", class extends HTMLElement {});

  // A card with an ha-card in its shadow root, like most cards.
  //   size: getCardSize(), keep: { background: true, border: true } sets
  //   --keep-background / --keep-border on its ha-card
  customElements.define(
    "test-card",
    class extends HTMLElement {
      constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = "<ha-card></ha-card>";
      }

      setConfig(config) {
        this.config = config;
        const haCard = this.shadowRoot.querySelector("ha-card");
        haCard.style.boxShadow = "0 2px 2px black";
        haCard.style.border = "1px solid gray";
        haCard.style.borderRadius = "12px";
        haCard.style.background = "white";
        if (config.keep?.background) {
          haCard.style.setProperty("--keep-background", "true");
        }
        if (config.keep?.border) {
          haCard.style.setProperty("--keep-border", "true");
        }
      }

      getCardSize() {
        return this.config.size ?? 1;
      }
    },
  );

  // Wraps every card in a stack, in the light DOM, like Home Assistant's
  customElements.define(
    "hui-card",
    class extends HTMLElement {
      set config(config) {
        this._element = createCardElement(config);
        this.appendChild(this._element);
      }

      set hass(hass) {
        this._element.hass = hass;
      }

      getCardSize() {
        return this._element.getCardSize?.() ?? 1;
      }
    },
  );

  // Home Assistant's stack editor, which rejects options it doesn't know
  customElements.define(
    "hui-stack-card-editor",
    class extends HTMLElement {
      setConfig(config) {
        const unknown = Object.keys(config).filter(
          (key) => !["type", "title", "cards"].includes(key),
        );
        if (unknown.length) throw new Error(`Unknown options: ${unknown}`);
        this.config = config;
      }
    },
  );

  class FakeStack extends HTMLElement {
    static async getConfigElement() {
      return document.createElement("hui-stack-card-editor");
    }

    constructor() {
      super();
      this.attachShadow({ mode: "open" }).innerHTML =
        '<div id="root" style="gap: 8px"></div>';
      this.updateComplete = Promise.resolve(true);
    }

    setConfig(config) {
      this.config = config;
      const root = this.shadowRoot.getElementById("root");
      this.cards = config.cards.map((cardConfig) => {
        const card = document.createElement("hui-card");
        card.config = cardConfig;
        return card;
      });
      root.replaceChildren(...this.cards);
    }

    set hass(hass) {
      this._hass = hass;
      this.cards.forEach((card) => (card.hass = hass));
    }

    get hass() {
      return this._hass;
    }
  }

  customElements.define(
    "hui-vertical-stack-card",
    class extends FakeStack {
      async getCardSize() {
        const sizes = await Promise.all(this.cards.map((c) => c.getCardSize()));
        return sizes.reduce((sum, size) => sum + size, 0);
      }
    },
  );

  customElements.define(
    "hui-horizontal-stack-card",
    class extends FakeStack {
      async getCardSize() {
        const sizes = await Promise.all(this.cards.map((c) => c.getCardSize()));
        return Math.max(...sizes);
      }
    },
  );
};

export const HASS = { states: {} };

export const CARDS = [{ type: "test" }, { type: "test" }];

export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Creates the card and waits until the stack is rendered
export const createCard = async (config = {}, hass = HASS) => {
  const card = document.createElement("stack-in-card");
  card.setConfig({ type: "custom:stack-in-card", cards: CARDS, ...config });
  card.hass = hass;
  document.body.appendChild(card);
  await wait(20);
  await card.updateComplete;
  return card;
};

// Waits for the second styling pass, which also removes backgrounds
export const restyled = () => wait(RESTYLE_DELAY + 50);

export const stackOf = (card) =>
  card.shadowRoot.querySelector("ha-card > .stack").firstElementChild;

export const rootOf = (stack) => stack.shadowRoot.getElementById("root");

// The ha-card of each card in a stack
export const haCardsOf = (stack) =>
  stack.cards.map((huiCard) =>
    huiCard.firstElementChild.shadowRoot.querySelector("ha-card"),
  );

// Creates the visual editor and waits until the stack editor is in it
export const createEditor = async (config, hass = HASS) => {
  const editor = await customElements.get("stack-in-card").getConfigElement();
  const configs = [];
  editor.addEventListener("config-changed", (ev) =>
    configs.push(ev.detail.config),
  );
  editor.hass = hass;
  editor.lovelace = { views: [] };
  editor.setConfig({ type: "custom:stack-in-card", cards: CARDS, ...config });
  document.body.appendChild(editor);
  await wait(20);
  await editor.updateComplete;
  return { editor, configs };
};

export const stackEditorOf = (editor) =>
  editor.shadowRoot.querySelector("hui-stack-card-editor");

// The ha-form that has a field with this name
export const formWith = (editor, name) =>
  [...editor.shadowRoot.querySelectorAll("ha-form")].find((form) =>
    form.schema.some((field) => field.name === name),
  );

export const change = (form, value) =>
  form.dispatchEvent(
    new CustomEvent("value-changed", {
      detail: { value },
      bubbles: true,
      composed: true,
    }),
  );
