# Go multiplatform & Go better `GOOS=js`

## Installation

```sh

```

## Usage

```js
import { Go } from "./wasm_exec.js";

const go = new Go({
  args: process.argv.slice(1),
  env: process.env,
  returnOnExit: false,
  import: (s, o) => import(s),
  importMeta: import.meta,
});
const { instance } = await WebAssembly.instantiateStreaming(
  fetch(import.meta.resolve("./main.wasm")),
  go.getImportObject()
);
await go.start(instance);
```

<details><summary>Older Go style</summary>

```js
import { Go } from "./wasm_exec.js";

const go = new Go();
go.argv = process.argv.slice(1);
go.env = process.env;
go.exit = process.exit;
go.import = (s, o) => import(s);
go.importMeta = import.meta;
const { instance } = await WebAssembly.instantiateStreaming(
  fetch(import.meta.resolve("./main.wasm")),
  go.importObject
);
await go.run(instance);
```

</details>

**Changes:**

- ESM-first design. Can be transpiled to CommonJS with TypeScript, Vite, Rollup, esbuild, or by hand.
- Provides access to newer ECMAScript features like `import()` and `import.meta` to Go code. Can be customized on a per-instance basis.
- Supports `bigint` primitives across the JS/Go boundary.
- Implements more OS-level features like `exec.Command()` using Node.js APIs.

## Development

- `gort0.min.js` is the minified bundle of code that just needs `__TEST_WASM_BASE64__` replaced with a JavaScript string of the base64 encoded WebAssembly compiled by `go build`. It is generated from `gort0.js` and `wasm_exec.js` using the Go esbuild package.
- `gort0.js` is the bootstrap code that decodes the base64 embedded string that should be embedded at build-time and then invokes the JS/Go runtime bridge with the WebAssembly module.
- `wasm_exec.js` is the Go runtime bridge code. It is intended to be copy-and-pasted into user's projects and should be entirely self-contained. It exports the `Go` class that is similar to Node.js' `node:wasi` `WASI` class. It is a drop-in replacement for older `wasm_exec.js` JS/Go runtime bridge code. It is backwards compatible with older compiled Go WebAssembly modules.

---

# The Go Programming Language

Go is an open source programming language that makes it easy to build simple,
reliable, and efficient software.

![Gopher image](https://golang.org/doc/gopher/fiveyears.jpg)
_Gopher image by [Renee French][rf], licensed under [Creative Commons 4.0 Attribution license][cc4-by]._

Our canonical Git repository is located at https://go.googlesource.com/go.
There is a mirror of the repository at https://github.com/golang/go.

Unless otherwise noted, the Go source files are distributed under the
BSD-style license found in the LICENSE file.

### Download and Install

#### Binary Distributions

Official binary distributions are available at https://go.dev/dl/.

After downloading a binary release, visit https://go.dev/doc/install
for installation instructions.

#### Install From Source

If a binary distribution is not available for your combination of
operating system and architecture, visit
https://go.dev/doc/install/source
for source installation instructions.

### Contributing

Go is the work of thousands of contributors. We appreciate your help!

To contribute, please read the contribution guidelines at https://go.dev/doc/contribute.

Note that the Go project uses the issue tracker for bug reports and
proposals only. See https://go.dev/wiki/Questions for a list of
places to ask questions about the Go language.

[rf]: https://reneefrench.blogspot.com/
[cc4-by]: https://creativecommons.org/licenses/by/4.0/
