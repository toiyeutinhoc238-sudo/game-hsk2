const XLSX = require('xlsx');
const fs = require('fs');

// Read questions.js
const content = fs.readFileSync('js/questions.js', 'utf8');
const match = content.match(/const hsk2Vocab = (\{[\s\S]*?\});/);
const hsk2Vocab = eval('(' + match[1] + ')');

const allTopics = Object.keys(hsk2Vocab);
const filteredTopics = allTopics.filter(topic => hsk2Vocab[topic].length >= 9);

const rows = [
    ["Chủ đề", "Những từ vựng sử dụng", "Tên Trò chơi (Trên Web)", "Công cụ Tạo Game", "TV Phụ trách", "Loại GAME", "LINK SẢN PHẨM (BẮT BUỘC)", "Mục tiêu Sư phạm", "Gợi ý Ứng dụng", "Gợi ý Hoạt động"]
];

filteredTopics.forEach((topic, idx) => {
    // Get unique Chinese words for this topic
    const words = [...new Set(hsk2Vocab[topic].map(item => item.zh))];
    const vocabList = words.join('\r\n');
    
    rows.push([
        topic,
        vocabList,
        "Ai Là Triệu Phú HSK 2",
        "HTML, CSS, Javascript",
        "", // TV Phụ trách
        "Trắc nghiệm / Trò chơi truyền hình",
        `game.html?topic=chude${idx + 1}`,
        "Nhận diện Hán tự, Ghi nhớ nghĩa, Phản xạ từ vựng HSK 2",
        "Khởi động 5 phút đầu giờ; Bài tập về nhà; Ôn tập cuối chương",
        "Cá nhân, Chia đội thi đấu (Đội nào giành được nhiều tiền hơn), Giáo viên chiếu bảng lớp học"
    ]);
});

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(rows);

// Set column widths for better readability
ws['!cols'] = [
    { wch: 30 }, // A: Topic
    { wch: 50 }, // B: Vocab
    { wch: 25 }, // C: Game Name
    { wch: 20 }, // D: Tools
    { wch: 20 }, // E: PIC
    { wch: 30 }, // F: Type
    { wch: 30 }, // G: Link
    { wch: 50 }, // H: Objective
    { wch: 60 }, // I: Usage
    { wch: 60 }  // J: Interaction
];

XLSX.utils.book_append_sheet(wb, ws, "Game theo chủ đề");
XLSX.writeFile(wb, "game_theo_chu_de.xlsx");

console.log(`Successfully updated game_theo_chu_de.xlsx with ${filteredTopics.length} topics.`);
filteredTopics.forEach((t, i) => console.log(`${i+1}. ${t} (${hsk2Vocab[t].length} words)`));
