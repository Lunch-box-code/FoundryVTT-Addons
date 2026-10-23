---
name: foundry-applications
description: Build Foundry VTT v14 UI with ApplicationV2. Use when writing or reviewing a custom window, form, settings menu, dialog, or Actor/Item/Document sheet in a Foundry module or system. Triggers include "ApplicationV2", "AppV2", "HandlebarsApplicationMixin", "DEFAULT_OPTIONS", "static PARTS", "_prepareContext", "_preparePartContext", "_onRender", "data-action", "actions handler", "form handler", "submitOnChange", "FormDataExtended", "static TABS", "changeTab", "DocumentSheetV2", "ActorSheetV2", "ItemSheetV2", "registerSheet", "DocumentSheetConfig", "DialogV2", "Dialog.confirm/prompt/input/wait", "formGroup"/"formInput" helpers, "foundry.applications.fields", "renderApplicationV2"/"renderActorSheetV2" hooks, "getHeaderControls", and migrating FormApplication/ActorSheet/Dialog (ApplicationV1) or jQuery `activateListeners(html)` code to v13/v14.
---

# Foundry VTT v14 Applications (ApplicationV2)

Verified against the scraped v14.368 API docs in `../foundry-api-reference/reference/`. When you need
something not covered here, look it up there. Don't rely on memory of v11/v12 (see "Lookup" at the end).

ApplicationV1 (`foundry.appv1.*`: `Application`, `FormApplication`, `Dialog`, `ActorSheet`, `ItemSheet`)
has been deprecated since v13 and will be removed in v16. Write all new UI with ApplicationV2.

## Examples in this skill

| File | What it shows |
|---|---|
| `examples/session-notes-app.js` + `examples/templates/session-notes/*.hbs` | Full custom app: form, tabs, actions, header control, settings menu |
| `examples/simple-actor-sheet.js` + `examples/templates/actor-sheet/*.hbs` | Full `ActorSheetV2`: parts, tabs, `formInput`, flags, item actions, registration |
| `examples/dialogs-and-hooks.js` | `DialogV2.confirm/prompt/input/wait/query`, field helpers, render and header hooks |
| `examples/lang-en.json` | i18n keys used by the examples (`my-module.*`) |

Templates are referenced as `modules/<module-id>/templates/...`. Load the JS through `"esmodules"` in `module.json`.

## Class map (namespaces)

```js
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2, DocumentSheetV2 } = foundry.applications.api;
const { ActorSheetV2, ItemSheetV2 } = foundry.applications.sheets;
const { DocumentSheetConfig } = foundry.applications.apps;
const { FormDataExtended, DragDrop, TextEditor } = foundry.applications.ux;
foundry.applications.fields      // createFormGroup, createTextInput, createSelectInput, ...
foundry.applications.handlebars  // renderTemplate, loadTemplates, getTemplate + helper fns
foundry.applications.instances   // Map<string, ApplicationV2> of currently rendered apps
```

`ApplicationV2` cannot render anything by itself because `_renderHTML`/`_replaceHTML` are abstract.
Always extend `HandlebarsApplicationMixin(Base)`, where `Base` is `ApplicationV2`, `DocumentSheetV2`,
`ActorSheetV2` or `ItemSheetV2`. The sheets namespace docs say all three sheet classes "must be wrapped by
`HandlebarsApplicationMixin` for proper use".

## Skeleton

```js
const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

class MyApp extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS = {
    id: "my-module-app",                 // or "my-app-{id}" + options.uniqueId
    tag: "form",                         // "form" enables options.form; default is a non-form element
    classes: ["my-module"],
    window: { title: "My App", icon: "fa-solid fa-star", resizable: true },
    position: { width: 480, height: "auto" },
    form: { handler: MyApp.#onSubmit, submitOnChange: false, closeOnSubmit: true },
    actions: { doThing: MyApp.#onDoThing }
  };
  static PARTS = { main: { template: "modules/my-module/templates/main.hbs" } };

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    context.value = 42;
    return context;
  }
  /** @this {MyApp} */ static async #onSubmit(event, form, formData) { console.log(formData.object); }
  /** @this {MyApp} */ static #onDoThing(event, target) { console.log(target.dataset); }
}
new MyApp().render({ force: true });
```

