#!/usr/bin/env node
// Usage: node scaffold.mjs <target-dir> --id my-module --title "My Module" [--author Name] [--repo owner/repo] [--description "..."]
// Copies ./template into <target-dir>/<id>, substituting __ID__, __TITLE__, __AUTHOR__, __REPO__, __DESCRIPTION__ in file contents and names.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const target = args[0];
const opt = (k, d) => { const i = args.indexOf(`--${k}`); return i > -1 ? args[i + 1] : d; };
const id = opt("id");
if ( !target || !id ) { console.error("Usage: node scaffold.mjs <target-dir> --id <module-id> --title <title> [--author] [--repo] [--description]"); process.exit(1); }
if ( !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) ) { console.error(`Invalid id "${id}": use lower-case letters, digits and hyphens.`); process.exit(1); }
const vars = {
  __ID__: id,
  __TITLE__: opt("title", id),
  __AUTHOR__: opt("author", "Unknown"),
  __REPO__: opt("repo", `OWNER/${id}`),
  __DESCRIPTION__: opt("description", "")
};
const sub = s => Object.entries(vars).reduce((a, [k, v]) => a.replaceAll(k, v), s);
const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "template");
const dest = path.resolve(target, id);
if ( fs.existsSync(dest) ) { console.error(`${dest} already exists`); process.exit(1); }
(function copy(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for ( const e of fs.readdirSync(from, { withFileTypes: true }) ) {
    const s = path.join(from, e.name), d = path.join(to, sub(e.name));
    if ( e.isDirectory() ) copy(s, d);
    else fs.writeFileSync(d, sub(fs.readFileSync(s, "utf8")));
  }
})(src, dest);
console.log(`Created ${dest}`);
