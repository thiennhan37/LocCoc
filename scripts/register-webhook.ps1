# ==============================================================================
# Script Đăng Ký / Cập Nhật Webhook URL trên PayOS
# ==============================================================================
# Cách sử dụng:
#   .\scripts\register-webhook.ps1 -WebhookUrl "https://your-domain.ngrok-free.app/payments/webhook/payos"
# ==============================================================================

param (
    [Parameter(Mandatory = $false)]
    [string]$WebhookUrl
)

# 1. Đọc biến môi trường từ file .env nếu có
$envFile = Join-Path $PSScriptRoot "..\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $parts = $line.Split("=", 2)
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            [System.Environment]::SetEnvironmentVariable($key, $value)
        }
    }
}

$clientId = [System.Environment]::GetEnvironmentVariable("PAYOS_CLIENT_ID")
$apiKey = [System.Environment]::GetEnvironmentVariable("PAYOS_API_KEY")

if (-not $clientId -or -not $apiKey -or $clientId -eq "your-payos-client-id") {
    Write-Host "[LỖI] Chưa cấu hình PAYOS_CLIENT_ID hoặc PAYOS_API_KEY trong file .env!" -ForegroundColor Red
    exit 1
}

# 2. Yêu cầu nhập Webhook URL nếu chưa truyền qua tham số
if (-not $WebhookUrl) {
    $WebhookUrl = Read-Host "Nhập public Webhook URL của bạn (vd: https://xxxx.ngrok-free.app/payments/webhook/payos)"
}

if (-not $WebhookUrl) {
    Write-Host "[LỖI] Webhook URL không được để trống!" -ForegroundColor Red
    exit 1
}

Write-Host "--------------------------------------------------------"
Write-Host "Đang gửi yêu cầu đăng ký Webhook URL tới PayOS..." -ForegroundColor Cyan
Write-Host "URL: $WebhookUrl"
Write-Host "Client ID: $clientId"
Write-Host "--------------------------------------------------------"

$headers = @{
    "x-client-id"  = $clientId
    "x-api-key"    = $apiKey
    "Content-Type" = "application/json"
}

$body = @{
    "webhookUrl" = $WebhookUrl
} | ConvertTo-Json

$payosEndpoint = "https://api-merchant.payos.vn/confirm-webhook"

try {
    $response = Invoke-RestMethod -Uri $payosEndpoint -Method Post -Headers $headers -Body $body
    Write-Host "[THÀNH CÔNG] Đã xác nhận Webhook URL với PayOS!" -ForegroundColor Green
    Write-Host ($response | ConvertTo-Json -Depth 5) -ForegroundColor Yellow
} catch {
    Write-Host "[THẤT BẠI] Không thể đăng ký Webhook URL:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.ErrorDetails.Message) {
        Write-Host "Chi tiết lỗi từ PayOS: $($_.ErrorDetails.Message)" -ForegroundColor Red
    }
    Write-Host "`nLƯU Ý: PayOS sẽ gửi 1 request test (POST) tới Webhook URL để xác minh trước khi kích hoạt. Hãy đảm bảo API Gateway / Payment Service đang chạy và có thể truy cập được từ internet." -ForegroundColor DarkYellow
}