## DEFAULT_OPTIONS (`ApplicationConfiguration`)

Parent classes' DEFAULT_OPTIONS are merged into `this.options` automatically. **Arrays are concatenated**,
inner objects merged, and scalars replaced. Constructor options (`new MyApp({...})`) override them per instance.

| Key | Type / notes |
|---|---|
| `id` | HTML id. `{id}` in it is replaced by `uniqueId`. Read it back through the `app.id` getter and don't override that getter. |
| `uniqueId` | String substituted for `{id}` |
| `tag` | Outer element tag, e.g. `"form"`, `"div"`, `"section"` |
| `classes` | `string[]` of CSS classes |
| `window` | `ApplicationWindowConfiguration`: `title`, `icon` (FA class or `false`), `frame`, `positioned`, `minimizable`, `resizable`, `contentTag`, `contentClasses` (added to `.window-content`), `controls` |
| `window.controls` | Header-menu entries `{ action, icon, label, visible?, ownership? }`. `action` names a key of `actions`. `ownership` applies to DocumentSheetV2 only. |
| `position` | `Partial<ApplicationPosition>`: `top`, `left`, `width`, `height` (number or `"auto"`), `scale`, `zIndex` |
| `actions` | `Record<string, handler | { handler, buttons: number[] }>`. A bare function handles left-click only. `buttons` is matched against `PointerEvent#button` (0 left, 1 middle, 2 right). |
| `form` | `ApplicationFormConfiguration`: `{ handler, submitOnChange, closeOnSubmit }` |

DocumentSheetV2 adds `document`, `viewPermission`, `editPermission` (both `CONST.DOCUMENT_OWNERSHIP_LEVELS`
values), `sheetConfig`, `ownershipConfig`, `canCreate`, `canImport`.

## Actions (`data-action`)

```hbs
<button type="button" data-action="doThing" data-foo="bar">Go</button>
```
- Handler signature is `(event: PointerEvent, target: HTMLElement)`, where `target` is the element carrying `data-action`.
- Write handlers as `static` (usually `static #private`) methods. Foundry calls them **with `this` bound to
  the app instance**. Annotate them with `/** @this {MyApp} */`. Referencing `this.#handler` inside the
  `static DEFAULT_OPTIONS` initializer also works because `this` there is the class.
- Use `type="button"` on buttons. HTML buttons default to `submit`.
- Clicks on a `data-action` that has no registered handler fall through to `_onClickAction(event, target)`, which you can override.
- Built-in actions on DocumentSheetV2: `configureSheet`, `configureOwnership`, `copyUuid`, `editImage`,
  `importDocument`. ActorSheetV2 adds `configurePrototypeToken`, `configureToken`, `showPortraitArtwork`, `showTokenArtwork`.

## PARTS, templates and context

`static PARTS: Record<string, HandlebarsTemplatePart>`:

| Part key | Meaning |
|---|---|
| `template` | Entry template path (required) |
| `templates` | Extra templates (partials) to preload for the part |
| `classes` | CSS classes added to the part's top-level element |
| `id` | Part element id, auto-prefixed with the app id |
| `scrollable` | Selectors whose scroll position survives re-render. `""` means the part root. |
| `root` | Part content replaces the root element's children |
| `forms` | `Record<selector, ApplicationFormConfiguration>` for forms inside the part |

Rules:
- **Each part template must have exactly one top-level element.** Parts render in PARTS key order.
- `_prepareContext(options)` builds the shared context once per render.
  `_preparePartContext(partId, context, options)` runs per part. Call `super`, then augment the shared
  context, which keeps it visible to `_onRender`, and return it.
- Re-render a subset with `app.render({ parts: ["items"] })`. Read the rendered part elements from
  `app.parts` (`Record<string, HTMLElement>`).
- Override `_configureRenderParts(options)` to add or remove parts dynamically, for example to hide a tab for limited viewers.
- For templates outside an app, use `await foundry.applications.handlebars.renderTemplate(path, data)` and
  `loadTemplates(paths | {partialId: path})`.

