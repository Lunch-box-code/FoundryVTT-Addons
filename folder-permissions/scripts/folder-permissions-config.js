import { MODULE_ID, getRule, collectFolders, applyOwnership } from "./rules.js";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const TEMPLATES = `modules/${MODULE_ID}/templates`;

/**
 * GM window for setting a folder's ownership, cascading it to the folder's contents,
 * and remembering it for documents added later.
 */
export class FolderPermissionsConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  constructor(options = {}) {
    if ( !options.folder ) throw new Error(`${MODULE_ID} | FolderPermissionsConfig requires a folder`);
    options.id ??= `${MODULE_ID}-${options.folder.id}`;
    super(options);
  }

  static DEFAULT_OPTIONS = {
    tag: "form",
    classes: [MODULE_ID],
    window: {
      icon: "fa-solid fa-folder-tree",
      contentClasses: ["standard-form"]
    },
    position: { width: 480, height: "auto" },
    form: {
      handler: FolderPermissionsConfig.#onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    actions: {
      clearRule: FolderPermissionsConfig.#onClearRule
    }
  };

  static PARTS = {
    form: { template: `${TEMPLATES}/folder-permissions.hbs`, scrollable: [".users"] },
    footer: { template: `${TEMPLATES}/footer.hbs` }
  };

  /** @type {Folder} */
  get folder() {
    return this.options.folder;
  }

  get title() {
    return game.i18n.localize(`${MODULE_ID}.Config.Title`, { folder: this.folder.name });
  }

  /* -------------------------------------------- */

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const { NOCHANGE } = CONST.DOCUMENT_META_OWNERSHIP_LEVELS;
    const { INHERIT, NONE, LIMITED, OBSERVER, OWNER } = CONST.DOCUMENT_OWNERSHIP_LEVELS;
    const rule = getRule(this.folder);
    const saved = rule?.ownership ?? {};
    const L = key => game.i18n.localize(`${MODULE_ID}.Levels.${key}`);

    // Arrays (not objects) so the order survives: objects would sort the negative keys last.
    const choice = (value, key) => ({ value: String(value), label: L(key) });
    const levels = [choice(NONE, "None"), choice(LIMITED, "Limited"), choice(OBSERVER, "Observer"), choice(OWNER, "Owner")];
    context.defaultChoices = [choice(NOCHANGE, "NoChange"), ...levels];
    context.userChoices = [choice(NOCHANGE, "NoChange"), choice(INHERIT, "Default"), ...levels];
    context.defaultLevel = String(saved.default ?? NOCHANGE);
    context.users = game.users.filter(u => !u.isGM).map(u => ({
      id: u.id,
      name: u.name,
      level: String(saved[u.id] ?? NOCHANGE)
    }));
    context.hasRule = !!rule;
    context.remember = rule ? !!rule.remember : true;
    context.includeSubfolders = true;
    return context;
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    const checkbox = this.element.querySelector("input[name='includeSubfolders']");
    checkbox?.addEventListener("change", () => this.#updatePreview());
    this.#updatePreview();
  }

  /** Show how many documents and folders the cascade will touch. */
  #updatePreview() {
    const include = this.element.querySelector("input[name='includeSubfolders']")?.checked ?? true;
    const folders = collectFolders(this.folder, include);
    const documents = folders.reduce((n, f) => n + f.contents.length, 0);
    const preview = this.element.querySelector(".preview");
    if ( preview ) preview.textContent = game.i18n.localize(`${MODULE_ID}.Config.Preview`, {
      documents, folders: folders.length
    });
  }

  /* -------------------------------------------- */

  /**
   * Read the form into an ownership object, leaving out "No change" entries.
   * @param {object} data   Expanded form data
   * @returns {object}
   */
  static #readOwnership(data) {
    const { NOCHANGE } = CONST.DOCUMENT_META_OWNERSHIP_LEVELS;
    const ownership = {};
    for ( const [key, value] of Object.entries(data.ownership ?? {}) ) {
      const level = Number(value);
      if ( Number.isFinite(level) && (level !== NOCHANGE) ) ownership[key] = level;
    }
    return ownership;
  }

  /** @this {FolderPermissionsConfig} */
  static async #onSubmit(event, form, formData) {
    const data = foundry.utils.expandObject(formData.object);
    const ownership = FolderPermissionsConfig.#readOwnership(data);
    const folder = this.folder;
    const folders = collectFolders(folder, data.includeSubfolders);
    const documents = folders.flatMap(f => f.contents);
    const hasChanges = !foundry.utils.isEmpty(ownership);

    if ( hasChanges && documents.length ) {
      const proceed = await DialogV2.confirm({
        window: { title: `${MODULE_ID}.Confirm.Title` },
        content: `<p>${game.i18n.localize(`${MODULE_ID}.Confirm.Content`, {
          documents: documents.length, folders: folders.length
        })}</p>`,
        rejectClose: false,
        modal: true
      });
      if ( !proceed ) return;
      await applyOwnership(folder.documentClass, documents, ownership);
    }

    // Store or clear the rule. Unset first so stale user entries do not survive a flag merge.
    await folder.unsetFlag(MODULE_ID, "rule");
    if ( data.remember && hasChanges ) {
      await folder.setFlag(MODULE_ID, "rule", { ownership, remember: true });
      // Cascading explicitly makes subfolders follow this folder from now on.
      if ( data.includeSubfolders ) {
        for ( const sub of folders.slice(1) ) {
          if ( getRule(sub) ) await sub.unsetFlag(MODULE_ID, "rule");
        }
      }
    }

    ui.notifications.info(game.i18n.localize(`${MODULE_ID}.Notify.Applied`, {
      documents: hasChanges ? documents.length : 0, folder: folder.name
    }));
  }

  /** @this {FolderPermissionsConfig} */
  static async #onClearRule() {
    await this.folder.unsetFlag(MODULE_ID, "rule");
    ui.notifications.info(game.i18n.localize(`${MODULE_ID}.Notify.Cleared`, { folder: this.folder.name }));
    this.render();
  }

  /* -------------------------------------------- */

  /**
   * Open the window for a folder, or bring an existing one to the front.
   * @param {Folder} folder
   */
  static open(folder) {
    const existing = foundry.applications.instances.get(`${MODULE_ID}-${folder.id}`);
    if ( existing ) return existing.bringToFront();
    return new this({ folder }).render({ force: true });
  }
}
