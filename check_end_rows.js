const XLSX = require('xlsx');
const workbook = XLSX.readFile('game_theo_chu_de.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

console.log('Total rows:', data.length);
data.forEach((row, idx) => {
    if (idx > 310) {
        console.log(`Row ${idx + 1}: ${JSON.stringify(row)}`);
    }
});
