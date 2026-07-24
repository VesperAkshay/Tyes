$file = $args[0]
$lines = Get-Content $file
$newlines = @()
foreach ($line in $lines) {
    if ($line -match 'pick (d948ee2|65e829d|1f8d0fe|667e35a|e8e6c90|5e53df8)') {
        $newlines += $line -replace 'pick ', 'squash '
    } else {
        $newlines += $line
    }
}
$newlines | Set-Content $file
