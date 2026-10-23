---
name: foundry-canvas-dice
description: Foundry VTT v14 module development for the game canvas and dice. Use when writing or reviewing code that touches `canvas` (layers such as canvas.tokens/walls/lighting/regions, placeables vs documents, controlled or targeted tokens, the grid and distance measurement, custom PIXI drawing, pan/ping, token animation and movement, vision/lighting tests, Scene Regions and custom RegionBehavior types, scene control buttons via getSceneControlButtons, canvas hooks like canvasReady/refreshToken/controlToken/targetToken) or dice (Roll, evaluate/evaluateSync, roll data, custom dice terms, CONFIG.Dice, modifiers, message/roll modes, Roll subclasses, posting rolls to ChatMessage).
---

# Foundry VTT v14: Canvas & Dice

Verified against the scraped v14.368 API docs. Reference root (relative to this file):
`../foundry-api-reference/reference/` (abbreviated **REF** below). Longer worked examples: [examples.md](examples.md).

> v14 changes that bite people who code from memory:
> - **Measured Templates are gone.** They are folded into Scene Regions (`articles/scene-regions.md`). There is no `canvas.templates` layer in `CONFIG.Canvas.layers`.
> - **Roll visibility uses `messageMode`, not `rollMode`.** `Roll#toMessage(data, {messageMode})`. `Roll._mapLegacyRollMode` is deprecated since v14. `CONST.DICE_ROLL_MODES` does not appear anywhere in the v14 docs, so don't use it.
> - `getSceneControlButtons` receives a **Record** keyed by control name (`controls.tokens`), not an array.
> - Scenes have **Levels**: `canvas.level`, `CanvasViewPosition.level`, `SceneViewOptions.level`.
> - `refreshToken` and the other `refresh<Object>` hooks pass **only the object**.

---

## A. Canvas

### The `canvas` object (`foundry.canvas.Canvas`)
REF `api/classes/foundry.canvas.Canvas.md`

| Member | Notes |
|---|---|
| `canvas.ready` | false until drawn. Guard every canvas call with it |
| `canvas.scene` | viewed `Scene` document or null |
| `canvas.level` | viewed `Level` document (v14) |
| `canvas.dimensions` | `CanvasDimensions`: `size`, `distance`, `distancePixels`, `units`, `width/height`, `sceneRect`, `rect`, `rows/columns` |
| `canvas.grid` | `BaseGrid` instance (not the GridLayer) |
| `canvas.stage`, `canvas.app` | PIXI stage / application |
| `canvas.mousePosition` | `Point` on stage |
| `canvas.activeLayer` | active `InteractionLayer` |
| `canvas.getLayerByEmbeddedName("Token")` / `canvas.getCollectionLayer("tokens")` | layer lookup |
| `canvas.pan({x, y, scale})` / `await canvas.animatePan({x, y, scale, duration, speed, easing})` | view control |
| `await canvas.recenter()` | re-center |
| `await canvas.ping(origin, {color, duration, name, size})` | broadcasts a ping to other clients |
| `canvas.canvasCoordinatesFromClient(pt)` / `canvas.clientCoordinatesFromCanvas(pt)` | screen <-> canvas |
| `canvas.isOffscreen(pt)` | |
| `canvas.highlightObjects(bool)` | |

**Groups** (`CONFIG.Canvas.groups`): `hidden`, `rendered`, `environment`, `primary`, `effects`, `interface`, `overlay`, `visibility`. Instances include `canvas.primary`, `canvas.effects`, `canvas.interface`, `canvas.overlay` (not stage-transformed), `canvas.visibility`, `canvas.environment`.

**Layers** (`CONFIG.Canvas.layers` keys, which are also exposed as `canvas.<key>`):
`controls`, `drawings`, `grid`, `lighting`, `notes`, `regions`, `sounds`, `tiles`, `tokens`, `walls`, `weather`.
Other singletons: `canvas.perception` (PerceptionManager), `canvas.fog` (FogManager), `canvas.edges`.

