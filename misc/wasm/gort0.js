#!/usr/bin/env node
/*!
 * Copyright 2024 The Go Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file.
 */

// @ts-check
/// <reference lib="ES2020" />
/// <reference lib="DOM" />
export {};

import { Go } from "./wasm_exec.js";
// @ts-ignore
import testWASM_ from "./test.wasm?init";
/** @type {WebAssembly.Module} */
const testWASM = testWASM_;

const go = new Go({
  import: (s, o) => import(s),
  importMeta: import.meta,
  returnOnExit: false,
});
const instance = await WebAssembly.instantiate(
  testWASM,
  go.getImportObject()
);
await go.start(instance);
