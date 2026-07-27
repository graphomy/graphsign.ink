# Pre-tool-use hook
# Validates tool usage patterns before execution

param(
    [string]$ToolName,
    [string]$ToolInput
)

# Block dangerous file operations
$dangerousPatterns = @(
    'rm -rf',
    'Remove-Item -Recurse -Force /',
    'DROP TABLE',
    'DROP DATABASE',
    'TRUNCATE',
    'git push --force',
    'git rebase',
    'prisma migrate deploy'
)

foreach ($pattern in $dangerousPatterns) {
    if ($ToolInput -match [regex]::Escape($pattern)) {
        Write-Error "BLOCKED: Dangerous operation detected: $pattern"
        exit 1
    }
}

# Block secret patterns in file writes
$secretPatterns = @(
    'PRIVATE_KEY',
    'API_SECRET',
    'password\s*=\s*[''"]',
    'sk_live_',
    'sk_test_'
)

foreach ($pattern in $secretPatterns) {
    if ($ToolInput -match $pattern) {
        Write-Warning "WARNING: Potential secret detected in tool input. Review carefully."
    }
}

exit 0
