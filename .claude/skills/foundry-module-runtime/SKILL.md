---
name: foundry-module-runtime
description: Runtime plumbing for Foundry VTT v14 modules (plain JS ES modules). Use when writing or reviewing module code that registers or listens to Hooks (init/i18nInit/setup/ready, pre*/create*/update*/render* hooks, getSceneControlButtons), registers game settings or settings menus, keybindings, uses sockets or CONFIG.queries / User#query to have the GM act for a player, localizes strings, posts notifications or chat messages, uses foundry.utils helpers, exposes a module API, or patches core behaviour.
---

# Foundry VTT v14 Module Runtime

Verified against the scraped v14.368 docs in `../foundry-api-reference/reference/`. Look deeper there:
`HOOKS.md` (every hook), `api/classes/foundry.helpers.Hooks.md`, `api/classes/foundry.helpers.ClientSettings.md`,
`api/interfaces/foundry.types.SettingConfig.md`, `api/classes/foundry.helpers.interaction.ClientKeybindings.md`,
`api/classes/foundry.helpers.Localization.md`, `api/classes/foundry.applications.ui.Notifications.md`,
`api/classes/foundry.documents.ChatMessage.md`, `api/classes/foundry.documents.User.md` (`query`),
`api/variables/CONFIG.queries.md`, `api/modules/foundry.utils.md`, `articles/module-development.md`, `articles/localization.md`.
Manifest and project layout belong to the **foundry-module-scaffold** skill.

Conventions below: `const MODULE_ID = "my-module";` (must equal the manifest `id`), and everything runs from an `esmodules` entry file.

## 1. Lifecycle order and what is safe where

| Hook (fires once) | Docs say | Safe to do |
|---|---|---|
| *(module top level)* | File is evaluated before `init` | Define classes, `Hooks.once(...)` registrations. Do **not** touch `game.*` state yet. |
| `init` | "right before any initialization tasks have begun. Most package registration calls should go in here, such as `DocumentSheetConfig.registerSheet`, adjusting `CONFIG`, and registering settings with `game.settings.register`." | `game.settings.register/registerMenu`, `game.keybindings.register`, edit `CONFIG.*` (incl. `CONFIG.queries`), register sheets, `game.socket.on`. **Cannot read settings yet. `game.i18n` strings not loaded yet.** |
| `i18nInit` | "after Localization translations have been loaded and are ready for use. Runs after `init` but before `setup`." | `game.i18n.localize`; pre-localize static config objects. |
| `setup` | "after all Documents are initialized, including Settings (you cannot read settings prior to this hook), but before the UI applications or Canvas have been initialized." | `game.settings.get`, `game.user` (null until Users are initialized), world collections (`game.actors`, ...). No `ui.*`, no canvas. |
| `ready` | "fires once when the game is fully ready. Runs after `setup`." `game.ready` becomes `true`. | Everything: `ui.notifications`, rendering apps, chat messages, document writes, migrations (gate on `game.user.isGM`). |
| `canvasReady` (every scene draw) | "fires when the Canvas is ready" | Canvas/placeable work. Check `canvas.ready` before using the canvas elsewhere; it can be disabled or have no scene. |

```js
// scripts/main.js
const MODULE_ID = "my-module";

Hooks.once("init", () => {
  registerSettings();
  registerKeybindings();
  CONFIG.queries[`${MODULE_ID}.applyDamage`] = onApplyDamageQuery; // see section 5
  game.modules.get(MODULE_ID).api = { applyDamage };                // see section 9
});

Hooks.once("ready", () => {
  if (game.settings.get(MODULE_ID, "showWelcome")) ui.notifications.info(`${MODULE_ID}.Welcome`, { localize: true });
});
```

## 2. Hooks API (`Hooks` global = `foundry.helpers.Hooks`)

| Call | Returns | Notes |
|---|---|---|
| `Hooks.on(hook, fn, {once}?)` | `number` id | Register a listener. |
| `Hooks.once(hook, fn)` | `number` id | Alias for `on(..., {once: true})`. |
| `Hooks.off(hook, fnOrId)` | `void` | Pass the same function reference or the id from `on`. |
| `Hooks.call(hook, ...args)` | `boolean` | Calls listeners in order and **stops at the first one that returns `false`**. Returns `false` if stopped. |
| `Hooks.callAll(hook, ...args)` | `void` | Calls every listener; return values ignored. |
| `Hooks.onError(location, error, {msg, log, notify, data})` | `void` | Fires the `error` hook and optionally logs/notifies. |

