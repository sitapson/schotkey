# Live, colour-coded feed of what the plugin is doing:  npm run logs
#
# Follows two sources at once:
#   [plugin]  the plugin's own log (telemetry, key presses, button states)
#   [host]    Stream Deck's log for this plugin (starts, crashes, stderr)
# Survives plugin restarts: when a new log file appears it switches to it.

$ErrorActionPreference = 'Continue'
$pluginLogs = Join-Path $PSScriptRoot '..\com.sctelemetry.deck.sdPlugin\logs'
$hostLog = Join-Path $env:APPDATA 'Elgato\StreamDeck\logs\com.sctelemetry.deck0.log'

function Open-Tail([string]$path, [bool]$fromEnd) {
	$fs = [System.IO.File]::Open($path, 'Open', 'Read', 'ReadWrite, Delete')
	if ($fromEnd) {
		# Start with the last ~4 KB so there's some context.
		$fs.Seek([Math]::Max(0, $fs.Length - 4096), 'Begin') | Out-Null
	}
	$reader = New-Object System.IO.StreamReader($fs)
	if ($fromEnd -and $fs.Position -gt 0) { [void]$reader.ReadLine() } # drop the partial first line
	return @{ Path = $path; Reader = $reader; Stream = $fs }
}

function Write-LogLine([string]$source, [string]$line) {
	if (-not $line.Trim()) { return }
	$colour = 'Gray'
	if ($line -match 'Debugger listening') { $colour = 'DarkCyan' }
	elseif ($line -match '\bERROR\b|stderr|Error:|unexpected') { $colour = 'Red' }
	elseif ($line -match '\bWARN\b') { $colour = 'Yellow' }
	elseif ($line -match '\bINFO\b|Process started|connected') { $colour = 'White' }
	elseif ($line -match '\bDEBUG\b') { $colour = 'DarkGray' }
	if ($line -match '-> live|LIVE') { $colour = 'Green' }
	Write-Host ("{0,-8} " -f "[$source]") -NoNewline -ForegroundColor Cyan
	Write-Host $line -ForegroundColor $colour
}

function Get-NewestPluginLog {
	Get-ChildItem $pluginLogs -Filter '*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
}

$Host.UI.RawUI.WindowTitle = 'SC Telemetry Deck - live log'
Write-Host 'SC Telemetry Deck live log. Ctrl+C to stop.' -ForegroundColor Cyan
Write-Host "  plugin: $((Resolve-Path $pluginLogs -ErrorAction SilentlyContinue).Path)" -ForegroundColor DarkCyan
Write-Host "  host:   $hostLog`n" -ForegroundColor DarkCyan

$plugin = $null
$hostTail = $null
$seen = New-Object 'System.Collections.Generic.HashSet[string]'
$seenOrder = New-Object 'System.Collections.Generic.Queue[string]'

while ($true) {
	# Plugin log: switch to the newest file whenever the plugin restarts.
	# The SDK rotates by renaming (.0 -> .1) and creating a new .0, so the name doesn't change.
	# Our open handle follows the renamed file, so if the file now at that path has a different
	# size from the one we hold, it's a new file.
	$newest = Get-NewestPluginLog
	$rotated = $plugin -and $newest -and $plugin.Path -eq $newest.FullName -and $newest.Length -ne $plugin.Stream.Length
	if ($newest -and (-not $plugin -or $plugin.Path -ne $newest.FullName -or $rotated)) {
		$first = -not $plugin
		if ($plugin) { $plugin.Reader.Dispose(); Write-Host "`n--- plugin restarted: $($newest.Name) ---" -ForegroundColor Magenta }
		$plugin = Open-Tail $newest.FullName $first
	}
	if ($plugin) {
		while ($null -ne ($line = $plugin.Reader.ReadLine())) {
			Write-LogLine 'plugin' $line
			# Remember the message text so the host's echo of it can be skipped.
			$msg = ($line -replace '^\S+\s+\w+\s+', '').Trim()
			if ($msg) { [void]$seen.Add($msg); $seenOrder.Enqueue($msg); if ($seenOrder.Count -gt 500) { [void]$seen.Remove($seenOrder.Dequeue()) } }
		}
	}

	# Host log: reopen if Stream Deck rotated/truncated it.
	if (Test-Path $hostLog) {
		if (-not $hostTail) { $hostTail = Open-Tail $hostLog $true }
		elseif ((Get-Item $hostLog).Length -lt $hostTail.Stream.Position) {
			$hostTail.Reader.Dispose(); $hostTail = Open-Tail $hostLog $false
		}
		while ($null -ne ($line = $hostTail.Reader.ReadLine())) {
			# The host echoes the plugin's stdout/stderr. Show only what the plugin log can't:
			# process start/stop, crashes before the logger starts, the debugger address.
			if ($line -match 'Process: stdout:') { continue }
			if ($line -match 'Process: stderr:\s*(.*)$' -and $seen.Contains($Matches[1].Trim())) { continue }
			Write-LogLine 'host' $line
		}
	}

	Start-Sleep -Milliseconds 300
}
