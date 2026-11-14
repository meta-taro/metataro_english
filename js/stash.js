// 拡張の画面どうしで、読み込んだ PDF を受け渡す（「ページ」タブ → 印付きの PDF 画面）。
// 置き場所は拡張の中の IndexedDB で、外へは送らない。最後に開いた 1 件だけを持つ（開き直しにも使う）。
(function () {
	'use strict';
	var DB = 'metataro-stash', STORE = 'pdf', KEY = 'last';
	function open() {
		return new Promise(function (resolve, reject) {
			var req = indexedDB.open(DB, 1);
			req.onupgradeneeded = function () { req.result.createObjectStore(STORE); };
			req.onsuccess = function () { resolve(req.result); };
			req.onerror = function () { reject(req.error); };
		});
	}
	function run(mode, fn) {
		return open().then(function (db) {
			return new Promise(function (resolve, reject) {
				var tx = db.transaction(STORE, mode);
				var req = fn(tx.objectStore(STORE));
				tx.oncomplete = function () { db.close(); resolve(req.result); };
				tx.onerror = tx.onabort = function () { db.close(); reject(tx.error); };
			});
		});
	}
	window.PdfStash = {
		// rec: { blob, name, map }
		put: function (rec) { return run('readwrite', function (s) { return s.put(rec, KEY); }); },
		get: function () { return run('readonly', function (s) { return s.get(KEY); }); }
	};
})();
