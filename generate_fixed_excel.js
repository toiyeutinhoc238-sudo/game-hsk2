const XLSX = require('xlsx');
const fs = require('fs');

const content = fs.readFileSync('js/questions.js', 'utf8');
const match = content.match(/const hsk2Vocab = (\{[\s\S]*?\});/);
const hsk2Vocab = eval('(' + match[1] + ')');

const topics = Object.keys(hsk2Vocab);
const rows = [
    ["Chủ đề", "Những từ vựng sử dụng", "Tên trò chơi", "Công nghệ sử dụng", "Dạng trò chơi", "Mục tiêu sư phạm", "Cách thức sử dụng", "Tương tác", "LINK SẢN PHẨM (BẮT BUỘC)"]
];

const merges = [];
let currentRow = 1; // 0-indexed for XLSX merges, but header is at row 0

topics.forEach((topic, index) => {
    const vocab = hsk2Vocab[topic];
    const startRow = currentRow;
    
    vocab.forEach(item => {
        rows.push([
            topic,
            item.zh,
            "Ai Là Triệu Phú HSK 2",
            "HTML, CSS, Javascript",
            "Trắc nghiệm / Trò chơi truyền hình",
            "Nhận diện Hán tự, Ghi nhớ nghĩa, Phản xạ từ vựng HSK 2",
            "Khởi động 5 phút đầu giờ; Bài tập về nhà; Ôn tập cuối chương",
            "Cá nhân, Chia đội thi đấu (Đội nào giành được nhiều tiền hơn), Giáo viên chiếu bảng lớp học",
            `game.html?topic=chude${index + 1}`
        ]);
        currentRow++;
    });

    const endRow = currentRow - 1;

    // Merge columns A, C, D, E, F, G, H, I (0, 2, 3, 4, 5, 6, 7, 8)
    [0, 2, 3, 4, 5, 6, 7, 8].forEach(colIdx => {
        merges.push({
            s: { r: startRow, c: colIdx },
            e: { r: endRow, c: colIdx }
        });
    });
});

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);
ws['!merges'] = merges;

// Optional: Add some basic styling/formatting if possible (xlsx-style is usually needed for colors, but basic alignment might work)
// For now, standard xlsx just does content.

XLSX.utils.book_append_sheet(wb, ws, "Game theo chủ đề");
XLSX.writeFile(wb, "game_theo_chu_de.xlsx");

console.log('Synchronized and Merged Excel file generated: game_theo_chu_de.xlsx');
console.log('Total rows:', rows.length);
console.log('Total merges:', merges.length);
