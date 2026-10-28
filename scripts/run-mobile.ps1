[CmdletBinding()]
param(
    [string]$ServerClientId,
    [string]$ApiBaseUrl,
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$FlutterArgs
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$envPath = Join-Path $projectRoot '.env'
$publicConfig = @{}

# Read only public settings. Do not evaluate the file or pass backend secrets
# through --dart-define-from-file to the mobile application.
if (Test-Path -LiteralPath $envPath) {
    foreach ($line in Get-Content -LiteralPath $envPath) {
        if ($line -match '^\s*(GOOGLE_SERVER_CLIENT_ID|GOOGLE_CLIENT_IDS|API_BASE_URL)\s*=\s*(.*?)\s*$') {
            $publicConfig[$Matches[1]] = $Matches[2].Trim().Trim('"').Trim("'")
        }
    }
}

if ([string]::IsNullOrWhiteSpace($ServerClientId)) {
    $ServerClientId = $env:GOOGLE_SERVER_CLIENT_ID
}
if ([string]::IsNullOrWhiteSpace($ServerClientId)) {
    $ServerClientId = $publicConfig['GOOGLE_SERVER_CLIENT_ID']
}
if ([string]::IsNullOrWhiteSpace($ServerClientId)) {
    $allowedIds = @($publicConfig['GOOGLE_CLIENT_IDS'] -split ',' |
        ForEach-Object { $_.Trim() } | Where-Object { $_ })
    if ($allowedIds.Count -eq 1) {
        $ServerClientId = $allowedIds[0]
        Write-Host 'Using the single GOOGLE_CLIENT_IDS entry. It must be a Web application OAuth client ID.'
    }
}
if ([string]::IsNullOrWhiteSpace($ServerClientId)) {
    throw 'Set GOOGLE_SERVER_CLIENT_ID to your Web application OAuth client ID, or pass -ServerClientId. Do not choose an arbitrary ID from GOOGLE_CLIENT_IDS.'
}
$ServerClientId = $ServerClientId.Trim()
if ($ServerClientId -notmatch '^[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$') {
    throw 'The server client ID must be one Google OAuth client ID ending in .apps.googleusercontent.com.'
}
if ([string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
    $ApiBaseUrl = $publicConfig['API_BASE_URL']
}

$runArgs = @('run', "--dart-define=GOOGLE_SERVER_CLIENT_ID=$ServerClientId")
if (-not [string]::IsNullOrWhiteSpace($ApiBaseUrl)) {
    $runArgs += "--dart-define=API_BASE_URL=$($ApiBaseUrl.Trim())"
}
$runArgs += $FlutterArgs

Push-Location (Join-Path $projectRoot 'MobileApp')
try {
    & flutter @runArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Flutter exited with code $LASTEXITCODE."
    }
} finally {
    Pop-Location
}
