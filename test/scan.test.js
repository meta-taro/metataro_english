// ページ読み込みの抽出ロジックの単体テスト（実データを使う）。実行: node --test test/scan.test.js
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Scan = require('../js/scan.js');

const DATA = path.join(__dirname, '..', 'data');
function json(rel) { return JSON.parse(fs.readFileSync(path.join(DATA, rel), 'utf8')); }

let idx;
test.before(() => {
	const wnPos = {};
	for (const b of 'abcdefghijklmnopqrstuvwxyz_') {
		const f = path.join(DATA, 'wn', b + '.json');
		if (!fs.existsSync(f)) continue;
		const m = JSON.parse(fs.readFileSync(f, 'utf8'));
		for (const k in m) wnPos[k] = m[k][0];
	}
	idx = Scan.buildIndex({ words: json('words.json'), exc: json('morph.json').exc, wnPos, idioms: json('idioms.json') });
});

function find(r, w) { return r.words.find((x) => x.w === w); }

test('変化形を原形に寄せて数える', () => {
	const r = Scan.extract('She went home. He goes to school. They studies hard and studied abroad. The children stopped.', idx);
	assert.strictEqual(find(r, 'go').n, 2);
	assert.deepStrictEqual(find(r, 'go').forms.sort(), ['goes', 'went']);
	assert.strictEqual(find(r, 'study').n, 2);
	assert.ok(find(r, 'child'));
	assert.ok(find(r, 'stop'));
	assert.ok(!find(r, 'went'));
});

test('WordNet の見出しにある語は崩さない', () => {
	assert.strictEqual(Scan.lemmaOf(idx, 'news'), 'news');
	assert.strictEqual(Scan.lemmaOf(idx, 'left'), 'left');
});

test('短縮形と所有格', () => {
	assert.strictEqual(Scan.lemmaOf(idx, "don't"), 'do');
	assert.strictEqual(Scan.lemmaOf(idx, "can't"), 'can');
	assert.strictEqual(Scan.lemmaOf(idx, "won't"), 'will');
	assert.strictEqual(Scan.lemmaOf(idx, 'students’'), 'student');
	assert.strictEqual(Scan.lemmaOf(idx, "teacher's"), 'teacher');
});

test('収録の無い語は数えない', () => {
	const r = Scan.extract('xyzzy qwrtp hello', idx);
	assert.strictEqual(r.unknown, 2);
	assert.deepStrictEqual(r.words.map((x) => x.w), ['hello']);
});

test('熟語は複数語の一致で拾い、変化形も原形で照合する', () => {
	const r = Scan.extract('This text is in the public domain. Two aircraft carriers sailed. They were in situ.', idx);
	const ps = r.idioms.map((x) => x.p);
	assert.ok(ps.includes('public domain'), ps.join(','));
	assert.ok(ps.includes('aircraft carrier'), ps.join(','));
	assert.ok(ps.includes('in situ'), ps.join(','));
});

test('句読点をまたいだ並びは熟語にしない', () => {
	const r = Scan.extract('It is public. Domain names are cheap.', idx);
	assert.ok(!r.idioms.some((x) => x.p === 'public domain'));
});

test('大文字を含む熟語は表記どおりのときだけ', () => {
	assert.ok(!Scan.extract('a level road', idx).idioms.some((x) => x.p === 'A level'));
	assert.ok(Scan.extract('She passed her A level exams', idx).idioms.some((x) => x.p === 'A level'));
});

test('頻度順に並ぶ', () => {
	const r = Scan.extract('apple apple apple banana banana cherry', idx);
	assert.deepStrictEqual(r.words.map((x) => x.w), ['apple', 'banana', 'cherry']);
});

test('Object の既定の名前でも落ちない', () => {
	for (const w of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) Scan.lemmaOf(idx, w);
	const r = Scan.extract('constructor toString valueOf hasOwnProperty', idx);
	assert.ok(Array.isArray(r.words));
});

test('PDF の断片をつなぎ、行末のハイフンを戻す', () => {
	const text = Scan.pdfText([
		[{ str: 'The inter', hasEOL: false }, { str: 'national stu-', hasEOL: true }, { str: 'dents went home.', hasEOL: true }],
		[{ width: 0 }, { str: 'Public domain', hasEOL: false }]
	]);
	assert.ok(text.includes('students went'), text);
	assert.ok(text.includes('\n\nPublic domain'), text);
	const r = Scan.extract(text, idx);
	assert.ok(find(r, 'student'));
	assert.ok(find(r, 'international'));
});

test('数万語の本文でも数百 ms 以内', () => {
	const words = json('words.json');
	const parts = [];
	for (let i = 0; i < 50000; i++) parts.push(words[(i * 7919) % words.length] + (i % 13 === 0 ? '. ' : ' '));
	const text = parts.join('');
	const fresh = Scan.buildIndex({ words, exc: json('morph.json').exc, wnPos: {}, idioms: json('idioms.json') });
	const t0 = Date.now();
	const r = Scan.extract(text, fresh);
	const ms = Date.now() - t0;
	assert.ok(r.tokens >= 50000);
	assert.ok(ms < 1000, ms + 'ms');
});