### Placeables vs documents
A **document** (`TokenDocument`, `WallDocument`, ...) is persisted data. A **placeable** (`foundry.canvas.placeables.Token`, ...) is the PIXI object drawn for the *currently viewed* scene. Always mutate the document; read visuals from the placeable.

```js
const token = canvas.tokens.controlled[0];   // placeable (Token)
const doc   = token.document;                // TokenDocument
const actor = token.actor;                   // Actor
doc.object;                                  // back to the placeable (null when not rendered)
await doc.update({ "texture.tint": "#ff0000" });
```

`PlaceablesLayer` (REF `api/classes/foundry.canvas.layers.PlaceablesLayer.md`) gives you `placeables`, `controlled`, `controlledObjects` (Map), `hover`, `get(id)`, `documentCollection`, `controlAll(opts)`, `releaseAll(opts)`, `updateAll(transform, condition?, options?)`.
`TokenLayer` adds `ownedTokens`, `setTargets(ids, {mode: "replace"|"acquire"|"release"})`, `targetObjects(rect, {releaseOthers})`, `cycleTokens`, `placeTokens`.

`PlaceableObject` (REF `api/classes/foundry.canvas.placeables.PlaceableObject.md`): `document`, `layer`, `scene`, `controlled`, `hover`, `center`, `bounds`, `isOwner`, `isVisible`, `control({releaseOthers, pan, force})`, `release()`, `renderFlags.set({...})`.

### Controlled and targeted tokens
```js
canvas.tokens.controlled;                 // Token[] selected by this user
game.user.targets;                        // Set<Token> targeted by this user
token.targeted;                           // Set<User> targeting this token
token.isTargeted;
token.setTarget(true, { releaseOthers: false });
canvas.tokens.setTargets([idA, idB], { mode: "acquire" });
token.control({ releaseOthers: true, pan: true });
```

### Scenes and navigation
REF `api/classes/foundry.documents.Scene.md`
```js
game.scenes.viewed; game.scenes.active;
await scene.view({ level, controlledTokens: [id], transition: { type, duration } }); // SceneViewOptions
await scene.activate({ pullUsers: true });     // GM: make active scene
canvas.scene.pullUsers(game.users);            // pull users to a scene
await scene.unview();
```

### Grid and coordinates
REF `api/classes/foundry.grid.BaseGrid.md` (+ `SquareGrid`, `HexagonalGrid`, `GridlessGrid`), `api/variables/CONST.GRID_TYPES.md`, `CONST.GRID_SNAPPING_MODES.md`.

Coordinates are either pixel `Point {x, y}` (or `ElevatedPoint {x, y, elevation}`) or grid offsets `{i, j}` (row `i`, column `j`). Most methods accept either (`GridCoordinates2D = GridOffset2D | Point`).

```js
const g = canvas.grid;
g.size; g.sizeX; g.sizeY; g.distance; g.units; g.type;   // type: CONST.GRID_TYPES.*
g.isSquare; g.isHexagonal; g.isGridless;

const off = g.getOffset({ x: 1200, y: 900 });           // {i, j}
g.getTopLeftPoint(off); g.getCenterPoint(off);         // Point
g.getSnappedPoint({ x, y }, { mode: CONST.GRID_SNAPPING_MODES.CENTER });
g.getAdjacentOffsets(off);                             // GridOffset2D[]
g.testAdjacency(offA, offB);
g.getDirectPath([ptA, ptB]);                           // GridOffset2D[] along the path

// Distance along a path (in scene units), honors diagonal rules
const r = g.measurePath([tokenA.center, tokenB.center]);
r.distance; r.spaces; r.cost; r.diagonals; r.euclidean; r.segments; r.waypoints;
```
Pixels per scene unit is `canvas.dimensions.distancePixels`.

### Token movement and animation
v14 has a full movement API on `TokenDocument` (REF `api/classes/foundry.documents.TokenDocument.md`, see `### move`):
```js
const done = await tokenDoc.move({ x: 500, y: 300 }, {
  animation: { duration: 800, movementSpeed: 6 },   // TokenMovementOptions.animation
  autoRotate: true, showRuler: true,
  // constrainOptions: { ignoreWalls: true, ignoreCost: true }
});
// or: tokenDoc.update({x, y}, {animate: false})  (`animate` is a TokenMovementOptions key)
await canvas.scene.moveTokens({ [id]: { /* TokenMovementInstruction */ } });
```
Movement hooks: `preMoveToken(document, movement, operation)` (initiator only, return false to block), `moveToken(document, movement, operation, user)` (all clients), `pauseToken`, `stopToken`, `planToken`, `recordToken`.

