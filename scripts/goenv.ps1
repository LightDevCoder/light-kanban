# Sourced by build/test commands so the self-contained toolchain under .tools/ is used.
# Usage: . .\scripts\goenv.ps1; go version
$root = Split-Path -Parent $PSScriptRoot
$env:GOROOT = Join-Path $root '.tools\go'
$env:GOPATH = Join-Path $root '.tools\gopath'
$env:GOCACHE = Join-Path $root '.tools\gocache'
$env:GOTOOLCHAIN = 'local'
$env:PATH = "$env:GOROOT\bin;$env:PATH"
