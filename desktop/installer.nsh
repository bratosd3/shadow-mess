; ═══════════════════════════════════════════════════════════
; Shadow Messenger — Custom NSIS Installer v5.2
; Dark theme with purple accents
; ═══════════════════════════════════════════════════════════

!include "nsDialogs.nsh"
!include "WinMessages.nsh"

; ─── Variables ───
Var SMDialog
Var SMAutoStartCB
Var SMAutoStartState
Var SMDesktopCB
Var SMDesktopState

!macro customHeader
  !system "echo Shadow Messenger Custom Installer v5.2"
!macroend

!macro preInit
  SetRegView 64
!macroend

; ═══════ CUSTOM INSTALL (registry + shortcuts) ═══════
!macro customInstall
  ; Registry entries
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayIcon" "$INSTDIR\Shadow Messenger.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "Publisher" "Shadow Team"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "URLInfoAbout" "https://shadow-mess.onrender.com"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "HelpLink" "https://shadow-mess.onrender.com"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" "DisplayVersion" "5.2.0"

  ; Add to App Paths for quick launch
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\Shadow Messenger.exe" "" "$INSTDIR\Shadow Messenger.exe"
  WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\Shadow Messenger.exe" "Path" "$INSTDIR"

  ; Create desktop shortcut (always in assisted installer)
  CreateShortCut "$DESKTOP\Shadow Messenger.lnk" "$INSTDIR\Shadow Messenger.exe" "" "$INSTDIR\Shadow Messenger.exe" 0

  ; Add autostart registry entry
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ShadowMessenger" '"$INSTDIR\Shadow Messenger.exe" --hidden'
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "0"
!macroend

; ═══════ CUSTOM UNINSTALL ═══════
!macro customUnInstall
  ; Remove autostart
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ShadowMessenger"
  ; Remove App Paths
  DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\App Paths\Shadow Messenger.exe"
  ; Remove desktop shortcut
  Delete "$DESKTOP\Shadow Messenger.lnk"
!macroend