Placeable-only animation (no DB write): `await token.animate({ alpha: 0.5, rotation: 90 }, { duration: 500, easing, name })` (`TokenAnimationData` / `TokenAnimationOptions`). Stop it with `token.stopAnimation()`. To pan, call `token.panCanvas({duration})`.
For generic tweening use `foundry.canvas.animation.CanvasAnimation.animate([{ parent, attribute, to }], { duration, name, easing, ontick })`. It resolves to `true` when the tween finishes, or `false` if it was terminated early.

### Drawing custom PIXI graphics
Three patterns (full code in [examples.md](examples.md)):
1. **Decorate a placeable.** In `drawToken` (initial draw) add a `PIXI.Graphics` child to the Token. In `refreshToken` update it. Every placeable is a PIXI container.
2. **Scene-wide overlay.** On `canvasReady` add a container to `canvas.interface` (moves with the stage), or to `canvas.overlay` (not bound to the stage transform). Destroy it on `canvasTearDown`.
3. **Custom layer.** Subclass `foundry.canvas.layers.CanvasLayer` (or `InteractionLayer` if it needs mouse/keyboard), give it `static get layerOptions()` and `async _draw(options)` / `async _tearDown(options)`, then register `CONFIG.Canvas.layers.myLayer = { group: "interface", layerClass: MyLayer }` in `init`. Get the live instance with `MyLayer.instance`.

Floating text: `canvas.interface.createScrollingText(point, "-5", { anchor, direction, distance, duration, jitter, textStyle })`.

### Canvas hooks (all verified in `HOOKS.md`)
| Hook | Args |
|---|---|
| `canvasConfig` | `(config)` before PIXI app creation |
| `canvasInit` / `canvasDraw` / `canvasReady` | `(canvas)` |
| `canvasPan` | `(canvas, position: CanvasViewPosition)` |
| `canvasTearDown` | `(canvas, options)` |
| `drawGroup` / `tearDownGroup` | `(group, options)`, e.g. `drawPrimaryCanvasGroup` |
| `drawLayer` / `tearDownLayer` | `(layer, options)`, e.g. `drawTokensLayer` |
| `activateLayer` / `deactivateLayer` | `(layer)`, e.g. `activateTokensLayer` |
| `drawObject` -> `drawToken`, `drawWall`... | `(object)` |
| `refreshObject` -> `refreshToken`... | `(object)` (no flags argument) |
| `destroyObject` -> `destroyToken`... | `(object)` |
| `controlObject` -> `controlToken`... | `(object, controlled)` |
| `hoverObject` -> `hoverToken`... | `(object, hovered)` |
| `targetToken` | `(user, token, targeted)` |
| `pastePlaceableObject` -> `pasteToken`... | `(objects, data, {cut})` |
| `highlightObjects` | `(active)` |
| `dropCanvasData` | `(canvas, data, event)` |
| `applyTokenStatusEffect` | `(token, statusId, active)` |
| `getPlaceableContextOptions` -> e.g. `getTokenContextOptions` | `(app, menuItems)` |
| `initializeLightSources`, `lightingRefresh` | `(group: EffectsCanvasGroup)` |
| `initializeVisionSources` | `(sources)` |
| `sightRefresh`, `visibilityRefresh`, `initializeVisionMode` | `(visibility: CanvasVisibility)` |

Document-level changes use the generic hooks: `createToken`, `updateToken`, `deleteToken`, `preUpdateWall`, and so on. Prefer those for data logic and the placeable hooks for visuals.

