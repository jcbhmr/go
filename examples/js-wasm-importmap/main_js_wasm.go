package main

import (
	"fmt"
	"os"
)

func main() {
	path := "message.txt"
	data, err := os.ReadFile(path)
	if err != nil {
		panic(err)
	}
	fmt.Printf("Contents of %s:\n%s", path, data)
}
