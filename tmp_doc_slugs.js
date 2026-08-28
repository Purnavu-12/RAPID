const { readFileSync } = require('fs');
const raw = readFileSync('docs/RAPID.md', 'utf8');
const chapterRe = /^(#{1})\s+(\d+(?:\.\d+)*)\.\s+(.*)$/;
const lines = raw.split('\n');
let found = false;
for (let i = 0; i < lines.length; i++) {
    if (chapterRe.test(lines[i])) {
        const m = chapterRe.exec(lines[i]);
        const slug = `${m[2]}-${m[3]}`.toLowerCase().replace(/[^\w]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
        console.log(`${m[2]}. ${m[3]} → slug: "${slug}"`);
        found = true;
    }
    if (found && i > 30) break; // just first 30 matches
}
