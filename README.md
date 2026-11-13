# lint-asset

English | [日本語](README.ja.md)

A browser-based linter for 3D assets (glTF/GLB) and textures.
Your files are processed locally and never leave your browser.

> Status: under development. Nothing is released yet.

## Development

After cloning, enable the repository hooks once:

```sh
git config core.hooksPath .githooks
```

The hooks check the branch name, the commit message, and that only allowlisted paths
(see `.public-paths`) are committed.

## License

[MIT](LICENSE)