Firing your own hooks (other modules can listen): `Hooks.callAll("myModule.didThing", data)` for notifications; `if (Hooks.call("myModule.preThing", data) === false) return;` for vetoable events.

**Cancellable pre-hooks must be synchronous.** `preCreate*`, `preUpdate*`, `preDelete*`, `preMoveToken`, `preImportAdventure` are run via `Hooks.call`, which only checks for a literal `false`. An `async` listener returns a Promise, so it can never cancel, and the workflow will not await it. To change pending data, mutate synchronously (`document.updateSource(...)` in `preCreate`, edit the `changed` object in `preUpdate`). Do async work in the post-hook (`createX`/`updateX`) instead.

Ordinary listeners may be `async`, but core does not await them.

### Generic hook names

Many hooks are templates. Substitute the class or document name:
- Documents: `preCreate{Doc}` / `create{Doc}`, `preUpdate{Doc}` / `update{Doc}`, `preDelete{Doc}` / `delete{Doc}`, e.g. `preUpdateActor`, `createToken`, `deleteCombat`.
- Applications V2: `render{AppClass}`, `preRender{AppClass}`, `close{AppClass}`, `getHeaderControls{AppClass}`. They fire for **every class in the inheritance chain**, so `renderActorSheetV2` hits all V2 actor sheets and `renderApplicationV2` hits everything.
- Placeables/layers: `draw{Object}`, `refresh{Object}`, `destroy{Object}`, `control{Object}`, `hover{Object}`, `activate{Layer}` (e.g. `refreshToken`, `controlToken`, `activateTokensLayer`).
- Context menus: `get{Doc}ContextOptions` for sidebar documents (e.g. `getActorContextOptions`) and `get{Doc}PlaceableContextOptions` for canvas placeables (e.g. `getTokenPlaceableContextOptions`), args `(application, menuItems)`.

### Most-used hooks by purpose (signatures from HOOKS.md)

**Lifecycle:** `init()`, `i18nInit()`, `setup()`, `ready()`, `hotReload(data)`, `error(location, error, data)`.

**Documents** (pre-hooks: initiating client only, return `false` to cancel; post-hooks: all clients):
- `preCreateDocument(document, data, options, userId)`, `createDocument(document, options, userId)`
- `preUpdateDocument(document, changed, options, userId)`, `updateDocument(document, changed, options, userId)`
- `preDeleteDocument(document, options, userId)`, `deleteDocument(document, options, userId)`
- Tokens: `preMoveToken(document, movement, operation)` (cancellable), `moveToken(document, movement, operation, user)`.
- Because post-hooks run on every client, guard side-effects: `if (userId !== game.user.id) return;` (or let only `game.users.activeGM` act).

**Rendering (ApplicationV2 passes a plain `HTMLElement`, not jQuery):**
- `renderApplicationV2(application, element, context, options)` and the per-class variants, e.g. `renderActorSheetV2`, `renderChatLog`, `renderActorDirectory`, `renderSettings`, `renderCombatTracker`, `renderSceneControls`.
- `getHeaderControlsApplicationV2(application, controls)`: push `ApplicationHeaderControlsEntry` objects.
- `renderChatMessageHTML(message, html, context)`: `html` is an `HTMLElement`.
- V1 `renderApplicationV1(app, html: JQuery, data)` remains only for deprecated V1 apps (removed in v16).

**Canvas:** `canvasInit(canvas)`, `canvasReady(canvas)`, `canvasTearDown(canvas, options)`, `canvasPan(canvas, position)`, `dropCanvasData(canvas, data, event)`, `targetToken(user, token, targeted)`, `controlToken(object, controlled)`, `hoverToken(object, hovered)`, `refreshToken(object)`, `highlightObjects(active)`.

**Chat:** `chatMessage(chatLog, message, chatData)`, `renderChatMessageHTML(message, html, context)`, `createChatMessage(...)` (generic document hook), `chatBubbleHTML(token, html, message, options)`.

**Combat:** `combatStart(combat, updateData)`, `combatTurn(combat, updateData, updateOptions)`, `combatRound(combat, updateData, updateOptions)`. These fire **on the initiating client before** the DB update. `combatTurnChange(combat, prior, current)` fires **on all clients after** the update.

