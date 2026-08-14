# Produces the release binaries under dist/. Windows keeps the plain name
# (light-kanban.exe) because that is the name all docs tell users to run.
# Usage: . .\scripts\goenv.ps1; .\scripts\cross-build.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force -Path $dist | Out-Null
$targets = @(
    @{ OS = 'linux';   ARCH = 'amd64'; Out = 'light-kanban-linux-amd64' },
    @{ OS = 'darwin';  ARCH = 'amd64'; Out = 'light-kanban-darwin-amd64' },
    @{ OS = 'darwin';  ARCH = 'arm64'; Out = 'light-kanban-darwin-arm64' },
    @{ OS = 'windows'; ARCH = 'amd64'; Out = 'light-kanban.exe' }
)
foreach ($t in $targets) {
    $env:GOOS = $t.OS
    $env:GOARCH = $t.ARCH
    $out = Join-Path $dist $t.Out
    go build -o $out ./cmd/light-kanban
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
    Write-Host "built $out"
}
