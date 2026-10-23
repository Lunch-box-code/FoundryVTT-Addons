# Worked examples (Foundry VTT v14)

Plain JS ES modules. `MODULE_ID = "my-module"` is a placeholder. All API names are checked against `../foundry-api-reference/reference/`. Lines marked *(inferred)* follow documented signatures but have no matching docs example.

## 1. Decorate tokens with a PIXI ring

```js
const MODULE_ID = "my-module";

Hooks.on("drawToken", (token) => {                 // drawObject -> drawToken(object)
  const g = new PIXI.Graphics();
  g.name = `${MODULE_ID}-ring`;
  token.addChild(g);                               // placeables are PIXI containers
  token[MODULE_ID] = { ring: g };
});

Hooks.on("refreshToken", (token) => {              // refreshObject -> refreshToken(object)
  const g = token[MODULE_ID]?.ring;
  if ( !g || g.destroyed ) return;
  const flagged = token.document.getFlag(MODULE_ID, "marked");
  g.clear();
  if ( !flagged ) return;
  g.lineStyle(4, 0xff8800, 1).drawCircle(token.w / 2, token.h / 2, Math.max(token.w, token.h) / 2 + 4);
});

// Force a redraw of the visual after a flag change
Hooks.on("updateToken", (doc, changed) => {
  if ( foundry.utils.hasProperty(changed, `flags.${MODULE_ID}`) ) doc.object?.renderFlags.set({ refresh: true });
});
```
`refresh` is a declared Token render flag (`Token.RENDER_FLAGS`). `doc.object` is the `CanvasDocument#object` placeable.

## 2. Scene-wide overlay (interface group)

```js
let overlay;
Hooks.on("canvasReady", () => {
  overlay = canvas.interface.addChild(new PIXI.Container());
  const g = overlay.addChild(new PIXI.Graphics());
  const { sceneRect } = canvas.dimensions;
  g.lineStyle(6, 0x00ffcc, 0.8).drawRect(sceneRect.x, sceneRect.y, sceneRect.width, sceneRect.height);
});
Hooks.on("canvasTearDown", () => { overlay?.destroy({ children: true }); overlay = null; });
```

## 3. Custom canvas layer *(registration pattern from CONFIG.Canvas.layers shape)*

```js
class MyLayer extends foundry.canvas.layers.CanvasLayer {
  static get layerOptions() {
    return foundry.utils.mergeObject(super.layerOptions, { name: "myLayer", zIndex: 250 });
  }
  async _draw(options) {
    this.gfx = this.addChild(new PIXI.Graphics());
  }
  async _tearDown(options) {
    this.gfx = null;
    return super._tearDown(options);
  }
  highlight(offset) {
    const { x, y } = canvas.grid.getTopLeftPoint(offset);
    this.gfx.beginFill(0xff0000, 0.3).drawRect(x, y, canvas.grid.sizeX, canvas.grid.sizeY).endFill();
  }
}
Hooks.once("init", () => {
  CONFIG.Canvas.layers.myLayer = { group: "interface", layerClass: MyLayer };
});
// later: MyLayer.instance.highlight(canvas.grid.getOffset(canvas.mousePosition));
```

## 4. Distance between selected token and each target

```js
const source = canvas.tokens.controlled[0];
for ( const target of game.user.targets ) {
  const { distance } = canvas.grid.measurePath([source.center, target.center]);
  console.log(`${target.name}: ${distance} ${canvas.grid.units}`);
}
```

## 5. Toggle tool in Token controls

```js
Hooks.on("getSceneControlButtons", (controls) => {
  controls.tokens.tools[`${MODULE_ID}-toggle`] = {
    name: `${MODULE_ID}-toggle`,
    title: "MYMOD.ToggleOverlay",
    icon: "fa-solid fa-eye",
    order: Object.keys(controls.tokens.tools).length,
    toggle: true,
    active: game.settings.get(MODULE_ID, "overlayOn"),
    onChange: (event, active) => game.settings.set(MODULE_ID, "overlayOn", active)
  };
});
```

## 6. Ping and pan to a token

```js
const t = canvas.tokens.controlled[0];
await canvas.animatePan({ x: t.center.x, y: t.center.y, scale: 1.5, duration: 600 });
await canvas.ping(t.center, { color: "#ff8800", duration: 1500 }); // PingOptions: color (string), duration, name, size
```

## Custom region behavior

`module.json`:
```json
"documentTypes": { "RegionBehavior": { "damageZone": {} } }
```

```js
const { fields } = foundry.data;

class DamageZoneBehaviorType extends foundry.data.regionBehaviors.RegionBehaviorType {
  static defineSchema() {
    return {
      events: this._createEventsField({
        events: [CONST.REGION_EVENTS.TOKEN_ENTER, CONST.REGION_EVENTS.TOKEN_TURN_START],
        initial: [CONST.REGION_EVENTS.TOKEN_ENTER]
      }),
      formula: new fields.StringField({ required: true, initial: "1d6" })
    };
  }

  /** @override */
  async _handleRegionEvent(event) {
    if ( event.user !== game.user ) return;          // only the triggering client acts
    const token = event.data.token;                  // TokenDocument
    const actor = token?.actor;
    if ( !actor ) return;
    const roll = await new Roll(this.formula, actor.getRollData()).evaluate();
    await roll.toMessage({
      speaker: ChatMessage.getSpeaker({ actor, token }),
      flavor: `${this.region.name}: ${event.name}`
    });
  }
}

Hooks.once("init", () => {
  const type = `${MODULE_ID}.damageZone`;
  CONFIG.RegionBehavior.dataModels[type] = DamageZoneBehaviorType;
  CONFIG.RegionBehavior.typeLabels[type] = "MYMOD.DamageZone";
  CONFIG.RegionBehavior.typeIcons[type] = "fa-solid fa-fire";
});
```
`this.region`, `this.behavior`, and `this.scene` are convenience accessors on `RegionBehaviorType`.

## 7. Full roll flow with message mode

```js
async function rollSave(actor, ability, { messageMode = "public" } = {}) {
  const data = actor.getRollData();
  const roll = new Roll("1d20 + @abilities." + ability + ".mod", data, { flavor: `${ability} save` });
  await roll.evaluate();
  const success = roll.total >= 15;
  return roll.toMessage({
    speaker: ChatMessage.getSpeaker({ actor }),
    flavor: `${ability.toUpperCase()} save: ${success ? "success" : "failure"}`,
    flags: { [MODULE_ID]: { ability, success } }
  }, { messageMode });
}

Hooks.on("renderChatMessageHTML", (message, html) => {
  const f = message.getFlag(MODULE_ID, "success");
  if ( f === undefined ) return;
  html.classList.add(f ? "my-success" : "my-failure");
});
```

## 8. Deterministic math with evaluateSync

```js
const bonus = new Roll("floor(@level / 2) + 1", { level: 7 }).evaluateSync().total; // 4
```
