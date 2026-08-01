# Pre-commit-tests hook
# Runs lint, type-check, and unit tests before committing

$ErrorActionPreference = "Stop"

Write-Host "Running pre-commit checks..." -ForegroundColor Cyan

# Step 1: Lint
Write-Host "`n[1/3] Running lint..." -ForegroundColor Yellow
try {
    npm run lint 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Lint failed. Fix lint errors before committing."
        exit 1
    }
    Write-Host "  Lint passed." -ForegroundColor Green
} catch {
    Write-Warning "Lint command not configured. Skipping."
}

# Step 2: Type-check
Write-Host "`n[2/3] Running type-check..." -ForegroundColor Yellow
try {
    npm run typecheck 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Type-check failed. Fix type errors before committing."
        exit 1
    }
    Write-Host "  Type-check passed." -ForegroundColor Green
} catch {
    Write-Warning "Type-check command not configured. Skipping."
}

# Step 3: Unit tests
Write-Host "`n[3/3] Running unit tests..." -ForegroundColor Yellow
try {
    npm run test -- --run 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Tests failed. Fix failing tests before committing."
        exit 1
    }
    Write-Host "  Tests passed." -ForegroundColor Green
} catch {
    Write-Warning "Test command not configured. Skipping."
}

Write-Host "`nAll pre-commit checks passed." -ForegroundColor Green
exit 0
