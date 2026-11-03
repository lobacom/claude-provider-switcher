#!/bin/sh
# Install for the current user; bootstrap a private Node runtime if necessary.
set -eu
repo_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
prefix='' bin_dir='' json=0 private_node=0 no_download=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --prefix|--bin-dir)
      [ "$#" -ge 2 ] && [ -n "$2" ] || { echo "$1 requires a directory" >&2; exit 1; }
      if [ "$1" = --prefix ]; then prefix=$2; else bin_dir=$2; fi
      shift 2 ;;
    --json) json=1; shift ;;
    --private-node) private_node=1; shift ;;
    --no-node-download) no_download=1; shift ;;
    -h|--help)
      echo 'Usage: sh install.sh [--prefix DIR] [--bin-dir DIR] [--private-node] [--no-node-download] [--json]'
      echo 'Installs for the current user. Missing Node.js is downloaded privately from nodejs.org (SHA-256 verified).'
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done
if [ -z "$prefix" ]; then
  prefix="$HOME/.local/share/claude-provider-switcher"
  [ -n "$bin_dir" ] || bin_dir="$HOME/.local/bin"
fi
node_exe=''
usable_node() {
  node_major=$("$1" -p 'parseInt(process.versions.node)' 2>/dev/null) || return 1
  case "$node_major" in ''|*[!0-9]*) return 1 ;; esac
  [ "$node_major" -ge 18 ]
}
if [ "$private_node" -eq 0 ] && command -v node >/dev/null 2>&1; then
  candidate=$(command -v node)
  if usable_node "$candidate"; then node_exe=$candidate; fi
fi
runtime_root="$prefix/runtime"
if [ -z "$node_exe" ]; then
  for candidate in "$runtime_root"/node-v24.*/bin/node; do
    if [ -f "$candidate" ] && usable_node "$candidate"; then node_exe=$candidate; break; fi
  done
fi
if [ -z "$node_exe" ]; then
  if [ "$no_download" -eq 1 ]; then
    echo 'Node.js 18+ not found; downloads disabled. Install Node.js or omit --no-node-download.' >&2
    exit 1
  fi
  case $(uname -s) in Linux) node_os=linux ;; Darwin) node_os=darwin ;; *) echo 'Unsupported OS; install Node.js 18+ manually.' >&2; exit 1 ;; esac
  case $(uname -m) in x86_64|amd64) node_arch=x64 ;; aarch64|arm64) node_arch=arm64 ;; *) echo 'Unsupported CPU; install Node.js 18+ manually.' >&2; exit 1 ;; esac
  download() {
    if command -v curl >/dev/null 2>&1; then curl --fail --location --proto '=https' --tlsv1.2 --silent --show-error "$1" -o "$2"
    elif command -v wget >/dev/null 2>&1; then wget -q --https-only "$1" -O "$2"
    else echo 'curl or wget is required to download Node.js.' >&2; return 1; fi
  }
  checksum() {
    if command -v sha256sum >/dev/null 2>&1; then sha256sum "$1" | awk '{print $1}'
    elif command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
    else echo 'sha256sum or shasum is required to verify Node.js.' >&2; return 1; fi
  }
  mkdir -p "$runtime_root"
  download_dir=$(mktemp -d "$runtime_root/.download.XXXXXX")
  manifest="$download_dir/SHASUMS256.txt"
  archive="$download_dir/node.tar.gz"
  trap 'rm -f "$manifest" "$archive"; rmdir "$download_dir"' EXIT
  base_url=https://nodejs.org/dist/latest-v24.x
  echo 'Downloading a private Node 24 LTS runtime from nodejs.org...' >&2
  download "$base_url/SHASUMS256.txt" "$manifest"
  archive_name=$(awk -v target="$node_os-$node_arch" '$2 ~ "^node-v24\\.[0-9]+\\.[0-9]+-" target "\\.tar\\.gz$" {print $2}' "$manifest")
  case "$archive_name" in ''|*' '*|*'
'*) echo 'No official Node.js archive for this platform.' >&2; exit 1 ;; esac
  expected_hash=$(awk -v file="$archive_name" '$2 == file {print $1}' "$manifest")
  [ "${#expected_hash}" -eq 64 ] || { echo 'Invalid Node.js checksum manifest.' >&2; exit 1; }
  download "$base_url/$archive_name" "$archive"
  [ "$(checksum "$archive")" = "$expected_hash" ] || { echo 'Node.js download failed SHA-256 verification.' >&2; exit 1; }
  tar -xzf "$archive" -C "$runtime_root"
  node_exe="$runtime_root/${archive_name%.tar.gz}/bin/node"
  usable_node "$node_exe" || { echo 'Downloaded Node.js could not start; check OS compatibility.' >&2; exit 1; }
  echo "Private Node.js runtime installed: $node_exe" >&2
fi
set -- "$repo_dir/cli/install.js" --prefix "$prefix"
[ -z "$bin_dir" ] || set -- "$@" --bin-dir "$bin_dir"
[ "$json" -eq 0 ] || set -- "$@" --json
# Do not exec: the download cleanup trap must run after installation.
"$node_exe" "$@"
