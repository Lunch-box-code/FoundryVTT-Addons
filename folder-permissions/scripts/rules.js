/**
 * Folder permission rules: storage on the Folder, resolution through the folder tree,
 * and applying ownership to the documents a folder contains.
 *
 * A rule is stored as the flag `flags.folder-permissions.rule`:
 *   { ownership: { default?: number, [userId]: number }, remember: boolean }
 * Ownership values come from CONST.DOCUMENT_OWNERSHIP_LEVELS (INHERIT -1, NONE 0, LIMITED 1, OBSERVER 2, OWNER 3).
 * Keys left out of the rule are never touched on the documents.
 */

export const MODULE_ID = "folder-permissions";

/** World document types that live in folders and carry an `ownership` field. */
export const SUPPORTED_TYPES = ["Actor", "Item", "Scene", "JournalEntry", "Playlist", "RollTable", "Cards", "Macro"];

/** Option key placed on our own update operations so our hooks can ignore them. */
export const OPERATION_FLAG = MODULE_ID;

/**
 * Can this folder hold permission rules?
 * @param {Folder|null|undefined} folder
 * @returns {boolean}
 */
export function isSupportedFolder(folder) {
  return !!folder && !folder.inCompendium && SUPPORTED_TYPES.includes(folder.type);
}

/**
 * The rule stored directly on a folder, if any.
 * @param {Folder} folder
 * @returns {{ownership: object, remember: boolean}|null}
 */
export function getRule(folder) {
  return folder?.getFlag(MODULE_ID, "rule") ?? null;
}

/**
 * The remembered rule that applies to documents placed in this folder:
 * the folder's own rule, otherwise the nearest ancestor's.
 * @param {Folder|null|undefined} folder
 * @returns {{ownership: object, remember: boolean, source: Folder}|null}
 */
export function resolveRule(folder) {
  if ( !isSupportedFolder(folder) ) return null;
  for ( const f of [folder, ...folder.ancestors] ) {
    const rule = getRule(f);
    if ( rule?.remember && !foundry.utils.isEmpty(rule.ownership ?? {}) ) return { ...rule, source: f };
  }
  return null;
}

/**
 * The folder itself plus, optionally, every nested subfolder.
 * @param {Folder} folder
 * @param {boolean} includeSubfolders
 * @returns {Folder[]}
 */
export function collectFolders(folder, includeSubfolders) {
  return includeSubfolders ? [folder, ...folder.getSubfolders(true)] : [folder];
}

/**
 * Write ownership to many documents of one type in a single batched update.
 * @param {typeof foundry.abstract.Document} documentClass
 * @param {foundry.abstract.Document[]} documents
 * @param {object} ownership
 * @returns {Promise<foundry.abstract.Document[]>}
 */
export async function applyOwnership(documentClass, documents, ownership) {
  if ( !documents.length || foundry.utils.isEmpty(ownership) ) return [];
  const updates = documents.map(d => ({ _id: d.id, ownership: { ...ownership } }));
  return documentClass.updateDocuments(updates, { [OPERATION_FLAG]: true });
}

/**
 * Re-apply inherited rules to everything below a folder, e.g. after the folder was moved
 * under a parent with a remembered rule. Each subfolder uses its own nearest rule.
 * @param {Folder} folder
 * @returns {Promise<number>} The number of documents updated
 */
export async function reapplyInheritedRules(folder) {
  if ( !isSupportedFolder(folder) ) return 0;
  let count = 0;
  for ( const f of collectFolders(folder, true) ) {
    const rule = resolveRule(f);
    if ( !rule ) continue;
    const updated = await applyOwnership(f.documentClass, f.contents, rule.ownership);
    count += updated.length;
  }
  return count;
}
