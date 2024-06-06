// @ts-check
export {};
// This file alone (no embedded WASM) is ~5700 bytes minzipped.
// TODO: Shorter encode/decode fallbacks
// TODO: Shorter gunzip fallback

/* -------------------------------------------------------------------------- */
/*             TextEncoder#encode and TextDecoder#decode ponyfills            */
/* -------------------------------------------------------------------------- */

/** @param {string} string */
function encodeFallback(string) {
  var pos = 0;
  var len = string.length;

  var at = 0; // output position
  var tlen = Math.max(32, len + (len >>> 1) + 7); // 1.5x size
  var target = new Uint8Array((tlen >>> 3) << 3); // ... but at 8 byte offset

  while (pos < len) {
    var value = string.charCodeAt(pos++);
    if (value >= 0xd800 && value <= 0xdbff) {
      // high surrogate
      if (pos < len) {
        var extra = string.charCodeAt(pos);
        if ((extra & 0xfc00) === 0xdc00) {
          ++pos;
          value = ((value & 0x3ff) << 10) + (extra & 0x3ff) + 0x10000;
        }
      }
      if (value >= 0xd800 && value <= 0xdbff) {
        continue; // drop lone surrogate
      }
    }

    // expand the buffer if we couldn't write 4 bytes
    if (at + 4 > target.length) {
      tlen += 8; // minimum extra
      tlen *= 1.0 + (pos / string.length) * 2; // take 2x the remaining
      tlen = (tlen >>> 3) << 3; // 8 byte offset

      var update = new Uint8Array(tlen);
      update.set(target);
      target = update;
    }

    if ((value & 0xffffff80) === 0) {
      // 1-byte
      target[at++] = value; // ASCII
      continue;
    } else if ((value & 0xfffff800) === 0) {
      // 2-byte
      target[at++] = ((value >>> 6) & 0x1f) | 0xc0;
    } else if ((value & 0xffff0000) === 0) {
      // 3-byte
      target[at++] = ((value >>> 12) & 0x0f) | 0xe0;
      target[at++] = ((value >>> 6) & 0x3f) | 0x80;
    } else if ((value & 0xffe00000) === 0) {
      // 4-byte
      target[at++] = ((value >>> 18) & 0x07) | 0xf0;
      target[at++] = ((value >>> 12) & 0x3f) | 0x80;
      target[at++] = ((value >>> 6) & 0x3f) | 0x80;
    } else {
      continue; // out of range
    }

    target[at++] = (value & 0x3f) | 0x80;
  }

  return target.slice(0, at);
}

/** @param {Uint8Array} bytes */
function decodeFallback(bytes) {
  var inputIndex = 0;

  // Create a working buffer for UTF-16 code points, but don't generate one
  // which is too large for small input sizes. UTF-8 to UCS-16 conversion is
  // going to be at most 1:1, if all code points are ASCII. The other extreme
  // is 4-byte UTF-8, which results in two UCS-16 points, but this is still 50%
  // fewer entries in the output.
  var pendingSize = Math.min(256 * 256, bytes.length + 1);
  var pending = new Uint16Array(pendingSize);
  var chunks = [];
  var pendingIndex = 0;

  for (;;) {
    var more = inputIndex < bytes.length;

    // If there's no more data or there'd be no room for two UTF-16 values,
    // create a chunk. This isn't done at the end by simply slicing the data
    // into equal sized chunks as we might hit a surrogate pair.
    if (!more || pendingIndex >= pendingSize - 1) {
      // nb. .apply and friends are *really slow*. Low-hanging fruit is to
      // expand this to literally pass pending[0], pending[1], ... etc, but
      // the output code expands pretty fast in this case.
      // These extra vars get compiled out: they're just to make TS happy.
      // Turns out you can pass an ArrayLike to .apply().
      var subarray = pending.subarray(0, pendingIndex);
      var arraylike = /** @type {number[]} */ (
        /** @type {unknown} */ (subarray)
      );
      chunks.push(String.fromCharCode.apply(null, arraylike));

      if (!more) {
        return chunks.join("");
      }

      // Move the buffer forward and create another chunk.
      bytes = bytes.subarray(inputIndex);
      inputIndex = 0;
      pendingIndex = 0;
    }

    // The native TextDecoder will generate "REPLACEMENT CHARACTER" where the
    // input data is invalid. Here, we blindly parse the data even if it's
    // wrong: e.g., if a 3-byte sequence doesn't have two valid continuations.

    var byte1 = bytes[inputIndex++];
    if ((byte1 & 0x80) === 0) {
      // 1-byte or null
      pending[pendingIndex++] = byte1;
    } else if ((byte1 & 0xe0) === 0xc0) {
      // 2-byte
      var byte2 = bytes[inputIndex++] & 0x3f;
      pending[pendingIndex++] = ((byte1 & 0x1f) << 6) | byte2;
    } else if ((byte1 & 0xf0) === 0xe0) {
      // 3-byte
      var byte2 = bytes[inputIndex++] & 0x3f;
      var byte3 = bytes[inputIndex++] & 0x3f;
      pending[pendingIndex++] = ((byte1 & 0x1f) << 12) | (byte2 << 6) | byte3;
    } else if ((byte1 & 0xf8) === 0xf0) {
      // 4-byte
      var byte2 = bytes[inputIndex++] & 0x3f;
      var byte3 = bytes[inputIndex++] & 0x3f;
      var byte4 = bytes[inputIndex++] & 0x3f;

      // this can be > 0xffff, so possibly generate surrogates
      var codepoint =
        ((byte1 & 0x07) << 0x12) | (byte2 << 0x0c) | (byte3 << 0x06) | byte4;
      if (codepoint > 0xffff) {
        // codepoint &= ~0x10000;
        codepoint -= 0x10000;
        pending[pendingIndex++] = ((codepoint >>> 10) & 0x3ff) | 0xd800;
        codepoint = 0xdc00 | (codepoint & 0x3ff);
      }
      pending[pendingIndex++] = codepoint;
    } else {
      // invalid initial byte
    }
  }
}

