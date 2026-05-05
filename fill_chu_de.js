const xlsx = require('xlsx');

// Read game_theo_chu_de.xlsx
const wbGame = xlsx.readFile('game_theo_chu_de.xlsx');
const sheetGame = wbGame.Sheets[wbGame.SheetNames[0]];
const dataGame = xlsx.utils.sheet_to_json(sheetGame);

// We need to write to chu_de.xlsx
// Structure: 'Chủ đề', 'Từ vựng', 'Gợi ý tổ chức', 'Gợi ý hoạt động'

const commonGoiYToChuc = "Khởi động 5 phút đầu giờ; Bài tập về nhà; Ôn tập cuối chương";
const commonGoiYHoatDong = "Cá nhân, Chia đội thi đấu (Đội nào giành được nhiều tiền hơn), Giáo viên chiếu bảng lớp học";

const finalData = [];

for (const row of dataGame) {
    const topic = row['Chủ đề'];
    const wordsRaw = row['Những từ vựng sử dụng'];
    
    if (!topic || !wordsRaw) continue;

    // Split words by newline
    const wordsList = wordsRaw.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);
    
    // Format with numbers
    const wordsFormatted = wordsList.map((w, index) => `${index + 1}. ${w}`).join('\n');

    finalData.push({
        'Chủ đề': topic,
        'Từ vựng': wordsFormatted,
        'Gợi ý tổ chức': commonGoiYToChuc,
        'Gợi ý hoạt động': commonGoiYHoatDong
    });
}

// Write to chu_de.xlsx
const wbNew = xlsx.utils.book_new();
const sheetNew = xlsx.utils.json_to_sheet(finalData);
xlsx.utils.book_append_sheet(wbNew, sheetNew, 'Sheet1');
xlsx.writeFile(wbNew, 'chu_de.xlsx');
console.log('Successfully written ' + finalData.length + ' topics to chu_de.xlsx');
