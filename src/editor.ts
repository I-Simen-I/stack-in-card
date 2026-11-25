import { LitElement, PropertyValues, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { loadCardHelpers } from "./card-helpers";
import { HomeAssistant, LovelaceCardConfig, StackInCardConfig } from "./types";

const fireEvent = (node: EventTarget, type: string, detail?: unknown): void => {
  node.dispatchEvent(
    new CustomEvent(type, { bubbles: true, composed: true, detail }),
  );
};

type Translate = (key: string) => string;

// Labels from Home Assistant's own translations, so the editor speaks every
// language Home Assistant does. English if a key is missing.
const LABELS: Record<string, [key: string, english: string]> = {
  mode: ["ui.panel.lovelace.editor.edit_view.type", "Layout"],
  vertical: [
    "ui.panel.lovelace.editor.card.vertical-stack.name",
    "Vertical stack",
  ],
  horizontal: [
    "ui.panel.lovelace.editor.card.horizontal-stack.name",
    "Horizontal stack",
  ],
};

// Home Assistant's editor for its stacks: tabs per card, add, move, copy,
// cut and delete, and the visual editor of each card
interface StackEditor extends HTMLElement {
  hass?: HomeAssistant;
  lovelace?: unknown;
  setConfig(config: LovelaceCardConfig): void;
}

const loadStackEditor = async (): Promise<StackEditor> => {
  const helpers = await loadCardHelpers();
  // Makes sure Home Assistant has loaded its vertical stack
  helpers.createCardElement({ type: "vertical-stack", cards: [] });
  await customElements.whenDefined("hui-vertical-stack-card");
  const Stack = customElements.get("hui-vertical-stack-card") as unknown as {
    getConfigElement(): Promise<StackEditor>;
  };
  return Stack.getConfigElement();
};

const buildSchemas = (t: Translate) => ({
  mode: [
    {
      name: "mode",
      selector: {
        select: {
          mode: "list",
          options: ["vertical", "horizontal"].map((value) => ({
            value,
            label: t(value),
          })),
        },
      },
    },
  ],
});

type Schemas = ReturnType<typeof buildSchemas>;

@customElement("stack-in-card-editor")
export class StackInCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  // The dashboard's config, which the card picker of the stack editor uses
  @property({ attribute: false }) lovelace?: unknown;
  @state() private _config?: StackInCardConfig;
  @state() private _stackEditor?: StackEditor;

  // Built again only when Home Assistant's translations change (a new
  // localize function). New schema objects on every render would make
  // ha-form rebuild its fields.
  private _schemaCache?: { localize: unknown; schemas: Schemas };

  setConfig(config: StackInCardConfig): void {
    this._config = config;
  }

  connectedCallback(): void {
    super.connectedCallback();
    if (!this._stackEditor) {
      loadStackEditor().then((editor) => {
        editor.addEventListener("config-changed", this._cardsChanged);
        this._stackEditor = editor;
      });
    }
  }

  protected updated(changed: PropertyValues): void {
    super.updated(changed);
    const editor = this._stackEditor;
    if (!editor || !this._config) return;
    if (changed.has("hass")) editor.hass = this.hass;
    if (changed.has("lovelace")) editor.lovelace = this.lovelace;
    if (changed.has("_config") || changed.has("_stackEditor")) {
      editor.hass = this.hass;
      editor.lovelace = this.lovelace;
      editor.setConfig(this._stackConfig(this._config));
    }
  }

  // Home Assistant's stack editor rejects options it doesn't know, so it
  // only gets the title and the cards
  private _stackConfig(config: StackInCardConfig): LovelaceCardConfig {
    const stack: LovelaceCardConfig = {
      type: `${config.mode ?? "vertical"}-stack`,
      cards: config.cards ?? [],
    };
    if (config.title) stack.title = config.title;
    return stack;
  }

  private _cardsChanged = (ev: Event): void => {
    ev.stopPropagation();
    if (!this._config) return;
    const { title, cards } = (ev as CustomEvent).detail.config;
    const config: StackInCardConfig = { ...this._config, cards };
    if (title) config.title = title;
    else delete config.title;
    this._fire(config);
  };

  private _modeChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config) return;
    const config = { ...this._config };
    if (ev.detail.value.mode === "horizontal") config.mode = "horizontal";
    else delete config.mode;
    this._fire(config);
  }

  private _fire(config: StackInCardConfig): void {
    // `keep` from the original card does nothing here, so it's removed
    delete (config as { keep?: unknown }).keep;
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  private _t = (name: string): string => {
    const [key, english] = LABELS[name];
    const localize = this.hass?.localize as
      ((key: string) => string) | undefined;
    return localize?.(key) || english;
  };

  private _computeLabel = (schema: { name: string }): string =>
    this._t(schema.name);

  private get _schemas(): Schemas {
    const localize = this.hass?.localize;
    if (!this._schemaCache || this._schemaCache.localize !== localize) {
      this._schemaCache = { localize, schemas: buildSchemas(this._t) };
    }
    return this._schemaCache.schemas;
  }

  protected render() {
    if (!this._config || !this.hass) return nothing;
    return html`
      <ha-form
        .hass=${this.hass}
        .data=${{ mode: this._config.mode ?? "vertical" }}
        .schema=${this._schemas.mode}
        .computeLabel=${this._computeLabel}
        @value-changed=${this._modeChanged}
      ></ha-form>
      ${this._stackEditor ?? nothing}
    `;
  }
}
