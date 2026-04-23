const fs = require('fs');
const content = fs.readFileSync('js/questions.js', 'utf8');
const match = content.match(/const hsk2Questions = (\{[\s\S]*?\});/);
if (!match) process.exit(1);

const data = eval('(' + match[1] + ')');

let zhToVi = {};

// Build dictionary from vocab
for (let k in data) {
    data[k].forEach(q => {
        if (!q.vocab) return;
        const vMatch = q.vocab.match(/^([^\s]+)\s+\([^)]+\)\s+-\s+([^-]+?)(?:\s+-\s+|$)/);
        if (vMatch) {
            let zh = vMatch[1].trim();
            let viFull = vMatch[2].trim();
            zhToVi[zh] = viFull;
        }
    });
}

// Add manual fallbacks in case some words don't have vocab entries or just to be safe
const manualZhToVi = {
    '上班': 'đi làm',
    '运动': 'thể thao / tập thể dục',
    '休息': 'nghỉ ngơi',
    '打篮球': 'chơi bóng rổ',
    '打乒乓球': 'chơi bóng bàn',
    '打羽毛球': 'đánh cầu lông',
    '踢足球': 'chơi bóng đá',
    '鼻子': 'mũi',
    '眼睛': 'mắt',
    '嘴巴': 'miệng',
    '手': 'tay',
    '最': 'nhất',
    '很': 'rất',
    '太': 'quá',
    '也': 'cũng',
    '自己': 'một mình',
    '一起': 'cùng nhau',
    '都': 'đều',
    '只': 'chỉ',
    '健康': 'khỏe mạnh',
    '生病': 'bị bệnh, bị ốm',
    '出院': 'ra viện',
    '工作': 'làm việc',
    '走路': 'đi bộ',
    '走': 'đi bộ',
    '懂': 'hiểu',
    '记': 'nhớ',
    '知道': 'biết',
    '看': 'nhìn',
    '房子': 'căn nhà',
    '教室': 'lớp học',
    '房间': 'phòng',
    '商店': 'cửa hàng',
    '东西': 'đồ vật',
    '衣服': 'quần áo',
    '颜色': 'màu sắc',
    '身体': 'sức khỏe / cơ thể',
    '后面': 'phía sau',
    '前面': 'phía trước',
    '里面': 'bên trong',
    '外面': 'bên ngoài',
    '旁边': 'bên cạnh',
    '左边': 'bên trái',
    '右边': 'bên phải',
    '上边': 'bên trên',
    '下边': 'bên dưới',
    '快乐': 'vui vẻ',
    '难过': 'buồn bã',
    '生气': 'tức giận',
    '漂亮': 'xinh đẹp',
    '正在': 'đang',
    '会': 'sẽ / biết',
    '新': 'mới',
    '开始': 'bắt đầu',
    '准备': 'chuẩn bị',
    '结束': 'kết thúc',
    '复习': 'ôn tập',
    '声音': 'âm thanh',
    '问题': 'câu hỏi / vấn đề',
    '意思': 'ý nghĩa',
    '事情': 'sự việc',
    '以前': 'trước đây',
    '现在': 'bây giờ',
    '以后': 'sau này',
    '今天': 'hôm nay',
    '错了': 'sai rồi',
    '不错': 'khá tốt / tuyệt',
    '很差': 'rất tệ',
    '一般': 'bình thường',
    '米饭': 'cơm',
    '包子': 'bánh bao',
    '面条': 'mì',
    '面包': 'bánh mì',
    '公斤': 'kilogram',
    '米': 'mét',
    '升': 'lít',
    '克': 'gram',
    '火车站': 'ga tàu hỏa',
    '车站': 'bến xe',
    '机场': 'sân bay',
    '公司': 'công ty',
    '听': 'nghe',
    '想': 'nghĩ / muốn',
    '告诉': 'nói cho biết',
    '回答': 'trả lời',
    '时间': 'thời gian',
    '人': 'con người',
    '唱歌': 'hát',
    '游泳': 'bơi lội',
    '跳舞': 'nhảy, khiêu vũ',
    '跑步': 'chạy bộ',
    '希望': 'mong, hy vọng',
    '决定': 'quyết định',
    '再见': 'tạm biệt',
    '谢谢': 'cảm ơn',
    '对不起': 'xin lỗi',
    '欢迎': 'hoan nghênh',
    '完': 'xong, hết',
    '在做': 'đang làm',
    '没完': 'chưa xong',
    '作业': 'bài tập',
    '课': 'giờ học, môn, bài',
    '学校': 'trường học',
    '老师': 'giáo viên',
    '不': 'không',
    '没': 'chưa / không',
    '别': 'đừng',
    '弟弟': 'em trai',
    '哥哥': 'anh trai',
    '姐姐': 'chị gái',
    '妹妹': 'em gái',
    '爸爸': 'bố',
    '妈妈': 'mẹ',
    '读': 'đọc',
    '大人': 'người lớn',
    '父母': 'bố mẹ',
    '孩子': 'trẻ em, trẻ con',
    '学生': 'học sinh',
    '说话': 'nói chuyện',
    '故事': 'câu chuyện',
    '小时': 'giờ',
    '脚': 'chân',
    '医院': 'bệnh viện',
    '学习': 'học tập',
    '玩儿': 'chơi, chơi đùa',
    '号': 'ngày (hào)',
    '角': 'hào (tiền)',
    '日': 'ngày',
    '月': 'tháng',
    '去年': 'năm ngoái',
    '今年': 'năm nay',
    '明年': 'năm sau',
    '新年': 'năm mới',
    '大家庭': 'gia đình lớn',
    '大家': 'mọi người',
    '朋友': 'bạn bè',
    '觉得': 'cho rằng, nghĩ rằng',
    '决的': 'quyết định (sai)',
    '叫的': 'gọi là (sai)',
    '学的': 'học (sai)',
    '非常': 'rất, vô cùng',
    '飞唱': 'hát (sai)',
    '飞常': 'bay (sai)',
    '费常': 'phí (sai)',
    '度': 'độ',
    '已经': 'đã',
    '他': 'nó / anh ấy',
    '她': 'cô ấy',
    '它': 'nó',
    '您': 'ngài',
    '怎么': 'thế nào',
    '什么时候': 'khi nào',
    '为什么': 'tại sao',
    '什么': 'cái gì',
    '老': 'cũ / già',
    '贵': 'đắt',
    '睡觉': 'ngủ',
    '洗澡': 'tắm',
    '起床': 'thức dậy',
    '吃饭': 'ăn cơm',
    '散步': 'đi dạo',
    '药': 'thuốc',
    '草': 'cỏ',
    '茶': 'trà',
    '菜': 'rau / món ăn',
    '累': 'mệt',
    '忙': 'bận',
    '快': 'nhanh',
    '慢': 'chậm',
    '时候': 'lúc',
    '年': 'năm',
    '上午': 'buổi sáng',
    '早上': 'buổi sáng',
    '中午': 'buổi trưa',
    '晚上': 'buổi tối',
    '多': 'nhiều',
    '几': 'mấy',
    '少': 'ít',
    '每': 'mỗi',
    '手机': 'điện thoại di động',
    '电脑': 'máy tính',
    '手表': 'đồng hồ đeo tay',
    '电视': 'tivi',
    '报纸': 'tờ báo',
    '书本': 'sách vở',
    '汉语': 'tiếng Trung',
    '纸': 'giấy',
    '班': 'lớp',
    '丈夫': 'chồng',
    '妻子': 'vợ',
    '黑色': 'màu đen',
    '红色': 'màu đỏ',
    '白色': 'màu trắng',
    '粉色': 'màu hồng',
    '水': 'nước',
    '牛奶': 'sữa bò',
    '咖啡': 'cà phê',
    '十': 'mười',
    '百': 'trăm',
    '千': 'nghìn',
    '万': 'vạn',
    '节日': 'ngày lễ',
    '生日': 'sinh nhật',
    '明天': 'ngày mai',
    '昨天': 'hôm qua',
    '下午': 'buổi chiều',
    '介绍': 'giới thiệu',
    '帮助': 'giúp đỡ',
    '认识': 'quen biết',
    '让': 'để, bảo, nhường',
    '给': 'cho',
    '帮': 'giúp',
    '找': 'tìm, kiếm',
    '短': 'ngắn',
    '高': 'cao',
    '远': 'xa',
    '长': 'dài',
    '说': 'nói',
    '问': 'hỏi',
    '羊': 'dê / cừu',
    '牛': 'bò',
    '鱼': 'cá',
    '鸟': 'chim',
    '考试': 'bài kiểm tra, cuộc thi',
    '果汁': 'nước ép',
    '啤酒': 'bia',
    '个': 'cái (lượng từ)',
    '本': 'quyển (lượng từ)',
    '块': 'đồng (lượng từ)',
    '件': 'cái, chiếc (lượng từ)',
    '要': 'muốn / phải',
    '可以': 'có thể, tạm được',
    '汽车': 'ô tô',
    '自行车': 'xe đạp',
    '火车': 'tàu hỏa',
    '飞机': 'máy bay',
    '羊肉': 'thịt cừu',
    '猪肉': 'thịt lợn',
    '牛肉': 'thịt bò',
    '鸡肉': 'thịt gà',
    '所以': 'cho nên',
    '因为': 'bởi vì',
    '但是': 'nhưng',
    '虽然': 'mặc dù',
    '还是': 'hay là / vẫn',
    '一直': 'liên tục / thẳng',
    '经常': 'thường xuyên',
    '离': 'cách',
    '从': 'từ',
    '到': 'đến',
    '近': 'gần',
    '出租车': 'taxi',
    '公共汽车': 'xe buýt',
    '分钟': 'phút',
    '对': 'đúng',
    '来': 'đến',
    '去': 'đi',
    '还': 'còn / vẫn',
    '再': 'lại, hãy',
    '就': 'thì / liền',
    '买': 'mua',
    '卖': 'bán',
    '送': 'tặng / tiễn',
    '服务员': 'nhân viên phục vụ',
    '医生': 'bác sĩ',
    '黑': 'đen',
    '红': 'đỏ',
    '白': 'trắng',
    '粉': 'hồng',
    '蓝': 'xanh lam',
    '绿': 'xanh lá',
    '便宜': 'rẻ',
    '错': 'sai',
    '一次': 'một lần',
    '第一': 'thứ nhất, đầu tiên',
    '一件': 'một chiếc',
    '题': 'câu hỏi',
    '下班': 'tan làm',
    '上课': 'lên lớp',
    '鸡蛋': 'trứng gà',
    '西瓜': 'dưa hấu',
    '水果': 'hoa quả',
    '电话': 'điện thoại',
    '洗': 'giặt, rửa',
    '穿': 'mặc, mang',
    '女': 'nữ',
    '男': 'nam',
    '老': 'già',
    '少': 'trẻ / ít',
    '阴': 'âm / râm',
    '阳': 'dương',
    '比': 'hơn, so với',
    '可能': 'có thể, có lẽ',
    '的': 'của (trợ từ)',
    '得': 'được (trợ từ)',
    '地': 'mà (trợ từ)',
    '了': 'rồi (trợ từ)',
    '雪': 'tuyết',
    '雨': 'mưa',
    '晴': 'nắng',
    '零': 'không (số 0)',
    '一': 'một',
    '脱': 'cởi',
    '出': 'ra',
    '回': 'về',
    '进': 'vào',
    '过': 'qua (trợ từ)',
    '着': 'đang (trợ từ)',
    '呢': 'nhỉ / nhé (trợ từ)',
    '拿': 'cầm, lấy',
    '铅笔': 'bút chì',
    '书包': 'cặp sách',
    '生': 'sinh',
    '做': 'làm',
    '玩': 'chơi',
    '哭': 'khóc',
    '叫': 'kêu / gọi',
    '笑': 'cười',
    '宾馆': 'khách sạn',
    '往': 'về phía, hướng về',
    '有意思': 'thú vị, hấp dẫn',
    '次': 'lần',
    '票': 'vé',
    '纸': 'giấy',
    '大家庭': 'đại gia đình',
    '大家': 'mọi người',
    '朋友': 'bạn bè',
    '更': 'càng, hơn nữa',
    // Sentences shouldn't be mapped word for word if they are in q.a, but the sentences in q.a are only for Vietnamese -> Chinese questions, so they won't be translated.
};

