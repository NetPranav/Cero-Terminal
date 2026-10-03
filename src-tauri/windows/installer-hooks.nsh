!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\.flow" "" "Cero.Flow"
  WriteRegStr SHCTX "Software\Classes\.flow" "Content Type" "application/x-cero-workflow"
  WriteRegStr SHCTX "Software\Classes\Cero.Flow" "" "Cero Flow"
  WriteRegStr SHCTX "Software\Classes\Cero.Flow\DefaultIcon" "" "$INSTDIR\flow.ico,0"
  WriteRegStr SHCTX "Software\Classes\Cero.Flow\shell\open\command" "" '"$INSTDIR\${MAINBINARYNAME}.exe" "%1"'
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DeleteRegKey SHCTX "Software\Classes\.flow"
  DeleteRegKey SHCTX "Software\Classes\Cero.Flow"
  System::Call 'shell32::SHChangeNotify(i 0x08000000, i 0, p 0, p 0)'
!macroend
