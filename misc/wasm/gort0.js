#!/usr/bin/env node
/*!
 * Copyright 2024 The Go Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file.
 */

// @ts-check
/// <reference lib="ES2020" />
/// <reference lib="DOM" />

import { Go } from "./wasm_exec.js";

// /** Injected by the Go compiler when combining WASM and this JS bootstrap. */
// No way to do this in JSDoc yet.
// declare const TEST_WASM_BASE64: string;
// TODO: Use `Uint8Array.fromBase64()` when it's available
// @ts-ignore
const testWASM = Uint8Array.from(atob(TEST_WASM_BASE64), (m) =>
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
