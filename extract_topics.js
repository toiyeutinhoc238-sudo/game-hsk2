const XLSX = require('xlsx');
const workbook = XLSX.readFile('ngan_hang_tu_vung.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, {header: 1});

const topics = new Set();
data.slice(1).forEach(row => {
    const topicStr = row[7];
    if (topicStr) {
        topicStr.split(',').forEach(t => topics.add(t.trim()));
    }
});

console.log('Unique topics in Excel:');
Array.from(topics).sort().forEach(t => console.log(t));
