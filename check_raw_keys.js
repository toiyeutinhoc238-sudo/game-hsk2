const fs = require('fs');
const content = fs.readFileSync('js/questions.js', 'utf8');
const lines = content.split('\n');
const topicKeys = [];
lines.forEach(line => {
    const match = line.match(/^    "(.*)": \[/);
    if (match) {
        topicKeys.push(match[1]);
    }
});
console.log('Topic keys found in questions.js:');
topicKeys.forEach((k, i) => console.log(`${i + 1}. ${k}`));

const duplicates = topicKeys.filter((item, index) => topicKeys.indexOf(item) !== index);
if (duplicates.length > 0) {
    console.log('\nDUPLICATE KEYS FOUND:');
    console.log(duplicates);
} else {
    console.log('\nNo duplicate keys found in questions.js');
}
