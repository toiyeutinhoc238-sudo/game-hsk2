const fs = require('fs');

const filepath = "c:/Users/BRAVO 15/Downloads/game tieng trung hsk 2/js/questions.js";

let content = fs.readFileSync(filepath, 'utf8');

const replacements = [
    ["['Right', 'Down', 'Left', 'Up']", "['右边', '下边', '左边', '上边']"],
    ["['Inside', 'Front', 'Outside', 'Back']", "['里面', '前面', '外面', '后面']"],
    ["['Sound', 'Question', 'Meaning', 'Event']", "['Âm thanh', 'Câu hỏi', 'Ý nghĩa', 'Sự việc']"],
    ["['Before', 'Now', 'After', 'Today']", "['Trước đây', 'Bây giờ', 'Sau này', 'Hôm nay']"],
    ["['所以', ' because', '但是', '虽然']", "['所以', '因为', '但是', '虽然']"],
    ["['So', 'Because', 'But', 'Still']", "['所以', '因为', '但是', '还是']"],
    ["他 because mỗi ngày đều chạy bộ cho nên sức khỏe tốt.", "因为他每天都跑步，所以身体很好。"],
    ["['Listen', 'Think', 'Tell', 'Answer']", "['Nghe', 'Nghĩ', 'Nói cho biết', 'Trả lời']"],
    ["['Object', 'Time', 'Matter/Event', 'Person']", "['Đồ vật', 'Thời gian', 'Sự việc', 'Con người']"],
    ["['White', 'Black', 'Blue', 'Green']", "['白', '黑', '蓝', '绿']"],
    ["['Cheap', 'High', 'Expensive', 'Many']", "['便宜', '高', '贵', '多']"],
    ["['Right', 'Wrong', 'Slow', 'Fast']", "['对', '错', '慢', '快']"],
    ["['Sing', 'Swim', 'Dance', 'Run']", "['Hát', 'Bơi', 'Khiêu vũ', 'Chạy bộ']"],
    ["['One time', 'First', 'One item', 'Together']", "['一次', '第一', '一件', '一起']"],
    ["['Hope', 'Prepare', 'Decide', 'Start']", "['Hy vọng', 'Chuẩn bị', 'Quyết định', 'Bắt đầu']"],
    ["['Bye', 'Thanks', 'Sorry', 'Welcome']", "['Tạm biệt', 'Cảm ơn', 'Xin lỗi', 'Hoan nghênh']"],
    ["['Off work', 'Work', 'Class', 'On work']", "['下班', '工作', '上课', '上班']"],
    ["['Know', 'Understand', 'Recognize', 'Think']", "['知道', '懂', '认识', '觉得']"],
    ["['Done/Finish', 'Start', 'Doing', 'Unfinished']", "['Xong/Hết', 'Bắt đầu', 'Đang làm', 'Chưa xong']"],
    ["['Homework', 'Lesson/Class', 'School', 'Teacher']", "['Bài tập', 'Bài học/Môn học', 'Trường học', 'Giáo viên']"],
    ["['Beef', 'Lamb', 'Egg', 'Rice']", "['牛肉', '羊肉', '鸡蛋', '米饭']"],
    ["['Apple', 'Watermelon', 'Fruit', 'Tea']", "['苹果', '西瓜', '水果', '茶']"],
    ["['Computer', 'TV', 'Phone', 'Mobile Phone']", "['电脑', '电视', '电话', '手机']"],
    ["['Listen', 'Dance', 'Sing', 'Read']", "['Nghe', 'Khiêu vũ', 'Hát', 'Đọc']"],
    ["['Girl', 'Boy', 'Old', 'Young']", "['女', '男', '老', '少']"],
    ["['Boy', 'Girl', 'Yin', 'Yang']", "['男', '女', '阴', '阳']"],
    ["['Adult', 'Parents', 'Child/Children', 'Student']", "['Người lớn', 'Bố mẹ', 'Trẻ em/Con cái', 'Học sinh']"],
    ["['Left', 'Right', 'Front', 'Back']", "['左边', '右边', '前面', '后面']"],
    ["['Expensive', 'Few', 'Cheap', 'Wrong']", "['贵', '少', '便宜', '错']"],
    ["['Listen', 'Speak/Talk', 'Story', 'Read']", "['Nghe', 'Nói chuyện', 'Câu chuyện', 'Đọc']"],
    ["['Tomorrow', 'This year', 'Next year', 'Last year']", "['明天', '今年', '明年', '去年']"],
    ["['Husband', 'Mom', 'Wife', 'Sister']", "['丈夫', '妈妈', '妻子', '姐姐']"],
    ["['Rain', 'Cloudy', 'Snow', 'Sunny']", "['雨', '阴', '雪', '晴']"],
    ["['One', 'Ten', 'Hundred', 'Zero']", "['一', '十', '百', '零']"],
    ["['Degree', 'Meter', 'KG', 'Hour']", "['Độ', 'Mét', 'Kg', 'Giờ']"],
    ["['Wash', 'Wear', 'Take off', 'Buy']", "['洗', '穿', '脱', '买']"],
    ["['Out', 'Back', 'Go', 'Enter']", "['出', '回', '走', '进']"],
    ["['Brother', 'Younger Brother', 'Sister', 'Older Sister']", "['哥哥', '弟弟', '妹妹', '姐姐']"],
    ["['Far', 'Near', 'Long', 'Short']", "['远', '近', '长', '短']"],
    ["['Leg', 'Eye', 'Hand', 'Mouth']", "['Chân', 'Mắt', 'Tay', 'Miệng']"],
    ["['Send', 'Give', 'Buy', 'Take/Hold']", "['送', '给', '买', '拿']"],
    ["['Newspaper', 'Pencil', 'Bag', 'Watch']", "['报纸', '铅笔', '书包', '手表']"],
    ["['School', 'Company', 'Class', 'Hospital']", "['Trường học', 'Công ty', 'Lớp học', 'Bệnh viện']"],
    ["['Grow', 'Born', 'Do', 'Play']", "['长', '生', '做', '玩']"],
    ["['Cry', 'Call', 'Ask', 'Smile/Laugh']", "['哭', '叫', '问', '笑']"],
    ["['Restaurant', 'Shop', 'Hotel', 'Hospital']", "['饭店', '商店', '宾馆', '医院']"],
    ["['Already', 'Very', 'Together', 'Straight']", "['已经', '非常', '一起', '一直']"],
    ["['From', 'Distance', 'Towards', 'Arrive']", "['从', '离', '往', '到']"],
    ["['Happy', 'Interesting', 'Not bad', 'Pretty']", "['快乐', '有意思', '不错', '漂亮']"],
    ["['So', 'Because', 'Although', 'But']", "['所以', '因为', '虽然', '但是']"],
    ["['Ítem', 'Piece', 'Time/Occurrence', 'Book']", "['件', '块', '次', '本']"],
    ["['Study', 'Rest', 'Play', 'Work']", "['Học', 'Nghỉ ngơi', 'Chơi', 'Làm việc']"],
    ["['Cloudy', 'Rainy', 'Snowy', 'Sunny']", "['阴', '雨', '雪', '晴']"],
    ["['TV', 'Computer', 'Movie', 'Phone']", "['电视', '电脑', '电影', '手机']"],
    ["['Last year', 'This year', 'Next year', 'New Year']", "['Năm ngoái', 'Năm nay', 'Sang năm', 'Năm mới']"],
    ["['Money', 'Ticket', 'Paper', 'News']", "['钱', '票', '纸', '报纸']"],
    ["['Airport', 'Bus station', 'Railway station', 'Metro station']", "['机场', '车站', '火车站', '地铁站']"],
    ["['Big Family', 'Everyone', 'Friends', 'Class']", "['Gia đình lớn', 'Mọi người', 'Bạn bè', 'Lớp học']"],
    ["['Most', 'Very', 'More/Even more', 'Too']", "['最', '很', '更', '太']"],
    ["['Sister', 'Younger Sister', 'Brother', 'Older Brother']", "['姐姐', '妹妹', '哥哥', '弟弟']"],
    ["['Sunny', 'Cloudy/Overcast', 'Rainy', 'Snowy']", "['晴', '阴', '雨', '雪']"]
];

for (const [oldStr, newStr] of replacements) {
    content = content.split(oldStr).join(newStr);
}

fs.writeFileSync(filepath, content, 'utf8');
console.log('Done replacing.');
