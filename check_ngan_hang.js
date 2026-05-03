const XLSX = require('xlsx');
const workbook = XLSX.readFile('ngan_hang_tu_vung.xlsx');
console.log('Sheet Names in ngan_hang_tu_vung:', workbook.SheetNames);
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, {header: 1});

const topicsFound = [];
data.slice(1).forEach(row => {
    const topic = row[0];
    if (topic && !topicsFound.includes(topic)) {
        topicsFound.push(topic);
    }
});

console.log('Topics in ngan_hang_tu_vung:');
topicsFound.forEach((t, i) => console.log(`${i + 1}. ${t}`));
