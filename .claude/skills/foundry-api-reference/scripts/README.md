# Re-scraping the Foundry VTT docs

Run these from an empty working directory with Node 18+ (requires `npm i cheerio turndown turndown-plugin-gfm`):

1. `curl -sL https://foundryvtt.com/api/ -o index.html && curl -sL https://foundryvtt.com/api/assets/navigation.js -o navigation.js`
2. `node nav.js`: decodes TypeDoc's zlib/base64 navigation data and writes `pages.txt` (one relative path per page).
3. Download every page:
   `awk '{print "url = \"https://foundryvtt.com/api/"$0"\"\noutput = \"html/"$0"\""}' pages.txt > curl.cfg && curl -sS --create-dirs --parallel --parallel-max 12 -K curl.cfg`
4. `node convert.js html md`: converts to Markdown (inherited members collapsed, signatures as ts blocks).
5. Download KB articles into `kb/<slug>.html` (`https://foundryvtt.com/article/<slug>/`), then run `node convkb.js`.
6. Copy `md/` to `reference/api/`, move `md/_overview.md` to `reference/OVERVIEW.md`, then run `node catalog.js <path-to-reference>` (it reads `api/_index.json`, which you delete afterwards).

Update the version number in SKILL.md (it appears in the footer of the API index page).
