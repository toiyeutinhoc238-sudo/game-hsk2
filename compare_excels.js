const XLSX = require('xlsx');

const wbOrig = XLSX.readFile('game_theo_chu_de.xlsx');
const wbFixed = XLSX.readFile('game_theo_chu_de_fixed.xlsx');

const dataOrig = XLSX.utils.sheet_to_json(wbOrig.Sheets[wbOrig.SheetNames[0]], {header: 1});
const dataFixed = XLSX.utils.sheet_to_json(wbFixed.Sheets[wbFixed.SheetNames[0]], {header: 1});

if (dataOrig.length !== dataFixed.length) {
    console.log(`Length mismatch: Orig ${dataOrig.length}, Fixed ${dataFixed.length}`);
}

for (let i = 0; i < Math.max(dataOrig.length, dataFixed.length); i++) {
    const rowO = dataOrig[i] || [];
    const rowF = dataFixed[i] || [];
    
    if (rowO[0] !== rowF[0] || rowO[1] !== rowF[1] || rowO[rowO.length-1] !== rowF[rowF.length-1]) {
        console.log(`Mismatch at row ${i + 1}:`);
        console.log(`  Orig: ${rowO[0]} | ${rowO[1]} | ${rowO[rowO.length-1]}`);
        console.log(`  Fixd: ${rowF[0]} | ${rowF[1]} | ${rowF[rowF.length-1]}`);
    }
}
