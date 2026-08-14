# 人类操作：把「验收测试任务」放到看板上（等价于网页上手动添加）。
# 用法: .\create-task.ps1 [-BaseUrl http://localhost:8080]
param(
  [string]$BaseUrl = "http://localhost:8080"
)
$ErrorActionPreference = 'Stop'
$ws = Split-Path -Parent $MyInvocation.MyCommand.Path
$payload = @{
  title         = "验收测试任务"
  workspacePath = $ws
  type          = "demo"
  tags          = @("验收")
} | ConvertTo-Json -Compress
$f = Join-Path $env:TEMP "lk-create.json"
Set-Content $f $payload -Encoding UTF8
$resp = curl.exe -sS -X POST -H "Content-Type: application/json" --data-binary "@$f" "$BaseUrl/api/tasks"
$task = $resp | ConvertFrom-Json
if (-not $task.id) { Write-Error "创建失败: $resp" }
Write-Host "已创建任务: $($task.id) 标题=$($task.title) 状态=$($task.status)"
Write-Host "workspace 文件夹: $($task.workspacePath)"
Write-Host "接下来运行: .\agent.ps1"