**Sidebar / UI / controls:** `changeSidebarTab(app)`, `collapseSidebar(sidebar, collapsed)`, `getSceneControlButtons(controls)`, `hotbarDrop(hotbar, data, slot)`, `pauseGame(paused, options)`, `updateWorldTime(worldTime, dt, options, userId)`, `userConnected(user, connected)`, `clientSettingChanged(key, value, options)`, `dropActorSheetData(actor, sheet, data)`.

### Scene control buttons (v14 shape)

In v14, `controls` is a **`Record<string, SceneControl>`** (not an array), and each `SceneControl.tools` is a `Record<string, SceneControlTool>`. Tools use `onChange(event, active)`. Adapted from the hook's docs example:

```js
Hooks.on("getSceneControlButtons", controls => {
  controls.tokens.tools.myTool = {
    name: "myTool",
    title: "MY_MODULE.Tool.Title",          // localization key
    icon: "fa-solid fa-wrench",
    order: Object.keys(controls.tokens.tools).length,
    button: true,                            // also: toggle, active
    visible: game.user.isGM,
    onChange: () => {
      const existing = foundry.applications.instances.get("my-tool");
      if (existing) existing.close();
      else new MyTool().render({ force: true });
    }
  };
});
```
SceneControl keys: `name, title, icon, order, tools, activeTool, visible, onChange, onToolChange`. SceneControlTool keys: `name, title, icon, order, button, toggle, active, visible, onChange, toolclip, ...` (see `api/interfaces/foundry.SceneControl.md`, `foundry.SceneControlTool.md`).

## 3. Settings (`game.settings`, `foundry.helpers.ClientSettings`)

Register in `init`; read from `setup` onward.

```js
function registerSettings() {
  game.settings.register(MODULE_ID, "showWelcome", {
    name: "MY_MODULE.Settings.ShowWelcome.Name",   // localization keys are fine here
    hint: "MY_MODULE.Settings.ShowWelcome.Hint",
    scope: "user",          // "world" | "client" | "user"
    config: true,           // show in Configure Settings
    type: new foundry.data.fields.BooleanField(),
    default: true
  });

  game.settings.register(MODULE_ID, "mode", {
    name: "MY_MODULE.Settings.Mode.Name",
    scope: "world", config: true,
    type: String,
    choices: { a: "MY_MODULE.Mode.A", b: "MY_MODULE.Mode.B" },   // renders a <select>
    default: "a",
    requiresReload: true,   // prompts reload after change
    onChange: value => console.log(MODULE_ID, "mode ->", value)
  });

  game.settings.register(MODULE_ID, "opacity", {
    name: "MY_MODULE.Settings.Opacity.Name",
    scope: "client", config: true,
    type: new foundry.data.fields.NumberField({ nullable: false, min: 0, max: 100, step: 10 }),
    default: 50
  });

  // Hidden data store (config: false) for structured data
  game.settings.register(MODULE_ID, "state", {
    scope: "world", config: false,
    type: Object, default: {}
  });
}

const mode = game.settings.get(MODULE_ID, "mode");
await game.settings.set(MODULE_ID, "state", { lastRun: Date.now() });   // returns Promise
```

`SettingConfig` keys (v14): `name, hint, scope ("client"|"world"|"user"), config, type (BuiltinType | DataField | typeof DataModel), choices, range, default, onChange, input (CustomFormInput for DataField types)`.
- `scope` meanings (from `register` docs): **world** = everyone in the world (rule variants; only users with settings permission can change), **user** = one user in this world, any device (new in v13), **client** = this browser, any world (performance/display).
- `requiresReload` is used in the official `register` examples but is **not** listed in the `SettingConfig` interface page.
- `range` is typed only as `Object`. Prefer a `NumberField({min, max, step})` type, as in the official example.
- `get(ns, key, {document: true})` and `set(..., {document: true})` return the `Setting` document instead of the value.
- Setting a world setting requires permission. Wrap player-side writes with a GM query (section 5).
- `clientSettingChanged(key, value, options)` hook fires for client-setting changes.

### Settings menu with ApplicationV2

`registerMenu(namespace, key, {name, label, hint, icon, type, restricted})`, where `type` is `typeof ApplicationV2` (or deprecated `FormApplication`), and `restricted: true` = GM only.

