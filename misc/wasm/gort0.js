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

// TODO: Use `Uint8Array.fromBase64()` when it's available
// @ts-ignore
const testWASM = Uint8Array.from(atob(REPLACE_ME_WITH_TEST_WASM_BASE64), (m) =>
  m.charCodeAt(0)
);
const go = new Go({
  importMeta: import.meta,
  returnOnExit: false,
});
const { instance } = await WebAssembly.instantiate(
  testWASM,
  go.getImportObject()
);
await go.start(instance);
