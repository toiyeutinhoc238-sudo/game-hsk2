const XLSX = require('xlsx');
const workbook = XLSX.readFile('game_theo_chu_de.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = XLSX.utils.sheet_to_json(worksheet, {header: 1});

const standardTopics = [
    "Con người & Các mối quan hệ",
    "Cơ thể & Sức khỏe",
    "Cảm xúc & Thái độ",
    "Tư duy & Nhận thức",
    "Đời sống sinh hoạt",
    "Đồ vật & Công cụ",
    "Địa điểm & Nơi chốn",
    "Giao thông & Di chuyển",
    "Không gian & Vị trí",
    "Thời gian",
    "Công việc & Nghề nghiệp",
    "Miêu tả & Đánh giá",
    "Số lượng & Đo lường",
    "Công cụ ngữ pháp & Cấu trúc",
    "Tự nhiên",
    "Đồ ăn & Thức uống"
];

data.slice(1).forEach((row, idx) => {
    const topic = row[0];
    if (topic && !standardTopics.includes(topic)) {
        console.log(`Row ${idx + 2}: Unknown topic "${topic}"`);
    }
});
