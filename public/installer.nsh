!macro customInstall
   SetRegView 64
   WriteRegStr HKCR "*\shell\flick" "" "open w&ith Flick"
   WriteRegStr HKCR "*\shell\flick" "Icon" "$INSTDIR\Flick.exe"
   WriteRegStr HKCR "*\shell\flick\command" "" '"$INSTDIR\Flick.exe" "search" "%1"'
   SetRegView 32
   WriteRegStr HKCR "*\shell\flick" "" "open w&ith Flick"
   WriteRegStr HKCR "*\shell\flick" "Icon" "$INSTDIR\Flick.exe"
   WriteRegStr HKCR "*\shell\flick\command" "" '"$INSTDIR\Flick.exe" "search" "%1"'
!macroend
!macro customUninstall
   DeleteRegKey HKCR "*\shell\flick"
!macroend
