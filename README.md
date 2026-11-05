# めたたろ英語辞典（Chrome 拡張）

![caver](https://user-images.githubusercontent.com/3032390/148529368-369cbe98-498a-4d1f-a7b4-199430866ff9.png)

ブラウザで読んでいる英語を、その場で引ける英和辞典です。辞書データはすべて拡張の中に入っているので、
引くたびに外部へ通信しません。不規則動詞の表は、これまでどおりタブの 1 つとして残しています。

## できること

- **右クリックで引く**：ページ上の単語を選んで右クリック →「「単語」を辞典で引く」。小さな窓で開きます
- **元の形に戻して引く**：`went` → go、`studies` → study、`better` → good / well
- **検索欄**：前方一致の候補、つづりの近い語の提案（`aple` → apple ほか）、熟語、日本語からの簡易検索
- **紙の辞書ふうの表示**：発音記号・英検の級の目安・品詞ごとの意味・熟語・例文・関連語
- **重要語の解説**：高校〜大学入試レベルの語について、コアイメージ・場面別の例文・コロケーション・
  類義語との違い・よくある間違い・語源・入試での問われ方（**解説・例文の一部は AI が作成**）
- **読み上げ**：アメリカ英語／イギリス英語、ゆっくり（0.7 倍）。Space または P で見出し語を読みます
- **単語帳・検索履歴（20 件）**・小テスト・意味を隠すモード
- **画面の言語**：日本語ほか 10 言語。**辞書の意味は、どの言語でも日本語です**

## 権限

| 権限 | 理由 |
|---|---|
| `contextMenus` | 右クリックメニューから引くため |
| `storage` | 検索履歴・単語帳・設定（読み上げの地域・速さ）を手元に保存するため |

読み上げはブラウザに入っている音声合成（speechSynthesis）を使うので、権限は要りません。
ページの中身を読む権限（`activeTab` / `scripting` / host 権限）は使っていません。

## 収録データ

| データ | 中身 | 件数 | ライセンス |
|---|---|---|---|
| [EJDict-hand](https://github.com/kujirahand/EJDict) | 英和辞書の本文 | 47,028 項目 | Public Domain（CC0） |
| [CMU Pronouncing Dictionary](https://github.com/cmusphinx/cmudict) | 発音記号（ARPAbet を IPA へ変換） | 26,756 項目に付与 | BSD 形式 |
| [WordNet 3.1](https://wordnet.princeton.edu/) | 品詞・類義語・反意語・派生語・不規則変化 | 40,098 語 | WordNet 3.1 License |
| [Tatoeba](https://tatoeba.org/) | 英日の例文（短い文を選んで収録） | 46,418 文 / 13,593 語 | CC BY 2.0 FR |
| [CEFR-J Wordlist 1.5 / Octanove Vocabulary Profile C1/C2 1.0](https://github.com/openlanguageprofiles/olp-en-cefrj) | 英検の級の目安（CEFR の段階から割り当て） | 7,436 語 | CC BY-SA 4.0 |
| AI による解説 | 重要語の解説と例文の一部 | 1142 語（順次追加） | MIT（この拡張の一部） |

- ライセンスの全文と変更点は [NOTICE](NOTICE) にあります
- 英検の級は**目安**です。英検が公式に示した語彙表ではありません
- 日本語からの検索は、英和辞書の訳語から逆に引いた簡易的なもので、和英辞典ではありません
- データは頭文字ごとに分けたファイル（`data/dict/a.json` など）で、必要になった分だけ読み込みます

## 構成

```
manifest.json        Manifest V3（権限は contextMenus と storage のみ）
background.js        右クリックメニュー → 小窓を開く
popup.html           画面
js/popup.js          辞書画面（検索・表示・単語帳・小テスト）
js/dict.js           データの読み込み（頭文字ごとに遅延読み込み）
js/lemma.js          変化形を元の形に戻す（WordNet の規則と例外表）
js/speech.js         読み上げ
js/store.js          履歴・単語帳・設定の保存
js/verbs.js, app.js  不規則動詞の表
data/                辞書データ（上の表を参照）
_locales/            画面の 10 言語
```

## インストール（開発版）

1. `chrome://extensions` を開き、右上の「デベロッパーモード」をオンにする
2. 「パッケージ化されていない拡張機能を読み込む」でこのフォルダを選ぶ

## ライセンス

拡張のコードは [MIT License](LICENSE)。同梱データはそれぞれのライセンスに従います（[NOTICE](NOTICE)）。
