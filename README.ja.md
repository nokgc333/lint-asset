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

WASM のビルド（出力: `build/wasm/core/lint_core.mjs` と `lint_core.wasm`）:

```sh
emcmake cmake -S . -B build/wasm -DCMAKE_BUILD_TYPE=Release
cmake --build build/wasm
```

## 開発

クローンしたあとに、リポジトリのフックを1度だけ有効にします。

```sh
git config core.hooksPath .githooks
```

フックは、ブランチ名・コミットメッセージ・許可リスト（`.public-paths`）に載るパスだけをコミットしていること、を検査します。

## ライセンス

[MIT](LICENSE)
