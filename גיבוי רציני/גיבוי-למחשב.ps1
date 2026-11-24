# גיבוי רציני - גיבוי אוטומטי של המאגר למחשב Windows
# הפעלה: לחיצה ימנית על הקובץ > Run with PowerShell
# בהפעלה הראשונה הסקריפט מגבה, וגם מגדיר את עצמו לרוץ אוטומטית כל יום.

$Repo     = "https://github.com/hakoloffice7-prog/kvutzat-rechisha.git"
$Target   = Join-Path ([Environment]::GetFolderPath("MyDocuments")) "גיבוי רציני"
$Keep     = 30
$TaskName = "GibuyRetzini"
$RunAt    = "21:00"

$ErrorActionPreference = "Stop"

if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Host "Git לא מותקן במחשב. יש להתקין מ- https://git-scm.com/download/win ולהריץ שוב." -ForegroundColor Red
    Read-Host "לחץ Enter לסגירה"; exit 1
}

New-Item -ItemType Directory -Force -Path $Target | Out-Null
$Mirror = Join-Path $Target "mirror.git"

if (Test-Path $Mirror) { git -C $Mirror remote update --prune }
else                    { git clone --mirror $Repo $Mirror }

$Stamp  = Get-Date -Format "yyyy-MM-dd_HH-mm"
$Bundle = Join-Path $Target "kvutzat-rechisha_$Stamp.bundle"
git -C $Mirror bundle create $Bundle --all
git bundle verify $Bundle | Out-Null

# עותק קוד פתוח לעיון (מתעדכן בכל גיבוי)
$Code = Join-Path $Target "קוד עדכני"
if (Test-Path $Code) { Remove-Item $Code -Recurse -Force }
git clone -q $Mirror $Code

# שמירת הגיבויים האחרונים בלבד
Get-ChildItem $Target -Filter *.bundle | Sort-Object LastWriteTime -Descending |
  Select-Object -Skip $Keep | Remove-Item -Force

Add-Content (Join-Path $Target "יומן גיבויים.txt") "$Stamp  הצליח  $Bundle"
Write-Host "הגיבוי נשמר: $Bundle" -ForegroundColor Green

# הגדרת הרצה אוטומטית יומית (פעם אחת בלבד)
if (-not (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue)) {
    $Action   = New-ScheduledTaskAction -Execute "powershell.exe" `
                -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    $Trigger  = New-ScheduledTaskTrigger -Daily -At $RunAt
    $Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable
    Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Settings $Settings | Out-Null
    Write-Host "הוגדר גיבוי אוטומטי כל יום בשעה $RunAt (גם אם המחשב היה כבוי - ירוץ כשיידלק)." -ForegroundColor Green
    Read-Host "לחץ Enter לסגירה"
}
