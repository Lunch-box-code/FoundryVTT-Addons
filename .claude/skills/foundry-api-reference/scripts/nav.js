const fs=require('fs'),zlib=require('zlib');
const src=fs.readFileSync('navigation.js','utf8');
const b64=src.match(/"([^"]+)"/)[1];
const data=JSON.parse(zlib.inflateSync(Buffer.from(b64,'base64')).toString());
const out=[];
(function walk(n){for(const x of n){if(x.path)out.push(x.path);if(x.children)walk(x.children);}})(data);
fs.writeFileSync('pages.txt',[...new Set(out)].join('\n'));
console.log(out.length);
