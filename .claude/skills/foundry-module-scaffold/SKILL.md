---
name: foundry-module-scaffold
description: Create, structure, configure, test and release a Foundry VTT v14 module (add-on). Use when the user wants to start a new Foundry module, write or fix a module.json manifest, add compendium packs, dependencies or languages, set up a local dev loop, or package/publish a module (GitHub release, manifest/download URLs, Package Release API).
---

# Foundry VTT Module Scaffold (v14)

Sources: `../foundry-api-reference/reference/articles/module-development.md`, `packaging-guide.md`,
`package-release-api.md`, `versioning.md`, `module-sub-types.md`, and the interfaces
`../foundry-api-reference/reference/api/interfaces/foundry.packages.types.{PackageManifestData,_ModuleManifestData,PackageFlagsData,PackageCompendiumData}.md`.

## Create a new module

```bash
node .claude/skills/foundry-module-scaffold/scaffold.mjs <parent-dir> --id my-module --title "My Module" \
  --author "Name" --repo owner/my-module --description "What it does"
```

This copies `template/` to `<parent-dir>/my-module/`:

```
my-module/
  module.json                  manifest (id MUST equal the folder name)
  scripts/main.js              ES module entry: init / setup / ready hooks, settings, public API
  styles/my-module.css
  templates/                   Handlebars .hbs templates for ApplicationV2 PARTS
  lang/en.json                 localization keys namespaced under the module id
  packs/                       compendium LevelDB folders
  .github/workflows/release.yml  zip + attach module.json/module.zip on GitHub release
  README.md, .gitignore
```

The rules for `id` are lower-case, no special characters, hyphen-separated, and **identical to the directory name**.

## Manifest (module.json) reference

Required fields: `id`, `title`, `version` (dot-separated numbers like `"1.2.3"` with no leading `v`, compared with `foundry.utils.isNewerVersion`). `description` is strongly expected and can contain HTML.

| Key | Purpose |
|---|---|
| `compatibility` | `{ minimum, verified, maximum }`. Use `"14"` for v14. Set `maximum` only if you know a version breaks the module, because it blocks installs |
| `esmodules` | **Preferred** JS entry points, loaded as ES modules (`import`/`export` work between your files) |
| `scripts` | Legacy non-module scripts, loaded in order |
| `styles` | CSS files |
| `languages` | `[{ lang: "en", name: "English", path: "lang/en.json" }]` |
| `packs` | `[{ name, label, path, type, system?, banner?, ownership? }]`. Actor, Item and Adventure packs **must** set `system`. `ownership` maps `PLAYER`/`TRUSTED`/`ASSISTANT` to `NONE`/`OBSERVER`/`OWNER` |
| `packFolders` | Default sidebar folders for packs: `{ name, sorting: "a"\|"m", color, packs: [...], folders: [...] }` |
| `relationships` | `{ systems: [...], requires: [...], recommends: [...] }`. Each entry is `{ id, type, manifest?, compatibility? }` |
| `socket` | `true` reserves the socket event `module.<id>` (see the foundry-module-runtime skill) |
| `documentTypes` | Module-defined sub-types for Actor, Item, JournalEntryPage, Cards, Card, etc. (see `articles/module-sub-types.md` and the foundry-documents-data skill) |
| `library` | `true` for library-only modules. They load before other packages |
| `flags.hotReload` | `{ extensions: ["css","hbs","json"], paths: ["styles","templates","lang"] }` hot-reloads those files without refreshing (fires the `hotReload` hook) |
| `flags.canUpload` | Allow FilePicker uploads into this package's folder |
| `media` | `[{ type: "setup"\|..., url, thumbnail }]` art |
| `authors` | `[{ name, email?, discord?, url? }]` |
| `url`, `bugs`, `changelog`, `readme`, `license` | Links or relative paths |
| `manifest` | **Stable** URL of the latest manifest (used for update checks) |
| `download` | URL of the zip **for this version** |
| `persistentStorage` | Keep the package's `/storage` folder across updates |

