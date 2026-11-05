// 「ページに印を付ける」を押したときだけ、そのタブへ注入する（常駐しない）。
// 収録語に下線を引き、押すとその語を辞典（サイドパネル）で開く。印は「印を外す」で元の文字へ戻す。
// ページの文字は読むだけで、外へは送らない（押した語の見出しだけを拡張の中へ渡す）。
(function () {
	'use strict';
	if (window.__metataroMarker) return;

	var CLS = 'metataro-mark';
	var MAX = 20000; // 印の上限（極端に長いページで固まらないように）
	var SKIP = /^(SCRIPT|STYLE|NOSCRIPT|TEXTAREA|INPUT|SELECT|OPTION|BUTTON|SVG|MATH|IFRAME|CANVAS|VIDEO|AUDIO|MARK)$/;
	var WORD = /[A-Za-z]+(?:['’][A-Za-z]+)*/g;
	var listening = false;

	function onClick(e) {
		var m = e.target && e.target.closest ? e.target.closest('mark.' + CLS) : null;
		if (!m) return;
		// リンクの中の語でも、印を押したときは辞典を開く（ページは移動させない）
		e.preventDefault();
		e.stopPropagation();
		try { chrome.runtime.sendMessage({ type: 'open', w: m.getAttribute('data-w') }); } catch (err) { unmark(); }
	}

	function textNodes() {
		var out = [];
		if (!document.body) return out;
		var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
			acceptNode: function (n) {
				if (!n.nodeValue || !/[A-Za-z]/.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
				for (var p = n.parentNode; p && p !== document.body; p = p.parentNode) {
					if (p.nodeType !== 1) continue;
					if (SKIP.test(p.nodeName.toUpperCase()) || p.isContentEditable) return NodeFilter.FILTER_REJECT;
				}
				return NodeFilter.FILTER_ACCEPT;
			}
		});
		var n;
		while ((n = walker.nextNode())) out.push(n);
		return out;
	}

	// map: { 表記（小文字）: [見出し, 短い意味] }
	function mark(map) {
		unmark();
		var count = 0;
		var nodes = textNodes();
		for (var i = 0; i < nodes.length && count < MAX; i++) {
			var node = nodes[i], s = node.nodeValue, last = 0, m, frag = null;
			WORD.lastIndex = 0;
			while ((m = WORD.exec(s)) && count < MAX) {
				var key = m[0].toLowerCase().replace(/’/g, "'");
				var hit = Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;
				if (!hit || typeof hit[0] !== 'string') continue;
				if (!frag) frag = document.createDocumentFragment();
				if (m.index > last) frag.appendChild(document.createTextNode(s.slice(last, m.index)));
				var mk = document.createElement('mark');
				mk.className = CLS;
				mk.setAttribute('data-w', hit[0]);
				mk.title = hit[1] ? hit[0] + ' : ' + hit[1] : hit[0];
				mk.textContent = m[0];
				frag.appendChild(mk);
				last = WORD.lastIndex;
				count++;
			}
			if (frag) {
				if (last < s.length) frag.appendChild(document.createTextNode(s.slice(last)));
				node.parentNode.replaceChild(frag, node);
			}
		}
		if (count && !listening) { document.addEventListener('click', onClick, true); listening = true; }
		return count;
	}

	function unmark() {
		var marks = document.querySelectorAll('mark.' + CLS);
		var parents = new Set();
		marks.forEach(function (mk) {
			parents.add(mk.parentNode);
			mk.parentNode.replaceChild(document.createTextNode(mk.textContent), mk);
		});
		parents.forEach(function (p) { if (p && p.normalize) p.normalize(); });
		if (listening) { document.removeEventListener('click', onClick, true); listening = false; }
		return marks.length;
	}

	window.__metataroMarker = { mark: mark, unmark: unmark };
})();
