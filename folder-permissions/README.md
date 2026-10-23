# Folder Permissions

Folders in Foundry VTT don't remember permissions, and the core folder "Configure Ownership" option is a one-time edit. This module gives folders their own ownership rules:

- **Cascade:** set ownership once on a folder and it is applied to every document in the folder and, optionally, all its subfolders, in one batch.
- **Inherit:** documents created in, imported into, or moved into the folder receive its permissions automatically. Subfolders without their own rule use the nearest parent folder's rule.
- **Moving a folder** under a parent with a rule passes that rule down to its contents.
- **Moving a document out** of a folder keeps its permissions.

It works for actors, items, scenes, journal entries, playlists, roll tables, card stacks and macros. Items on a character sheet already follow the character's ownership in core Foundry.

## Installation

In Foundry, go to **Add-on Modules → Install Module** and paste this manifest URL:

```
https://raw.githubusercontent.com/Lunch-box-code/FoundryVTT-Addons/main/folder-permissions/module.json
```

## Usage (GM only)

1. Right-click a folder in the sidebar and choose **Folder Permissions**.
2. Pick a level for **All Players** and/or individual players. **No change** leaves that entry untouched on every document. **Default** makes a player fall back to the All Players level.
3. Choose **Apply to all subfolders** and **Remember for new contents**, then **Apply**. A confirmation shows how many documents will change.

Folders with a remembered rule show a lock icon in the sidebar. **Forget Rule** stops a folder from passing its permissions on (documents keep what they already have).

Settings: **Automatic inheritance** (world) and **Show folder marker** (per client).

Macro or console API:

```js
const api = game.modules.get("folder-permissions").api;
api.open(game.folders.getName("Party"));
api.resolveRule(folder);            // rule in effect for a folder, or null
await api.reapply(folder);          // re-apply inherited rules below a folder
```

## Compatibility

Foundry VTT v14.
