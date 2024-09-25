// Copyright 2024 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

//go:build ignore

package main

import (
	"log"
	"net/http"
	"os"
)

const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Go JS WASM</title>
  </head>
  <body>
	  <p>Open your DevTools to see the console. Refresh the page to rerun.</p>
    <script type="module" src="test.js"></script>
  </body>
</html>`

func main() {
	http.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(html))
	})
	http.HandleFunc("/test.js", func(w http.ResponseWriter, r *http.Request) {
    js, err := os.ReadFile(os.Args[1])
    if err != nil {
      http.Error(w, err.Error(), http.StatusInternalServerError)
      return
    }
		w.Header().Set("Content-Type", "text/javascript")
    w.Write(js)
	})
	log.Println("Open http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
