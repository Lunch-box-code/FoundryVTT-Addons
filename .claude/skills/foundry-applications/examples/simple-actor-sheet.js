/**
 * Complete minimal ActorSheetV2 for Foundry VTT v14, registered from a module.
 *
 * Demonstrates: HandlebarsApplicationMixin(ActorSheetV2), inherited document form handling
 * (submitOnChange), PARTS + TABS, the DocumentSheetV2 render context (document, source, editable,
 * rootId, ...), DataField-driven inputs via {{formInput}}, flags in form field names,
 * embedded Item actions, built-in Item drag & drop (data-item-id), and sheet registration.
 *
 * Templates (module id "my-module"):
 *   templates/actor-sheet/header.hbs
 *   templates/actor-sheet/details.hbs
 *   templates/actor-sheet/items.hbs
 */

const { HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const MODULE_ID = "my-module";
const TEMPLATE_ROOT = `modules/${MODULE_ID}/templates/actor-sheet`;

export class SimpleActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {

  static DEFAULT_OPTIONS = {
    classes: ["my-module", "simple-actor-sheet"],     // concatenated with core sheet classes
    position: { width: 600, height: 640 },
    window: { resizable: true },
    // The form handler is inherited from DocumentSheetV2 and updates the Actor for you.
    form: { submitOnChange: true, closeOnSubmit: false },
    actions: {
      openItem: SimpleActorSheet.#onOpenItem,
      deleteItem: SimpleActorSheet.#onDeleteItem
    }
  };

  static PARTS = {
    header: { template: `${TEMPLATE_ROOT}/header.hbs` },
    tabs: { template: "templates/generic/tab-navigation.hbs" },
    details: { template: `${TEMPLATE_ROOT}/details.hbs`, scrollable: [""] },
    items: { template: `${TEMPLATE_ROOT}/items.hbs`, scrollable: [".item-list"] }
  };

  static TABS = {
    sheet: {
      tabs: [
        { id: "details", icon: "fa-solid fa-book-open", label: "my-module.Sheet.Tabs.details" },
        { id: "items", icon: "fa-solid fa-suitcase", label: "my-module.Sheet.Tabs.items" }
      ],
      initial: "details"
    }
  };

  /**
   * DocumentSheetV2#_prepareContext already provides:
   *   document, source, fields, editable, user, rootId (plus `tabs` for a single tab group).
   */
  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const actor = this.actor;
    context.actor = actor;
    // Explicit DataField reference for the {{formInput}} helper.
    context.nameField = actor.schema.getField("name");
    context.notes = actor.getFlag(MODULE_ID, "notes") ?? "";
    // Sort here (not in the template) so built-in drag-sorting works as expected.
    context.items = actor.items.contents.sort((a, b) => a.sort - b.sort);
    return context;
  }

  async _preparePartContext(partId, context, options) {
    context = await super._preparePartContext(partId, context, options);
    if ( context.tabs && (partId in context.tabs) ) context.tab = context.tabs[partId];
    if ( partId === "details" ) {
      context.enrichedNotes = await foundry.applications.ux.TextEditor.implementation.enrichHTML(
        context.notes, { relativeTo: this.actor, secrets: this.actor.isOwner }
      );
    }
    return context;
  }

  /* -------------------------------------------- */

  /** @this {SimpleActorSheet} */
  static #onOpenItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    this.actor.items.get(itemId)?.sheet.render({ force: true });
  }

  /** @this {SimpleActorSheet} */
  static async #onDeleteItem(event, target) {
    const itemId = target.closest("[data-item-id]")?.dataset.itemId;
    const item = this.actor.items.get(itemId);
    if ( !item ) return;
    const ok = await DialogV2.confirm({
      window: { title: "my-module.Sheet.DeleteItem" },
      content: `<p>${foundry.utils.escapeHTML(item.name)}</p>`,
      rejectClose: false
    });
    if ( ok ) await item.delete();      // the sheet re-renders automatically on document change
  }
}

/* -------------------------------------------- */
/*  Registration                                */
/* -------------------------------------------- */

Hooks.once("init", () => {
  foundry.applications.apps.DocumentSheetConfig.registerSheet(
    foundry.documents.Actor,       // documentClass
    MODULE_ID,                     // scope (unique namespace, usually your package id)
    SimpleActorSheet,              // sheetClass
    {
      label: "my-module.Sheet.Label",   // localized
      makeDefault: false,              // a module usually should NOT override the system default
      // types: ["character"],         // restrict to system sub-types; omit for all types
    }
  );
});
