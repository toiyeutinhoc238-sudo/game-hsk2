const fs = require('fs');
const content = fs.readFileSync('js/questions.js', 'utf8');
const match = content.match(/const hsk2Questions = (\{[\s\S]*?\});/);
if (!match) process.exit(1);

const data = eval('(' + match[1] + ')');

let viToZh = {};
let zhToVi = {};

// Build dictionary
for (let k in data) {
    data[k].forEach(q => {
        const vMatch = q.vocab.match(/^([^\s]+)\s+\([^)]+\)\s+-\s+([^-]+?)(?:\s+-\s+|$)/);
        if (vMatch) {
            let zh = vMatch[1].trim();
            let viFull = vMatch[2].trim();
            
            viToZh[viFull.toLowerCase()] = zh;
            viFull.split(/[,/]/).forEach(v => {
                viToZh[v.trim().toLowerCase()] = zh;
            });
            zhToVi[zh] = viFull;
        }
    });
}

const manualFallbacks = {
    'đi làm': '上班',
    'thể thao': '运动',
    'nghỉ ngơi': '休息',
    'chơi bóng rổ': '打篮球',
    'chơi bóng bàn': '打乒乓球',
    'đánh cầu lông': '打羽毛球',
    'chơi bóng đá': '踢足球',
    'mũi': '鼻子',
    'mắt': '眼睛',
    'miệng': '嘴巴',
    'tay': '手',
    'nhất': '最',
    'rất': '很',
    'quá': '太',
    'cũng': '也',
    'một mình': '自己',
    'cùng nhau': '一起',
    'đều': '都',
    'chỉ': '只',
    'khỏe mạnh': '健康',
    'bị ốm': '生病',
    'ra viện': '出院',
    'làm việc': '工作',
    'đi bộ': '走路',
    'hiểu': '懂',
    'nhớ': '记',
    'biết': '知道',
    'nhìn': '看',
    'căn nhà': '房子',
    'lớp học': '教室',
    'phòng': '房间',
    'cửa hàng': '商店',
    'đồ vật': '东西',
    'quần áo': '衣服',
    'màu sắc': '颜色',
    'sức khỏe': '身体',
    'phía sau': '后面',
    'phía trước': '前面',
    'bên trong': '里面',
    'bên cạnh': '旁边',
    'vui vẻ': '快乐',
    'buồn bã': '难过',
    'tức giận': '生气',
    'xinh đẹp': '漂亮',
    'đang': '正在',
    'sẽ': '会',
    'mới': '新',
    'bắt đầu': '开始',
    'chuẩn bị': '准备',
    'kết thúc': '结束',
    'ôn tập': '复习',
    'âm thanh': '声音',
    'câu hỏi': '问题',
    'ý nghĩa': '意思',
    'sự việc': '事情',
    'trước đây': '以前',
    'bây giờ': '现在',
    'sau này': '以后',
    'hôm nay': '今天',
    'sai rồi': '错了',
    'khá tốt, tuyệt': '不错',
    'rất tệ': '很差',
    'bình thường': '一般',
    'cơm': '米饭',
    'bánh bao': '包子',
    'mì': '面条',
    'bánh mì': '面包',
    'kilogram': '公斤',
    'mét': '米',
    'lít': '升',
    'gram': '克',
    'ga tàu': '火车站',
    'bến xe': '车站',
    'sân bay': '机场',
    'công ty': '公司',
    'nghe': '听',
    'nghĩ': '想',
    'nói cho biết': '告诉',
    'trả lời': '回答',
    'thời gian': '时间',
    'con người': '人',
    'hát': '唱歌',
    'bơi': '游泳',
    'khiêu vũ': '跳舞',
    'chạy bộ': '跑步',
    'hy vọng': '希望',
    'quyết định': '决定',
    'tạm biệt': '再见',
    'cảm ơn': '谢谢',
    'xin lỗi': '对不起',
    'hoan nghênh': '欢迎',
    'xong/hết': '完',
    'đang làm': '在做',
    'chưa xong': '没完',
    'bài tập': '作业',
    'bài học/môn học': '课',
    'trường học': '学校',
    'giáo viên': '老师',
    'không': '不',
    'chưa': '没',
    'đừng': '别',
    'em trai': '弟弟',
    'anh trai': '哥哥',
    'chị gái': '姐姐',
    'bố': '爸爸',
    'đọc': '读',
    'người lớn': '大人',
    'bố mẹ': '父母',
    'trẻ em/con cái': '孩子',
    'học sinh': '学生',
    'nói chuyện': '说话',
    'câu chuyện': '故事',
    'kg': '公斤',
    'giờ': '小时',
    'chân': '脚',
    'bệnh viện': '医院',
    'học': '学习',
    'chơi': '玩儿',
    'hào': '号',
    'tiêu': '角',
    'rì (日)': '日',
    'nguyệt': '月',
    'năm ngoái': '去年',
    'năm nay': '今年',
    'sang năm': '明年',
    'năm mới': '新年',
    'gia đình lớn': '大家庭',
    'mọi người': '大家',
    'bạn bè': '朋友',
    'juéde': '觉得',
    'juédé': '决的',
    'jiào de': '叫的',
    'xuéde': '学的',
    'fēicháng': '非常',
    'fēichàng': '飞唱',
    'fēichang': '飞常',
    'fèicháng': '费常',
    'độ': '度',
    'đã': '已经',
    'khá tốt': '不错',
    'tuyệt': '不错'
};

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

