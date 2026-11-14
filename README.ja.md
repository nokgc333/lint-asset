# lint-asset

[English](README.md) | 日本語

3D アセット（glTF/GLB）とテクスチャを検査する、ブラウザで動くツールです。
ファイルは手元のブラウザの中だけで処理され、外部へ送られません。

> 状態: 開発中です。まだ公開していません。

## ビルド

CMake 3.24 以上と、C++20 に対応したコンパイラが必要です。WASM のビルドには Emscripten も必要です。

ネイティブのビルドとテスト（AddressSanitizer と UBSan が既定で有効）:

```sh
cmake -S . -B build/native -DCMAKE_BUILD_TYPE=Debug
cmake --build build/native
ctest --test-dir build/native --output-on-failure
```

WASM のビルド（出力: `build/wasm/core/lint_core.mjs` と `lint_core.wasm`。Web アプリ用に
`web/src/wasm/` へもコピーされます）:

```sh
emcmake cmake -S . -B build/wasm -DCMAKE_BUILD_TYPE=Release
cmake --build build/wasm
```

Web アプリ（Node.js 22.12 以上と、上の WASM ビルドが必要）:

```sh
npm ci
npm run dev        # 開発サーバーを起動
npm run build      # 本番ビルド（build/web へ出力）
npm run check      # lint と書式の検査（Biome）
npm run typecheck  # TypeScript の型検査
```

## 開発

クローンしたあとに、リポジトリのフックを1度だけ有効にします。

```sh
git config core.hooksPath .githooks
```

フックは、ブランチ名・コミットメッセージ・許可リスト（`.public-paths`）に載るパスだけをコミットしていること、を検査します。

## サンプル

`samples/` の2ファイルは `tests/tools/make_samples.py` で生成し、CC0 1.0 により
パブリックドメインに提供しています。`toy-house-clean.glb` には指摘事項がありません。
`toy-house-broken.glb` には、屋根の法線の反転、右壁の穴、鏡像配置で重なる屋根の UV、
0–1 の UV 範囲を外れた煙突の面、ファイル外に保存された画像への参照が含まれます。

## ライセンス

[MIT](LICENSE)
