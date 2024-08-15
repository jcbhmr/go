# Go multiplatform

📦 Multiplatform self-extracting single-executable Go bundles \
🔀 Forked from [golang/go](https://github.com/golang/go)

<table align=center><td>

```sh
wget https://github.com/jcbhmr/go/releases/download/go1.23.0/go1.23.0.ape.zip
unzip go1.23.0.ape.zip
./go/go help
```

</table>

🌌 Bundles multiple platform-specific binaries into a single cross-platform binary \
🟦 Works on Windows too! \
😎 It's _one binary_ \
📂 Extracts & caches the the Go root & platform-specific binaries to a cache folder

## Installation

![Windows](https://img.shields.io/static/v1?style=for-the-badge&message=Windows&color=0078D4&logo=Windows&logoColor=FFFFFF&label=)
![Linux](https://img.shields.io/static/v1?style=for-the-badge&message=Linux&color=222222&logo=Linux&logoColor=FCC624&label=)
![macOS](https://img.shields.io/static/v1?style=for-the-badge&message=macOS&color=000000&logo=macOS&logoColor=FFFFFF&label=)

**🛑 This project is unofficial.** You should probably use [the official Go download page](https://go.dev/dl/). 

1. Download the zip.
2. Extract the zip.
3. \[Windows only\] Rename `go` and `gofmt` to have a `.com` or `.exe` suffix.

**https://github.com/jcbhmr/go/releases/download/go1.23.0/go1.23.0.ape.zip**

The all-in-one binaries should work on the following platforms:

- Windows x86-64
- Windows AArch64
- macOS x86-64
- macOS AArch64
- Linux x86-64
- Linux AArch64

TODO: Add the relevant \*BSDs that `cosmocc` also supports

You can check the [go.dev/dl](https://go.dev/dl/) page for more platforms.

## Development

![C++](https://img.shields.io/static/v1?style=for-the-badge&message=C%2B%2B&color=00599C&logo=C%2B%2B&logoColor=FFFFFF&label=)
![GitHub Actions](https://img.shields.io/static/v1?style=for-the-badge&message=GitHub+Actions&color=2088FF&logo=GitHub+Actions&logoColor=FFFFFF&label=)

This is a fork of the Go repository. I doubt the Go team would want to release a Cosmopolitan APE binary. 😭 This project is **unofficial**.

Right now there's [a bug in Cosmopolitan Libc](https://github.com/jart/cosmopolitan/issues/1248) that has been fixed but hasn't been published as a release yet. You'll need to build `cosmocc` from source to use the fix.

---

# The Go Programming Language

Go is an open source programming language that makes it easy to build simple,
reliable, and efficient software.

![Gopher image](https://golang.org/doc/gopher/fiveyears.jpg)
*Gopher image by [Renee French][rf], licensed under [Creative Commons 4.0 Attribution license][cc4-by].*

Our canonical Git repository is located at https://go.googlesource.com/go.
There is a mirror of the repository at https://github.com/golang/go.

Unless otherwise noted, the Go source files are distributed under the
BSD-style license found in the LICENSE file.

### Download and Install

#### Binary Distributions

Official binary distributions are available at https://go.dev/dl/.

After downloading a binary release, visit https://go.dev/doc/install
for installation instructions.

#### Install From Source

If a binary distribution is not available for your combination of
operating system and architecture, visit
https://go.dev/doc/install/source
for source installation instructions.

### Contributing

Go is the work of thousands of contributors. We appreciate your help!

To contribute, please read the contribution guidelines at https://go.dev/doc/contribute.

Note that the Go project uses the issue tracker for bug reports and
proposals only. See https://go.dev/wiki/Questions for a list of
places to ask questions about the Go language.

[rf]: https://reneefrench.blogspot.com/
[cc4-by]: https://creativecommons.org/licenses/by/4.0/