### Vision and lighting basics
```js
canvas.visibility.testVisibility({ x, y }, { tolerance: 2, object: token }); // visible to current user?
canvas.effects.testInsideLight({ x, y, elevation: 0 });
canvas.effects.testInsideDarkness({ x, y, elevation: 0 });
token.hasSight; token.isVisible; token.sightRange; token.emitsLight;
token.checkCollision(destPoint, { type: "move", mode: "any" });       // walls between token and point
canvas.perception.update({ initializeVision: true, refreshLighting: true }); // request a perception refresh
```
Flag names are in `PerceptionManager.RENDER_FLAGS` (REF `api/classes/foundry.canvas.perception.PerceptionManager.md`). Use `initializeLightSources(group)` to add programmatic light sources. Custom vision and detection modes go through `CONFIG.Canvas.visionModes` / `detectionModes` (`foundry.canvas.perception.VisionMode` / `DetectionMode`).

### Scene Regions (and RegionBehavior types)
REF `articles/scene-regions.md`, `api/classes/foundry.documents.RegionDocument.md`, `api/classes/foundry.data.regionBehaviors.RegionBehaviorType.md`, `api/variables/CONST.REGION_EVENTS.md`.

- A Region is made of shapes (and holes). Behaviors (embedded `RegionBehavior` documents) give it effects.
- `regionDoc.tokens` (ReadonlySet<TokenDocument>), `regionDoc.testPoint({x, y, elevation})`, `regionDoc.teleportToken(...)`, `regionDoc.spawnTokens(...)`, `tokenDoc.regions`, `tokenDoc.testInsideRegion(...)`.
- `await canvas.regions.placeRegion(data, options)` lets the user place a region interactively. This is the replacement for templates: shapes include `circle`, `emanation` and others, and `{attachToToken: true}` attaches the region to a token.
- Core behavior types: `adjustDarknessLevel`, `applyActiveEffect`, `changeLevel`, `defineSurface`, `displayScrollingText`, `executeMacro`, `executeScript`, `modifyMovementCost`, `pauseGame`, `suppressWeather`, `teleportToken`, `toggleBehavior` (classes `foundry.data.regionBehaviors.*RegionBehaviorType`).

`CONST.REGION_EVENTS`: `BEHAVIOR_ACTIVATED`, `BEHAVIOR_DEACTIVATED`, `BEHAVIOR_VIEWED`, `BEHAVIOR_UNVIEWED`, `REGION_BOUNDARY`, `REGION_ANIMATION`, `TOKEN_ENTER`, `TOKEN_EXIT`, `TOKEN_MOVE_IN`, `TOKEN_MOVE_OUT`, `TOKEN_MOVE_WITHIN`, `TOKEN_ANIMATE_IN`, `TOKEN_ANIMATE_OUT`, `TOKEN_TURN_START`, `TOKEN_TURN_END`, `TOKEN_ROUND_START`, `TOKEN_ROUND_END`.
A `RegionEvent` has `{ name, data, region, user }`, where `user` is the User who triggered it. For enter/exit events, `data` is `{ token: TokenDocument, movement }`.

