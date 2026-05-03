const XLSX = require('xlsx');
const workbook = XLSX.readFile('game_theo_chu_de.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, {header: 1});

const topicsFound = [];
let lastTopic = null;
const issues = [];

data.slice(1).forEach((row, idx) => {
    const topic = row[0];
    if (!topic) return;
    
    if (topic !== lastTopic) {
        if (topicsFound.includes(topic)) {
            issues.push(`Topic "${topic}" reappears at row ${idx + 2} (previously seen before row ${idx + 1})`);
        }
        topicsFound.push(topic);
        lastTopic = topic;
    }
});

console.log('Topics found in order of appearance:');
topicsFound.forEach((t, i) => console.log(`${i + 1}. ${t}`));

if (issues.length > 0) {
    console.log('\nIssues found:');
    issues.forEach(issue => console.log(issue));
} else {
    console.log('\nNo repeated topics (non-contiguous) found.');
}
