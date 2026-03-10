# 概要

ブラウザ上で動くコード読解支援ツールです。無限キャンバス上でコードスニペットを視覚的に整理・関連付けできます。

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

## Node オブジェクト

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
      "filePath": "src/libcrun/linux.c"
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
  }
}
```
