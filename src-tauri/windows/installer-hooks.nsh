!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\.flow" "" "Sentinel.Flow"
  WriteRegStr SHCTX "Software\Classes\.flow" "Content Type" "application/x-sentinel-workflow"
  WriteRegStr SHCTX "Software\Classes\Sentinel.Flow" "" "Sentinel Flow"
  WriteRegStr SHCTX "Software\Classes\Sentinel.Flow\DefaultIcon" "" "$INSTDIR\flow.ico,0"
  WriteRegStr SHCTX "Software\Classes\Sentinel.Flow\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\.flow"
  DeleteRegKey SHCTX "Software\Classes\Sentinel.Flow"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
