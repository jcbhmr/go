package ld

import _ "embed"
import "compress/gzip"
import "bytes"
import "encoding/base64"
import "os"
import "path/filepath"
import "runtime"

func wrapWASMInJS(ctxt *Link, flagOutfile string) {
	appWASM, err := os.ReadFile(flagOutfile)
	if err != nil {
		Exitf("failed to read WASM: %s", err)
	}

	wasmExec2JS, err := os.ReadFile(filepath.Join(runtime.GOROOT(), "misc/wasm/wasm_exec2.js"))
	if err != nil {
		Exitf("failed to read wasm_exec2.js: %s", err)
	}

	appWASMGz := bytes.Buffer{}
	gzWriter := gzip.NewWriter(&appWASMGz)

	_, err = gzWriter.Write(appWASM)
	if err != nil {
		Exitf("failed to gzip WASM: %s", err)
	}
	appWASM = nil
	
	err = gzWriter.Close()
	if err != nil {
		Exitf("failed to close gzip writer: %s", err)
	}

	appWASMGzBase64 := base64.StdEncoding.EncodeToString(appWASMGz.Bytes())
	appWASMGz = bytes.Buffer{}

	appJS := `const __APP_WASM_GZ_BASE64__="` + appWASMGzBase64 + `";` + "\n" + string(wasmExec2JS)
	appWASMGzBase64 = ""

	err = os.WriteFile(flagOutfile, []byte(appJS), 0644)
	if err != nil {
		Exitf("failed to write JS: %s", err)
	}
}