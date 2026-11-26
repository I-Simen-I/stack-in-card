import { loadCardHelpers } from "./card-helpers";
import {
  HomeAssistant,
  LovelaceCardConfig,
  MODES,
  StackInCardConfig,
} from "./types";

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
          options: MODES.map((value) => ({
            value,
            label: t(value),
          })),
        },
      },
    },
  ],
});

type Schemas = ReturnType<typeof buildSchemas>;

// The parts of Home Assistant's ha-form the editor sets
interface HaForm extends HTMLElement {
  hass?: HomeAssistant;
  data?: unknown;
  schema?: unknown;
  computeLabel?: (schema: { name: string }) => string;
}

export class StackInCardEditor extends HTMLElement {
  private _hass?: HomeAssistant;
  // The dashboard's config, which the card picker of the stack editor uses
  private _lovelace?: unknown;
  private _config?: StackInCardConfig;
  private _form?: HaForm;
  private _stackEditor?: StackEditor;
  private _loading = false;

  // Built again only when Home Assistant's translations change (a new
  // localize function). New schema objects would make ha-form rebuild its
  // fields.
  private _schemaCache?: { localize: unknown; schemas: Schemas };

  set hass(hass: HomeAssistant) {
    this._hass = hass;
    this._update();
  }

  set lovelace(lovelace: unknown) {
    this._lovelace = lovelace;
    this._update();
  }

  setConfig(config: StackInCardConfig): void {
    this._config = config;
    this._stackEditor?.setConfig(this._stackConfig(config));
    this._update();
  }

  connectedCallback(): void {
    if (this._loading) return;
    this._loading = true;
    loadStackEditor().then((editor) => {
      editor.addEventListener("config-changed", this._cardsChanged);
      this._stackEditor = editor;
      if (this._config) editor.setConfig(this._stackConfig(this._config));
      this._update();
    });
  }

  // Shows the mode form, and the stack editor once it has loaded
  private _update(): void {
    if (!this._config || !this._hass) return;
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" });

    if (!this._form) {
      this._form = document.createElement("ha-form") as HaForm;
      this._form.computeLabel = this._computeLabel;
      this._form.addEventListener("value-changed", (ev) =>
        this._modeChanged(ev as CustomEvent),
      );
      shadow.append(this._form);
    }
    this._form.hass = this._hass;
    this._form.schema = this._schemas.mode;
    // A new data object makes ha-form render again, so only on a change
    const mode = this._config.mode ?? "vertical";
    const data = this._form.data as { mode?: string } | undefined;
    if (data?.mode !== mode) this._form.data = { mode };

    const editor = this._stackEditor;
    if (!editor) return;
    editor.hass = this._hass;
    editor.lovelace = this._lovelace;
    if (!editor.parentNode) shadow.append(editor);
  }

  // Home Assistant's stack editor rejects options it doesn't know, so it
  // only gets the title and the cards
  private _stackConfig(config: StackInCardConfig): LovelaceCardConfig {
    const stack: LovelaceCardConfig = {
      type: `${config.mode ?? "vertical"}-stack`,
      cards: config.cards,
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
    this.setConfig(config);
    fireEvent(this, "config-changed", { config });
  }

  private _t = (name: string): string => {
    const [key, english] = LABELS[name];
    return this._hass?.localize?.(key) || english;
  };

  private _computeLabel = (schema: { name: string }): string =>
    this._t(schema.name);

  private get _schemas(): Schemas {
    const localize = this._hass?.localize;
    if (!this._schemaCache || this._schemaCache.localize !== localize) {
      this._schemaCache = { localize, schemas: buildSchemas(this._t) };
    }
    return this._schemaCache.schemas;
  }
}

customElements.define("stack-in-card-editor", StackInCardEditor);