```js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class MyConfigMenu extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-config`,
    tag: "form",
    window: { title: "MY_MODULE.Menu.Title" },
    form: { handler: MyConfigMenu.#onSubmit, closeOnSubmit: true, submitOnChange: false }
  };
  static PARTS = { form: { template: `modules/${MODULE_ID}/templates/config.hbs` } };

  async _prepareContext(options) {
    return { state: game.settings.get(MODULE_ID, "state") };
  }

  /** ApplicationFormSubmission: (event, form, formData: FormDataExtended), this = app */
  static async #onSubmit(event, form, formData) {
    await game.settings.set(MODULE_ID, "state", formData.object);
  }
}

game.settings.registerMenu(MODULE_ID, "configMenu", {
  name: "MY_MODULE.Menu.Name", label: "MY_MODULE.Menu.Label", hint: "MY_MODULE.Menu.Hint",
  icon: "fa-solid fa-bars", type: MyConfigMenu, restricted: true
});
```
`formData.object` (the parsed, expanded form data) is standard in core and community code but the property is not listed on the scraped `FormDataExtended` page. ApplicationV2 details belong to an applications skill or `api/classes/foundry.applications.api.ApplicationV2.md`.

## 4. Keybindings (`game.keybindings.register(namespace, action, config)`)

Register in `init`, like settings.

```js
function registerKeybindings() {
  game.keybindings.register(MODULE_ID, "toggleTool", {
    name: "MY_MODULE.Keys.Toggle.Name",
    hint: "MY_MODULE.Keys.Toggle.Hint",
    editable: [{ key: "KeyT", modifiers: ["Shift"] }],   // key = KeyboardEvent#code
    uneditable: [],
    onDown: context => { toggleTool(); return true; },  // true = consume the event
    onUp: () => {},
    restricted: false,          // true = GM only
    repeat: false,
    precedence: CONST.KEYBINDING_PRECEDENCE.NORMAL     // PRIORITY 0, NORMAL 1, DEFERRED 2
  });
}
```
Config keys: `name, hint, editable, uneditable, onDown, onUp, order, precedence, repeat, reservedModifiers, restricted`. Modifiers come from `foundry.helpers.interaction.KeyboardManager.MODIFIER_KEYS` (`{ALT, CONTROL, SHIFT}`).

## 5. Running code as the GM: queries (v14, preferred) and sockets

### Built-in queries: `CONFIG.queries` + `User#query`

v14 provides a request/response channel. No manifest flag is needed.
- Register a handler: `CONFIG.queries["<module-id>.<name>"] = async (queryData) => result`. **Names must be prefixed with your module id.** Un-prefixed names are reserved for core (core ships `dialog` and `confirmTeleportToken`).
- Call it: `user.query(queryName, queryData, {timeout})` returns `Promise<any>`, the handler's result. `queryData` must be JSON-serializable.
- Fan-out: `User.queryMany(users, queryName, queryData, {timeout})` returns `Promise<Map<User, PromiseSettledResult>>`.

```js
// init (all clients): the handler runs on the queried user's client
CONFIG.queries[`${MODULE_ID}.applyDamage`] = async ({ actorUuid, amount }) => {
  const actor = await fromUuid(actorUuid);
  const hp = foundry.utils.getProperty(actor, "system.attributes.hp.value");   // system-specific path
  await actor.update({ "system.attributes.hp.value": hp - amount });
  return { ok: true };
};

// player side
async function applyDamage(actor, amount) {
  if (actor.isOwner) return actor.update({ /* direct */ });
  const gm = game.users.activeGM;           // an active GM (non-assistant if possible) or null
  if (!gm) return ui.notifications.warn("MY_MODULE.NoGM", { localize: true });
  return gm.query(`${MODULE_ID}.applyDamage`, { actorUuid: actor.uuid, amount }, { timeout: 10_000 });
}
```
The docs show the handler signature only as `(queryData) => Promise<...>`. Whether a second argument (for example the sender) is passed is not documented, so do not rely on one. Validate `queryData` in the handler, because any client can send it.

### Raw sockets: `game.socket` (socket.io client)

Use these for fire-and-forget broadcasts to all clients. They need `"socket": true` in `module.json`. The server then relays the event `module.<id>` "between the sending client and all other connected clients" (module-development article). `game.socket` is a socket.io `Socket`. Its `emit`/`on` methods come from socket.io and are not documented in the Foundry API.

