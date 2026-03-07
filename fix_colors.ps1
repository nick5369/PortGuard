$f = "c:\Sem 6\containerrisk\PortGuard\Frontend\src\pages\risk-engine\RiskCharts.jsx"
$content = Get-Content $f -Raw
$content = $content.Replace('strokeDasharray="3 3" stroke="rgba(150,150,150,0.15)"', 'strokeDasharray="3 3" stroke={GRID_COLOR}')
$content = $content.Replace('stroke="rgba(150,150,150,0.2)"', 'stroke={GRID_COLOR}')
Set-Content $f $content -NoNewline
Write-Host "Done. Replacements applied."
