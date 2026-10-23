const fs=require('fs');const R=process.argv[2];
const idx=JSON.parse(fs.readFileSync(R+'/api/_index.json'));
// group by namespace (strip final segment)
const groups={};
for(const e of idx){
  if(e.file.startsWith('functions/hookEvents.'))continue;
  const name=e.file.split('/')[1].replace(/\.md$/,'');
  const ns=e.kind==='modules'?'(modules)':name.includes('.')?name.slice(0,name.lastIndexOf('.')):'(global)';
  (groups[ns]??=[]).push(e);
}
let out='# Foundry VTT v14 API Catalog\n\nOne line per API page: `path` — Title — summary. Paths are relative to `reference/api/`. Grep this file to locate a class, then Read the page.\n\nHook events are listed separately in HOOKS.md.\n\n';
for(const ns of Object.keys(groups).sort()){
  out+=`\n## ${ns}\n\n`;
  for(const e of groups[ns].sort((a,b)=>a.file.localeCompare(b.file)))out+=`- \`${e.file}\` — ${e.title}${e.summary?' — '+e.summary:''}\n`;
}
fs.writeFileSync(R+'/CATALOG.md',out);
// hooks
let h='# Foundry VTT v14 Hook Events\n\nEvery core hook. Register with `Hooks.on(name, fn)` / `Hooks.once(name, fn)`. Detail pages are in `reference/api/functions/hookEvents.<name>.md`. Generic hooks substitute the class/document name (e.g. `renderActorSheetV2`, `preCreateItem`, `updateToken`).\n\n| Hook | Signature | Description |\n|---|---|---|\n';
for(const e of idx.filter(e=>e.file.startsWith('functions/hookEvents.')).sort((a,b)=>a.file.localeCompare(b.file))){
  const md=fs.readFileSync(R+'/api/'+e.file,'utf8');
  const sig=(md.match(/```ts\n([\s\S]*?)```/)||[,''])[1].replace(/\s+/g,' ').trim();
  const desc=(md.split('```')[2]||'').replace(/\*\*Parameters\*\*[\s\S]*/,'').replace(/\s+/g,' ').trim().slice(0,200);
  h+=`| ${e.title.replace(/^Function /,'')} | \`${sig.replace(/\|/g,'\|')}\` | ${desc.replace(/\|/g,'\|')} |\n`;
}
fs.writeFileSync(R+'/HOOKS.md',h);
