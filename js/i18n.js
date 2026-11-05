// chrome.i18n で文言を引く。拡張の外（ファイルを直接開いた時）は HTML に書いた日本語のまま表示する
function t(key, sub) {
	var s = (typeof chrome !== 'undefined' && chrome.i18n) ? chrome.i18n.getMessage(key, sub) : '';
	return s || key;
}
document.addEventListener('DOMContentLoaded', function () {
	var loc = t('@@ui_locale');
	if (loc !== '@@ui_locale') document.documentElement.lang = loc.replace('_', '-');
	// 絵に日本語が焼き込まれているので、日本語以外は文字を消した絵へ差し替えて HTML の文字を重ねる
	if (loc !== '@@ui_locale' && loc.indexOf('ja') !== 0) document.documentElement.classList.add('plain');
	document.querySelectorAll('[data-i18n]').forEach(function (el) {
		var s = t(el.getAttribute("data-i18n"));
		if (s !== el.getAttribute("data-i18n")) el.textContent = s;
	});
	document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
		var k = el.getAttribute("data-i18n-placeholder");
		var s = t(k);
		if (s !== k) el.placeholder = s;
	});
	document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
		var k = el.getAttribute("data-i18n-title");
		var s = t(k);
		if (s !== k) { el.title = s; el.setAttribute('aria-label', s); }
	});
	// 絵だけの見出しは、読み上げとマウスを乗せた時の名前を言語に合わせる
	document.querySelectorAll('[data-i18n-alt]').forEach(function (el) {
		var k = el.getAttribute("data-i18n-alt");
		var s = t(k);
		if (s !== k) { el.alt = s; el.title = s; }
	});
});
