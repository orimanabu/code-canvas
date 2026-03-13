# 概要

ブラウザ上で動くコード読解支援ツールです。無限キャンバス上でコードスニペットを視覚的に整理・関連付けできます。

![screenshot1](images/screenshot-1.png)

![screenshot2](images/screenshot-2.png)

# 主な機能

- コードブロック: 矩形の中にコードを配置。タイトル・ファイルパスも記載可能
- シンタックスハイライト: コードの内容から言語を自動判定してハイライト
- リンク機能: コードブロック内の文字列（関数名など）を選択して、別のコードブロックと線でつなぐ。クリックでジャンプも可能
- 無限キャンバス: Miro風の操作感（ドラッグでスクロール、Cmd+ドラッグでズーム、v/hでモード切替）
- 保存/読み込み: JSON形式でエクスポート・インポート


# JSON出力フォーマット

## トップレベル

| フィールド | 型 | 説明 |
|---|---|---|
| `canvasTitle` | string | キャンバス全体のタイトル |
| `nodes` | Node[] | コードブロックの配列 |
| `links` | Link[] | リンクの配列 |
| `nid` | number | 次に割り当てるノードIDのカウンタ |
| `lid` | number | 次に割り当てるリンクIDのカウンタ |
| `vp` | Viewport | ビューポートの状態 |
| `gitConfig` | GitConfig | キャンバスに紐付くGitリポジトリの設定 |

## Node オブジェクト（コードブロック）

`type` フィールドが存在しない、または `"code"` の場合はコードブロック。

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | ノードの一意なID |
| `x` | number | キャンバス上のX座標 |
| `y` | number | キャンバス上のY座標 |
| `w` | number | 矩形の幅 |
| `h` | number | 矩形の高さ |
| `code` | string | コードの本文 |
| `lang` | string | 言語（自動判定結果。例: `"cpp"`, `"rust"`） |
| `title` | string | コードブロックのタイトル |
| `filePath` | string | コードが載っているファイルのパス |
| `showLineNumbers` | boolean | 行番号を表示するか（デフォルト: `true`） |
| `lineNumberStart` | number | 先頭行に表示する行番号（デフォルト: `1`） |

## Node オブジェクト（吹き出し）

`type` が `"bubble"` の場合は吹き出しノード。

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | ノードの一意なID |
| `type` | string | `"bubble"` 固定 |
| `x` | number | キャンバス上のX座標（吹き出し本体の左上） |
| `y` | number | キャンバス上のY座標（吹き出し本体の左上） |
| `w` | number | 吹き出し本体の幅 |
| `h` | number | 吹き出し本体の高さ |
| `text` | string | 吹き出し内のテキスト |
| `tailX` | number | しっぽ先端のキャンバス上X座標（本体と独立して移動可能） |
| `tailY` | number | しっぽ先端のキャンバス上Y座標（本体と独立して移動可能） |

## Link オブジェクト

| フィールド | 型 | 説明 |
|---|---|---|
| `id` | number | リンクの一意なID |
| `fromId` | number | リンク元ノードのID |
| `text` | string | リンク元で選択した文字列（アンカーテキスト） |
| `toId` | number | リンク先ノードのID |

## Viewport オブジェクト

| フィールド | 型 | 説明 |
|---|---|---|
| `x` | number | ビューポートのX座標オフセット |
| `y` | number | ビューポートのY座標オフセット |
| `scale` | number | ズーム倍率 |

## GitConfig オブジェクト

キャンバス全体に紐付くGitリポジトリの情報。ツールバーの「⎇ Git設定」ボタンから設定する。
GitHubのURLを指定した場合、ブランチ名またはタグ名からcommit hashをGitHub APIで自動解決する。

| フィールド | 型 | 説明 |
|---|---|---|
| `url` | string | リポジトリのURL（例: `"https://github.com/owner/repo"`） |
| `branch` | string | ブランチ名（例: `"main"`）。指定時はそのブランチのHEAD commitを使用 |
| `tag` | string | タグ名（例: `"v1.0.0"`）。指定時はそのタグのcommitを使用 |
| `commitHash` | string | commit hash。ブランチ/タグ指定時はGitHub APIで自動解決される |

`branch` と `tag` はどちらか一方を指定する。両方省略した場合は `commitHash` をそのまま使用する。

## サンプル

```json
{
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
      "lineNumberStart": 1
    },
    {
      "id": 2,
      "type": "bubble",
      "x": 300.0,
      "y": 100.0,
      "w": 200,
      "h": 80,
      "text": "ここで名前空間を初期化している",
      "tailX": 250.0,
      "tailY": 220.0
    }
  ],
  "links": [
    {
      "id": 1,
      "fromId": 1,
      "text": "get_fd_map",
      "toId": 3
    }
  ],
  "nid": 7,
  "lid": 6,
  "vp": {
    "x": 76.9,
    "y": -6.8,
    "scale": 0.7
  },
  "gitConfig": {
    "url": "https://github.com/containers/crun",
    "branch": "main",
    "tag": "",
    "commitHash": "a1b2c3d4e5f6..."
  }
}
```