```js
const SOCKET = `module.${MODULE_ID}`;

Hooks.once("init", () => {
  game.socket.on(SOCKET, async ({ action, payload, userId }) => {
    if (action === "ping") ui.notifications?.info(`Ping from ${game.users.get(userId)?.name}`);
    // "GM executes" pattern without queries: exactly one GM acts
    if (action === "gmUpdate" && game.user === game.users.activeGM) {
      const doc = await fromUuid(payload.uuid);
      await doc?.update(payload.changes);
    }
  });
});

game.socket.emit(SOCKET, { action: "gmUpdate", payload: { uuid, changes }, userId: game.user.id });
```
- The emitting client normally does **not** receive its own broadcast, so call the handler locally too if the sender must react.
- Always elect one executor (`game.users.activeGM`) so that several GMs do not apply the same change twice.
- Raw sockets give no reply. Use `User#query` when you need a result or an acknowledgement.

## 6. Localization (`game.i18n`, `foundry.helpers.Localization`)

Manifest: `"languages": [{ "lang": "en", "name": "English", "path": "lang/en.json" }]`. `lang/en.json` is a JSON object keyed by namespaced IDs (flat dotted keys as in the KB, e.g. `"MY_MODULE.Greeting": "Hello {name}"`). Translations merge in the order core, then system, then modules, so modules can override earlier strings.

```js
game.i18n.localize("MY_MODULE.Title");
game.i18n.localize("MY_MODULE.Greeting", { name: user.name });  // v14: localize(stringId, data?) substitutes {name}
game.i18n.has("MY_MODULE.Optional");                             // boolean
```
Handlebars: `{{localize "MY_MODULE.Greeting" name=user.name}}`.
- Strings are ready from `i18nInit` on. Setting/keybinding `name`/`hint`, `window.title`, and scene-control `title` accept keys that core localizes.
- **`game.i18n.format` is not documented on the v14.368 `Localization` page.** `NotificationOptions.format` still mentions "Localization#format". Prefer `localize(key, data)` in new v14 code. If you need v12/v13 compatibility, `format` was the older API.
- Also available: `getListFormatter({style, type})`, `sortObjects(objects, key)`, `lang`.

## 7. Notifications and chat

`ui.notifications` (available from `ready`): `info | warn | error | success(message, options?)`, `notify(message, type = "info", options?)`, `remove(id)`, `clear()`, `update(notification, {pct, message, ...})`.
`NotificationOptions`: `permanent, localize, format, console, escape, clean, progress`.

```js
ui.notifications.warn("MY_MODULE.Warn.NoToken", { localize: true });
ui.notifications.info("MY_MODULE.Done", { localize: true, format: { count: "3" } });
const bar = ui.notifications.info("Importing...", { progress: true });
ui.notifications.update(bar, { pct: 0.5 });
```

Chat (`ChatMessage` global = configured `foundry.documents.ChatMessage`; `Document.create(data, operation)`):
```js
const speaker = ChatMessage.getSpeaker({ actor });          // {actor?, token?, scene?, alias?}; defaults to controlled token
let data = {
  content: `<p>${game.i18n.localize("MY_MODULE.Chat.Hello")}</p>`,
  speaker,
  style: CONST.CHAT_MESSAGE_STYLES.OTHER,                   // OTHER 0, OOC 1, IC 2, EMOTE 3
  flavor: "My Module",
  flags: { [MODULE_ID]: { kind: "hello" } }
};
data = ChatMessage.applyMode(data, "gm");                   // "public" | "self" | "gm" | "blind" (keys of CONFIG.ChatMessage.modes)
await ChatMessage.create(data);
// Whisper: whisper: ChatMessage.getWhisperRecipients("GM").map(u => u.id)
```
In v14 the "roll mode" vocabulary became **message modes** (`applyMode`, `Roll#toMessage(data, {messageMode})`, `Combat#rollInitiative(ids, {messageMode})`). `Roll._mapLegacyRollMode` is deprecated since v14. Other `ChatMessageData` fields: `blind, content, emote, flags, flavor, rolls, sound, speaker, style, system, title, type, user, whisper`.

## 8. Globals and `foundry.utils`

