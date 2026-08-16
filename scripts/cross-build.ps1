# Produces the release binaries under dist/. Windows keeps the plain name
# (light-kanban.exe) because that is the name all docs tell users to run.
# Builds the React frontend first (ADR-0002) so the embedded UI is fresh.
# Usage: . .\scripts\goenv.ps1; .\scripts\cross-build.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$dist = Join-Path $root 'dist'

# Frontend: install deps on first run, build, stage into internal/webui/dist.
$frontend = Join-Path $root 'frontend'
if (-not (Test-Path (Join-Path $frontend 'node_modules'))) {
    Push-Location $frontend; npm ci; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; Pop-Location
}
Push-Location $frontend; npm run build; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; Pop-Location
$webuiDist = Join-Path $root 'internal\webui\dist'
if (Test-Path $webuiDist) { Remove-Item -Recurse -Force $webuiDist }
Copy-Item -Recurse (Join-Path $frontend 'dist') $webuiDist
Write-Host "frontend staged -> internal/webui/dist"

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
