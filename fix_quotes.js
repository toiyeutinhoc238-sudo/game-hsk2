const fs = require('fs');

// We have syntax error in the current questions.js, so we should read from questions.js but we might not be able to eval it directly because of syntax errors.
// Wait, the current questions.js IS syntax error. We can read the old questions_new.js or process_questions.js if it backed it up?
// No, questions.js was syntax error because I replaced ALL quotes. Let's fix the syntax error directly by replacing 'Từ ' with "Từ '" and "' trong" with "' trong" using Regex, or we can just read the previous valid state if there is any backup. I didn't create a backup.
// Let's manually fix the string syntax.

let content = fs.readFileSync('js/questions.js', 'utf8');

// Fix syntax error first: replace { q: '...', a: with { q: "...", a:
// Actually, it's easier to just fix the quotes:
content = content.replace(/q: '(.*?)', a:/g, (match, p1) => {
    // If the string itself contains single quotes, we should wrap it in double quotes
    // and escape any internal double quotes.
    return `q: ${JSON.stringify(p1.replace(/\\'/g, "'"))}, a:`;
});
content = content.replace(/vocab: '(.*?)' \}/g, (match, p1) => {
    return `vocab: ${JSON.stringify(p1.replace(/\\'/g, "'"))} }`;
});

// Now we can eval it
const match = content.match(/const hsk2Questions = (\{[\s\S]*?\});/);
if (!match) process.exit(1);

const data = eval('(' + match[1] + ')');

let outputStr = 'const hsk2Questions = {\n';
for (let k in data) {
    outputStr += `    ${k}: [\n`;
    data[k].forEach((q, idx) => {
        let aStr = JSON.stringify(q.a).replace(/"/g, "'");
        let qStr = JSON.stringify(q.q); // use double quotes for string
        let vStr = q.vocab ? JSON.stringify(q.vocab) : "''";
        outputStr += `        { q: ${qStr}, a: ${aStr}, correct: ${q.correct}, vocab: ${vStr} }${idx < data[k].length - 1 ? ',' : ''}\n`;
    });
    outputStr += `    ]${k < Object.keys(data).length ? ',' : ''}\n`;
}
outputStr += '};\n';

fs.writeFileSync('js/questions.js', outputStr);
console.log('Done fixing quotes.');
