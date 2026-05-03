const XLSX = require('xlsx');
const workbook = XLSX.readFile('game_theo_chu_de.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, {header: 1});

const clean = (s) => s ? s.toString().trim().toLowerCase() : '';

const topicsFound = [];
let lastTopic = null;
const issues = [];

data.slice(1).forEach((row, idx) => {
    const topic = row[0];
    if (!topic) return;
    
    const cleanedTopic = clean(topic);
    
    if (cleanedTopic !== clean(lastTopic)) {
        if (topicsFound.includes(cleanedTopic)) {
            issues.push(`Topic "${topic}" (cleaned: "${cleanedTopic}") reappears at row ${idx + 2}`);
        }
        topicsFound.push(cleanedTopic);
        lastTopic = topic;
    }
});

console.log('Cleaned topics in order:');
topicsFound.forEach((t, i) => console.log(`${i + 1}. ${t}`));

if (issues.length > 0) {
    console.log('\nIssues found:');
    issues.forEach(issue => console.log(issue));
} else {
    console.log('\nNo repeated topics found.');
}
