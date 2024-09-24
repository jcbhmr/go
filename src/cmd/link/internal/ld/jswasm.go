package ld

import (
	"bytes"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
)

func wrapWASMInJS(ctxt *Link, flagOutfile string) {
	appWASM, err := os.ReadFile(flagOutfile)
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

	// Poor man's bundler
	appWASMBase64 := base64.StdEncoding.EncodeToString(appWASM)
	appJS := strings.Replace(string(gort0JS), `import { Go } from "./wasm_exec.js";`, strings.Replace(string(wasmExecJS), `export class Go {`, `class Go {`, 1), 1)
	appJS = strings.Replace(appJS, `#!/usr/bin/env node` + "\n", `#!/usr/bin/env node` + "\n" + `const TEST_WASM_BASE64="` + appWASMBase64 + `";` + "\n", 1)

	err = os.WriteFile(flagOutfile, []byte(appJS), 0644)
	if err != nil {
		Exitf("failed to write JS: %s", err)
	}
}