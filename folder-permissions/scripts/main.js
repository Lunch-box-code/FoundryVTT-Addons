/**
 * Folder Permissions entry point.
 * - Adds "Folder Permissions" to the right-click menu of sidebar folders (GM only).
 * - Documents created in, or moved into, a folder with a remembered rule inherit its ownership.
 * - A folder moved under a ruled parent passes the inherited rule down to its contents.
 * Moving a document OUT of a folder leaves its ownership unchanged.
 */
import {
  MODULE_ID, SUPPORTED_TYPES, OPERATION_FLAG,
  isSupportedFolder, getRule, resolveRule, reapplyInheritedRules
} from "./rules.js";
import { FolderPermissionsConfig } from "./folder-permissions-config.js";

const log = (...args) => console.log(`${MODULE_ID} |`, ...args);

/** Is automatic inheritance switched on? */
const autoInherit = () => game.settings.get(MODULE_ID, "autoInherit");

/** Is this client the one GM that should perform follow-up updates? */
const isResponsibleGM = () => game.user === game.users.activeGM;

/**
 * Find the Folder a sidebar element belongs to.
 * Sidebar markup is not part of the documented API, so try the common data attributes.
 * @param {HTMLElement} element
 * @returns {Folder|null}
 */
function folderFromElement(element) {
  const id = element?.closest("[data-folder-id]")?.dataset.folderId;
  if ( id ) return game.folders.get(id) ?? null;
  const uuid = element?.closest("[data-uuid]")?.dataset.uuid;
  const doc = uuid ? fromUuidSync(uuid) : null;
  return doc?.documentName === "Folder" ? doc : null;
}

/* -------------------------------------------- */
/*  Initialization                              */
/* -------------------------------------------- */

Hooks.once("init", () => {
  log("Initializing");
  game.settings.register(MODULE_ID, "autoInherit", {
    name: `${MODULE_ID}.Settings.AutoInherit.Name`,
    hint: `${MODULE_ID}.Settings.AutoInherit.Hint`,
    scope: "world",
    config: true,
    type: Boolean,
    default: true
  });
  game.settings.register(MODULE_ID, "showMarker", {
    name: `${MODULE_ID}.Settings.ShowMarker.Name`,
    hint: `${MODULE_ID}.Settings.ShowMarker.Hint`,
    scope: "client",
    config: true,
    type: Boolean,
    default: true,
    onChange: () => ui.sidebar?.render()
  });
});

Hooks.once("ready", () => {
  game.modules.get(MODULE_ID).api = {
    /** Open the configuration window for a folder. */
    open: folder => FolderPermissionsConfig.open(folder),
    /** The remembered rule in effect for a folder (its own or the nearest ancestor's). */
    resolveRule,
    /** Re-apply inherited rules to everything under a folder. Returns the number of documents updated. */
    reapply: folder => reapplyInheritedRules(folder)
  };
});

/* -------------------------------------------- */
/*  Folder context menu                         */
/* -------------------------------------------- */

Hooks.on("getFolderContextOptions", (application, menuItems) => {
  menuItems.push({
    label: `${MODULE_ID}.Menu.Configure`,
    icon: '<i class="fa-solid fa-folder-tree"></i>',
    visible: target => game.user.isGM && isSupportedFolder(folderFromElement(target)),
    onClick: (event, target) => {
      const folder = folderFromElement(target);
      if ( folder ) FolderPermissionsConfig.open(folder);
    }
  });
});

/* -------------------------------------------- */
/*  Sidebar marker for folders with a rule      */
/* -------------------------------------------- */

Hooks.on("renderDocumentDirectory", (application, element) => {
  if ( !game.user.isGM || !game.settings.get(MODULE_ID, "showMarker") ) return;
  for ( const node of element.querySelectorAll("[data-folder-id]") ) {
    const folder = game.folders.get(node.dataset.folderId);
    const rule = getRule(folder);
    if ( !rule?.remember ) continue;
    const header = node.querySelector(".folder-header") ?? node;
    const name = header.querySelector("h3, .folder-name, .name") ?? header;
    if ( name.querySelector(".folder-permissions-marker") ) continue;
    const icon = document.createElement("i");
    icon.className = "fa-solid fa-user-lock folder-permissions-marker";
    icon.dataset.tooltip = game.i18n.localize(`${MODULE_ID}.Marker`);
    name.append(icon);
  }
});

/* -------------------------------------------- */
/*  Inheritance for documents                   */
/* -------------------------------------------- */

for ( const type of SUPPORTED_TYPES ) {

  // Created in a ruled folder. A GM writes ownership into the creation data directly.
  Hooks.on(`preCreate${type}`, (document, data, options, userId) => {
    if ( !autoInherit() || !game.user.isGM || document.pack ) return;
    const rule = resolveRule(document.folder);
    if ( rule ) document.updateSource({ ownership: rule.ownership });
  });

  // Created by a player: they may not set other users' ownership, so the active GM follows up.
  Hooks.on(`create${type}`, (document, options, userId) => {
    if ( !autoInherit() || !isResponsibleGM() || document.pack ) return;
    if ( game.users.get(userId)?.isGM ) return;
    const rule = resolveRule(document.folder);
    if ( rule ) document.update({ ownership: rule.ownership }, { [OPERATION_FLAG]: true });
  });

  // Moved into a ruled folder by a GM: add ownership to the same update.
  Hooks.on(`preUpdate${type}`, (document, changed, options, userId) => {
    if ( !autoInherit() || !game.user.isGM || options[OPERATION_FLAG] ) return;
    if ( !("folder" in changed) || !changed.folder ) return;      // moved to root: keep ownership
    const rule = resolveRule(game.folders.get(changed.folder));
    if ( rule ) changed.ownership = foundry.utils.mergeObject(changed.ownership ?? {}, rule.ownership, { inplace: false });
  });

  // Moved by a player (e.g. their own document): the active GM follows up.
  Hooks.on(`update${type}`, (document, changed, options, userId) => {
    if ( !autoInherit() || !isResponsibleGM() || options[OPERATION_FLAG] ) return;
    if ( game.users.get(userId)?.isGM ) return;
    if ( !("folder" in changed) || !changed.folder ) return;
    const rule = resolveRule(document.folder);
    if ( rule ) document.update({ ownership: rule.ownership }, { [OPERATION_FLAG]: true });
  });
}

/* -------------------------------------------- */
/*  Inheritance for moved folders               */
/* -------------------------------------------- */

Hooks.on("updateFolder", (folder, changed, options, userId) => {
  if ( !autoInherit() || !isResponsibleGM() || !("folder" in changed) || !changed.folder ) return;
  if ( !isSupportedFolder(folder) || getRule(folder)?.remember ) return;   // its own rule wins
  if ( !resolveRule(folder) ) return;
  reapplyInheritedRules(folder).then(n => {
    if ( n ) ui.notifications.info(game.i18n.localize(`${MODULE_ID}.Notify.Inherited`, { documents: n, folder: folder.name }));
  });
});
