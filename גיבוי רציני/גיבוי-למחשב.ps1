# גיבוי מקומי של המאגר למחשב Windows
# הפעלה ידנית:  לחיצה ימנית > Run with PowerShell
# הפעלה אוטומטית יומית (פעם אחת, ב-PowerShell):
#   schtasks /Create /SC DAILY /ST 21:00 /TN "GibuyRetzini" /TR "powershell -ExecutionPolicy Bypass -File \"$PSCommandPath\""

$Repo   = "https://github.com/hakoloffice7-prog/kvutzat-rechisha.git"
$Target = Join-Path $env:USERPROFILE "Documents\גיבוי רציני"
$Keep   = 30

New-Item -ItemType Directory -Force -Path $Target | Out-Null
$Mirror = Join-Path $Target "mirror.git"

if (Test-Path $Mirror) { git -C $Mirror remote update --prune }
else                    { git clone --mirror $Repo $Mirror }

$Stamp  = Get-Date -Format "yyyy-MM-dd_HH-mm"
$Bundle = Join-Path $Target "kvutzat-rechisha_$Stamp.bundle"
git -C $Mirror bundle create $Bundle --all
git bundle verify $Bundle

# שמירת הגיבויים האחרונים בלבד
Get-ChildItem $Target -Filter *.bundle | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep | Remove-Item -Force

Write-Host "הגיבוי נשמר: $Bundle"