for (let k in data) {
    data[k].forEach(q => {
        const vMatch = q.vocab.match(/^([^\s]+)\s+\([^)]+\)\s+-\s+([^-]+?)(?:\s+-\s+|$)/);
        let zhWord = '';
        let viMeaning = '';
        if (vMatch) {
            zhWord = vMatch[1].trim();
            viMeaning = vMatch[2].trim();
        }

        let newA = q.a.map(opt => {
            if (!/[a-zA-Z]/.test(opt) && !opt.includes(' ')) {
                if (['Đã', 'Độ'].includes(opt)) {
                    return manualFallbacks[opt.toLowerCase()] || opt;
                }
                return opt;
            }
            let lowerOpt = opt.toLowerCase();
            if (viToZh[lowerOpt]) return viToZh[lowerOpt];
            if (manualFallbacks[lowerOpt]) return manualFallbacks[lowerOpt];
            return opt;
        });
        
        q.a = newA;

        let newQ = q.q.replace(/\s*\([^)]+\)\s*/g, ' ');
        if (newQ.includes('Nghĩa của từ') || newQ.includes('có nghĩa là gì') || newQ.includes('Pinyin của')) {
            if (viMeaning) {
                let displayMeaning = capitalizeFirstLetter(viMeaning);
                newQ = `Từ "${displayMeaning}" trong tiếng Trung là gì?`;
            }
        }
        q.q = newQ.replace(/\s+/g, ' ').trim();
    });
}

let outputStr = 'const hsk2Questions = {\n';
for (let k in data) {
    outputStr += `    ${k}: [\n`;
    data[k].forEach((q, idx) => {
        let aStr = JSON.stringify(q.a).replace(/"/g, "'");
        let qStr = JSON.stringify(q.q).replace(/"/g, "'");
        let vStr = JSON.stringify(q.vocab).replace(/"/g, "'");
        outputStr += `        { q: ${qStr}, a: ${aStr}, correct: ${q.correct}, vocab: ${vStr} }${idx < data[k].length - 1 ? ',' : ''}\n`;
    });
    outputStr += `    ]${k < Object.keys(data).length ? ',' : ''}\n`;
}
outputStr += '};\n';

fs.writeFileSync('js/questions_new.js', outputStr);
console.log('Done');
