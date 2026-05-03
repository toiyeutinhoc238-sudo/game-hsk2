const XLSX = require('xlsx');
const fs = require('fs');

const workbook = XLSX.readFile('ngan_hang_tu_vung.xlsx');
const sheet = workbook.Sheets[workbook.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, {header: 1});

// Create a temporary mapping to keep track of order and items
const tempVocab = {};
const topicOrder = [];

// Skip header
data.slice(1).forEach((row) => {
    // Column 3: ZH, Column 5: Pinyin, Column 6: Meaning, Column 7: Topics
    const zh = row[3];
    const pinyin = row[5];
    const meaning = row[6] ? row[6].toString().trim().replace(/\r\n/g, '; ').replace(/\n/g, '; ') : '';
    const topicsStr = row[7];

    if (!zh || !topicsStr) return;

    const topics = topicsStr.split(',').map(t => t.trim());
    
    topics.forEach(topic => {
        if (!tempVocab[topic]) {
            tempVocab[topic] = [];
            topicOrder.push(topic);
        }
        tempVocab[topic].push({
            zh: zh.toString().trim(),
            pinyin: pinyin ? pinyin.toString().trim() : '',
            meaning: meaning
        });
    });
});

// Sort topicOrder by their number prefix
topicOrder.sort((a, b) => {
    const numA = parseInt(a.match(/^\d+/));
    const numB = parseInt(b.match(/^\d+/));
    if (isNaN(numA) && isNaN(numB)) return a.localeCompare(b);
    if (isNaN(numA)) return 1;
    if (isNaN(numB)) return -1;
    return numA - numB;
});

const hsk2Vocab = {};
topicOrder.forEach(topic => {
    const cleanTopic = topic.replace(/^\d+\.\s*/, '');
    hsk2Vocab[cleanTopic] = tempVocab[topic];
});

const output = `const hsk2Vocab = ${JSON.stringify(hsk2Vocab, null, 4)};`;
fs.writeFileSync('js/questions.js', output);
console.log('Successfully updated js/questions.js');
console.log('Topics found:', topicOrder.length);
topicOrder.forEach(t => {
    const cleanT = t.replace(/^\d+\.\s*/, '');
    console.log(`- ${cleanT}: ${hsk2Vocab[cleanT].length} words`);
});