Object.assign(zhToVi, manualZhToVi);

function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

const hasChinese = (str) => /[\u4e00-\u9fa5]/.test(str);

for (let k in data) {
    data[k].forEach(q => {
        let qHasChinese = hasChinese(q.q);
        
        const vMatch = q.vocab ? q.vocab.match(/^([^\s]+)\s+\([^)]+\)\s+-\s+([^-]+?)(?:\s+-\s+|$)/) : null;
        let zhWord = '';
        let viMeaning = '';
        if (vMatch) {
            zhWord = vMatch[1].trim();
            viMeaning = capitalize(vMatch[2].trim());
        }

        if (qHasChinese) {
            // Question asks for Vietnamese meaning (Chinese -> Vietnamese)
            // Options in q.a should be Vietnamese.
            // Currently they are Chinese. We need to map them back.
            let newA = [];
            for (let i = 0; i < q.a.length; i++) {
                let opt = q.a[i];
                // If it's already NOT Chinese, leave it
                if (!hasChinese(opt)) {
                    newA.push(opt);
                    continue;
                }
                
                if (i === q.correct && viMeaning) {
                    newA.push(viMeaning);
                } else {
                    let viOpt = zhToVi[opt];
                    if (viOpt) {
                        newA.push(capitalize(viOpt));
                    } else {
                        // If we can't find a translation, just keep it, but this shouldn't happen.
                        newA.push(opt + " (untranslated)");
                    }
                }
            }
            q.a = newA;
        } else {
            // Question asks for Chinese translation (Vietnamese -> Chinese)
            // Options in q.a should be Chinese.
            // They are already Chinese, but let's make sure the correct option exactly matches vocab if it's a single word.
            if (vMatch && q.a[q.correct].length <= 5 && !q.a[q.correct].includes('...')) {
                 q.a[q.correct] = zhWord;
            }
        }
    });
}

let outputStr = 'const hsk2Questions = {\n';
for (let k in data) {
    outputStr += `    ${k}: [\n`;
    data[k].forEach((q, idx) => {
        let aStr = JSON.stringify(q.a).replace(/"/g, "'");
        let qStr = JSON.stringify(q.q).replace(/"/g, "'");
        let vStr = q.vocab ? JSON.stringify(q.vocab).replace(/"/g, "'") : "''";
        outputStr += `        { q: ${qStr}, a: ${aStr}, correct: ${q.correct}, vocab: ${vStr} }${idx < data[k].length - 1 ? ',' : ''}\n`;
    });
    outputStr += `    ]${k < Object.keys(data).length ? ',' : ''}\n`;
}
outputStr += '};\n';

fs.writeFileSync('js/questions.js', outputStr);
console.log('Done mapping answers.');
