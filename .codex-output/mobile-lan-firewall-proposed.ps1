[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$originalBlockName = '{A534430E-1745-42AF-BBC8-C518D42852F1}'
$allowName = 'LocCoc-Dev-Gateway-Phone-WiFi'
$guardName = 'LocCoc-Dev-Gateway-Block-Other-Devices'
$nodeProgram = 'D:\MySystemApplication\node.exe'
$laptopIp = '10.251.37.35'
$phoneIp = '10.251.36.96'
$deviceAdb = 'D:\MySystemApplication\My_Android_std\SDK\platform-tools\adb.exe'
$deviceSerial = '69ifauirprauypyh'

# This proposal is limited to the discovered laptop/phone and requires the
# user's explicit approval before execution. It never disables the firewall.
$originalBlock = Get-NetFirewallRule -Name $originalBlockName
$originalPort = $originalBlock | Get-NetFirewallPortFilter
$originalApplication = $originalBlock | Get-NetFirewallApplicationFilter
if ($originalBlock.Action -ne 'Block' -or
    $originalBlock.Profile -ne 'Public' -or
    $originalBlock.Enabled -ne 'True' -or
    $originalPort.Protocol -ne 'TCP' -or
    (@($originalPort.LocalPort) -join ',') -ne 'Any' -or
    $originalApplication.Program -ine $nodeProgram) {
    throw 'The original firewall state has changed. No changes applied.'
}
foreach ($ruleName in @($allowName, $guardName)) {
    if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
        throw "Rule $ruleName already exists; inspect it before proceeding."
    }
}

$snapshot = [ordered]@{
    OriginalBlockName = $originalBlockName
    OriginalLocalPort = @($originalPort.LocalPort)
    NodeProgram = $nodeProgram
    AddedRules = @($allowName, $guardName)
    LaptopIp = $laptopIp
    PhoneIp = $phoneIp
    GatewayPort = 8080
}
$snapshot | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (
    Join-Path $PSScriptRoot 'mobile-lan-firewall-20261028.json'
) -Encoding utf8

try {
    # Preserve explicit blocking for other IPv4/IPv6 sources on port 8080.
    # Unspecified/broadcast addresses are not valid TCP peer addresses.
    New-NetFirewallRule -Name $guardName `
        -DisplayName 'LocCoc Dev - keep gateway blocked for other devices' `
        -Group 'LocCoc Development' -Direction Inbound -Action Block `
        -Enabled True -Profile Public -Program $nodeProgram -Protocol TCP `
        -LocalPort 8080 -RemoteAddress @(
            '0.0.0.1-10.251.36.95',
            '10.251.36.97-255.255.255.254',
            '2000::/3',
            'fc00::/7',
            'fe80::/10'
        ) -ErrorAction Stop | Out-Null

    New-NetFirewallRule -Name $allowName `
        -DisplayName 'LocCoc Dev - API Gateway from Android phone over Wi-Fi' `
        -Group 'LocCoc Development' -Direction Inbound -Action Allow `
        -Enabled True -Profile Public -Program $nodeProgram -Protocol TCP `
        -LocalPort 8080 -LocalAddress $laptopIp -RemoteAddress $phoneIp `
        -InterfaceAlias 'Wi-Fi' -ErrorAction Stop | Out-Null

    # An explicit block wins over an allow rule. Keep all other Node TCP ports
    # blocked, and use the two rules above to control the single exception.
    $originalPort | Set-NetFirewallPortFilter `
        -LocalPort @('1-8079', '8081-65535') -ErrorAction Stop | Out-Null

    Start-Sleep -Seconds 1
    $phoneProbe = & $deviceAdb -s $deviceSerial shell "(printf 'GET /health HTTP/1.1\r\nHost: localhost\r\nConnection: close\r\n\r\n'; sleep 2) | toybox nc -W 4 -w 4 $laptopIp 8080" 2>&1
    if (($phoneProbe -join "`n") -notmatch 'HTTP/1\.1 200') {
        throw 'Phone Wi-Fi probe failed. Restoring original firewall settings.'
    }
    Write-Output 'Phone reached the gateway over Wi-Fi: HTTP 200.'
    Write-Output 'Firewall exception retained only for this phone and TCP/8080.'
} catch {
    Get-NetFirewallRule -Name $originalBlockName |
        Get-NetFirewallPortFilter |
        Set-NetFirewallPortFilter -LocalPort Any | Out-Null
    foreach ($ruleName in @($allowName, $guardName)) {
        Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue |
            Remove-NetFirewallRule
    }
    throw
}