| Global | What |
|---|---|
| `game` | `foundry.Game`: `settings, keybindings, i18n, socket, modules, user, users, actors, items, scenes, messages, combat, packs, ready, version, paused, isAdmin` |
| `ui` | UI singletons (`ui.notifications`, `ui.chat`, `ui.sidebar`, `ui.controls`, ...) from `ready` |
| `canvas` | `foundry.canvas.Canvas`; check `canvas.ready` |
| `CONFIG` | Mutable runtime config (document classes, `CONFIG.queries`, `CONFIG.ChatMessage.modes`, ...) |
| `CONST` | Frozen enums (`CHAT_MESSAGE_STYLES`, `KEYBINDING_PRECEDENCE`, ...) |
| Document classes | Global (`Actor`, `ChatMessage`, ...) and under `foundry.documents.*`; configured class via `foundry.utils.getDocumentClass("Actor")` |

Prefer namespaced `foundry.utils.*`:
- `mergeObject(original, other?, {insertKeys, insertValues, overwrite, recursive, inplace, enforceTypes, applyOperators})` returns the merged object. By default it mutates `original`; pass `{inplace: false}` to merge into a copy.
- `deepClone(original, {strict, prune}?)` clones plain data (no Map/Set/cyclic structures). `duplicate(original)` is the cheaper JSON-based version.
- `getProperty(obj, "a.b.c")`, `setProperty(obj, "a.b.c", value)` returns a boolean (changed), `hasProperty`, `deleteProperty`.
- `expandObject`, `flattenObject`, `diffObject`, `isEmpty`, `equals`, `isNewerVersion(v1, v0)`.
- `randomID(length = 16)`, `debounce(fn, delayMs)` (has `.cancel`), `throttle(fn, delayMs)`.
- `fromUuid(uuid, {relative, invalid}?)` returns a Promise, `fromUuidSync`, `parseUuid`, `buildUuid`.
- `escapeHTML`, `cleanHTML`, `parseHTML`, `fetchJsonWithTimeout`, `logCompatibilityWarning`.
Full list: `../foundry-api-reference/reference/api/modules/foundry.utils.md`.

## 9. Exposing a public API

`game.modules` is a `Collection<string, Module>`. The `.api` property is a **community convention**, not a documented core field. Assign it in `init` so that other modules' `setup`/`ready` code can find it, and announce readiness with a hook:

```js
Hooks.once("init", () => {
  const api = { applyDamage, version: game.modules.get(MODULE_ID).version };
  game.modules.get(MODULE_ID).api = api;
  Hooks.callAll(`${MODULE_ID}.ready`, api);    // optional custom hook
});

// consumer
const api = game.modules.get("my-module")?.active ? game.modules.get("my-module").api : null;
```
To create typed data stores rather than plain settings, use flags: `doc.setFlag(MODULE_ID, key, value)` / `getFlag` / `unsetFlag`. The scope must be your module id.

## 10. Changing core behaviour

1. **Hooks first.** Use a pre-hook to veto or modify, a post-hook to react, `render*` to alter DOM, `get*ContextOptions` / `getHeaderControls*` / `getSceneControlButtons` to add UI.
2. **CONFIG next.** Replace or extend registered classes (`CONFIG.Actor.documentClass`, `CONFIG.Token.objectClass`, sheet registration), subclassing the current value so that other modules' changes are kept.
3. **Wrapping methods is a last resort.** Use **libWrapper** (community library, *not* part of core; declare it under `relationships.requires`/`recommends`). It chains wrappers from several modules and reports conflicts. Never overwrite a prototype method directly without calling the original. Do not rely on `_private`/undocumented members (see "Public vs Private API" in `../foundry-api-reference/reference/OVERVIEW.md`).

## Gotchas checklist

- Settings cannot be read before `setup` (per the hook docs). Register in `init`, read in `setup`/`ready`.
- `game.user` is `null` before Users initialize. `ui.*` and `canvas` do not exist before `ready`.
- Post-document hooks run on **every** client. Filter by `userId === game.user.id` or by `game.users.activeGM`.
- Pre-hooks: synchronous, `return false` to cancel, mutate via `updateSource` / the `changed` object.
- Hooks for ApplicationV2 receive `HTMLElement`, so use `element.querySelector`, not jQuery.
- `getSceneControlButtons` uses records, not arrays, in v14. Tool callbacks use `onChange`.
- Prefix everything with your module id: settings namespace, query names, socket (`module.<id>`), flags scope, custom hook names, localization keys.
