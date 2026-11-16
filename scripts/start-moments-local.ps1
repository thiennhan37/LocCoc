$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskLogDir = Join-Path $taskRoot 'logs/moments-local'
New-Item -ItemType Directory -Path $taskLogDir -Force | Out-Null
$taskRecords = @()
$taskServices = @(
  @{ Name = 'auth-service'; Port = 8000; File = (Get-Command node).Source; Args = @('dist/main.js') },
  @{ Name = 'api-gateway'; Port = 8080; File = (Get-Command node).Source; Args = @('dist/main.js') },
  @{ Name = 'ai-service'; Port = 8087; File = (Join-Path $taskRoot 'ai-service/.venv/Scripts/python.exe'); Args = @('-m','uvicorn','app.main:app','--host','127.0.0.1','--port','8087','--no-access-log') },
  @{ Name = 'moment-service'; Port = 8088; File = (Get-Command node).Source; Args = @('dist/main.js') }
)
foreach ($taskService in $taskServices) {
  $taskListening = Get-NetTCPConnection -State Listen -LocalPort $taskService.Port -ErrorAction SilentlyContinue
  if ($taskListening) {
    Write-Output "$($taskService.Name): port $($taskService.Port) already listening; preserving existing process"
    $taskRecords += @{ name=$taskService.Name; port=$taskService.Port; pid=$taskListening[0].OwningProcess; startedByScript=$false }
    continue
  }
  $taskProcess = Start-Process -FilePath $taskService.File -ArgumentList $taskService.Args `
    -WorkingDirectory (Join-Path $taskRoot $taskService.Name) -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $taskLogDir "$($taskService.Name).stdout.log") `
    -RedirectStandardError (Join-Path $taskLogDir "$($taskService.Name).stderr.log") -PassThru
  $taskRecords += @{ name=$taskService.Name; port=$taskService.Port; pid=$taskProcess.Id; startedByScript=$true; startedAt=$taskProcess.StartTime.ToUniversalTime().ToString('o') }
  $taskRecords | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskLogDir 'processes.json') -Encoding utf8
  $taskReady = $false
  for ($taskAttempt=0; $taskAttempt -lt 80; $taskAttempt++) {
    if (Get-NetTCPConnection -State Listen -LocalPort $taskService.Port -ErrorAction SilentlyContinue) { $taskReady=$true; break }
    $taskProcess.Refresh()
    if ($taskProcess.HasExited) { break }
    Start-Sleep -Milliseconds 250
  }
  if (-not $taskReady) { throw "$($taskService.Name) did not start; inspect logs/moments-local (no credentials are printed by this launcher)" }
  Write-Output "$($taskService.Name): listening on $($taskService.Port) (PID $($taskProcess.Id))"
}
Write-Output 'Local services started; process IDs and logs are in logs/moments-local.'
