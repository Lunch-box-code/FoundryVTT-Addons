/**
 * Complete minimal custom ApplicationV2 for Foundry VTT v14.
 *
 * Demonstrates: HandlebarsApplicationMixin, DEFAULT_OPTIONS (id, tag, classes, window, position,
 * actions, form), static PARTS, static TABS, _prepareContext/_preparePartContext, _onRender,
 * _preClose, header controls, action handlers with mouse-button filters, a form handler using
 * FormDataExtended#object, DialogV2.confirm, and opening the app from a settings menu.
 *
 * Files used (relative to the module root, module id "my-module"):
 *   templates/session-notes/notes.hbs
 *   templates/session-notes/settings.hbs
 *   templates/session-notes/footer.hbs
 * The tab navigation part uses the core template "templates/generic/tab-navigation.hbs".
 */

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;

export const MODULE_ID = "my-module";
const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates/session-notes`;

const MOODS = {
  calm: "my-module.SessionNotes.Moods.calm",
  tense: "my-module.SessionNotes.Moods.tense",
  chaotic: "my-module.SessionNotes.Moods.chaotic"
};

export class SessionNotesApp extends HandlebarsApplicationMixin(ApplicationV2) {

  /** Merged with every parent class's DEFAULT_OPTIONS (arrays concatenate, objects merge). */
  static DEFAULT_OPTIONS = {
    id: "my-module-session-notes",
    tag: "form",                        // top-level element is a <form>: enables options.form
    classes: ["my-module", "session-notes"],
    window: {
      title: "Session Notes",           // see the `title` getter below for a localized title
      icon: "fa-solid fa-book",
      resizable: true,
      // Header controls (dropdown menu). `action` must be a key of `actions` below.
      controls: [{
        action: "resetNotes",
        icon: "fa-solid fa-trash",
        label: "my-module.SessionNotes.Reset"
      }]
    },
    position: { width: 520, height: "auto" },
    form: {
      handler: SessionNotesApp.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      resetNotes: SessionNotesApp.#onResetNotes,
      // Respond to left (0) and right (2) clicks. A bare function only handles left-click.
      rollMood: { handler: SessionNotesApp.#onRollMood, buttons: [0, 2] }
    }
  };

  /** Each part renders one template with exactly ONE top-level element. Order = DOM order. */
  static PARTS = {
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    notes: { template: `${TEMPLATE_ROOT}/notes.hbs`, scrollable: [""] },
    settings: { template: `${TEMPLATE_ROOT}/settings.hbs` },
    footer: { template: `${TEMPLATE_ROOT}/footer.hbs` }
  };

  /** One tab group named "primary". With exactly one group, context.tabs is prepared for you. */
  static TABS = {
    primary: {
      tabs: [
        { id: "notes", icon: "fa-solid fa-feather" },
        { id: "settings", icon: "fa-solid fa-gears" }
      ],
      initial: "notes",
      labelPrefix: "my-module.SessionNotes.Tabs"   // label = `${labelPrefix}.${tabId}`
    }
  };

  /** ApplicationV2#title is a getter; overriding it lets us localize at render time. */
  get title() {
    return game.i18n.localize("my-module.SessionNotes.Title");
  }

  /* -------------------------------------------- */
  /*  Rendering                                   */
  /* -------------------------------------------- */

  /** Shared context for every part. */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);   // contains `tabs`
    context.notes = game.settings.get(MODULE_ID, "notes");
    context.mood = game.settings.get(MODULE_ID, "mood");
    context.moods = MOODS;
    return context;
  }

  /** Per-part context. Mutating the shared context keeps it visible to _onRender. */
  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    // Give each tab part a convenient `tab` reference (used for `tab.cssClass` in the template).
    if ( context.tabs && (partId in context.tabs) ) context.tab = context.tabs[partId];
    return context;
  }

  /** Runs after EVERY render (including partial re-renders). Attach non-click listeners here. */
  async _onRender(context, options) {
    await super._onRender(context, options);
    const textarea = this.element.querySelector("textarea[name='notes']");
    const counter = this.element.querySelector(".char-count");
    textarea?.addEventListener("input", () => counter.textContent = String(textarea.value.length));
  }

  /** Awaited before the app closes. */
  async _preClose(options) {
    await super._preClose(options);
    console.debug(`${MODULE_ID} | closing session notes`);
  }

  /* -------------------------------------------- */
  /*  Action + Form Handlers                      */
  /*  Static, but invoked with `this` = instance  */
  /* -------------------------------------------- */

  /**
   * @this {SessionNotesApp}
   * @param {SubmitEvent|Event} event
   * @param {HTMLFormElement} form
   * @param {foundry.applications.ux.FormDataExtended} formData
   */
  static async #onSubmit(event, form, formData) {
    const data = formData.object;            // { notes: string, mood: string }
    await game.settings.set(MODULE_ID, "notes", data.notes);
    await game.settings.set(MODULE_ID, "mood", data.mood);
    ui.notifications.info("my-module.SessionNotes.Saved", { localize: true });
  }

  /**
   * @this {SessionNotesApp}
   * @param {PointerEvent} event
   * @param {HTMLElement} target   The element carrying data-action
   */
  static async #onResetNotes(event, target) {
    const confirmed = await DialogV2.confirm({
      window: { title: "my-module.SessionNotes.Reset" },
      content: `<p>${game.i18n.localize("my-module.SessionNotes.ResetConfirm")}</p>`,
      rejectClose: false,
      modal: true
    });
    if ( !confirmed ) return;
    await game.settings.set(MODULE_ID, "notes", "");
    this.render({ parts: ["notes"] });       // partial re-render
  }

  /**
   * Left-click picks a random mood, right-click resets to "calm". Changes the form only (no save).
   * @this {SessionNotesApp}
   */
  static #onRollMood(event, target) {
    const select = this.form.elements.mood;
    const keys = Object.keys(MOODS);
    select.value = event.button === 2 ? "calm" : keys[Math.floor(Math.random() * keys.length)];
  }

  /* -------------------------------------------- */

  /** Open (or focus) the single instance. foundry.applications.instances is keyed by app id. */
  static open() {
    const existing = foundry.applications.instances.get(this.DEFAULT_OPTIONS.id);
    if ( existing ) {
      existing.bringToFront();
      return existing;
    }
    return new this().render({ force: true });
  }
}

/* -------------------------------------------- */
/*  Registration (call from your esmodule)      */
/* -------------------------------------------- */

Hooks.once("init", () => {
  game.settings.register(MODULE_ID, "notes", {
    scope: "world", config: false, type: String, default: ""
  });
  game.settings.register(MODULE_ID, "mood", {
    scope: "world", config: false, type: String, default: "calm"
  });

  // A button in Configure Settings that opens the app. `type` takes an ApplicationV2 subclass.
  game.settings.registerMenu(MODULE_ID, "sessionNotesMenu", {
    name: "my-module.SessionNotes.Title",
    label: "my-module.SessionNotes.Open",
    hint: "my-module.SessionNotes.Hint",
    icon: "fa-solid fa-book",
    type: SessionNotesApp,
    restricted: true
  });
});

// Open it from a macro or console:  game.modules.get("my-module").api?.openNotes()
Hooks.once("ready", () => {
  const mod = game.modules.get(MODULE_ID);
  if ( mod ) mod.api = { openNotes: () => SessionNotesApp.open() };
});