/** @type {TextEncoder | null} */
let encoder = null;
/** @param {string} string */
function encode(string) {
  if (globalThis.TextEncoder) {
    if (!encoder) {
      encoder = new TextEncoder();
    }
    return encoder.encode(string);
  } else {
    return encodeFallback(string);
  }
}

/** @type {TextDecoder | null} */
let decoder = null;
/** @param {Uint8Array} bytes */
function decode(bytes) {
  if (globalThis.TextDecoder) {
    if (!decoder) {
      decoder = new TextDecoder();
    }
    return decoder.decode(bytes);
  } else {
    return decodeFallback(bytes);
  }
}

/* -------------------------------------------------------------------------- */
/*                       Uint8Array.fromBase64 ponyfill                       */
/* -------------------------------------------------------------------------- */

/**
 * @param {string} base64
 * @param {{}} options
 */
function Uint8ArrayFromBase64(base64, options = {}) {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = Object.fromEntries(
    Array.from(alphabet).map((a, i) => [a.charCodeAt(0), i])
  );
  lookup["=".charCodeAt(0)] = 0;
  lookup["-".charCodeAt(0)] = 62;
  lookup["_".charCodeAt(0)] = 63;

  base64 = base64.replace(/=/g, "");
  let n = base64.length;
  let rem = n % 4;
  let k = rem && rem - 1; // how many bytes the last base64 chunk encodes
  let m = (n >> 2) * 3 + k; // total encoded bytes

  let encoded = encode(base64 + "===");

  for (let i = 0, j = 0; i < n; i += 4, j += 3) {
    let x =
      (lookup[encoded[i]] << 18) +
      (lookup[encoded[i + 1]] << 12) +
      (lookup[encoded[i + 2]] << 6) +
      lookup[encoded[i + 3]];
    encoded[j] = x >> 16;
    encoded[j + 1] = (x >> 8) & 0xff;
    encoded[j + 2] = x & 0xff;
  }
  return new Uint8Array(encoded.buffer, 0, m);
}

/* -------------------------------------------------------------------------- */
/*                      Gunzip implemented in JavaScript                      */
/* -------------------------------------------------------------------------- */

/**
 * @param {Uint8Array} compressed
 * @see https://github.com/101arrowz/fflate/blob/master/src/index.ts
 */
