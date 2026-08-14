# 演示 agent：通过 API 接取 → 读 workspace → 干活 → 交回。
# 用法: .\agent.ps1 [-BaseUrl http://localhost:8080] [-TaskTitle 验收测试任务] [-AgentId demo-agent] [-Name "Demo Agent"]
param(
  [string]$BaseUrl = "http://localhost:8080",
  [string]$TaskTitle = "验收测试任务",
  [string]$AgentId = "demo-agent",
  [string]$Name = "Demo Agent"
)
$ErrorActionPreference = 'Stop'

function Invoke-Json($method, $url, $obj) {
  $f = Join-Path $env:TEMP "lk-agent-body.json"
  if ($null -ne $obj) {
    Set-Content $f ($obj | ConvertTo-Json -Compress) -Encoding UTF8
    curl.exe -sS -X $method -H "Content-Type: application/json" --data-binary "@$f" $url
  } else {
    curl.exe -sS -X $method $url
  }
}

Write-Host "1. 找任务: $TaskTitle"
$task = (Invoke-Json GET "$BaseUrl/api/tasks" $null | ConvertFrom-Json) |
  Where-Object { $_.title -eq $TaskTitle -and $_.status -eq 'todo' } | Select-Object -First 1
if (-not $task) { Write-Error "没找到待处理的 '$TaskTitle'，先运行 create-task.ps1 或网页添加。" }

Write-Host "2. 接取: $($task.id)"
$claimed = Invoke-Json POST "$BaseUrl/api/tasks/$($task.id)/claim" @{ agentId = $AgentId; name = $Name } | ConvertFrom-Json
if (-not $claimed.claimedBy) { Write-Error "接取失败: $($claimed | ConvertTo-Json -Compress)" }
Write-Host "   状态: $($claimed.status) 由 $($claimed.claimedBy)"

Write-Host "3. 干活: 读 workspace 并写 output.txt"
$ws = $claimed.workspacePath
$out = Join-Path $ws "output.txt"
Set-Content $out "Light-Kanban 验收通过`n时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')`nagent: $AgentId" -Encoding UTF8
Write-Host "   已写入 $out"

Write-Host "4. 交回 complete"
$done = Invoke-Json POST "$BaseUrl/api/tasks/$($task.id)/complete" $null | ConvertFrom-Json
Write-Host "   状态: $($done.status)"

Write-Host "5. 请在网页上验收（验收通过 → 归档）"
