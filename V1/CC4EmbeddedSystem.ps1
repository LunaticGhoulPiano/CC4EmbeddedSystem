<#
    -----------------------------------------------------------------------
    Script Name : CC4EmbeddedSystem.ps1
    Author      : Emile Su
    Created     : 2026-01-08
    Description : A PowerShell script to compress html/css/js/... files using Google HTML Compressor and convert to binary/c code using makefsdata.exe
    -----------------------------------------------------------------------
#>

# Helper functions
function readUserOption($validOptions, $msg) {
    while ($true) {
        $opt = Read-Host $msg
        if ($validOptions -contains $opt) {
            return $opt
        }
        else {
            Write-Host "Invalid input. Please try again."
        }
    }
}

function checkJava() {
    if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
        Write-Host "Java not found in PATH !"
        Read-Host "Press any key to exit"
        exit 1
    }
}

function checkTool($command, $tool, $toolSimpName, $validOptions, $msg) {
    if (-not $tool) {
        Write-Host $msg
        if ($command -in $validOptions) {
            Read-Host "Press any key to exit"
            exit 1
        }
    }
    else {
        Write-Host ("Using ${toolSimpName}: " + $tool.FullName)
    }
}

function checkSrcDir() {
    while ($true) {
        $srcDir = Read-Host "Enter source path"
        if (Test-Path $srcDir) {
            return (Resolve-Path $srcDir).Path
        }
        else {
            Write-Host "Invalid path. Please try again."
        }
    }
}

# Get option
Write-Host "
#################################################################
# [1] Compress files using Google HTML Compressor (.jar) - ONLY #
# [2] Convert to binary/c code using makefsdata (.exe) - ONLY   #
# [3] Compress files then convert to binary/c code - BOTH       #
#################################################################
"
$command = readUserOption @("1", "2", "3") "Select an option"

# Check if used apps exists
$ToolDir = $PWD.Path # or set to your directory that has the tools
$mainCompressor = Get-ChildItem $ToolDir -Filter "htmlcompressor*.jar" | # sort and choose the latest version
    Sort-Object Name -Descending |
    Select-Object -First 1
$subCompressor = Get-ChildItem $ToolDir -Filter "yuicompressor*.jar" | # sort and choose the latest version
    Sort-Object Name -Descending |
    Select-Object -First 1
$converter = Get-ChildItem $ToolDir -Filter "makefsdata.exe"
$converter_dll = Get-ChildItem $ToolDir -Filter "msvcr100d.dll"
checkTool $command $mainCompressor "Google Html Compressor" @("1", "3") "Google HTML Compressor not found in $ToolDir !"
checkTool $command $subCompressor "YUI Compressor" @("1", "3") "YUI Compressor not found in $ToolDir !"
checkTool $command $converter "Makefsdata" @("2", "3") "makefsdata.exe not found in $ToolDir !"
checkTool $command $converter_dll "DLL of Makefsdata" @("2", "3") "msvcr100d.dll not found in $ToolDir !"

# Compress html files using Google HTML Compressor
if ($command -ne "2") {
    Write-Host "
# Compression ###################################################
"
    # check Java environment
    checkJava
    # single or whole directory
    $srcCompressDir = checkSrcDir
    $destCompressDir = "${srcCompressDir}_compressed"
    $compress_mod = readUserOption @("s", "a") "Compress single file or all files in directory? (s/a)"
    if ($compress_mod -eq "s") {
        # only compress single file in $srcCompressDir
        while ($true) {
            $temp = Read-Host "Enter file name under ${srcCompressDir}"
            $srcFile = Join-Path $srcCompressDir $temp # force to search file under $srcCompressDir
            if (Test-Path $srcFile) {
                $destFile = Join-Path $destCompressDir $temp
                # compress
                java -jar $mainCompressor.FullName -o $destFile --compress-js --compress-css $srcFile
                Write-Host "Compressed: ${srcFile} ===> ${destFile}"
                # stop compress
                if ((Read-Host "Stop compressing? (y/n)") -eq "y") {
                    break
                }
            }
            else {
                Write-Host "Invalid path. Please try again."
            }
        }
    }
    else {
        # Copy all files to _compressed to keep non-HTML/JS/CSS/... files (e.g., .png, .jpg) intact
        if (-not (Test-Path $destCompressDir)) {
            Copy-Item -Path $srcCompressDir -Destination $destCompressDir -Recurse
        }

        # compress all files in $srcCompressDir
        java -jar $mainCompressor.FullName -o "${destCompressDir}/" --compress-js --compress-css "${destCompressDir}/"
        Write-Host "Compressed: ${srcCompressDir} ===> ${destCompressDir}"
    }

    if ($command -eq "1") {
        exit
    }
}

# Convert to binary/c code using makefsdata.exe
Write-Host "
# Conversion ####################################################
"
if ($command -eq "3") {
    $srcConvertDir = $destCompressDir
}
else {
    $srcConvertDir = checkSrcDir
}

# make dir "fsdata_converted"
$destConvertDir = "fsdata_converted"
if (-not (Test-Path $destConvertDir)) {
    mkdir $destConvertDir
}

# convert
$destConvertDir = Join-Path $destConvertDir (((Split-Path $srcConvertDir -Leaf) -replace "_compressed$") + ".c")
.\makefsdata.exe $srcConvertDir -f:$destConvertDir
Write-Host "Converted: ${srcConvertDir} ===> ${destConvertDir}"

Read-Host "Press any key to exit"