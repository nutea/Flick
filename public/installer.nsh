!macro customInstall
   SetRegView 64
   WriteRegStr HKCR "*\shell\flick" "" "open w&ith flick"
   WriteRegStr HKCR "*\shell\flick" "Icon" "$INSTDIR\flick.exe"
   WriteRegStr HKCR "*\shell\flick\command" "" '"$INSTDIR\flick.exe" "search" "%1"'
   SetRegView 32
   WriteRegStr HKCR "*\shell\flick" "" "open w&ith flick"
   WriteRegStr HKCR "*\shell\flick" "Icon" "$INSTDIR\flick.exe"
   WriteRegStr HKCR "*\shell\flick\command" "" '"$INSTDIR\flick.exe" "search" "%1"'
!macroend
!macro customUninstall
   DeleteRegKey HKCR "*\shell\flick"
!macroend