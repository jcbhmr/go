/*!
 * Copyright 2024 The Go Authors. All rights reserved.
 * Use of this source code is governed by a BSD-style
 * license that can be found in the LICENSE file.
 */

// @ts-check
/// <reference lib="ES2020" />
/// <reference lib="DOM" />

/**
 * @template T
 * @param {typeof Promise} P
 * @returns {{ promise: Promise<T>, resolve: (value: T) => void, reject: (reason: any) => void }}
 */
function PromiseWithResolversImpl(P) {
  /** @type {(value: T) => void} */
  let resolve;
  /** @type {(reason: any) => void} */
  let reject;
  const promise = new P((y, n) => {
    resolve = y;
    reject = n;
  });
  // @ts-ignore
  return { promise, resolve, reject };
}
/** @type {<T>(P: typeof Promise) => { promise: Promise<T>, resolve: (value: T) => void, reject: (reason: any) => void }} */
const PromiseWithResolvers =
  // @ts-ignore
  Promise.withResolvers?.call.bind(Promise.withResolvers) ??
  PromiseWithResolversImpl;

/** @type {TextEncoder} */
let textEncoder;

/**
 * @param {string} s
 * @returns {Uint8Array}
 */
function encode(s) {
  textEncoder ??= new TextEncoder();
  return textEncoder.encode(s);
}

/** @type {TextDecoder} */
let textDecoder;

/**
 * @param {Uint8Array} b
 * @returns {string}
 */
function decode(b) {
  textDecoder ??= new TextDecoder();
  return textDecoder.decode(b);
}

/**
 * The options for the {@link Go} constructor.
 * @typedef {object} GoOptions
 * @property {ImportMeta | null | undefined} [importMeta] The module-local
 * `import.meta` object. This is expected to have at least `import.meta.url` and
 * `import.meta.resolve()`.
 * @property {boolean | undefined} [returnOnExit] If true (the default), this
 * will set `process.exitCode` and resolve from the `go.start()` promise without
 * calling `process.exit()`. If false, this will call `process.exit()` with the
 * Go program's exit code.
 */

/**
 * Modeled after `node:wasi`. Maintains compatibility with older `wasm_exec.js`
 * `Go` versions.
 *
 * @example
 * import { Go } from "./wasm_exec.js";
 * const go = new Go({ importMeta: import.meta });
 * const { instance } = await WebAssembly.instantiateStreaming(
 *   fetch("test.wasm"),
 *   go.getImportObject()
 * );
 * const exitCode = await go.start(instance);
 * console.log("Exited with code %d", exitCode);
 *
 * @example
 * import { Go } from "./wasm_exec.js";
 * const go = new Go({
 *   importMeta: import.meta,
 *   returnOnExit: false,
 * });
 * const { instance } = await WebAssembly.instantiateStreaming(
 *   fetch("test.wasm"),
 *   go.getImportObject()
 * );
 * await go.start(instance);
 */
export class Go {

  /**
   * If `null`, then we assume a classic script environment (non-ESM). Expected to have at least `import.meta.url` and `import.meta.resolve()`. This is set by the constructor.
   * @type {ImportMeta | null}
   */
  #importMeta;

  /** @type {"created" | "starting" | "running" | "exited"} */
  #readyState = "created";

  /**
   * Whether or not to call `process.exit()` after the Go program exits. If `true`, this will set `process.exitCode`
   * and resolve from the `go.start()` promise without calling `process.exit()`. If `false`, this will call
   * `process.exit()` with the Go program's exit code. The default is `true`. This is set by the constructor.
   * @type {boolean}
   */
  #returnOnExit;

  /** @param {GoOptions} options */
  constructor(options = {}) {
    this.#importMeta = options.importMeta ?? null;
    this.#returnOnExit = options.returnOnExit ?? true;
  }

  /** @type {DataView | null} */
  #dataViewCache = null;

