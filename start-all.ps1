# Start all four services for the two apps in this workspace.
#
#   1. DemoApp backend  (FastAPI)  -> http://localhost:8000   (cwd: backend)
#   2. DemoApp frontend (Vite)     -> http://localhost:5173   (cwd: repo root)
#   3. project8 backend (FastAPI)  -> http://localhost:8001   (cwd: project8/backend)
#   4. project8 frontend (Vite)    -> http://localhost:5174   (cwd: project8/frontend)
#
# Each service runs in its own PowerShell window. Close a window to stop that
# service. Re-run this script to restart any that aren't already up.

$root = $PSScriptRoot
if (-not $root) { $root = Split-Path -Parent $MyInvocation.MyCommand.Path }

function Start-Service($title, $cwd, $command) {
    Write-Host "[start-all] launching $title ..." -ForegroundColor Cyan
    $args = @(
        "-NoExit",
        "-Command",
        "`$Host.UI.RawUI.WindowTitle = '$title'; Set-Location -LiteralPath '$cwd'; $command"
    )
    Start-Process -FilePath "powershell.exe" -ArgumentList $args | Out-Null
}

Start-Service `
    -title "DemoApp backend (8000)" `
    -cwd  "$root\backend" `
    -command "& .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"

Start-Service `
    -title "DemoApp frontend (5173)" `
    -cwd  "$root" `
    -command "npm run dev"

Start-Service `
    -title "project8 backend (8001)" `
    -cwd  "$root\project8\backend" `
    -command "& .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8001"

Start-Service `
    -title "project8 frontend (5174)" `
    -cwd  "$root\project8\frontend" `
    -command "npm run dev"

Write-Host ""
Write-Host "All four services are starting in separate windows." -ForegroundColor Green
Write-Host "  DemoApp   : http://localhost:5173  (API: http://localhost:8000)"
Write-Host "  project8  : http://localhost:5174  (API: http://localhost:8001)"
Write-Host ""
Write-Host "Close a window to stop that service."