## Render lifecycle (all `async` unless noted; call `super`)

`render(options)` triggers roughly this sequence. The method names are documented, but the exact order is
inferred from the method descriptions:
`_canRender(options)` (return `false` to abort, throw to warn) → `_configureRenderOptions(options)` →
`_prepareContext(options)` → (`_preparePartContext` per part) → `_preFirstRender(context, options)` (first
render only) → `_preRender(context, options)` → `_renderHTML` / `_replaceHTML` → `_onFirstRender(context, options)`
(first render only) → `_onRender(context, options)` → `_postRender(context, options)`.

Closing: `close(options)` runs `_preClose(options)` (awaited) and then `_onClose(options)` (not awaited).
Positioning: `_prePosition(position)` → `_onPosition(position)` (sync).

Hooks fire alongside these steps. `preRender{Class}` fires before rendering and `render{Class}` fires after.

- `render(options)` takes `ApplicationRenderOptions`: `force` (add to the DOM if not shown), `parts`,
  `position`, `window` (`{ title, icon, controls, detached }`), `tab` (`"tabId"` or `{group: tabId}`, which does
  not trigger `changeTab`), and `isFirstRender` (filled in automatically). A boolean argument still means `force`.
- `app.render({ force: true })` opens the app. A plain `app.render()` only refreshes it if it is already rendered.
- Use `_onRender` for non-click listeners (`input`, `change`, `dragstart`, ...) on `this.element`. It runs after
  **every** render, including partial ones, so attach listeners only to freshly rendered nodes.
- Use `_onFirstRender` for one-time setup, such as creating context menus with
  `this._createContextMenu(handler, selector, options)`. DocumentSheetV2 relies on its own
  `_onFirstRender` to auto-re-render on document updates, so **you must `await super._onFirstRender(...)`**.
- Other members: `element`, `form`, `window` (header elements), `rendered`, `state`, `minimized`,
  `position`, `setPosition()`, `bringToFront()`, `minimize()`, `maximize()`, `close()`, `submit(submitOptions)`,
  `renderChild(app, options)` (child shares the window and closes with the parent), `detachWindow()` / `attachWindow()`.

## Tabs

```js
static TABS = {
  primary: {                                           // tab group id
    tabs: [{ id: "notes", icon: "fa-solid fa-feather" }, { id: "settings", label: "My.Label" }],
    initial: "notes",
    labelPrefix: "my-module.Tabs"                        // label = `${labelPrefix}.${id}` (localized)
  }
};
static PARTS = {
  tabs: { template: "templates/generic/tab-navigation.hbs" },   // core nav template, consumes context.tabs
  notes: { template: ".../notes.hbs" },
  settings: { template: ".../settings.hbs" }
};
```
```hbs
<section class="tab {{tab.cssClass}}" data-group="primary" data-tab="notes"> ... </section>
```
- With **exactly one** tab group, the base `_prepareContext` sets `context.tabs`
  (`Record<id, ApplicationTab>` with `id, group, active, cssClass, icon, label, tooltip`). With several groups,
  call `this._prepareTabs(group)` yourself.
- A common pattern is to expose `context.tab = context.tabs[partId]` in `_preparePartContext`. The examples do this.
- `app.tabGroups` (`Record<group, tabId|null>`) holds the active tabs. Switch programmatically with
  `app.changeTab(tab, group, { event?, force?, navElement?, updatePosition? })`.
- Override hooks: `_getTabsConfig(group)`, `_prepareTabs(group)`, `_onClickTab(event)`.
- *Unverified:* if you hand-roll the nav instead of using the core template, the core markup is
  `<a data-action="tab" data-group="primary" data-tab="notes">`. This comes from core source and is not in
  the scraped docs. Check `client/applications` in your install before relying on it.

## Forms

- Set `tag: "form"` and `form: { handler, submitOnChange, closeOnSubmit }`. Document sheets already have both.
- Handler signature (`ApplicationFormSubmission`): `async (event: SubmitEvent|Event, form: HTMLFormElement,
  formData: FormDataExtended)`, again a static method with `this` bound to the app. A fourth
  `submitOptions` argument is present only when the app is submitted through `app.submit(submitOptions)`.