function gunzipFallback(compressed) {
  // DEFLATE is a complex format; to read this code, you should probably check the RFC first:
  // https://tools.ietf.org/html/rfc1951
  // You may also wish to take a look at the guide I made about this program:
  // https://gist.github.com/101arrowz/253f31eb5abc3d9275ab943003ffecad
  // Some of the following code is similar to that of UZIP.js:
  // https://github.com/photopea/UZIP.js
  // However, the vast majority of the codebase has diverged from UZIP.js to increase performance and reduce bundle size.
  // Sometimes 0 will appear where -1 would be more appropriate. This is because using a uint
  // is better for memory in most engines (I *think*).

  // aliases for shorter compressed code (most minifers don't do this)
  var u8 = Uint8Array,
    u16 = Uint16Array,
    i32 = Int32Array;
  // fixed length extra bits
  var fleb = new u8([
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5,
    5, 5, 5, 0, /* unused */ 0, 0, /* impossible */ 0,
  ]);
  // fixed distance extra bits
  var fdeb = new u8([
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
    11, 11, 12, 12, 13, 13, /* unused */ 0, 0,
  ]);
  // code length index map
  var clim = new u8([
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
  ]);
  // get base, reverse index map from extra bits
  var freb = function (eb, start) {
    var b = new u16(31);
    for (var i = 0; i < 31; ++i) {
      b[i] = start += 1 << eb[i - 1];
    }
    // numbers here are at max 18 bits
    var r = new i32(b[30]);
    for (var i = 1; i < 30; ++i) {
      for (var j = b[i]; j < b[i + 1]; ++j) {
        r[j] = ((j - b[i]) << 5) | i;
      }
    }
    return { b: b, r: r };
  };
  var _a = freb(fleb, 2),
    fl = _a.b,
    revfl = _a.r;
  // we can ignore the fact that the other numbers are wrong; they never happen anyway
  (fl[28] = 258), (revfl[258] = 28);
  var _b = freb(fdeb, 0),
    fd = _b.b;
  // map of value to reverse (assuming 16 bits)
  var rev = new u16(32768);
  for (var i = 0; i < 32768; ++i) {
    // reverse table algorithm from SO
    var x = ((i & 0xaaaa) >> 1) | ((i & 0x5555) << 1);
    x = ((x & 0xcccc) >> 2) | ((x & 0x3333) << 2);
    x = ((x & 0xf0f0) >> 4) | ((x & 0x0f0f) << 4);
    rev[i] = (((x & 0xff00) >> 8) | ((x & 0x00ff) << 8)) >> 1;
  }
  // create huffman tree from u8 "map": index -> code length for code index
  // mb (max bits) must be at most 15
  // TODO: optimize/split up?
  var hMap = function (cd, mb, r) {
    var s = cd.length;
    // index
    var i = 0;
    // u16 "map": index -> # of codes with bit length = index
    var l = new u16(mb);
    // length of cd must be 288 (total # of codes)
    for (; i < s; ++i) {
      if (cd[i]) ++l[cd[i] - 1];
    }
    // u16 "map": index -> minimum code for bit length = index
    var le = new u16(mb);
    for (i = 1; i < mb; ++i) {
      le[i] = (le[i - 1] + l[i - 1]) << 1;
    }
    var co;
    if (r) {
      // u16 "map": index -> number of actual bits, symbol for code
      co = new u16(1 << mb);
      // bits to remove for reverser
      var rvb = 15 - mb;
      for (i = 0; i < s; ++i) {
        // ignore 0 lengths
        if (cd[i]) {
          // num encoding both symbol and bits read
          var sv = (i << 4) | cd[i];
          // free bits
          var r_1 = mb - cd[i];
          // start value
          var v = le[cd[i] - 1]++ << r_1;
          // m is end value
          for (var m = v | ((1 << r_1) - 1); v <= m; ++v) {
            // every 16 bit value starting with the code yields the same result
            co[rev[v] >> rvb] = sv;
          }
        }
      }
    } else {
      co = new u16(s);
      for (i = 0; i < s; ++i) {
        if (cd[i]) {
          co[i] = rev[le[cd[i] - 1]++] >> (15 - cd[i]);
        }
      }
    }
    return co;
  };
  // fixed length tree
  var flt = new u8(288);
  for (var i = 0; i < 144; ++i) flt[i] = 8;
  for (var i = 144; i < 256; ++i) flt[i] = 9;
  for (var i = 256; i < 280; ++i) flt[i] = 7;
  for (var i = 280; i < 288; ++i) flt[i] = 8;
  // fixed distance tree
  var fdt = new u8(32);
  for (var i = 0; i < 32; ++i) fdt[i] = 5;
  // fixed length map
  var flrm = /*#__PURE__*/ hMap(flt, 9, 1);
  // fixed distance map
  var fdrm = /*#__PURE__*/ hMap(fdt, 5, 1);
  // find max of array
  var max = function (a) {
    var m = a[0];
    for (var i = 1; i < a.length; ++i) {
      if (a[i] > m) m = a[i];
    }
    return m;
  };
  // read d, starting at bit p and mask with m
  var bits = function (d, p, m) {
    var o = (p / 8) | 0;
    return ((d[o] | (d[o + 1] << 8)) >> (p & 7)) & m;
  };
  // read d, starting at bit p continuing for at least 16 bits
  var bits16 = function (d, p) {
    var o = (p / 8) | 0;
    return (d[o] | (d[o + 1] << 8) | (d[o + 2] << 16)) >> (p & 7);
  };
  // get end of byte
  var shft = function (p) {
    return ((p + 7) / 8) | 0;
  };
  // typed array slice - allows garbage collector to free original reference,
  // while being more compatible than .slice
  var slc = function (v, s, e) {
    if (e == null || e > v.length) e = v.length;
    // can't use .constructor in case user-supplied
    return new u8(v.subarray(s, e));
  };
  // error codes
  var ec = [
    "unexpected EOF",
    "invalid block type",
    "invalid length/literal",
    "invalid distance",
    "stream finished",
    "no stream handler",
    ,
    "no callback",
    "invalid UTF-8 data",
    "extra field too long",
    "date not in range 1980-2099",
    "filename too long",
    "stream finishing",
    "invalid zip data",
    // determined by unknown compression method
  ];
  var err = function (ind, msg, nt) {
    var e = new Error(msg || ec[ind]);
    // @ts-ignore
    e.code = ind;
    // @ts-ignore
    if (Error.captureStackTrace)
      // @ts-ignore
      Error.captureStackTrace(e, err);
    if (!nt) throw e;
    return e;
  };
  // expands raw DEFLATE data
  var inflt = function (dat, st, buf, dict) {
    // source length       dict length
    var sl = dat.length,
      dl = dict ? dict.length : 0;
    if (!sl || (st.f && !st.l)) return buf || new u8(0);
    var noBuf = !buf;
    // have to estimate size
    var resize = noBuf || st.i != 2;
    // no state
    var noSt = st.i;
    // Assumes roughly 33% compression ratio average
    if (noBuf) buf = new u8(sl * 3);
    // ensure buffer can fit at least l elements
    var cbuf = function (l) {
      var bl = buf.length;
      // need to increase size to fit
      if (l > bl) {
        // Double or set to necessary, whichever is greater
        var nbuf = new u8(Math.max(bl * 2, l));
        nbuf.set(buf);
        buf = nbuf;
      }
    };
    //  last chunk         bitpos           bytes
    var final = st.f || 0,
      pos = st.p || 0,
      bt = st.b || 0,
      lm = st.l,
      dm = st.d,
      lbt = st.m,
      dbt = st.n;
    // total bits
    var tbts = sl * 8;
    do {
      if (!lm) {
        // BFINAL - this is only 1 when last chunk is next
        final = bits(dat, pos, 1);
        // type: 0 = no compression, 1 = fixed huffman, 2 = dynamic huffman
        var type = bits(dat, pos + 1, 3);
        pos += 3;
        if (!type) {
          // go to end of byte boundary
          var s = shft(pos) + 4,
            l = dat[s - 4] | (dat[s - 3] << 8),
            t = s + l;
          if (t > sl) {
            if (noSt) err(0);
            break;
          }
          // ensure size
          if (resize) cbuf(bt + l);
          // Copy over uncompressed data
          buf.set(dat.subarray(s, t), bt);
          // Get new bitpos, update byte count
          (st.b = bt += l), (st.p = pos = t * 8), (st.f = final);
          continue;
        } else if (type == 1) (lm = flrm), (dm = fdrm), (lbt = 9), (dbt = 5);
        else if (type == 2) {
          //  literal                            lengths
          var hLit = bits(dat, pos, 31) + 257,
            hcLen = bits(dat, pos + 10, 15) + 4;
          var tl = hLit + bits(dat, pos + 5, 31) + 1;
          pos += 14;
          // length+distance tree
          var ldt = new u8(tl);
          // code length tree
          var clt = new u8(19);
          for (var i = 0; i < hcLen; ++i) {
            // use index map to get real code
            clt[clim[i]] = bits(dat, pos + i * 3, 7);
          }
          pos += hcLen * 3;
          // code lengths bits
          var clb = max(clt),
            clbmsk = (1 << clb) - 1;
          // code lengths map
          var clm = hMap(clt, clb, 1);
          for (var i = 0; i < tl; ) {
            var r = clm[bits(dat, pos, clbmsk)];
            // bits read
            pos += r & 15;
            // symbol
            var s = r >> 4;
            // code length to copy
            if (s < 16) {
              ldt[i++] = s;
            } else {
              //  copy   count
              var c = 0,
                n = 0;
              if (s == 16)
                (n = 3 + bits(dat, pos, 3)), (pos += 2), (c = ldt[i - 1]);
              else if (s == 17) (n = 3 + bits(dat, pos, 7)), (pos += 3);
              else if (s == 18) (n = 11 + bits(dat, pos, 127)), (pos += 7);
              while (n--) ldt[i++] = c;
            }
          }
          //    length tree                 distance tree
          var lt = ldt.subarray(0, hLit),
            dt = ldt.subarray(hLit);
          // max length bits
          lbt = max(lt);
          // max dist bits
          dbt = max(dt);
          lm = hMap(lt, lbt, 1);
          dm = hMap(dt, dbt, 1);
        } else err(1);
        if (pos > tbts) {
          if (noSt) err(0);
          break;
        }
      }
      // Make sure the buffer can hold this + the largest possible addition
      // Maximum chunk size (practically, theoretically infinite) is 2^17
      if (resize) cbuf(bt + 131072);
      var lms = (1 << lbt) - 1,
        dms = (1 << dbt) - 1;
      var lpos = pos;
      for (; ; lpos = pos) {
        // bits read, code
        // @ts-ignore
        var c = lm[bits16(dat, pos) & lms],
          sym = c >> 4;
        pos += c & 15;
        if (pos > tbts) {
          if (noSt) err(0);
          break;
        }
        if (!c) err(2);
        if (sym < 256) buf[bt++] = sym;
        else if (sym == 256) {
          (lpos = pos), (lm = null);
          break;
        } else {
          var add = sym - 254;
          // no extra bits needed if less
          if (sym > 264) {
            // index
            var i = sym - 257,
              b = fleb[i];
            add = bits(dat, pos, (1 << b) - 1) + fl[i];
            pos += b;
          }
          // dist
          var d = dm[bits16(dat, pos) & dms],
            dsym = d >> 4;
          if (!d) err(3);
          pos += d & 15;
          // @ts-ignore
          var dt = fd[dsym];
          if (dsym > 3) {
            var b = fdeb[dsym];
            // @ts-ignore
            (dt += bits16(dat, pos) & ((1 << b) - 1)), (pos += b);
          }
          if (pos > tbts) {
            if (noSt) err(0);
            break;
          }
          if (resize) cbuf(bt + 131072);
          var end = bt + add;
          if (bt < dt) {
            // @ts-ignore
            var shift = dl - dt,
              // @ts-ignore
              dend = Math.min(dt, end);
            if (shift + bt < 0) err(3);
            for (; bt < dend; ++bt) buf[bt] = dict[shift + bt];
          }
          for (; bt < end; ++bt)
            // @ts-ignore
            buf[bt] = buf[bt - dt];
        }
      }
      (st.l = lm), (st.p = lpos), (st.b = bt), (st.f = final);
      if (lm) (final = 1), (st.m = lbt), (st.d = dm), (st.n = dbt);
    } while (!final);
    // don't reallocate for streams or user buffers
    return bt != buf.length && noBuf ? slc(buf, 0, bt) : buf.subarray(0, bt);
  };
  // empty
  var et = /*#__PURE__*/ new u8(0);
  // gzip footer: -8 to -4 = CRC, -4 to -0 is length
  // gzip start
  var gzs = function (d) {
    if (d[0] != 31 || d[1] != 139 || d[2] != 8) err(6, "invalid gzip data");
    var flg = d[3];
    var st = 10;
    if (flg & 4) st += (d[10] | (d[11] << 8)) + 2;
    // @ts-ignore
    for (var zs = ((flg >> 3) & 1) + ((flg >> 4) & 1); zs > 0; zs -= !d[st++]);
    return st + (flg & 2);
  };
  // gzip length
  var gzl = function (d) {
    var l = d.length;
    return (
      (d[l - 4] | (d[l - 3] << 8) | (d[l - 2] << 16) | (d[l - 1] << 24)) >>> 0
    );
  };
  /**
   * Expands GZIP data
   * @param data The data to decompress
   * @param opts The decompression options
   * @returns The decompressed version of the data
   */
  function gunzipSync(data, opts) {
    var st = gzs(data);
    if (st + 8 > data.length) err(6, "invalid gzip data");
    return inflt(
      data.subarray(st, -8),
      { i: 2 },
      (opts && opts.out) || new u8(gzl(data)),
      opts && opts.dictionary
    );
  }
  // text decoder
  var td = typeof TextDecoder != "undefined" && /*#__PURE__*/ new TextDecoder();
  try {
    // @ts-ignore
    td.decode(et, { stream: true });
  } catch (e) {}

  // @ts-ignore
  return gunzipSync(compressed);
}

