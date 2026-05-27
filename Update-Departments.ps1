# Update-Departments.ps1
# Queries Active Directory and writes a departments.csv next to this script.
# Format: username,department  (skips disabled accounts and users with no department)
#
# Usage:
#   Right-click → Run with PowerShell
#   OR from a PowerShell prompt:  .\Update-Departments.ps1
#
# Requires the machine to be domain-joined. No RSAT needed (uses built-in DirectoryServices).

$ErrorActionPreference = 'Stop'
$out = Join-Path $PSScriptRoot 'departments.csv'

Write-Host "Querying Active Directory..." -ForegroundColor Cyan

# Filter: person + user + NOT disabled (userAccountControl bit 2 = ACCOUNTDISABLE)
$ldapFilter = '(&(objectCategory=person)(objectClass=user)(!userAccountControl:1.2.840.113556.1.4.803:=2))'

$searcher = New-Object DirectoryServices.DirectorySearcher
$searcher.Filter = $ldapFilter
$searcher.PageSize = 1000
$null = $searcher.PropertiesToLoad.Add('samaccountname')
$null = $searcher.PropertiesToLoad.Add('department')

$results = $searcher.FindAll()

function CsvEscape([string]$s) {
  if ($s -match '[,"\r\n]') { return '"' + ($s -replace '"', '""') + '"' }
  return $s
}

$rows = New-Object System.Collections.Generic.List[string]
$rows.Add('username,department')

$total = 0
$mapped = 0
foreach ($r in $results) {
  $total++
  $user = [string]$r.Properties['samaccountname']
  $dept = [string]$r.Properties['department']
  if (-not $user) { continue }
  if (-not $dept) { continue }
  $rows.Add("$(CsvEscape $user),$(CsvEscape $dept)")
  $mapped++
}

$rows | Set-Content -Path $out -Encoding UTF8

Write-Host "Wrote $mapped of $total enabled users to:" -ForegroundColor Green
Write-Host "  $out"
Write-Host ""
Write-Host "Drop this file onto the app, or open the app via http://localhost:4333 to auto-load."

if ($Host.Name -eq 'ConsoleHost' -and -not $env:NO_PAUSE) {
  Write-Host ""
  Write-Host "Press any key to close..." -ForegroundColor DarkGray
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
