# Post-edit-format hook
# Auto-formats edited files with Prettier after edits

param(
    [string[]]$EditedFiles
)

$ErrorActionPreference = "SilentlyContinue"

if (-not $EditedFiles -or $EditedFiles.Count -eq 0) {
    # If no files passed, format staged files
    $EditedFiles = git diff --cached --name-only --diff-filter=ACMR 2>&1
}

if (-not $EditedFiles -or $EditedFiles.Count -eq 0) {
    Write-Host "No files to format."
    exit 0
}

# Filter to formattable extensions
$formattableExtensions = @('.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.md', '.yaml', '.yml')
$filesToFormat = $EditedFiles | Where-Object {
    $ext = [System.IO.Path]::GetExtension($_)
    $formattableExtensions -contains $ext
}

if ($filesToFormat.Count -eq 0) {
    Write-Host "No formattable files found."
    exit 0
}

Write-Host "Formatting $($filesToFormat.Count) file(s) with Prettier..." -ForegroundColor Cyan

foreach ($file in $filesToFormat) {
    if (Test-Path $file) {
        npx prettier --write $file 2>&1 | Out-Null
        Write-Host "  Formatted: $file" -ForegroundColor Green
    }
}

Write-Host "Formatting complete." -ForegroundColor Green
exit 0