  get #dataView() {
    if (!this.#dataViewCache) {
      const memory = this.#instance.exports.mem;
      this.#dataViewCache = new DataView(memory.buffer);
    }
    return this.#dataViewCache;
  }

  /**
   * @param {string} specifier
   * @param {ImportCallOptions} [options] Currently ignored. Not all environments support import call options.
   * @returns {Promise<any>}
   */
  async _import(specifier, options = undefined) {
    if (this.#importMeta) {
      return import(this.#importMeta.resolve(specifier));
    } else {
      return import(specifier);
    }
  }

  /**
   * @param {number} addr
   * @param {number} v
   */
  #setInt64(addr, v) {
    this.#dataView.setUint32(addr + 0, v, true);
    this.#dataView.setUint32(addr + 4, Math.floor(v / 4294967296), true);
  }

  /**
   * @param {number} addr
   * @returns {number}
   */
  #getInt64(addr) {
    const low = this.#dataView.getUint32(addr + 0, true);
    const high = this.#dataView.getInt32(addr + 4, true);
    return low + high * 4294967296;
  }

  /**
   * @param {number} addr
   * @returns {any}
   */
  #loadValue(addr) {
    const f = this.#dataView.getFloat64(addr, true);
    if (f === 0) {
      return undefined;
    }
    if (!isNaN(f)) {
      return f;
    }

    const id = this.#dataView.getUint32(addr, true);
    return /** @type {any[]} */ this.#values[id];
  }

  /**
   * @param {number} addr
   * @param {any} v
   */
  #storeValue(addr, v) {
    const nanHead = 0x7ff80000;

    if (typeof v === "number" && v !== 0) {
      if (isNaN(v)) {
        this.#dataView.setUint32(addr + 4, nanHead, true);
        this.#dataView.setUint32(addr, 0, true);
        return;
      }
      this.#dataView.setFloat64(addr, v, true);
      return;
    }

    if (v === undefined) {
      this.#dataView.setFloat64(addr, 0, true);
      return;
    }

    let id = this/** @type {Map<any, number>} */ .#ids
      .get(v);
    if (id === undefined) {
      this/** @type {number[]} */ .#idPool
        .pop();
      if (id === undefined) {
        id = /** @type {any[]} */ this.#values.length;
      }
      /** @type {any[]} */ this.#values[id] = v;
      /** @type {number[]} */ this.#goRefCounts[id] = 0;
      this/** @type {Map<any, number>} */ .#ids
        .set(v, id);
    }
    /** @type {number[]} */ this.#goRefCounts[id]++;
    let typeFlag = 0;
    switch (typeof v) {
      case "object":
        if (v !== null) {
          typeFlag = 1;
        }
        break;
      case "string":
        typeFlag = 2;
        break;
      case "symbol":
        typeFlag = 3;
        break;
      case "function":
        typeFlag = 4;
        break;
    }
    this.#dataView.setUint32(addr + 4, nanHead | typeFlag, true);
    this.#dataView.setUint32(addr, id, true);
  }

  /**
   * @param {number} addr
   * @returns {Uint8Array}
   */
  #loadSlice(addr) {
    const array = this.#getInt64(addr + 0);
    const len = this.#getInt64(addr + 8);
    return new Uint8Array(this.#dataView.buffer, array, len);
  }

  /**
   * @param {number} addr
   * @returns {any[]}
   */
  #loadSliceOfValues(addr) {
    const array = this.#getInt64(addr + 0);
    const len = this.#getInt64(addr + 8);
    const a = new Array(len);
    for (let i = 0; i < len; i++) {
      a[i] = this.#loadValue(array + i * 8);
    }
    return a;
  }

  #loadString(addr: number) {
    const saddr = this.#getInt64(addr + 0);
    const len = this.#getInt64(addr + 8);
    return decode(new Uint8Array(this.#dataView.buffer, saddr, len));
  }

  /** @returns {WebAssembly.Imports} */
  getImportObject() {
    return {
      gojs: this.gojsImport,
    };
  }

  /**
   * @deprecated
   * @type {WebAssembly.Imports | null}
   */
  #cachedImportObject = null;

  /**
   * @deprecated
   * @returns {WebAssembly.Imports}
   */
  get importObject() {
    this.#cachedImportObject ??= this.getImportObject();
    return this.#cachedImportObject;
  }

  /** @type {WebAssembly.ModuleImports} */
  gojsImport = {
    // @ts-ignore
    __proto__: null,

    // Go's SP does not change as long as no Go code is running. Some operations (e.g. calls, getters and setters)
    // may synchronously trigger a Go event handler. This makes Go code get executed in the middle of the imported
    // function. A goroutine can switch to a new stack if the current stack is too small (see morestack function).
    // This changes the SP, thus we have to update the SP used by the imported function.

    /**
     * ```go
     * func wasmExit(code int32)
     * ```
     * @param {number} sp
     */
    "runtime.wasmExit": (sp) => {
      sp >>>= 0;
      const code = this.#dataView.getInt32(sp + 8, true);
      // Unsure what order to a) exit() and b) destroy instance data.
      if (this.#returnOnExit) {
        this.#process.default.exitCode = code;
      } else {
        this.#process.exit(code);
      }
      this.#readyState = "exited";
      (/** @type {{ promise: Promise<number>; resolve: (value: number) => void; reject: (reason: any) => void; }} */(this.#startDeferred)).resolve(code);
      this.#instance = null;
      this.#dataViewCache = null;
      this.#values = null;
      this.#goRefCounts = null;
      this.#ids = null;
      this.#idPool = null;
      this.#startDeferred = null;
      this.#fs = null;
      this.#process = null;
      this._pendingEvent = null;
    },

    /**
     * ```go
     * func wasmWrite(fd uintptr, p unsafe.Pointer, n int32)
     * ```
     * @param {number} sp
     */
    "runtime.wasmWrite": (sp) => {
      sp >>>= 0;
      const fd = this.#getInt64(sp + 8);
      const p = this.#getInt64(sp + 16);
      const n = this.#dataView.getInt32(sp + 24, true);
      this.#fs.writeSync(fd, new Uint8Array(this.#dataView.buffer, p, n));
    },

    /**
     * ```go
     * func resetMemoryDataView()
     * ```
     * @param {number} sp
     */
    "runtime.resetMemoryDataView": (sp) => {
      sp >>>= 0;
      const memory = (/** @type {WebAssembly.Memory} */((/** @type {WebAssembly.Instance} */(this.#instance)).exports.mem));
      this.#dataViewCache = new DataView(memory.buffer);
    },

    /**
     * ```go
     * func nanotime1() int64
     * ```
     * @param {number} sp 
     */
    "runtime.nanotime1": (sp) => {
      sp >>>= 0;
      this.#setInt64(
        sp + 8,
        (performance.timeOrigin + performance.now()) * 1000000
      );
    },

    /**
     * ```go
     * func walltime() (sec int64, nsec int32)
     * ```
     * @param {number} sp 
     */
    "runtime.walltime": (sp) => {
      sp >>>= 0;
      const msec = new Date().getTime();
      this.#setInt64(sp + 8, msec / 1000);
      this.#dataView.setInt32(sp + 16, (msec % 1000) * 1000000, true);
    },

    /**
     * ```go
     * func scheduleTimeoutEvent(delay int64) int32
     * ```
     * @param {number} sp 
     */
    "runtime.scheduleTimeoutEvent": (sp) => {
      sp >>>= 0;
      const id = this.#nextCallbackTimeoutID;
      this.#nextCallbackTimeoutID++;
      (/** @type {Map<number, number>} */(this.#scheduledTimeouts)).set(
        id,
        setTimeout(() => {
          this.#resume();
          while ((/** @type {Map<number, number>} */(this.#scheduledTimeouts)).has(id)) {
            // for some reason Go failed to register the timeout event, log and try again
            // (temporary workaround for https://github.com/golang/go/issues/28975)
            console.warn("scheduleTimeoutEvent: missed timeout event");
            this.#resume();
          }
        }, this.#getInt64(sp + 8))
      );
      this.#dataView.setInt32(sp + 16, id, true);
    },

    /**
     * ```go
     * func clearTimeoutEvent(id int32)
     * ```
     * @param {number} sp 
     */
    "runtime.clearTimeoutEvent": (sp) => {
      sp >>>= 0;
      const id = this.#dataView.getInt32(sp + 8, true);
      clearTimeout((/** @type {Map<number, number>} */(this.#scheduledTimeouts)).get(id));
      (/** @type {Map<number, number>} */(this.#scheduledTimeouts)).delete(id);
    },

    // func getRandomData(r []byte)
    "runtime.getRandomData": (sp: number) => {
      sp >>>= 0;
      cryptoGetRandomValues(this.#loadSlice(sp + 8));
    },

    // func finalizeRef(v ref)
    "syscall/js.finalizeRef": (sp: number) => {
      sp >>>= 0;
      const id = this.#dataView.getUint32(sp + 8, true);
      this.#goRefCounts![id]--;
      if (this.#goRefCounts![id] === 0) {
        const v = this.#values![id];
        this.#values![id] = null;
        this.#ids!.delete(v);
        this.#idPool!.push(id);
      }
    },

    // func stringVal(value string) ref
    "syscall/js.stringVal": (sp: number) => {
      sp >>>= 0;
      this.#storeValue(sp + 24, this.#loadString(sp + 8));
    },

    // func valueGet(v ref, p string) ref
    "syscall/js.valueGet": (sp: number) => {
      sp >>>= 0;
      const result = Reflect.get(
        this.#loadValue(sp + 8),
        this.#loadString(sp + 16)
      );
      const getsp = this.#instance!.exports.getsp as () => number;
      sp = getsp() >>> 0; // see comment above
      this.#storeValue(sp + 32, result);
    },

    // func valueSet(v ref, p string, x ref)
    "syscall/js.valueSet": (sp: number) => {
      sp >>>= 0;
      Reflect.set(
        this.#loadValue(sp + 8),
        this.#loadString(sp + 16),
        this.#loadValue(sp + 32)
      );
    },

    // func valueDelete(v ref, p string)
    "syscall/js.valueDelete": (sp: number) => {
      sp >>>= 0;
      Reflect.deleteProperty(
        this.#loadValue(sp + 8),
        this.#loadString(sp + 16)
      );
    },

    // func valueIndex(v ref, i int) ref
    "syscall/js.valueIndex": (sp: number) => {
      sp >>>= 0;
      this.#storeValue(
        sp + 24,
        Reflect.get(this.#loadValue(sp + 8), this.#getInt64(sp + 16))
      );
    },

    // valueSetIndex(v ref, i int, x ref)
    "syscall/js.valueSetIndex": (sp: number) => {
      sp >>>= 0;
      Reflect.set(
        this.#loadValue(sp + 8),
        this.#getInt64(sp + 16),
        this.#loadValue(sp + 24)
      );
    },

    // func valueCall(v ref, m string, args []ref) (ref, bool)
    "syscall/js.valueCall": (sp: number) => {
      sp >>>= 0;
      try {
        const v = this.#loadValue(sp + 8);
        const m = Reflect.get(v, this.#loadString(sp + 16));
        const args = this.#loadSliceOfValues(sp + 32);
        const result = Reflect.apply(m, v, args);
        const getsp = this.#instance!.exports.getsp as () => number;
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 56, result);
        this.#dataView.setUint8(sp + 64, 1);
      } catch (err) {
        const getsp = this.#instance!.exports.getsp as () => number;
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 56, err);
        this.#dataView.setUint8(sp + 64, 0);
      }
    },

    // func valueInvoke(v ref, args []ref) (ref, bool)
    "syscall/js.valueInvoke": (sp: number) => {
      sp >>>= 0;
      try {
        const v = this.#loadValue(sp + 8);
        const args = this.#loadSliceOfValues(sp + 16);
        const result = Reflect.apply(v, undefined, args);
        const getsp = this.#instance!.exports.getsp as () => number;
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 40, result);
        this.#dataView.setUint8(sp + 48, 1);
      } catch (err) {
        const getsp = this.#instance!.exports.getsp as () => number;
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 40, err);
        this.#dataView.setUint8(sp + 48, 0);
      }
    },

    // func valueNew(v ref, args []ref) (ref, bool)
    "syscall/js.valueNew": (sp: number) => {
      sp >>>= 0;
      try {
        const v = this.#loadValue(sp + 8);
        const args = this.#loadSliceOfValues(sp + 16);
        const result = Reflect.construct(v, args);
        const getsp = this.#instance!.exports.getsp as () => number;
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 40, result);
        this.#dataView.setUint8(sp + 48, 1);
      } catch (err) {
        const getsp = this.#instance!.exports.getsp as () => number;
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 40, err);
        this.#dataView.setUint8(sp + 48, 0);
      }
    },

    // func valueLength(v ref) int
    "syscall/js.valueLength": (sp: number) => {
      sp >>>= 0;
      this.#setInt64(sp + 16, parseInt(this.#loadValue(sp + 8).length));
    },

    // valuePrepareString(v ref) (ref, int)
    "syscall/js.valuePrepareString": (sp: number) => {
      sp >>>= 0;
      const str = encode(String(this.#loadValue(sp + 8)));
      this.#storeValue(sp + 16, str);
      this.#setInt64(sp + 24, str.length);
    },

    // valueLoadString(v ref, b []byte)
    "syscall/js.valueLoadString": (sp: number) => {
      sp >>>= 0;
      const str = this.#loadValue(sp + 8);
      this.#loadSlice(sp + 16).set(str);
    },

    // func valueInstanceOf(v ref, t ref) bool
    "syscall/js.valueInstanceOf": (sp: number) => {
      sp >>>= 0;
      this.#dataView.setUint8(
        sp + 24,
        this.#loadValue(sp + 8) instanceof this.#loadValue(sp + 16) ? 1 : 0
      );
    },

    // func copyBytesToGo(dst []byte, src ref) (int, bool)
    "syscall/js.copyBytesToGo": (sp: number) => {
      sp >>>= 0;
      const dst = this.#loadSlice(sp + 8);
      const src = this.#loadValue(sp + 32);
      if (!(src instanceof Uint8Array || src instanceof Uint8ClampedArray)) {
        this.#dataView.setUint8(sp + 48, 0);
        return;
      }
      const toCopy = src.subarray(0, dst.length);
      dst.set(toCopy);
      this.#setInt64(sp + 40, toCopy.length);
      this.#dataView.setUint8(sp + 48, 1);
    },

    // func copyBytesToJS(dst ref, src []byte) (int, bool)
    "syscall/js.copyBytesToJS": (sp: number) => {
      sp >>>= 0;
      const dst = this.#loadValue(sp + 8);
      const src = this.#loadSlice(sp + 16);
      if (!(dst instanceof Uint8Array || dst instanceof Uint8ClampedArray)) {
        this.#dataView.setUint8(sp + 48, 0);
        return;
      }
      const toCopy = src.subarray(0, dst.length);
      dst.set(toCopy);
      this.#setInt64(sp + 40, toCopy.length);
      this.#dataView.setUint8(sp + 48, 1);
    },

    debug: (value: any) => {
      globalThis.console?.log(value);
    },
  };

  protected _pendingEvent: { id: number; this: any; args: any[] } | null = null;
  #resume() {
    if (this.#readyState !== "running") {
      throw new Error("Go program has already exited");
    }
    const resume = this.#instance!.exports.resume as () => void;
    resume();
  }
  protected _makeFuncWrapper(id: number) {
    const go = this;
    return function (this: any, ...args: any) {
      const event = { id: id, this: this, args: args };
      go._pendingEvent = event;
      go.#resume();
      return (event as typeof event & { result: any }).result;
    };
  }

  #fs: any | null = null;
  #process: any | null = null;
  #instance: WebAssembly.Instance | null = null;
  #startDeferred: {
    promise: Promise<number>;
    resolve: (value: number) => void;
    reject: (reason: any) => void;
  } | null = null;
  #values: any[] | null = null;
  #goRefCounts: number[] | null = null;
  #ids: Map<any, number> | null = null;
  #idPool: number[] | null = null;
  #nextCallbackTimeoutID: number = 1;
  #scheduledTimeouts: Map<number, number> | null = null;

  /**
   * @param {WebAssembly.Instance} instance 
   * @returns {Promise<number>} Will never resolve if `options.returnOnExit` is `false` (the program will exit instead).
   */
  async start(instance) {
    if (this.#readyState !== "created") {
      throw new Error("Go program already started");
    }
    this.#readyState = "starting";
    this.#instance = instance;

    this.#values = [NaN, 0, null, true, false, globalThis, this];
    this.#goRefCounts = new Array(this.#values.length).fill(Infinity);
    // @ts-ignore
    this.#ids = new Map([
        [0, 1],
        [null, 2],
        [true, 3],
        [false, 4],
        [globalThis, 5],
        [this, 6],
        [this.#shared, 7],
      ]);
    this.#idPool = [];
    this.#scheduledTimeouts = new Map();

    // Pass command line arguments and environment variables to WebAssembly by writing them to the linear memory.
    let offset = 4096;

    /**
     * @param {string} str 
     * @returns {number}
     */
    const strPtr = (str) => {
      const ptr = offset;
      const bytes = encode(str + "\0");
      new Uint8Array(this.#dataView.buffer, offset, bytes.length).set(bytes);
      offset += bytes.length;
      if (offset % 8 !== 0) {
        offset += 8 - (offset % 8);
      }
      return ptr;
    };

    const args = this.#process.argv.slice();
    args[0] = this.#process.argv0;
    const argc = args.length;

    /** @type {number[]} */
    const argvPtrs = [];
    for (const arg of args) {
      argvPtrs.push(strPtr(arg));
    }
    argvPtrs.push(0);
    for (const [key, value] of Object.entries(this.#process.env)) {
      argvPtrs.push(strPtr(`${key}=${value}`));
    }
    argvPtrs.push(0);

    const argvPtr = offset;
    for (const ptr of argvPtrs) {
      this.#dataView.setUint32(offset, ptr, true);
      this.#dataView.setUint32(offset + 4, 0, true);
      offset += 8;
    }

    // The linker guarantees global data starts from at least wasmMinDataAddr.
    // Keep in sync with cmd/link/internal/ld/data.go:wasmMinDataAddr.
    const wasmMinDataAddr = 4096 + 8192;
    if (offset >= wasmMinDataAddr) {
      throw new Error(
        "total length of command line and environment variables exceeds limit"
      );
    }

    this.#startDeferred = PromiseWithResolvers(Promise);
    this.#readyState = "running";
    const run =
      /** @type {(argc: number, argvPtr: number) => void} */ (this.#instance
        .exports.run);
    run(argc, argvPtr);
    return this.#startDeferred.promise;
  }
}