/* -------------------------------------------------------------------------- */
/*            Gunzip wrapper around DecompressionStream or fallback           */
/* -------------------------------------------------------------------------- */

/** @param {Uint8Array} compressed */
async function gunzip(compressed) {
  if (globalThis.DecompressionStream) {
    /** @type {Uint8Array[]} */
    const chunks = [];
    await new ReadableStream({
      start(controller) {
        controller.enqueue(compressed);
        controller.close();
      },
    })
      .pipeThrough(new DecompressionStream("gzip"))
      .pipeTo(
        new WritableStream({
          write(chunk, controller) {
            chunks.push(chunk);
          },
        })
      );
    const result = new Uint8Array(
      chunks.reduce((acc, chunk) => acc + chunk.length, 0)
    );
    let offset = 0;
    for (const chunk of chunks) {
      result.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return result;
  } else {
    return gunzipFallback(compressed);
  }
}

/* -------------------------------------------------------------------------- */
/*                       Go + JavaScript bridge runtime                       */
/* -------------------------------------------------------------------------- */

function PromiseWithResolvers() {
  /** @type {(value: any) => void} */
  let resolve;
  /** @type {(reason: any) => void} */
  let reject;
  const promise = new Promise((resolve2, reject2) => {
    resolve = resolve2;
    reject = reject2;
  });
  // @ts-ignore
  return { promise, resolve, reject };
}

/**
 * @typedef {object} GoOptions
 * @property {((specifier: string, options?: ImportCallOptions) => Promise<any>) | null} [import]
 * @property {ImportMeta | null} [importMeta]
 */

/**
 * Inspired by `node:wasi`.
 * @see https://nodejs.org/api/wasi.html
 */
class Go {
  /**
   * @protected
   * @readonly
   * @type {(specifier: string, options?: ImportCallOptions) => Promise<any>}
   */
  _import;
  /**
   * @protected
   * @readonly
   * @type {ImportMeta | null}
   */
  _importMeta = null;
  /** @type {"created" | "starting" | "running" | "exited"} */
  #readyState = "created";
  /** @param {GoOptions} [options] */
  constructor(options = {}) {
    if (options.import) {
      this._import = options.import;
    } else {
      try {
        // @ts-ignore
        this._import = new Function("s", "o", "return import(s)");
      } catch {
        this._import = (specifier, options) => import(specifier);
      }
    }
    this._importMeta = options.importMeta ?? null;
  }

  /** @type {DataView | null} */
  #dataViewCache = null;
  get #dataView() {
    if (!this.#dataViewCache) {
      const memory = /** @type {WebAssembly.Memory} */ (
        /** @type {WebAssembly.Instance} */ (this.#instance).exports.mem
      );
      this.#dataViewCache = new DataView(memory.buffer);
    }
    return this.#dataViewCache;
  }

  #setInt64(addr, v) {
    this.#dataView.setUint32(addr + 0, v, true);
    this.#dataView.setUint32(addr + 4, Math.floor(v / 4294967296), true);
  }
  #getInt64(addr) {
    const low = this.#dataView.getUint32(addr + 0, true);
    const high = this.#dataView.getInt32(addr + 4, true);
    return low + high * 4294967296;
  }
  #loadValue(addr) {
    const f = this.#dataView.getFloat64(addr, true);
    if (f === 0) {
      return undefined;
    }
    if (!isNaN(f)) {
      return f;
    }

    const id = this.#dataView.getUint32(addr, true);
    return /** @type {any[]} */ (this.#values)[id];
  }
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

    let id = /** @type {Map<any, number>} */ (this.#ids).get(v);
    if (id === undefined) {
      id = /** @type {number[]} */ (this.#idPool).pop();
      if (id === undefined) {
        id = /** @type {any[]} */ (this.#values).length;
      }
      /** @type {any[]} */ (this.#values)[id] = v;
      /** @type {number[]} */ (this.#goRefCounts)[id] = 0;
      /** @type {Map<any, number>} */ (this.#ids).set(v, id);
    }
    /** @type {number[]} */ (this.#goRefCounts)[id]++;
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
  #loadSlice(addr) {
    const array = this.#getInt64(addr + 0);
    const len = this.#getInt64(addr + 8);
    return new Uint8Array(this.#dataView.buffer, array, len);
  }
  #loadSliceOfValues(addr) {
    const array = this.#getInt64(addr + 0);
    const len = this.#getInt64(addr + 8);
    const a = new Array(len);
    for (let i = 0; i < len; i++) {
      a[i] = this.#loadValue(array + i * 8);
    }
    return a;
  }
  #loadString(addr) {
    const saddr = this.#getInt64(addr + 0);
    const len = this.#getInt64(addr + 8);
    return decode(new Uint8Array(this.#dataView.buffer, saddr, len));
  }

  /** @returns {WebAssembly.Imports} */
  getImportObject() {
    return { gojs: this.gojs };
  }

  /** @type {WebAssembly.ModuleImports} */
  _gotest = {
    add: (a, b) => a + b,
  };

  /** @type {WebAssembly.ModuleImports} */
  gojs = {
    // Go's SP does not change as long as no Go code is running. Some operations (e.g. calls, getters and setters)
    // may synchronously trigger a Go event handler. This makes Go code get executed in the middle of the imported
    // function. A goroutine can switch to a new stack if the current stack is too small (see morestack function).
    // This changes the SP, thus we have to update the SP used by the imported function.

    // func wasmExit(code int32)
    "runtime.wasmExit": (sp) => {
      sp >>>= 0;
      const code = this.#dataView.getInt32(sp + 8, true);
      this.#process.exit(code);
      this.#readyState = "exited";
      this.#instance = null;
      this.#values = null;
      this.#goRefCounts = null;
      this.#ids = null;
      this.#idPool = null;
      /** @type {{ promise: Promise<number>; resolve: (value: number) => void; reject: (reason: any) => void; }} */ (
        this.#startDeferred
      ).resolve(code);
    },

    // func wasmWrite(fd uintptr, p unsafe.Pointer, n int32)
    "runtime.wasmWrite": (sp) => {
      sp >>>= 0;
      const fd = this.#getInt64(sp + 8);
      const p = this.#getInt64(sp + 16);
      const n = this.#dataView.getInt32(sp + 24, true);
      this.#fs.writeSync(fd, new Uint8Array(this.#dataView.buffer, p, n));
    },

    // func resetMemoryDataView()
    "runtime.resetMemoryDataView": (sp) => {
      sp >>>= 0;
      const memory = /** @type {WebAssembly.Memory} */ (
        /** @type {WebAssembly.Instance} */ (this.#instance).exports.mem
      );
      this.#dataViewCache = new DataView(memory.buffer);
    },

    // func nanotime1() int64
    "runtime.nanotime1": (sp) => {
      sp >>>= 0;
      this.#setInt64(
        sp + 8,
        (performance.timeOrigin + performance.now()) * 1000000
      );
    },

    // func walltime() (sec int64, nsec int32)
    "runtime.walltime": (sp) => {
      sp >>>= 0;
      const msec = new Date().getTime();
      this.#setInt64(sp + 8, msec / 1000);
      this.#dataView.setInt32(sp + 16, (msec % 1000) * 1000000, true);
    },

    // func scheduleTimeoutEvent(delay int64) int32
    "runtime.scheduleTimeoutEvent": (sp) => {
      sp >>>= 0;
      const id = this.#nextCallbackTimeoutID;
      this.#nextCallbackTimeoutID++;
      /** @type {Map<number, number>} */ (this.#scheduledTimeouts).set(
        id,
        setTimeout(() => {
          this.#resume();
          while (
            /** @type {Map<number, number>} */ (this.#scheduledTimeouts).has(id)
          ) {
            // for some reason Go failed to register the timeout event, log and try again
            // (temporary workaround for https://github.com/golang/go/issues/28975)
            if (globalThis.console) {
              console.warn("scheduleTimeoutEvent: missed timeout event");
            }
            this.#resume();
          }
        }, this.#getInt64(sp + 8))
      );
      this.#dataView.setInt32(sp + 16, id, true);
    },

    // func clearTimeoutEvent(id int32)
    "runtime.clearTimeoutEvent": (sp) => {
      sp >>>= 0;
      const id = this.#dataView.getInt32(sp + 8, true);
      clearTimeout(
        /** @type {Map<number, number>} */ (this.#scheduledTimeouts).get(id)
      );
      /** @type {Map<number, number>} */ (this.#scheduledTimeouts).delete(id);
    },

    // func getRandomData(r []byte)
    "runtime.getRandomData": (sp) => {
      sp >>>= 0;
      crypto.getRandomValues(this.#loadSlice(sp + 8));
    },

    // func finalizeRef(v ref)
    "syscall/js.finalizeRef": (sp) => {
      sp >>>= 0;
      const id = this.#dataView.getUint32(sp + 8, true);
      /** @type {number[]} */ (this.#goRefCounts)[id]--;
      if (/** @type {number[]} */ (this.#goRefCounts)[id] === 0) {
        const v = /** @type {any[]} */ (this.#values)[id];
        /** @type {any[]} */ (this.#values)[id] = null;
        /** @type {Map<any, number>} */ (this.#ids).delete(v);
        /** @type {number[]} */ (this.#idPool).push(id);
      }
    },

    // func stringVal(value string) ref
    "syscall/js.stringVal": (sp) => {
      sp >>>= 0;
      this.#storeValue(sp + 24, this.#loadString(sp + 8));
    },

    // func valueGet(v ref, p string) ref
    "syscall/js.valueGet": (sp) => {
      sp >>>= 0;
      const result = Reflect.get(
        this.#loadValue(sp + 8),
        this.#loadString(sp + 16)
      );
      const getsp = /** @type {() => number} */ (
        /** @type {WebAssembly.Instance} */ (this.#instance).exports.getsp
      );
      sp = getsp() >>> 0; // see comment above
      this.#storeValue(sp + 32, result);
    },

    // func valueSet(v ref, p string, x ref)
    "syscall/js.valueSet": (sp) => {
      sp >>>= 0;
      Reflect.set(
        this.#loadValue(sp + 8),
        this.#loadString(sp + 16),
        this.#loadValue(sp + 32)
      );
    },

    // func valueDelete(v ref, p string)
    "syscall/js.valueDelete": (sp) => {
      sp >>>= 0;
      Reflect.deleteProperty(
        this.#loadValue(sp + 8),
        this.#loadString(sp + 16)
      );
    },

    // func valueIndex(v ref, i int) ref
    "syscall/js.valueIndex": (sp) => {
      sp >>>= 0;
      this.#storeValue(
        sp + 24,
        Reflect.get(this.#loadValue(sp + 8), this.#getInt64(sp + 16))
      );
    },

    // valueSetIndex(v ref, i int, x ref)
    "syscall/js.valueSetIndex": (sp) => {
      sp >>>= 0;
      Reflect.set(
        this.#loadValue(sp + 8),
        this.#getInt64(sp + 16),
        this.#loadValue(sp + 24)
      );
    },

    // func valueCall(v ref, m string, args []ref) (ref, bool)
    "syscall/js.valueCall": (sp) => {
      sp >>>= 0;
      try {
        const v = this.#loadValue(sp + 8);
        const m = Reflect.get(v, this.#loadString(sp + 16));
        const args = this.#loadSliceOfValues(sp + 32);
        const result = Reflect.apply(m, v, args);
        const getsp = /** @type {() => number} */ (
          /** @type {WebAssembly.Instance} */ (this.#instance).exports.getsp
        );
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 56, result);
        this.#dataView.setUint8(sp + 64, 1);
      } catch (err) {
        const getsp = /** @type {() => number} */ (
          /** @type {WebAssembly.Instance} */ (this.#instance).exports.getsp
        );
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 56, err);
        this.#dataView.setUint8(sp + 64, 0);
      }
    },

    // func valueInvoke(v ref, args []ref) (ref, bool)
    "syscall/js.valueInvoke": (sp) => {
      sp >>>= 0;
      try {
        const v = this.#loadValue(sp + 8);
        const args = this.#loadSliceOfValues(sp + 16);
        const result = Reflect.apply(v, undefined, args);
        const getsp = /** @type {() => number} */ (
          /** @type {WebAssembly.Instance} */ (this.#instance).exports.getsp
        );
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 40, result);
        this.#dataView.setUint8(sp + 48, 1);
      } catch (err) {
        const getsp = /** @type {() => number} */ (
          /** @type {WebAssembly.Instance} */ (this.#instance).exports.getsp
        );
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 40, err);
        this.#dataView.setUint8(sp + 48, 0);
      }
    },

    // func valueNew(v ref, args []ref) (ref, bool)
    "syscall/js.valueNew": (sp) => {
      sp >>>= 0;
      try {
        const v = this.#loadValue(sp + 8);
        const args = this.#loadSliceOfValues(sp + 16);
        const result = Reflect.construct(v, args);
        const getsp = /** @type {() => number} */ (
          /** @type {WebAssembly.Instance} */ (this.#instance).exports.getsp
        );
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 40, result);
        this.#dataView.setUint8(sp + 48, 1);
      } catch (err) {
        const getsp = /** @type {() => number} */ (
          /** @type {WebAssembly.Instance} */ (this.#instance).exports.getsp
        );
        sp = getsp() >>> 0; // see comment above
        this.#storeValue(sp + 40, err);
        this.#dataView.setUint8(sp + 48, 0);
      }
    },

    // func valueLength(v ref) int
    "syscall/js.valueLength": (sp) => {
      sp >>>= 0;
      this.#setInt64(sp + 16, parseInt(this.#loadValue(sp + 8).length));
    },

    // valuePrepareString(v ref) (ref, int)
    "syscall/js.valuePrepareString": (sp) => {
      sp >>>= 0;
      const str = encode(String(this.#loadValue(sp + 8)));
      this.#storeValue(sp + 16, str);
      this.#setInt64(sp + 24, str.length);
    },

    // valueLoadString(v ref, b []byte)
    "syscall/js.valueLoadString": (sp) => {
      sp >>>= 0;
      const str = this.#loadValue(sp + 8);
      this.#loadSlice(sp + 16).set(str);
    },

    // func valueInstanceOf(v ref, t ref) bool
    "syscall/js.valueInstanceOf": (sp) => {
      sp >>>= 0;
      this.#dataView.setUint8(
        sp + 24,
        this.#loadValue(sp + 8) instanceof this.#loadValue(sp + 16) ? 1 : 0
      );
    },

    // func copyBytesToGo(dst []byte, src ref) (int, bool)
    "syscall/js.copyBytesToGo": (sp) => {
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
    "syscall/js.copyBytesToJS": (sp) => {
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

    debug: (value) => {
      console.log(value);
    },
  };

  /** @type {{ id: number, this: any, args: any[] } | null} */
  _pendingEvent = null;
  #resume() {
    if (this.#readyState !== "running") {
      throw new Error("Go program has already exited");
    }
    const resume = /** @type {() => void} */ (
      /** @type {WebAssembly.Instance} */ (this.#instance).exports.resume
    );
    resume();
  }
  /**
   * @protected
   * @param {number} id
   */
  _makeFuncWrapper(id) {
    const go = this;
    return function (...args) {
      const event = { id: id, this: this, args: args };
      go._pendingEvent = event;
      go.#resume();
      return event.result;
    };
  }

  /** @type {any | null} */
  #fs = null;
  /** @type {any | null} */
  #process = null;
  /** @type {WebAssembly.Instance | null} */
  #instance = null;
  /** @type {{ promise: Promise<number>, resolve: (value: number) => void, reject: (reason: any) => void } | null} */
  #startDeferred = null;
  /** @type {any[] | null} */
  #values = null;
  /** @type {number[] | null} */
  #goRefCounts = null;
  /** @type {Map<any, number> | null} */
  #ids = null;
  /** @type {number[] | null} */
  #idPool = null;
  /** @type {number} */
  #nextCallbackTimeoutID = 1;
  /** @type {Map<number, number> | null} */
  #scheduledTimeouts = null;
  /** @param {WebAssembly.Instance} instance */
  async start(instance) {
    if (this.#readyState !== "created") {
      throw new Error("Go program already started");
    }
    this.#readyState = "starting";
    this.#instance = instance;

    this.#fs = await this._import("node:fs");
    this.#process = await this._import("node:process");

    this.#values = [NaN, 0, null, true, false, globalThis, this];
    this.#goRefCounts = new Array(this.#values.length).fill(Infinity);
    this.#ids = new Map(
      /** @type {[any, number][]} */ ([
        [0, 1],
        [null, 2],
        [true, 3],
        [false, 4],
        [globalThis, 5],
        [this, 6],
      ])
    );
    this.#idPool = [];
    this.#scheduledTimeouts = new Map();

    // Pass command line arguments and environment variables to WebAssembly by writing them to the linear memory.
    let offset = 4096;

    /** @param {string} str */
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

    this.#startDeferred = PromiseWithResolvers();
    this.#readyState = "running";
    const run = /** @type {(argc: number, argvPtr: number) => void} */ (
      this.#instance.exports.run
    );
    run(argc, argvPtr);
    return this.#startDeferred;
  }
}

/* -------------------------------------------------------------------------- */
/*                                Import stubs                                */
/* -------------------------------------------------------------------------- */

function createENOSYS() {
  return Object.assign(new Error("ENOSYS: Function not implemented"), {
    code: "ENOSYS",
  });
}

function throw_(v) {
  throw v;
}

let outputBuffer = "";
const fsStub = {
  __proto__: null,
  get default() {
    return fsStub;
  },
  constants: {
    __proto__: null,
    O_WRONLY: -1,
    O_RDWR: -1,
    O_CREAT: -1,
    O_TRUNC: -1,
    O_APPEND: -1,
    O_EXCL: -1,
  },
  writeSync(fd, buffer, offset, length, position) {
    if ((fd !== 1 && fd !== 2) || position != null) {
      throw createENOSYS();
    }
    const bytes = new Uint8Array(buffer.buffer, offset, length)
    outputBuffer += decode(bytes);
    const newlineIndex = outputBuffer.lastIndexOf("\n");
    if (newlineIndex !== -1) {
      const text = outputBuffer.slice(0, newlineIndex);
      outputBuffer = outputBuffer.slice(newlineIndex + 1);
      if (globalThis.console) {
        console.log(text);
      }
    }
    return bytes.length;
  },
  write(fd, buffer, offset, length, position, callback) {
    let x;
    try {
      x = fsStub.writeSync(fd, buffer, offset, length, position);
    } catch (e) {
      callback(e);
    }
    callback(null, x);
  },
  chmod: (path, mode, callback) => void callback(createENOSYS()),
  chown: (path, uid, gid, callback) => void callback(createENOSYS()),
  close: (fd, callback) => void callback(createENOSYS()),
  fchmod: (fd, mode, callback) => void callback(createENOSYS()),
  fchown: (fd, uid, gid, callback) => void callback(createENOSYS()),
  fstat: (fd, callback) => void callback(createENOSYS()),
  fsync: (fd, callback) => void callback(null),
  ftruncate: (fd, length, callback) => void callback(createENOSYS()),
  lchown: (path, uid, gid, callback) => void callback(createENOSYS()),
  link: (path, link, callback) => void callback(createENOSYS()),
  lstat: (path, callback) => void callback(createENOSYS()),
  mkdir: (path, perm, callback) => void callback(createENOSYS()),
  open: (path, flags, mode, callback) => void callback(createENOSYS()),
  read: (fd, buffer, offset, length, position, callback) =>
    void callback(createENOSYS()),
  readdir: (path, callback) => void callback(createENOSYS()),
  readlink: (path, callback) => void callback(createENOSYS()),
  rename: (from, to, callback) => void callback(createENOSYS()),
  rmdir: (path, callback) => void callback(createENOSYS()),
  stat: (path, callback) => void callback(createENOSYS()),
  symlink: (path, link, callback) => void callback(createENOSYS()),
  truncate: (path, length, callback) => void callback(createENOSYS()),
  unlink: (path, callback) => void callback(createENOSYS()),
  utimes: (path, atime, mtime, callback) => void callback(createENOSYS()),
};

let processStubExitCode = 0;
const processStub = {
  __proto__: null,
  get default() {
    return processStub;
  },
  argv: ["js"],
  argv0: "js",
  env: {},
  getuid: () => -1,
  getgid: () => -1,
  geteuid: () => -1,
  getegid: () => -1,
  get pid() {
    return -1;
  },
  get ppid() {
    return -1;
  },
  getgroups: () => throw_(createENOSYS()),
  umask: () => throw_(createENOSYS()),
  cwd: () => throw_(createENOSYS()),
  chdir: () => throw_(createENOSYS()),
  exit: (code = undefined) => {
    if (code != null) {
      processStubExitCode = code;
    }
    if (globalThis.console && processStubExitCode) {
      console.warn(`exit code: ${processStubExitCode}`);
    }
  },
  get exitCode() {
    return processStubExitCode;
  },
};

/* -------------------------------------------------------------------------- */
/*                   Decode & run the Go WebAssembly program                  */
/* -------------------------------------------------------------------------- */

const appWASM = await gunzip(
  Uint8ArrayFromBase64(
    // @ts-ignore
    /** @type {string} */ (__APP_WASM_GZ_BASE64__)
  )
);
const go = new Go({
  import: (specifier, options) =>
    import(specifier).catch((e) => {
      if (specifier === "node:fs" || specifier === "fs") {
        return fsStub;
      } else if (specifier === "node:process" || specifier === "process") {
        return processStub;
      } else {
        throw e;
      }
    }),
  importMeta: import.meta,
});
const { instance } = await WebAssembly.instantiate(
  appWASM,
  go.getImportObject()
);
const exitCode = await go.start(instance);
