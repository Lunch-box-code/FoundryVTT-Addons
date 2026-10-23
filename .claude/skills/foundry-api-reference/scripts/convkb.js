const fs=require('fs'),path=require('path'),cheerio=require('cheerio');
const TD=require('turndown');const {gfm}=require('turndown-plugin-gfm');
const td=new TD({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-'});td.use(gfm);td.escape=s=>s;
td.addRule('pre',{filter:'pre',replacement:(c,n)=>'\n```\n'+n.textContent.replace(/\n+$/,'')+'\n```\n'});
fs.mkdirSync('kbmd',{recursive:true});
for(const f of fs.readdirSync('kb')){
  const $=cheerio.load(fs.readFileSync('kb/'+f,'utf8'));
  const a=$('article.primary-content');a.find('script,style,nav,button,svg').remove();
  const t=$('title').text().replace(/\s*\|.*$/,'').trim();
  const slug=f.replace('.html','');
  fs.writeFileSync('kbmd/'+slug+'.md',`# ${t}\n\nsource: https://foundryvtt.com/article/${slug}/\n\n`+td.turndown(a.html()||'').replace(/\n{3,}/g,'\n\n'));
}
// API landing page
const $=cheerio.load(fs.readFileSync('index.html','utf8'));const r=$('.col-content');r.find('svg,button,.tsd-anchor-icon').remove();
fs.writeFileSync('md/_overview.md','# Foundry VTT API v14 — Overview\n\nsource: https://foundryvtt.com/api/\n\n'+td.turndown(r.html()).replace(/\]\([^)]*\)/g,']').replace(/\n{3,}/g,'\n\n'));
