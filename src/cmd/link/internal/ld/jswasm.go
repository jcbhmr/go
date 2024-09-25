package ld

import (
	_ "embed"
	"encoding/base64"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
)

func wrapWASMInJS(ctxt *Link, flagOutfile string) {
	testWASM, err := os.ReadFile(flagOutfile)
	if err != nil {
		Exitf("failed to read WASM: %s", err)
	}

	fpath := filepath.Join(runtime.GOROOT(), "misc/wasm/gort0.js")
	gort0JS, err := os.ReadFile(fpath)
	if err != nil {
		Exitf("failed to read %s: %s", fpath, err)
	}

	fpath = filepath.Join(runtime.GOROOT(), "misc/wasm/wasm_exec.js")
	wasmExecJS, err := os.ReadFile(fpath)
	if err != nil {
		Exitf("failed to read %s: %s", fpath, err)
	}
	
	// This is a poor man's bundler. It works OK for this narrow use case.

	testWASMBase64 := base64.StdEncoding.EncodeToString(testWASM)

	wasmExecJSWithoutExports := string(wasmExecJS)
	wasmExecJSWithoutExports = regexp.MustCompile(`^export (var|let|const|function|class)`).ReplaceAllString(wasmExecJSWithoutExports, "$1")
	wasmExecJSWithoutExports = regexp.MustCompile(`^export \{.*\}`).ReplaceAllString(wasmExecJSWithoutExports, "")

	appJS := string(gort0JS)
	appJS = strings.Replace(appJS, `REPLACE_ME_WITH_TEST_WASM_BASE64`, `"` + testWASMBase64 + `"`, 1)
	appJS = strings.Replace(appJS, `import { Go } from "./wasm_exec.js";`, wasmExecJSWithoutExports, 1)

	err = os.WriteFile(flagOutfile, []byte(appJS), 0644)
	if err != nil {
		Exitf("failed to write JS: %s", err)
	}
}