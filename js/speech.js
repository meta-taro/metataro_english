// 読み上げ。ブラウザに入っている音声合成（speechSynthesis）だけを使い、通信はしない。
// 設定（アメリカ英語／イギリス英語・ゆっくり）は Store から受け取る。
var Speech = (function () {
	'use strict';
	var opt = { accent: 'us', slow: false };
	var ok = typeof speechSynthesis !== 'undefined';

	function voices() { return ok ? speechSynthesis.getVoices() : []; }
	function lang() { return opt.accent === 'uk' ? 'en-GB' : 'en-US'; }
	function pick() {
		var vs = voices(), want = lang().toLowerCase();
		var exact = vs.filter(function (v) { return v.lang.replace('_', '-').toLowerCase() === want; });
		if (exact.length) return exact.filter(function (v) { return v.localService; })[0] || exact[0];
		var en = vs.filter(function (v) { return /^en/i.test(v.lang); });
		return en.filter(function (v) { return v.localService; })[0] || en[0] || null;
	}
	// 'none'：英語の声が無い／'other'：選んだ地域の声が無く別の英語で読む／'ok'
	function status() {
		var vs = voices();
		if (!ok || !vs.some(function (v) { return /^en/i.test(v.lang); })) return 'none';
		var want = lang().toLowerCase();
		return vs.some(function (v) { return v.lang.replace('_', '-').toLowerCase() === want; }) ? 'ok' : 'other';
	}
	function say(text) {
		if (!ok || !text) return;
		speechSynthesis.cancel();
		var u = new SpeechSynthesisUtterance(String(text));
		u.lang = lang();
		var v = pick();
		if (v) u.voice = v;
		u.rate = opt.slow ? 0.7 : 1;
		speechSynthesis.speak(u);
	}
	function set(o) { if (o) { if (o.accent) opt.accent = o.accent; if ('slow' in o) opt.slow = !!o.slow; } }
	// 声の一覧は後から届くことがある
	function ready(cb) {
		if (!ok) return cb();
		if (voices().length) return cb();
		var done = false;
		speechSynthesis.addEventListener('voiceschanged', function () { if (!done) { done = true; cb(); } });
		setTimeout(function () { if (!done) { done = true; cb(); } }, 1500);
	}
	return { say: say, set: set, status: status, ready: ready, lang: lang };
})();
