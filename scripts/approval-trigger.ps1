# DSH-Mobile — approval-trigger calibration marker.
Write-Host "DSH-Mobile approval calibration: attempting an approved write."
$marker = "calibration-$(Get-Date -Format o)"
Set-Content -Path "$PSScriptRoot\approval-marker.txt" -Value $marker
Write-Output "marker: $marker"
