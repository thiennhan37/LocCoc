param([ValidateSet(768,1536,3072)][int]$Dimension=1536)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$taskLog=Join-Path $taskRoot 'logs/moment-dimensions'
New-Item -ItemType Directory -Path $taskLog -Force | Out-Null
# This local experiment owns these two backend ports; the normal AI on 8087 stays up.
foreach($taskPort in @(8089,8097)) {
  $taskListeners=Get-NetTCPConnection -State Listen -LocalPort $taskPort -ErrorAction SilentlyContinue
  foreach($taskListener in $taskListeners) { Stop-Process -Id $taskListener.OwningProcess -ErrorAction Stop }
}
$taskKeys=@('EMBEDDING_DIM','EMBEDDING_PROFILE_ID','QDRANT_COLLECTION_NAME','PORT','IMAGE_ENHANCEMENT_ENABLED','POST_AI_SERVICE_URL','POST_WORKER_ENABLED','POST_DB_DDL_AUTO')
$taskPrevious=@{}
foreach($taskKey in $taskKeys) { $taskPrevious[$taskKey]=[Environment]::GetEnvironmentVariable($taskKey,'Process') }
try {
  $env:EMBEDDING_DIM="$Dimension"
  $env:EMBEDDING_PROFILE_ID="gemini2-d$Dimension-imgv1-queryv1"
  $env:QDRANT_COLLECTION_NAME="moments_gemini2_d${Dimension}_v1"
  $env:PORT='8097';$env:IMAGE_ENHANCEMENT_ENABLED='false'
  $taskAi=Start-Process -FilePath (Join-Path $taskRoot 'ai-service/.venv/Scripts/python.exe') -ArgumentList @('-m','uvicorn','scripts.dimension_server:app','--host','127.0.0.1','--port','8097','--no-access-log') -WorkingDirectory (Join-Path $taskRoot 'ai-service') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLog "ai-$Dimension.stdout.log") -RedirectStandardError (Join-Path $taskLog "ai-$Dimension.stderr.log") -PassThru
  $env:POST_AI_SERVICE_URL='http://127.0.0.1:8097';$env:POST_WORKER_ENABLED='true'
  $env:POST_DB_DDL_AUTO='validate'
  $taskPost=Start-Process -FilePath (Get-Command node).Source -ArgumentList @('scripts/start-post.mjs','--jar') -WorkingDirectory $taskRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $taskLog "post-$Dimension.stdout.log") -RedirectStandardError (Join-Path $taskLog "post-$Dimension.stderr.log") -PassThru
  @{dimension=$Dimension;aiLauncher=$taskAi.Id;postLauncher=$taskPost.Id;startedAt=[DateTime]::UtcNow.ToString('o')} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskLog 'runtime.json')
  Write-Output "Starting experimental dimension $Dimension (AI 8097, Post 8089)"
} finally { foreach($taskKey in $taskKeys) { [Environment]::SetEnvironmentVariable($taskKey,$taskPrevious[$taskKey],'Process') } }
