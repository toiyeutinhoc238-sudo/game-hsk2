import re

filepath = r"c:\Users\BRAVO 15\Downloads\game tieng trung hsk 2\js\questions.js"

with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

replacements = [
    (r"\['Right', 'Down', 'Left', 'Up'\]", "['右边', '下边', '左边', '上边']"),
    (r"\['Inside', 'Front', 'Outside', 'Back'\]", "['里面', '前面', '外面', '后面']"),
    (r"\['Sound', 'Question', 'Meaning', 'Event'\]", "['Âm thanh', 'Câu hỏi', 'Ý nghĩa', 'Sự việc']"),
    (r"\['Before', 'Now', 'After', 'Today'\]", "['Trước đây', 'Bây giờ', 'Sau này', 'Hôm nay']"),
    (r"\['所以', ' because', '但是', '虽然'\]", "['所以', '因为', '但是', '虽然']"),
    (r"\['So', 'Because', 'But', 'Still'\]", "['所以', '因为', '但是', '还是']"),
    (r"他 because mỗi ngày đều chạy bộ cho nên sức khỏe tốt.", "因为他每天都跑步，所以身体很好。"),
    (r"\['Listen', 'Think', 'Tell', 'Answer'\]", "['Nghe', 'Nghĩ', 'Nói cho biết', 'Trả lời']"),
    (r"\['Object', 'Time', 'Matter/Event', 'Person'\]", "['Đồ vật', 'Thời gian', 'Sự việc', 'Con người']"),
    (r"\['White', 'Black', 'Blue', 'Green'\]", "['白', '黑', '蓝', '绿']"),
    (r"\['Cheap', 'High', 'Expensive', 'Many'\]", "['便宜', '高', '贵', '多']"),
    (r"\['Right', 'Wrong', 'Slow', 'Fast'\]", "['对', '错', '慢', '快']"),
    (r"\['Sing', 'Swim', 'Dance', 'Run'\]", "['Hát', 'Bơi', 'Khiêu vũ', 'Chạy bộ']"),
    (r"\['One time', 'First', 'One item', 'Together'\]", "['一次', '第一', '一件', '一起']"),
    (r"\['Hope', 'Prepare', 'Decide', 'Start'\]", "['Hy vọng', 'Chuẩn bị', 'Quyết định', 'Bắt đầu']"),
    (r"\['Bye', 'Thanks', 'Sorry', 'Welcome'\]", "['Tạm biệt', 'Cảm ơn', 'Xin lỗi', 'Hoan nghênh']"),
    (r"\['Off work', 'Work', 'Class', 'On work'\]", "['下班', '工作', '上课', '上班']"),
    (r"\['Know', 'Understand', 'Recognize', 'Think'\]", "['知道', '懂', '认识', '觉得']"),
    (r"\['Done/Finish', 'Start', 'Doing', 'Unfinished'\]", "['Xong/Hết', 'Bắt đầu', 'Đang làm', 'Chưa xong']"),
    (r"\['Homework', 'Lesson/Class', 'School', 'Teacher'\]", "['Bài tập', 'Bài học/Môn học', 'Trường học', 'Giáo viên']"),
    (r"\['Beef', 'Lamb', 'Egg', 'Rice'\]", "['牛肉', '羊肉', '鸡蛋', '米饭']"),
    (r"\['Apple', 'Watermelon', 'Fruit', 'Tea'\]", "['苹果', '西瓜', '水果', '茶']"),
    (r"\['Computer', 'TV', 'Phone', 'Mobile Phone'\]", "['电脑', '电视', '电话', '手机']"),
    (r"\['Listen', 'Dance', 'Sing', 'Read'\]", "['Nghe', 'Khiêu vũ', 'Hát', 'Đọc']"),
    (r"\['Girl', 'Boy', 'Old', 'Young'\]", "['女', '男', '老', '少']"),
    (r"\['Boy', 'Girl', 'Yin', 'Yang'\]", "['男', '女', '阴', '阳']"),
    (r"\['Adult', 'Parents', 'Child/Children', 'Student'\]", "['Người lớn', 'Bố mẹ', 'Trẻ em/Con cái', 'Học sinh']"),
    (r"\['Left', 'Right', 'Front', 'Back'\]", "['左边', '右边', '前面', '后面']"),
    (r"\['Expensive', 'Few', 'Cheap', 'Wrong'\]", "['贵', '少', '便宜', '错']"),
    (r"\['Listen', 'Speak/Talk', 'Story', 'Read'\]", "['Nghe', 'Nói chuyện', 'Câu chuyện', 'Đọc']"),
    (r"\['Tomorrow', 'This year', 'Next year', 'Last year'\]", "['明天', '今年', '明年', '去年']"),
    (r"\['Husband', 'Mom', 'Wife', 'Sister'\]", "['丈夫', '妈妈', '妻子', '姐姐']"),
    (r"\['Rain', 'Cloudy', 'Snow', 'Sunny'\]", "['雨', '阴', '雪', '晴']"),
    (r"\['One', 'Ten', 'Hundred', 'Zero'\]", "['一', '十', '百', '零']"),
    (r"\['Degree', 'Meter', 'KG', 'Hour'\]", "['Độ', 'Mét', 'Kg', 'Giờ']"),
    (r"\['Wash', 'Wear', 'Take off', 'Buy'\]", "['洗', '穿', '脱', '买']"),
    (r"\['Out', 'Back', 'Go', 'Enter'\]", "['出', '回', '走', '进']"),
    (r"\['Brother', 'Younger Brother', 'Sister', 'Older Sister'\]", "['哥哥', '弟弟', '妹妹', '姐姐']"),
    (r"\['Far', 'Near', 'Long', 'Short'\]", "['远', '近', '长', '短']"),
    (r"\['Leg', 'Eye', 'Hand', 'Mouth'\]", "['Chân', 'Mắt', 'Tay', 'Miệng']"),
    (r"\['Send', 'Give', 'Buy', 'Take/Hold'\]", "['送', '给', '买', '拿']"),
    (r"\['Newspaper', 'Pencil', 'Bag', 'Watch'\]", "['报纸', '铅笔', '书包', '手表']"),
    (r"\['School', 'Company', 'Class', 'Hospital'\]", "['Trường học', 'Công ty', 'Lớp học', 'Bệnh viện']"),
    (r"\['Grow', 'Born', 'Do', 'Play'\]", "['长', '生', '做', '玩']"),
    (r"\['Cry', 'Call', 'Ask', 'Smile/Laugh'\]", "['哭', '叫', '问', '笑']"),
    (r"\['Restaurant', 'Shop', 'Hotel', 'Hospital'\]", "['饭店', '商店', '宾馆', '医院']"),
    (r"\['Already', 'Very', 'Together', 'Straight'\]", "['已经', '非常', '一起', '一直']"),
    (r"\['From', 'Distance', 'Towards', 'Arrive'\]", "['从', '离', '往', '到']"),
    (r"\['Happy', 'Interesting', 'Not bad', 'Pretty'\]", "['快乐', '有意思', '不错', '漂亮']"),
    (r"\['So', 'Because', 'Although', 'But'\]", "['所以', '因为', '虽然', '但是']"),
    (r"\['Ítem', 'Piece', 'Time/Occurrence', 'Book'\]", "['件', '块', '次', '本']"),
    (r"\['Study', 'Rest', 'Play', 'Work'\]", "['Học', 'Nghỉ ngơi', 'Chơi', 'Làm việc']"),
    (r"\['Cloudy', 'Rainy', 'Snowy', 'Sunny'\]", "['阴', '雨', '雪', '晴']"),
    (r"\['TV', 'Computer', 'Movie', 'Phone'\]", "['电视', '电脑', '电影', '手机']"),
    (r"\['Last year', 'This year', 'Next year', 'New Year'\]", "['Năm ngoái', 'Năm nay', 'Sang năm', 'Năm mới']"),
    (r"\['Money', 'Ticket', 'Paper', 'News'\]", "['钱', '票', '纸', '报纸']"),
    (r"\['Airport', 'Bus station', 'Railway station', 'Metro station'\]", "['机场', '车站', '火车站', '地铁站']"),
    (r"\['Big Family', 'Everyone', 'Friends', 'Class'\]", "['Gia đình lớn', 'Mọi người', 'Bạn bè', 'Lớp học']"),
    (r"\['Most', 'Very', 'More/Even more', 'Too'\]", "['最', '很', '更', '太']"),
    (r"\['Sister', 'Younger Sister', 'Brother', 'Older Brother'\]", "['姐姐', '妹妹', '哥哥', '弟弟']"),
    (r"\['Sunny', 'Cloudy/Overcast', 'Rainy', 'Snowy'\]", "['晴', '阴', '雨', '雪']")
]

for old, new in replacements:
    content = re.sub(old, new, content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)

print("Done replacing.")
