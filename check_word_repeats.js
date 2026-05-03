const fs = require('fs');
const content = fs.readFileSync('js/questions.js', 'utf8');
const match = content.match(/const hsk2Vocab = (\{[\s\S]*?\});/);
if (!match) {
    console.log('Could not find hsk2Vocab');
    process.exit(1);
}

const hsk2Vocab = eval('(' + match[1] + ')');

const wordToTopics = {};
for (let topic in hsk2Vocab) {
    hsk2Vocab[topic].forEach(item => {
        const word = item.zh;
        if (!wordToTopics[word]) wordToTopics[word] = [];
        wordToTopics[word].push(topic);
    });
}

console.log('Words in multiple topics:');
for (let word in wordToTopics) {
    if (wordToTopics[word].length > 1) {
        console.log(`${word}: ${wordToTopics[word].join(', ')}`);
    }
}
