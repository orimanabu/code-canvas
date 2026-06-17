# 概要

ソースコードを読んで理解するためのブラウザベースのツールです。無限キャンバス上にコードスニペットを視覚的に整理し、相互に接続できます。

![screenshot1](images/screenshot-1.png)

![screenshot2](images/screenshot-2.png)

# クイックスタート

github pagesの[https://orimanabu.github.io/code-canvas/canvas.html](https://orimanabu.github.io/code-canvas/canvas.html)からアクセス可能です。

# 機能

- **コードブロック**: リサイズ可能な矩形の中にコードを配置できます。各ブロックにタイトルとファイルパスを設定できます。編集メニュー（`•••`）からフォントファミリーとサイズを個別に変更できます。
- **シンタックスハイライト**: コードの内容から言語を自動検出し、適切にハイライト表示します。
- **リンク**: コードブロック内の文字列（関数名など）を選択し、別のブロックへ矢印で接続できます。クリックするとジャンプ先へ移動します。右クリックでリンクの色・太さ・破線スタイルを変更できます。
- **吹き出し**: 移動可能な尾部を持つコメント吹き出しを追加できます。吹き出しヘッダーのチェックボックスで尾部の表示・非表示を切り替えられます。編集メニュー（`•••`）からフォントファミリーとサイズを個別に変更できます。
- **フレーム**: ラベル付きのフレーム矩形で関連するノードを視覚的にグループ化できます。編集メニュー（`•••`）からフォントファミリーとサイズを変更できます。
- **テキストノード**: 見出し、ラベル、メモ用の軽量なテキストノードをキャンバス上に追加できます。ノードごとに文字色・フォントファミリー・サイズを変更できます。
- **矢印ノード**: テキストリンクとは別に、単体の矢印ノードを追加できます。長さ、矢印ヘッド形状、回転、色、太さをインタラクティブに調整できます。
- **フリーハンド線**: ポリライン・スムーズカーブ・直線をキャンバス上に描けます。右クリックメニューで形状・色・太さ・破線スタイルを変更できます。
- **アンドゥ**: Cmd/Ctrl+Z で直前の操作を取り消せます（スナップショット方式、最大10ステップ）。
- **無限キャンバス**: Miro風のナビゲーション（ドラッグでパン、Cmd+ドラッグでズーム、v/hでモード切替）。
- **タブ独立保存**: ブラウザのタブごとに独立したlocalStorageキーでキャンバスを保存します。閉じたタブのエントリは30日後に自動削除されます。
- **保存 / 読み込み**: JSONとしてエクスポート・インポートできます。


# Webサーバの起動

`serve.go`（Go）と `serve.py`（Python 3）はどちらも等価なローカルHTTPサーバを起動します。`file://` プロトコルのCORS制限を回避するため、ローカルサーバ経由で開いてください。

**Go版**: Go 1.21+、外部依存なし

```bash
# go run で直接実行する
go run serve.go

# またはバイナリをビルドしてから実行する
go build -o serve serve.go
./serve

# 起動時にエクスポート済みのJSONファイルを読み込む
go run serve.go my-notes.json

# ポートを指定する（デフォルト: 8765）
go run serve.go --port 9000 my-notes.json
```

**Python版**: Python 3、外部依存なし

```bash
python3 serve.py
python3 serve.py my-notes.json
python3 serve.py --port 9000 my-notes.json
```

サーバ起動時にブラウザが自動で `http://localhost:8765/code-canvas/canvas.html` を開きます。

JSONファイルを指定した場合、その内容は起動時にキャンバスへ読み込まれ、`localStorage` にも書き込まれます。そのためページをリロードしても状態が保持されます。

# キーボードショートカット

| キー | 操作 |
|------|------|
| `v` | 選択モード |
| `h` | ハンド（パン）モード |
| `Space`（長押し） | 一時的なハンドモード |
| `l` | リンクモードの切り替え |
| `Del` / `Backspace` | 選択中のノードまたは線を削除 |
| `Cmd/Ctrl+C` | 選択中のノード・線をコピー |
| `Cmd/Ctrl+X` | 選択中のノード・線をカット |
| `Cmd/Ctrl+V` | ペースト |
| `Cmd/Ctrl+Z` | アンドゥ（最大10ステップ） |
| `Escape` | 編集モード・リンクモードを終了 |

# JSON出力フォーマット

## トップレベル

| フィールド | 型 | 説明 |
|---|---|---|
| `dataVersion` | string | フォーマットバージョン（現在 `"3.2"`） |
| `canvasTitle` | string | キャンバス全体のタイトル |
| `nodes` | Node[] | コードブロック・吹き出し・フレーム・テキストノード・矢印ノードの配列 |
| `links` | Link[] | リンクの配列 |
| `freeLines` | FreeLine[] | フリーハンド線の配列 |
| `nid` | number | 次に割り当てるノードIDのカウンター |
| `lid` | number | 次に割り当てるリンクIDのカウンター |
| `flid` | number | 次に割り当てるフリーハンド線IDのカウンター |
| `taid` | number | 次に割り当てるテールアンカーIDのカウンター |
| `vp` | Viewport | ビューポートの状態 |
| `globalConfig` | GlobalConfig | キャンバスの説明と関連Gitリポジトリ一覧 |

## Nodeオブジェクト（コードブロック）

`type` フィールドが存在しない、または `"code"` の場合、ノードはコードブロックです。

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | 一意のノードID |
| `x` | number | キャンバス上のX座標 |
| `y` | number | キャンバス上のY座標 |
| `w` | number | 矩形の幅 |
| `h` | number | 矩形の高さ |
| `code` | string | コードの内容 |
| `lang` | string | 言語（自動検出結果、例：`"cpp"`、`"rust"`） |
| `title` | string | コードブロックのタイトル |
| `filePath` | string | コードが属するファイルのパス |
| `showLineNumbers` | boolean | 行番号を表示するかどうか（デフォルト：`true`） |
| `lineNumberStart` | number | 先頭行に表示する行番号（デフォルト：`1`） |
| `color` | string | カラーテーマID（例：`"blue"`、`"green"`、`"red"`） |
| `fontFamily` | string | フォントファミリーID。等幅: `"default"` / `"ui-monospace"` / `"source-code-pro"` / `"jetbrains-mono"` / `"fira-code"` / `"menlo"` / `"monaco"` / `"cascadia-code"` / `"consolas"` / `"courier-new"`、プロポーショナル: `"system-ui"` / `"inter"` / `"helvetica-neue"` / `"verdana"` / `"trebuchet-ms"` / `"arial"` / `"georgia"` のいずれか。省略時は `"default"` |
| `fontSize` | number | フォントサイズ（px、6〜96）。プリセット（10〜48 px）から選択するか直接入力可能。省略時は `12.5` |

## Nodeオブジェクト（吹き出し）

`type` が `"bubble"` の場合、ノードは吹き出しです。

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | 一意のノードID |
| `type` | string | 固定値 `"bubble"` |
| `x` | number | 吹き出し本体の左上隅のX座標 |
| `y` | number | 吹き出し本体の左上隅のY座標 |
| `w` | number | 吹き出し本体の幅 |
| `h` | number | 吹き出し本体の高さ |
| `text` | string | 吹き出し内のテキスト |
| `tailX` | number | キャンバス上の尾部先端のX座標（本体とは独立して移動可能） |
| `tailY` | number | キャンバス上の尾部先端のY座標（本体とは独立して移動可能） |
| `color` | string | カラーテーマID（例：`"green"`、`"blue"`、`"red"`） |
| `showTail` | boolean | 尾部を表示するかどうか（デフォルト：`true`） |
| `fontFamily` | string | フォントファミリーID。コードブロックと同じ選択肢。省略時は `"default"` |
| `fontSize` | number | フォントサイズ（px、6〜96）。プリセット（11〜48 px）から選択するか直接入力可能。省略時は `13` |
| `tailAnchorId` | number \| null | テールアンカーバインディングのID（テール先端をコードブロック内の特定テキスト出現にリンク）。アンカーなしの場合は `null` |
| `tailAnchorFromId` | number \| null | テールが固定されているコードブロックのノードID。アンカーなしの場合は `null` |
| `tailAnchorText` | string \| null | テール先端が固定されている選択テキスト。アンカーなしの場合は `null` |
| `tailAnchorLine` | number | アンカー位置を示す接続元コードブロックの生テキスト内の行番号（1始まり）。未設定時は `-1`（全出現をハイライト） |
| `tailAnchorCol` | number | `tailAnchorLine` 内でアンカー位置を示す列番号（0始まり）。未設定時は `-1` |

## Nodeオブジェクト（フレーム）

`type` が `"frame"` の場合、ノードはフレームです。フレームは他のノードを視覚的にグループ化するために使用します。

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | 一意のノードID |
| `type` | string | 固定値 `"frame"` |
| `x` | number | フレームの左上隅のX座標 |
| `y` | number | フレームの左上隅のY座標 |
| `w` | number | フレームの幅 |
| `h` | number | フレームの高さ |
| `label` | string | フレームヘッダーに表示されるラベルテキスト |
| `color` | string | カラーテーマID（例：`"blue"`、`"green"`、`"red"`） |
| `fontFamily` | string | フォントファミリーID。コードブロックと同じ選択肢。省略時は `"default"` |
| `fontSize` | number | フォントサイズ（px、6〜96）。プリセット（10〜32 px）から選択するか直接入力可能。省略時は `12` |

## Nodeオブジェクト（テキスト）

`type` が `"text"` の場合、ノードはテキストノードです。

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | 一意のノードID |
| `type` | string | 固定値 `"text"` |
| `x` | number | テキストノード左上のX座標 |
| `y` | number | テキストノード左上のY座標 |
| `w` | number | テキストノードの幅 |
| `h` | number | テキストノードの高さ |
| `text` | string | テキスト内容 |
| `textColor` | string | 文字色ID（例：`"white"`、`"yellow"`、`"blue"`） |
| `fontFamily` | string | フォントファミリーID。コードブロックと同じ選択肢。省略時は `"default"` |
| `fontSize` | number | フォントサイズ（px）。省略時は `20` |

## Nodeオブジェクト（矢印）

`type` が `"arrow"` の場合、ノードは矢印ノードです。

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | 一意のノードID |
| `type` | string | 固定値 `"arrow"` |
| `x` | number | 矢印の原点X座標 |
| `y` | number | 矢印の原点Y座標 |
| `bodyLen` | number | シャフト長（キャンバス座標） |
| `headLen` | number | 矢印ヘッド長（キャンバス座標） |
| `headWidth` | number | 矢印ヘッド幅（キャンバス座標） |
| `angle` | number | 回転角（ラジアン） |
| `color` | string | カラーテーマID（例：`"blue"`、`"green"`、`"red"`） |
| `strokeWidth` | number | シャフトの太さ（ピクセル） |

## Linkオブジェクト

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | 一意のリンクID |
| `fromId` | number | 接続元ノードのID |
| `text` | string | 接続元ノードで選択されたテキスト（アンカーテキスト） |
| `toId` | number | 接続先ノードのID |
| `stroke` | string | 矢印の色（CSSカラー文字列、デフォルト：`"#388bfd"`） |
| `strokeWidth` | number | 矢印の太さ（ピクセル、デフォルト：`1.5`） |
| `dash` | string | SVGのstroke-dasharray値（`""` = 実線、`"8 4"` = 破線、`"16 6"` = 長破線） |
| `anchorLine` | number | 矢印の起点となる出現箇所を示す接続元ブロックの生テキスト内の行番号（1始まり）。`-1` は未設定 |
| `anchorCol` | number | `anchorLine` 内で矢印の起点を示す列番号（0始まり）。`-1` は未設定 |

古いエクスポートでは `anchorMatchIdx` を持つ場合がありますが、読み込み時に `anchorLine` / `anchorCol` へ自動移行されます。

## FreeLineオブジェクト

キャンバス上に直接描いたフリーハンド線です。

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | 一意のフリーハンド線ID |
| `points` | `{x, y}`[] | キャンバス座標系の点の配列 |
| `lineStyle` | string | 形状モード：`"polyline"`・`"curve"`・`"straight"` |
| `stroke` | string | 線の色（CSSカラー文字列） |
| `strokeWidth` | number | 線の太さ（ピクセル） |
| `dash` | string | SVGのstroke-dasharray値（`""` = 実線、`"8 4"` = 破線など） |

## Viewportオブジェクト

| フィールド | 型 | 説明 |
|---|---|---|
| `x` | number | ビューポートのXオフセット |
| `y` | number | ビューポートのYオフセット |
| `scale` | number | ズームレベル |

## GlobalConfigオブジェクト

キャンバス全体のメタデータと関連Gitリポジトリ一覧です。ツールバーの「⎇ Global Config」ボタンから設定します。

| フィールド | 型 | 説明 |
|---|---|---|
| `description` | string | キャンバスの自由記述説明 |
| `repositories` | Repository[] | 関連Gitリポジトリの一覧 |

### Repositoryオブジェクト

`globalConfig.repositories` の各要素は1つのGitリポジトリを表します。GitHub URLを指定すると、GitHub APIを通じてブランチ名またはタグ名からコミットハッシュが自動解決されます。

| フィールド | 型 | 説明 |
|---|---|---|
| `nickname` | string | 表示用の短い名前（例：`"crun"`） |
| `url` | string | リポジトリURL（例：`"https://github.com/owner/repo"`） |
| `branch` | string | ブランチ名（例：`"main"`）。設定した場合、そのブランチのHEADコミットを使用します。 |
| `tag` | string | タグ名（例：`"v1.0.0"`）。設定した場合、そのタグのコミットを使用します。 |
| `commitHash` | string | コミットハッシュ。ブランチ/タグが指定された場合、GitHub APIで自動解決されます。 |

`branch` または `tag` のどちらか一方を指定してください。両方省略した場合は `commitHash` がそのまま使用されます。

## サンプル

```json
{
  "dataVersion": "3.2",
  "canvasTitle": "crun_code_reading",
  "nodes": [
    {
      "id": 1,
      "x": 88.25,
      "y": 225.65,
      "w": 989.5,
      "h": 2962.2,
      "code": "static int\ninit_container (...) { ... }",
      "lang": "cpp",
      "title": "init_container()",
      "filePath": "src/libcrun/linux.c",
      "showLineNumbers": true,
      "lineNumberStart": 1,
      "color": "blue"
    },
    {
      "id": 2,
      "type": "bubble",
      "x": 300.0,
      "y": 100.0,
      "w": 200,
      "h": 80,
      "text": "Namespaces are initialized here",
      "tailX": 250.0,
      "tailY": 220.0,
      "color": "green",
      "showTail": true
    },
    {
      "id": 3,
      "type": "frame",
      "x": 50.0,
      "y": 180.0,
      "w": 1100.0,
      "h": 3100.0,
      "label": "Namespace setup",
      "color": "blue"
    }
  ],
  "links": [
    {
      "id": 1,
      "fromId": 1,
      "text": "get_fd_map",
      "toId": 3,
      "stroke": "#388bfd",
      "strokeWidth": 1.5,
      "dash": "",
      "anchorLine": 1,
      "anchorCol": 0
    }
  ],
  "freeLines": [
    {
      "id": 1,
      "points": [{"x": 200, "y": 300}, {"x": 350, "y": 280}, {"x": 500, "y": 320}],
      "lineStyle": "curve",
      "stroke": "#e6edf3",
      "strokeWidth": 2,
      "dash": ""
    }
  ],
  "nid": 7,
  "lid": 6,
  "flid": 2,
  "taid": 1,
  "vp": {
    "x": 76.9,
    "y": -6.8,
    "scale": 0.7
  },
  "globalConfig": {
    "description": "",
    "repositories": [
      {
        "nickname": "crun",
        "url": "https://github.com/containers/crun",
        "branch": "main",
        "tag": "",
        "commitHash": "a1b2c3d4e5f6..."
      }
    ]
  }
}
```
