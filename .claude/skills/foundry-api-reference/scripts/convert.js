const fs=require('fs'),path=require('path'),cheerio=require('cheerio');
const TD=require('turndown');const {gfm}=require('turndown-plugin-gfm');
const td=new TD({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-'});td.use(gfm);td.escape=s=>s;
td.addRule('pre',{filter:n=>n.nodeName==='PRE',replacement:(c,n)=>{
  const code=n.querySelector&&n.querySelector('code');const lang=code&&/\b(js|ts|javascript|typescript|json|html|hbs|css)\b/.exec(code.className||'');
  return '\n```'+(lang?lang[1]:'')+'\n'+n.textContent.replace(/\n+$/,'')+'\n```\n';}});
td.addRule('links',{filter:'a',replacement:c=>c});   // drop link URLs; names are enough and grep-able
const OUT=process.argv[3], IN=process.argv[2];
const pages=fs.readFileSync('pages.txt','utf8').trim().split('\n');
const index=[];
for(const p of pages){
  const $=cheerio.load(fs.readFileSync(path.join(IN,p),'utf8'));
  const root=$('.col-content');
  const crumbs=root.find('.tsd-breadcrumb li').map((i,e)=>$(e).text()).get().join('.');
  const title=root.find('.tsd-page-title h1').text().trim();
  root.find('svg,button,.tsd-anchor-icon,.tsd-page-title,.tsd-index-section,.tsd-index-panel,details.tsd-index-accordion,.tsd-panel-group.tsd-index-group').remove();
  // Inherited members: collapse to a name list
  const inherited=[];
  root.find('section.tsd-panel.tsd-member.tsd-is-inherited').each((i,e)=>{inherited.push($(e).find('h3').first().text().trim());$(e).remove();});
  root.find('.tsd-is-private,.tsd-is-internal').remove();
  root.find('aside.tsd-sources').each((i,e)=>{const t=$(e).text().trim();if(/^Defined in/.test(t)||!t)$(e).remove();else $(e).replaceWith(`<p><em>${t}</em></p>`);});
  root.find('br').replaceWith('\n');
  // signatures -> plain-text code blocks
  root.find('.tsd-signature').each((i,e)=>{const t=$(e).text().replace(/\u00a0/g,' ').trim();$(e).replaceWith(`<pre><code class="ts">${$('<x>').text(t).html()}</code></pre>`);});
  root.find('code.tsd-tag').each((i,e)=>$(e).replaceWith('['+$(e).text().trim()+'] '));
  root.find('section.tsd-panel.tsd-member > h3').each((i,e)=>{const fl=$(e).parent().hasClass('tsd-is-protected')?' (protected)':'';$(e).replaceWith(`<h3>${$(e).text().trim()}${fl}</h3>`);});
  root.find('h4.tsd-returns-title').each((i,e)=>$(e).replaceWith(`<p><strong>${$(e).text().trim()}</strong></p>`));
  root.find('h4.tsd-parameters-title').each((i,e)=>$(e).replaceWith(`<p><strong>${$(e).text().trim()}</strong></p>`));
  let md=td.turndown(root.html()||'');
  md=md.replace(/\n{3,}/g,'\n\n').replace(/[ \t]+\n/g,'\n');
  const kind=p.split('/')[0];
  const summary=($('.col-content .tsd-panel.tsd-comment .tsd-comment p').first().text()||'').replace(/\s+/g,' ').trim().slice(0,160);
  let head=`# ${title}\n\n\`${crumbs}\` · source: https://foundryvtt.com/api/${p}\n\n`;
  if(inherited.length) md+=`\n\n## Inherited members (documented on parent class)\n\n${[...new Set(inherited)].join(', ')}\n`;
  const outp=path.join(OUT,p.replace(/\.html$/,'.md'));
  fs.mkdirSync(path.dirname(outp),{recursive:true});fs.writeFileSync(outp,head+md);
  index.push({kind,file:p.replace(/\.html$/,'.md'),title,summary});
}
fs.writeFileSync(path.join(OUT,'_index.json'),JSON.stringify(index));
console.log(index.length);
