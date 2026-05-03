const XLSX = require('xlsx');
const workbook = XLSX.readFile('game_theo_chu_de.xlsx');
console.log('Sheet Names:', workbook.SheetNames);