- `formData.object` is the typed, flat object keyed by input `name`. Expand dotted keys with
  `foundry.utils.expandObject` if needed. (`#object` is documented in `articles/migration.md`. The
  FormDataExtended class page only lists `dtypes`, `editors`, `append`, `process`, `set`.)
- `submitOnChange: true` submits on each input change (`_onChangeForm`). There is **no `submitOnClose`**
  in `ApplicationFormConfiguration`. If you need that behaviour, call `this.submit()` in `_preClose` yourself.
- DocumentSheetV2 form pipeline (override points): `_processFormData(event, form, formData)` →
  `_prepareSubmitData(event, form, formData, updateData)` → `_processSubmitData(event, form, submitData, options)`,
  which runs the `update` or `create`. Throw from the first two to block submission. Input `name`s are dot-paths
  such as `name`, `system.hp.value` or `flags.my-module.notes`.

### Field helpers

Handlebars helpers (`foundry.applications.handlebars.*`):
- `{{formGroup field ...}}` / `{{formInput field ...}}` take a `DataField` and return a SafeString. *The helper
  pages only say `options: object`.* The assumption, consistent with `DataField#toFormGroup(groupConfig,
  inputConfig)`, is that hash keys such as `value=`, `label=`, `hint=`, `localize=` and `classes=` are forwarded
  as `FormGroupConfig` / `FormInputConfig`.
- `{{selectOptions choices selected=value localize=true}}` (also `inverted`, `valueAttr`, `labelAttr`),
  `{{checked bool}}`, `{{disabled bool}}`, `{{localize "KEY" name=value}}`,
  `{{editor content target="system.bio" button=false engine="prosemirror" collaborate=false}}`,
  `numberInput`, `radioBoxes`, `numberFormat`, `concat`, `ifThen`, `object`.
- Simple helpers `eq ne lt gt lte gte not and or` are also registered. Do the heavy logic in context preparation instead.
- In a document sheet, `context.fields` / `context.source` come from DocumentSheetV2. To get an explicit
  DataField, use `doc.schema.getField("system.hp.value")`.

Element builders (`foundry.applications.fields.*`) return real `HTMLElement`s:
`createFormGroup({label, input, hint, units, stacked, localize, rootId, classes})`,
`createTextInput`, `createNumberInput`, `createCheckboxInput`, `createSelectInput({name, options:[{value,label,group}], blank, sort, type})`,
`createMultiSelectInput`, `createTextareaInput`, `createEditorInput`, `createFontAwesomeIcon`, `setInputAttributes`.
Common input config: `name, value, id, classes, disabled, readonly, required, placeholder, autofocus, dataset, aria, localize`.
`DataField#toFormGroup(groupConfig, inputConfig)` and `DataField#toInput(config)` do the same work from a schema field.

## Document sheets

```js
class MySheet extends HandlebarsApplicationMixin(foundry.applications.sheets.ActorSheetV2) { /* ... */ }

Hooks.once("init", () => {
  foundry.applications.apps.DocumentSheetConfig.registerSheet(foundry.documents.Actor, "my-module", MySheet, {
    label: "my-module.SheetLabel", types: ["character"], makeDefault: false
  });
});
```
- `DocumentSheetConfig.registerSheet(documentClass, scope, sheetClass, options)`. The options are
  `SheetRegistrationOptions`: `types`, `label` (string or function, localized), `makeDefault`, `canBeDefault`,
  `canConfigure`, `themes` (`Record<key,label>` or `null`). `unregisterSheet(documentClass, scope, sheetClass, {types})`
  removes a sheet. Register in `init`.
- The legacy form `foundry.documents.collections.Actors.registerSheet(scope, cls, opts)` (same for Items,
  etc.) still exists and forwards to DocumentSheetConfig. Prefer DocumentSheetConfig.
- Accessors: `document`, `isEditable`, `isVisible`. On ActorSheetV2 also `actor` and `token`. On ItemSheetV2
  also `item` and `actor` (the owner or null).
