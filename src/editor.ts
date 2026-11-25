import { LitElement, PropertyValues, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";

import { loadCardHelpers } from "./card-helpers";
import { localize } from "./localize";
import {
  HomeAssistant,
  KeepConfig,
  LovelaceCardConfig,
  StackInCardConfig,
} from "./types";

const fireEvent = (node: EventTarget, type: string, detail?: unknown): void => {
  node.dispatchEvent(
    new CustomEvent(type, { bubbles: true, composed: true, detail }),
  );
};

type Translate = (key: string) => string;

const KEEP_KEYS = [
  "background",
  "border",
  "border_radius",
  "box_shadow",
  "margin",
  "outer_padding",
] as const;

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
            label: t(`modes.${value}`),
          })),
        },
      },
    },
  ],
  keep: KEEP_KEYS.map((name) => ({ name, selector: { boolean: {} } })),
});

type Schemas = ReturnType<typeof buildSchemas>;

// What the keep switches show: the config, or the defaults
const keepData = (keep: KeepConfig = {}): Required<KeepConfig> => {
  const margin = keep.margin ?? false;
  return {
    background: keep.background ?? false,
    border: keep.border ?? false,
    border_radius: keep.border_radius ?? false,
    box_shadow: keep.box_shadow ?? false,
    margin,
    outer_padding: keep.outer_padding ?? margin,
  };
};

@customElement("stack-in-card-editor")
export class StackInCardEditor extends LitElement {
  @property({ attribute: false }) hass?: HomeAssistant;
  // The dashboard's config, which the card picker of the stack editor uses
  @property({ attribute: false }) lovelace?: unknown;
  @state() private _config?: StackInCardConfig;
  @state() private _stackEditor?: StackEditor;

  // Built once per language. New schema objects on every render would make
  // ha-form rebuild its fields.
  private _schemaCache?: { language: string; schemas: Schemas };

  static styles = css`
    ha-expansion-panel {
      margin-top: 16px;
    }
    .section-content {
      padding: 8px 16px 16px;
    }
    .help {
      color: var(--secondary-text-color);
      font-size: 0.875em;
      margin: 8px 0 0;
    }
  `;

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

  // ha-form sends every switch, so only store the ones that differ from
  // the default. Otherwise defaults end up in the user's config.
  private _keepChanged(ev: CustomEvent): void {
    ev.stopPropagation();
    if (!this._config) return;
    const value = ev.detail.value as Required<KeepConfig>;
    const defaults = { ...keepData(), outer_padding: value.margin };
    const keep: KeepConfig = {};
    for (const key of KEEP_KEYS) {
      if (value[key] !== defaults[key]) keep[key] = value[key];
    }
    const config: StackInCardConfig = { ...this._config, keep };
    if (Object.keys(keep).length === 0) delete config.keep;
    this._fire(config);
  }

  private _fire(config: StackInCardConfig): void {
    this._config = config;
    fireEvent(this, "config-changed", { config });
  }

  private _t = (key: string): string => localize(this.hass, key);

  private _computeLabel = (schema: { name: string }): string =>
    this._t(`fields.${schema.name}`);

  private get _schemas(): Schemas {
    const locale = this.hass?.locale as { language?: string } | undefined;
    const language = locale?.language ?? "en";
    if (this._schemaCache?.language !== language) {
      this._schemaCache = { language, schemas: buildSchemas(this._t) };
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
      <ha-expansion-panel outlined>
        <span slot="header"
          ><ha-icon icon="mdi:palette-outline"></ha-icon>
          ${this._t("sections.keep")}</span
        >
        <div class="section-content">
          <ha-form
            .hass=${this.hass}
            .data=${keepData(this._config.keep)}
            .schema=${this._schemas.keep}
            .computeLabel=${this._computeLabel}
            @value-changed=${this._keepChanged}
          ></ha-form>
          <p class="help">${this._t("keep_help")}</p>
        </div>
      </ha-expansion-panel>
    `;
  }
}
