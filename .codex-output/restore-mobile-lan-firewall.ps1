[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
# Restore the original Node Public TCP block before removing its exceptions.
Get-NetFirewallRule -Name '{A534430E-1745-42AF-BBC8-C518D42852F1}' -ErrorAction Stop |
    Get-NetFirewallPortFilter -ErrorAction Stop |
    Set-NetFirewallPortFilter -LocalPort Any -ErrorAction Stop | Out-Null
foreach ($ruleName in @(
    'LocCoc-Dev-Gateway-LAN-WiFi',
    'LocCoc-Dev-Gateway-Phone-WiFi',
    'LocCoc-Dev-Gateway-Block-Other-Devices'
)) {
    Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue |
        Remove-NetFirewallRule -ErrorAction Stop
}
Write-Output 'Original Node Public firewall block restored; LocCoc Wi-Fi exceptions removed.'
