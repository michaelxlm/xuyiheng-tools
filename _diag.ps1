$ErrorActionPreference = 'Continue'
Set-Location 'c:/Users/22819/Documents/HBuilderProjects/xuyiheng-tools'
$server = Start-Process -FilePath "node" -ArgumentList "scripts/serve.js","--port=4173" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
playwright-cli open --browser=chromium 2>&1 | Out-Null
playwright-cli resize 1440 900 2>&1 | Out-Null
playwright-cli goto "http://127.0.0.1:4173/index.html" 2>&1 | Out-Null
Start-Sleep -Milliseconds 800
Write-Host "=== screenshot with filename ==="
playwright-cli screenshot --filename=shot_index.png 2>&1 | Out-String
Write-Host "=== list ==="
Get-ChildItem -Path '.playwright-cli' -Filter *.png | Select-Object Name, Length
Write-Host "=== screenshot with abs path ==="
playwright-cli screenshot --filename="c:/Users/22819/Documents/HBuilderProjects/xuyiheng-tools/_t.png" 2>&1 | Out-String
Test-Path 'c:/Users/22819/Documents/HBuilderProjects/xuyiheng-tools/_t.png'
playwright-cli close 2>&1 | Out-Null
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