The KB article still mentions a top-level `"system": [...]` restriction, but the v14 manifest interfaces only define `relationships.systems`. Use that.

## JavaScript entry point

- Code at the top level of an ES module runs when the file is loaded, which is before `init`. Put work inside hooks:
  - `init`: register settings, keybindings, sheets, `CONFIG` changes, document classes, and data models.
  - `setup`: game data is initialized. Use it for anything that needs settings values or `game.*` collections before the UI renders.
  - `ready`: everything is available. Set `game.modules.get(id).api = {...}` here or in `init`.
- Modules only run inside a game world, never on the Setup or Join screens.
- Prefer namespaced globals: `foundry.applications.api.ApplicationV2`, `foundry.utils.*`, `foundry.documents.*`.
- See the **foundry-module-runtime**, **foundry-applications**, **foundry-documents-data**, and **foundry-canvas-dice** skills for each area. Look up exact signatures with **foundry-api-reference**.

## Local development loop

1. Find the user data path: Setup → Configuration → *User Data Path*. On Windows the default is `%LOCALAPPDATA%\FoundryVTT`.
2. Keep the repo outside Foundry and link it in:
   - Windows (no admin needed): `cmd /c mklink /J "%LOCALAPPDATA%\FoundryVTT\Data\modules\my-module" "C:\path\to\repo\my-module"`
   - macOS/Linux: `ln -s /path/to/repo/my-module ~/.local/share/FoundryVTT/Data/modules/my-module`
3. Restart Foundry once so it discovers the new manifest. Enable the module in a **dedicated test world** with no other modules.
4. Edits to JS need a browser refresh (F5). CSS, HBS, and lang files hot-reload if `flags.hotReload` is set.
5. Debug with F12 DevTools. `CONFIG.debug.hooks = true` logs every hook call.
6. Manifest changes (new esmodules, packs, languages) need a return to Setup or a Foundry restart.

## Compendium packs

- In v11+ each pack is a **LevelDB directory** (`packs/<name>/`), not a `.db` file. Edit packs in Foundry (unlock the pack, then drag documents in or use folder → Export to Compendium).
- Shut the world down before copying or committing pack folders, because LevelDB holds locks while running.
- For source control, Foundry's official CLI `@foundryvtt/foundryvtt-cli` (`fvtt package unpack` / `fvtt package pack`) converts packs to and from JSON/YAML. It is not part of the API docs, so check its README for current flags.

## Releasing

1. Bump `version` in module.json, then commit.
2. Create a GitHub release tagged `vX.Y.Z`. The bundled workflow stamps `version`, `manifest` and `download`, then uploads `module.json` and `module.zip` to the release.
   - `manifest` → `https://github.com/OWNER/REPO/releases/latest/download/module.json` (stable)
   - `download` → `https://github.com/OWNER/REPO/releases/download/vX.Y.Z/module.zip` (version-specific)
3. To list the module on foundryvtt.com, submit it once through the website. After that you can automate version listings with the **Package Release API**:
   `POST https://foundryvtt.com/_api/packages/release_version/` with header `Authorization: fvttp_...` (the package's release token, which must stay secret, e.g. in a GitHub secret) and body
   `{ "id", "dry-run"?: true, "release": { "version", "manifest" (version-specific URL), "notes"?, "compatibility": { "minimum", "verified", "maximum"? } } }`.
   See `articles/package-release-api.md`.

## Checklist before publishing

- [ ] `id` equals the folder name. The JSON is valid. `version` was bumped.
- [ ] `compatibility.minimum` and `verified` are set. `maximum` is unset unless needed.
- [ ] All user-facing strings are localized under the `<id>.` namespace.
- [ ] CSS is scoped under a module class, with no global element selectors.
- [ ] Settings, flags, and socket events are namespaced to the module id.
- [ ] The module was tested in a clean world with only its required dependencies.
- [ ] Packs are built and not locked, and Actor, Item and Adventure packs declare `system`.