**Custom behavior:**
1. Declare the sub-type in `module.json`: `"documentTypes": { "RegionBehavior": { "myBehavior": {} } }`. Core prefixes it with the module id (`articles/module-sub-types.md`).
2. Subclass `RegionBehaviorType`. `defineSchema()` returns your fields plus `events: this._createEventsField({ events: [...] })`, and you implement `async _handleRegionEvent(event)`. Use `static events = { [eventName]: async function(event) {...} }` for events that are always handled.
3. Register it in `init`: `CONFIG.RegionBehavior.dataModels["my-module.myBehavior"] = MyBehaviorType`, plus `typeLabels` / `typeIcons`.
4. Gate side effects to one client, e.g. `if (event.user !== game.user) return;`.
See [examples.md](examples.md#custom-region-behavior).

### Scene control buttons (v14 shape)
REF `api/functions/hookEvents.getSceneControlButtons.md`, `api/interfaces/foundry.SceneControl.md`, `foundry.SceneControlTool.md`.
```js
Hooks.on("getSceneControlButtons", (controls) => {     // Record<string, SceneControl>
  controls.tokens.tools.myTool = {
    name: "myTool", title: "MYMOD.Tool", icon: "fa-solid fa-wrench",
    order: Object.keys(controls.tokens.tools).length,
    button: true,                       // fire-and-forget; or toggle: true + active
    visible: game.user.isGM,
    onChange: (event, active) => { /* ... */ }
  };
  // A whole new control set:
  controls.myControls = { name: "myControls", title: "MYMOD.Controls", icon: "fa-solid fa-star",
    order: 99, visible: true, activeTool: "a", tools: { a: { name: "a", title: "A", icon: "fa-solid fa-a", order: 0 } },
    onChange: (event, active) => {}, onToolChange: (event, tool, active) => {} };
});
```
`SceneControlTool` keys: `name, title, icon, order, visible, button, toggle, active, onChange, control, interaction, creation, createData, shapeData, toolclip`.
At runtime: `ui.controls.control`, `ui.controls.tool`, `ui.controls.activate({control, tool})`.

---

## B. Dice

REF `api/classes/foundry.dice.Roll.md`, `articles/dice.md`, `articles/dice-advanced.md`, `articles/dice-modifiers.md`, `api/variables/CONFIG.Dice.md`.

### Roll basics
```js
const roll = new Roll("2d20kh + @prof + @abilities.str.mod", actor.getRollData(), { flavor: "Attack" });
await roll.evaluate();            // async; returns the Roll
roll.total;    // number
roll.result;   // "16 + 2 + 4"
roll.formula;  // standardized formula
roll.terms;    // RollTerm[] (Die, OperatorTerm, NumericTerm, ...)
roll.dice;     // DiceTerm[] only
roll.dice[0].results;   // [{result, active, discarded, exploded, rerolled, success, failure, count}]
roll.isDeterministic;
```
- `new Roll(formula, data = {}, options = {})`. `options` is `RollOptions` (`flavor` plus arbitrary keys).
- `evaluate({ maximize, minimize, allowStrings, allowInteractive })` returns `Promise<Roll>`. `allowInteractive: false` skips manual or external dice fulfillment prompts.
- `evaluateSync({ maximize, minimize, allowStrings, strict })` returns a Roll. With `strict` it throws on non-deterministic terms, so use it only for deterministic formulas such as `"@lvl * 2"`.
- `Roll.create(formula, data, options)` uses the configured default Roll class (`Roll.defaultImplementation`).
- Utilities: `roll.clone()`, `await roll.reroll()`, `roll.alter(multiply, add)`, `Roll.validate(formula)`, `Roll.replaceFormulaData(formula, data, {missing, warn})`, `Roll.parse(formula, data)`, `Roll.fromTerms(terms)`, `Roll.fromData(obj)` / `Roll.fromJSON(str)` / `roll.toJSON()`, `await Roll.simulate(formula, n)`, `Roll.safeEval(expr)`.
- Roll data: `actor.getRollData()` / `item.getRollData()` / `message.getRollData()`. Formulas reference it with `@path.to.value`. Never mutate the returned object.

### Rendering and chat
```js
await roll.toMessage({
  speaker: ChatMessage.getSpeaker({ actor }),   // {actor, token, scene, alias}
  flavor: "Longsword attack"
}, { messageMode: "gm" });                      // "public" | "self" | "gm" | "blind"

const data = await roll.toMessage({}, { create: false }); // prepared chatData only
const html = await roll.render({ flavor, isPrivate, template });
const tip  = await roll.getTooltip();
const a    = roll.toAnchor({ label, icon, classes, dataset, attrs }); // inline-roll <a>
```
Message modes (from `ChatMessage.applyMode` docs) work like this:
- `public` sets `whisper` to [].
- `self` whispers to the user only.
- `gm` whispers to the GMs.
- `blind` whispers to the GMs and sets `blind = true`.

To create a message manually: `ChatMessage.applyMode(chatData, mode)` then `ChatMessage.create(chatData)`, or `message.applyMode(mode)`. The available modes live in `CONFIG.ChatMessage.modes`. If you omit the mode, the client's default setting applies. `ChatMessageData.rolls` is the serialized rolls array. `message.isRoll` and `message.isContentVisible` exist. Use the `renderChatMessageHTML(message, html: HTMLElement, context)` hook to customize cards.

### Formula syntax quick ref (`articles/dice-modifiers.md`)
- Reroll and explode: `r` (`1d20r<10`), `rr` (recursive), `x` (`5d10x10`, `6d10x5=10` caps explosions), `xo` (explode once).
- Keep and drop: `k`/`kh`/`kl`, `d`/`dl`/`dh` (`4d6kh3`, `2d20kl`). Clamp with `min`/`max` (`4d10min2`).
- Count: `cs` (`10d20cs>=15`), `cf`, `df` (deduct failures), `sf` (subtract failures), `ms` (margin of success), `even`, `odd`.
- Special dice: coins `dc` (`3dcc1` calls heads) and Fate `df` (`4df`).
- Pools `{4d6, 3d8}kh`, parentheses `(2d4)d8`, flavor `2d6[fire]`, math functions `floor()`, `ceil()`, `round()`, `abs()`.
- `Die.MODIFIERS` keys: `r rr x xo k kh kl d dh dl min max cs cf df sf ms even odd`.

### Custom dice terms, functions and Roll subclasses
`CONFIG.Dice`: `terms` (Record<denomination, DiceTerm class>), `rolls` (Roll class array), `functions` (Record<name, RollFunction>), `types`, `termTypes`, `fulfillment`, `randomUniform`, `parser`.

```js
// Custom die: register by DENOMINATION (core: Die "d", Coin "c", FateDie "f" -> 1d6, 3dc, 4df)
class HopeDie extends foundry.dice.terms.Die {
  static DENOMINATION = "h";
  constructor(termData = {}) { super({ ...termData, faces: 12 }); }
  getResultLabel(result) { return result.result >= 10 ? "★" : String(result.result); }
}
Hooks.once("init", () => { CONFIG.Dice.terms[HopeDie.DENOMINATION] = HopeDie; }); // "2dh"

// Custom modifier on your term: static MODIFIERS = { ...Die.MODIFIERS, crit: "myCritMethod" }

// Roll subclass, e.g. a custom chat template
class MyRoll extends Roll {
  static CHAT_TEMPLATE = "modules/my-module/templates/my-roll.hbs";
  async _prepareChatRenderContext(options) { const ctx = await super._prepareChatRenderContext(options); ctx.extra = this.options.extra; return ctx; }
}
Hooks.once("init", () => CONFIG.Dice.rolls.push(MyRoll));

// Formula function (RollFunction: (...args) => number|string|Promise)
Hooks.once("init", () => { CONFIG.Dice.functions.half = (x) => Math.floor(x / 2); }); // "half(1d10)"
```
Other overridable members: `DiceTerm#mapRandomFace(u)`, `#randomFace()`, `#getResultCSS(result)`, `#getTooltipData()`, `Roll#_prepareData(data)`, `Roll.TOOLTIP_TEMPLATE`.

---

## Gotchas
- Only touch `canvas.*` after `canvasReady` (or check `canvas.ready`). Placeables are destroyed and recreated on every scene change, so re-attach graphics in `drawToken` or `canvasReady`.
- Placeables exist only for the viewed scene. For other scenes use `scene.tokens` (documents).
- `Token#animate` and graphics are local to one client. Persist changes with `document.update` or `move`.
- Always `await roll.evaluate()`. Reading `total` before evaluation is meaningless.
- Use `messageMode`, not `rollMode`.

## Unverified or inferred (check before relying on it)
- Formula use of `CONFIG.Dice.functions` names (e.g. `half(1d10)`): the config type is verified, the call syntax is inferred from the Math-function article.
- Whether `CONFIG.Dice.rolls` registration is what lets `Roll.fromData` rehydrate subclasses from chat: the docs only say "Configured Roll class definitions".
- Dispatch split between `static events` and `_handleRegionEvent`: both are documented, but the exact routing is not spelled out.
- The custom-die pattern (Die subclass with a new `DENOMINATION`) mirrors core `Coin`/`FateDie`. The docs contain no module example.
- The name of the client setting for the default message mode is not documented.
