const XLSX = require('xlsx');
const workbook = XLSX.readFile('game_theo_chu_de.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, {header: 1});

const topicStats = {};

data.slice(1).forEach((row, idx) => {
    const topic = row[0];
    if (!topic) return;
    
    if (!topicStats[topic]) {
        topicStats[topic] = { first: idx + 2, last: idx + 2, count: 0 };
    }
    topicStats[topic].last = idx + 2;
    topicStats[topic].count++;
});

console.log('Topic Statistics in Excel:');
for (let t in topicStats) {
    console.log(`${t}: First Row: ${topicStats[t].first}, Last Row: ${topicStats[t].last}, Count: ${topicStats[t].count}`);
}
