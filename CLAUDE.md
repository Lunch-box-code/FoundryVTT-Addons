# Foundry VTT module development

This workspace is for building Foundry Virtual Tabletop **v14** modules and add-ons. Each module lives in its own subfolder (`./<module-id>/`), created with the scaffold skill.

## Skills (in `.claude/skills/`)

| Skill | Use for |
|---|---|
| `foundry-api-reference` | Offline copy of the full v14.368 API docs and dev KB articles. **Check signatures here, not from memory.** |
| `foundry-module-scaffold` | New module, module.json, dev loop, packs, releasing |
| `foundry-module-runtime` | Hooks lifecycle, settings, keybindings, sockets, i18n, notifications, chat, public API |
| `foundry-applications` | ApplicationV2 / HandlebarsApplicationMixin, sheets, DialogV2, forms, render hooks |
| `foundry-documents-data` | Document CRUD, flags, compendia, TypeDataModel / data fields, sub-types, ActiveEffects |
| `foundry-canvas-dice` | Canvas layers, placeables, grid, regions, scene controls, Roll and dice terms |

## Conventions

- Plain JavaScript ES modules (`esmodules`). No build step unless a module needs one.
- Namespace everything by module id: settings keys, flags (`doc.setFlag(MODULE_ID, ...)`), socket `module.<id>`, i18n keys `<id>.*`, CSS classes.
- Use ApplicationV2 and DialogV2. ApplicationV1, `FormApplication` and `Dialog` are deprecated and removed in v16. Do not use jQuery in new code, because render hooks pass `HTMLElement`.
- Prefer hooks over monkey-patching core. If patching is unavoidable, use libWrapper as a declared dependency.
- Use only the public API. Avoid `_private` members unless they are documented as overridable.

## v14 changes that are easy to get wrong from older versions

- `game.i18n.format` is gone. `game.i18n.localize(key, data)` now does the interpolation.
- Roll modes are replaced by message modes. Use `{ messageMode: "public"|"self"|"gm"|"blind" }` and `ChatMessage.applyMode`. `CONST.DICE_ROLL_MODES` no longer exists.
- Update operators: `"-=key"` / `"==key"` are deprecated. Use `_del` / `_replace(data)` (`foundry.data.operators`).
- ActiveEffect changes live in `system.changes` with `type` and `phase` (`CONST.ACTIVE_EFFECT_CHANGE_TYPES`). `ACTIVE_EFFECT_MODES` is gone.
- Measured Templates are gone. Use Scene Regions (`canvas.regions.placeRegion`).
- In `getSceneControlButtons`, `controls` and `tools` are Records, not arrays. Tools use `onChange`.
- To have the GM act for a player, prefer `CONFIG.queries["<id>.<name>"]` + `game.users.activeGM.query(...)` over raw sockets.
- New in v14: Scene `Level` documents (`canvas.level`), `TokenDocument#move` with the `preMoveToken`/`moveToken` hooks, and `foundry.documents.modifyBatch`.
- Register sheets with `foundry.applications.apps.DocumentSheetConfig.registerSheet(...)`.
