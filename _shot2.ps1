$ErrorActionPreference = 'Continue'
$root = 'c:/Users/22819/Documents/HBuilderProjects/xuyiheng-tools'
Set-Location $root
$server = Start-Process -FilePath "node" -ArgumentList "scripts/serve.js","--port=4173" -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
try { (Invoke-WebRequest -Uri http://127.0.0.1:4173/ -UseBasicParsing -TimeoutSec 5).StatusCode | Out-Null; Write-Host "SERVER_OK" } catch { Write-Host "SERVER_FAIL" }

$base = "http://127.0.0.1:4173/"
$pages = @("index.html","calculator/tax.html","calendar.html","combo/buy-house.html","discover.html","search.html","about.html","random.html","lotto.html","privacy.html","probability.html","tools.html")

playwright-cli open --browser=chromium 2>&1 | Out-Null
playwright-cli resize 1440 900 2>&1 | Out-Null

foreach($p in $pages){
  $name = "pg_" + ($p -replace '/','_' -replace '\.html$','')
  $out = Join-Path $root ($name+".png")
  playwright-cli goto ($base+$p) 2>&1 | Out-Null
  Start-Sleep -Milliseconds 900
  playwright-cli screenshot --filename=$out 2>&1 | Out-Null
  if(Test-Path $out){ Write-Host "OK $name" } else { Write-Host "MISS $name" }
}

playwright-cli resize 390 844 2>&1 | Out-Null
foreach($p in @("index.html","calculator/tax.html","combo/buy-house.html","calendar.html")){
  $name = "m_" + ($p -replace '/','_' -replace '\.html$','')
  $out = Join-Path $root ($name+".png")
  playwright-cli goto ($base+$p) 2>&1 | Out-Null
  Start-Sleep -Milliseconds 900
  playwright-cli screenshot --filename=$out 2>&1 | Out-Null
  if(Test-Path $out){ Write-Host "OK $name" } else { Write-Host "MISS $name" }
}

playwright-cli close 2>&1 | Out-Null
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
Write-Host "DONE"
