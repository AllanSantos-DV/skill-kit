# Neural Link Training CLI — PowerShell wrapper
# Usage: neural-link-train.ps1 --handler=<name> --reward=<0.0-1.0> [--session=<id>] [--context=<json>]
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
node "$projectDir\src\train.js" $args
