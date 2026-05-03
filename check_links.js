const XLSX = require('xlsx');
const workbook = XLSX.readFile('game_theo_chu_de.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, {header: 1});

const topicsFound = [];
data.slice(1).forEach((row, idx) => {
    const topic = row[0];
    const link = row[row.length - 1];
    if (!topic) return;
    
    if (!topicsFound.find(t => t.name === topic)) {
        topicsFound.push({ name: topic, link: link, firstRow: idx + 2 });
    } else {
        const existing = topicsFound.find(t => t.name === topic);
        if (existing.link !== link) {
            console.log(`Mismatch for topic "${topic}" at row ${idx + 2}: Link is ${link}, but was ${existing.link} at row ${existing.firstRow}`);
        }
    }
});

console.log('Unique topics and their links:');
topicsFound.forEach((t, i) => {
    console.log(`${i + 1}. ${t.name} -> ${t.link}`);
});
