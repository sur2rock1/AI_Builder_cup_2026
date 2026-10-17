param(
    [string]$InputPath,
    [string]$OutputPath
)

try {
    $ppt = New-Object -ComObject PowerPoint.Application
    $pres = $ppt.Presentations.Open($InputPath, [Microsoft.Office.Core.MsoTriState]::msoTrue, [Microsoft.Office.Core.MsoTriState]::msoFalse, [Microsoft.Office.Core.MsoTriState]::msoFalse)
    # 32 = ppSaveAsPDF
    $pres.SaveAs($OutputPath, 32)
    $pres.Close()
    Write-Output "Successfully converted $InputPath to $OutputPath"
}
catch {
    Write-Output "PDF conversion error: $_"
}
finally {
    if ($ppt) {
        # Don't quit if user has other presentations open
    }
}
