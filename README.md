# lint-asset

English | [日本語](README.ja.md)

A browser-based linter for 3D assets (glTF/GLB) and textures.
Your files are processed locally and never leave your browser.

> Status: under development. Nothing is released yet.

## Build

Requires CMake 3.24+ and a C++20 compiler. The WASM build also requires Emscripten.

Native build and tests (AddressSanitizer and UBSan are on by default):

```sh
cmake -S . -B build/native -DCMAKE_BUILD_TYPE=Debug
cmake --build build/native
ctest --test-dir build/native --output-on-failure
```

WASM build (output: `build/wasm/core/lint_core.mjs` and `lint_core.wasm`, also copied to
`web/src/wasm/` for the web app):

```sh
emcmake cmake -S . -B build/wasm -DCMAKE_BUILD_TYPE=Release
cmake --build build/wasm
```

Web app (requires Node.js 22.12+ and the WASM build above):

```sh
npm ci
npm run dev        # start the development server
npm run build      # production build into build/web
npm run check      # lint and format check (Biome)
npm run typecheck  # TypeScript
```

## Development

After cloning, enable the repository hooks once:

```sh
git config core.hooksPath .githooks
```

The hooks check the branch name, the commit message, and that only allowlisted paths
(see `.public-paths`) are committed.

## License

[MIT](LICENSE)