- `_prepareContext` adds `document`, `source`, `fields`, `editable`, `user`, `rootId` to the context.
- Open a sheet with `doc.sheet.render({ force: true })`. Sheets re-render automatically when their document updates.
- A non-registered helper sheet must be given the document: `new MyHelperSheet({ document: doc })`.
- Drag and drop is built into Actor and Item sheets. Put `data-item-id` (Items) or `data-effect-id`
  (+`data-item-id` for item effects) on list rows, and sort in context prep
  (`items.sort((a, b) => a.sort - b.sort)`). Override `_onDropItem`, `_onDropActor`, `_onDropActiveEffect`,
  `_onDropFolder`, `_onDropDocument`, `_onSortItem`, `_canDragStart`, `_canDragDrop` as needed. For a
  plain app, use `new foundry.applications.ux.DragDrop({ dragSelector, dropSelector, permissions, callbacks }).bind(element)`.

## DialogV2

Options are `ApplicationConfiguration & DialogV2Configuration & DialogV2WaitOptions`:
- `content` is an HTML string (cleaned with `cleanHTML`) or an `HTMLDivElement`, which is trusted and not cleaned.
- `buttons`: `[{ action, label, icon, default, callback(event, button, dialog), class, style, disabled, tooltip, type }]`.
- `modal`, `submit(result, dialog)`, `rejectClose`, `render(event, dialog)`, `close(event, dialog)`, `renderOptions`, and `window: { title }`.

| Call | Resolves to |
|---|---|
| `DialogV2.confirm({ content, yes?, no?, rejectClose: false })` | `true` / `false`, or `null` if dismissed |
| `DialogV2.prompt({ content, ok? })` | the ok button's action id or its callback's return value |
| `DialogV2.input({ content, ok? })` | form data object keyed by input `name`, or `null` |
| `DialogV2.wait({ buttons, ... })` | clicked button's action id or its callback's return value |
| `DialogV2.query(user, "confirm"\|"prompt"\|"input"\|"wait", config)` | another user's answer (no callbacks) |

If the user dismisses a dialog and `rejectClose` is true, the promise rejects. For a custom dialog, use
`new DialogV2({...}).render({ force: true })`. Listeners attached to a `content` element are lost when it is
stringified, so attach them in the `render` callback.

## Hooks for other packages' apps (HTMLElement, not jQuery)

| Hook | Args |
|---|---|
| `render{Class}` e.g. `renderApplicationV2`, `renderActorSheetV2`, `renderMyApp` | `(app, element: HTMLElement, context, options)` |
| `preRender{Class}` | `(app, context, options)` |
| `close{Class}` e.g. `closeApplicationV2` | `(app)` |
| `getHeaderControls{Class}` e.g. `getHeaderControlsApplicationV2` | `(app, controls: ApplicationHeaderControlsEntry[])`. Push `{icon, label, onClick(event, target), visible?}` or `{action, ...}`. |

Each class in the inheritance chain fires its own variant, up to `BASE_APPLICATION`. Guard against double
injection because the hook fires on every render. See `examples/dialogs-and-hooks.js`.

## Migrating from ApplicationV1 / jQuery

| V1 | V2 |
|---|---|
| `static get defaultOptions() { return mergeObject(super.defaultOptions, {...}) }` | `static DEFAULT_OPTIONS = {...}` (auto-merged, arrays concatenated) |
| `template: "x.hbs"` | `static PARTS = { main: { template: "x.hbs" } }` |
| `getData(options)` | `async _prepareContext(options)` (+ `_preparePartContext`) |
| `activateListeners(html)` (jQuery) | `actions` + `data-action`, and `_onRender(context, options)` using `this.element` |
| `_updateObject(event, formData)` | `form.handler(event, form, formData)` and use `formData.object` |
| `width/height/top/left` | `position: { width, height, top, left }` |
| `title`, `resizable`, `minimizable` | `window: { title, resizable, minimizable }` |
| `popOut: false` | `window: { frame: false }` (closest analogue) |
| `tabs: [{navSelector, contentSelector, initial}]` | `static TABS` + `data-group`/`data-tab` sections |
| `scrollY: [sel]` | part `scrollable: [sel]` |
| `dragDrop: [...]` | built into ActorSheetV2/ItemSheetV2, or `new DragDrop(cfg).bind(el)` |
| `_getHeaderButtons()` / `getApplicationV1HeaderButtons` hook | `window.controls` / `_getHeaderControls()` / `getHeaderControls{Class}` hook |
| `render(true)` | `render({ force: true })` |
| `renderXxx(app, html: JQuery, data)` hook | `renderXxx(app, element: HTMLElement, context, options)` |
| `ActorSheet` / `ItemSheet` / `DocumentSheet` | `HandlebarsApplicationMixin(ActorSheetV2 / ItemSheetV2 / DocumentSheetV2)` |
| `Dialog.confirm/prompt/wait`, `new Dialog({buttons:{yes:{...}}})` | `DialogV2.confirm/prompt/input/wait`, `buttons` is an **array** with `action` |
| `submitOnClose` | no equivalent option. Submit manually in `_preClose` if needed. |
| global `renderTemplate`, `loadTemplates` | `foundry.applications.handlebars.renderTemplate/loadTemplates` |
| `TextEditor.enrichHTML` | `foundry.applications.ux.TextEditor.implementation.enrichHTML(content, {relativeTo, secrets, rollData})` |

jQuery → DOM: `html.find(s)` → `el.querySelector(s)` / `querySelectorAll(s)`. `.on("click", fn)` →
`addEventListener("click", fn)`. `.val()` → `.value`. `.data("x")` → `.dataset.x`. `.addClass` → `classList.add`.
`.append(html)` → `insertAdjacentHTML("beforeend", html)` / `append(node)`. `$(html)[0]` is no longer needed
because hooks pass an HTMLElement. `.closest()` works the same on Elements.

## Gotchas

- Forgetting `HandlebarsApplicationMixin` means nothing renders, because `_renderHTML` is abstract.
- Each part needs exactly one root element. Tab sections need `class="tab {{tab.cssClass}}"`, `data-group` and `data-tab`.
- Missing `await super.X(...)` in overridden lifecycle methods breaks core behaviour. A document sheet
  without `super._onFirstRender` stops auto-re-rendering.
- `this` in action and form handlers is the instance even though they are static. Arrow functions in DEFAULT_OPTIONS lose that binding.
- `render()` without `force` won't open a closed app.
- DialogV2 string `content` is sanitized. Pass an `HTMLDivElement` for trusted markup built with the field helpers.

## Lookup (deeper reference)

All paths are relative to this skill directory:
- `../foundry-api-reference/reference/api/classes/foundry.applications.api.ApplicationV2.md` (lifecycle, all methods)
- `../foundry-api-reference/reference/api/classes/foundry.HandlebarsApplication.md` (PARTS, `_preparePartContext`, `_configureRenderParts`)
- `../foundry-api-reference/reference/api/modules/foundry.applications.md` (official AppV2 guide: actions, parts, tabs, forms)
- `../foundry-api-reference/reference/api/modules/foundry.applications.sheets.md` (sheet registration, drag & drop)
- `../foundry-api-reference/reference/api/classes/foundry.applications.api.DocumentSheetV2.md`, `...sheets.ActorSheetV2.md`, `...sheets.ItemSheetV2.md`
- `../foundry-api-reference/reference/api/classes/foundry.applications.apps.DocumentSheetConfig.md`, `interfaces/foundry.SheetRegistrationDescriptor.md`
- `../foundry-api-reference/reference/api/classes/foundry.applications.api.DialogV2.md`, `interfaces/foundry.DialogV2*.md`
- `../foundry-api-reference/reference/api/interfaces/foundry.applications.types.Application*.md` (configuration, render options, tabs, position)
- `../foundry-api-reference/reference/api/modules/foundry.applications.handlebars.md`, `modules/foundry.applications.fields.md`
- `../foundry-api-reference/reference/HOOKS.md` and `api/functions/hookEvents.renderApplicationV2.md`
- To see how core does it, grep `CATALOG.md` for a core sheet such as `SceneConfig` or `FilePicker` and read its `DEFAULT_OPTIONS`/`PARTS`/`TABS`.
