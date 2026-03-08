; ═══════════════════════════════════════════════════════════
; Shadow Messenger — Custom NSIS Installer v5.2
; Dark theme with purple accents
; ═══════════════════════════════════════════════════════════

!include "nsDialogs.nsh"
!include "WinMessages.nsh"

; ─── Colors ───
!define SM_BG_COLOR    "0x0C0C1D"
!define SM_CARD_COLOR  "0x1A1A2E"
!define SM_BRAND       "0x7C3AED"
!define SM_TEXT_COLOR   "0xFFFFFF"
!define SM_TEXT_DIM     "0x8E9AA6"

; ─── Variables ───
Var SMDialog
Var SMWelcomeLabel
Var SMDescLabel
Var SMVersionLabel
Var SMFinishLabel
Var SMFinishDesc
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

; ═══════ CUSTOM WELCOME PAGE ═══════
!macro customWelcome
  nsDialogs::Create 1018
  Pop $SMDialog
  ${If} $SMDialog == error
    Abort
  ${EndIf}

  ; Full dark background
  SetCtlColors $SMDialog "" "${SM_BG_COLOR}"
  SetCtlColors $HWNDPARENT "" "${SM_BG_COLOR}"

  ; Title label: Shadow Messenger
  ${NSD_CreateLabel} 0 30u 100% 30u "Shadow Messenger"
  Pop $SMWelcomeLabel
  SetCtlColors $SMWelcomeLabel "${SM_TEXT_COLOR}" "${SM_BG_COLOR}"
  CreateFont $0 "Segoe UI" 26 700
  SendMessage $SMWelcomeLabel ${WM_SETFONT} $0 1

  ; Version label
  ${NSD_CreateLabel} 0 65u 100% 16u "Версия 5.2  •  Shadow Team"
  Pop $SMVersionLabel
  SetCtlColors $SMVersionLabel "${SM_TEXT_DIM}" "${SM_BG_COLOR}"
  CreateFont $0 "Segoe UI" 10 400
  SendMessage $SMVersionLabel ${WM_SETFONT} $0 1

  ; Description
  ${NSD_CreateLabel} 10u 100u 90% 40u "Добро пожаловать в установщик Shadow Messenger.$\r$\n$\r$\nБезопасный мессенджер с шифрованием, звонками, и уникальным дизайном."
  Pop $SMDescLabel
  SetCtlColors $SMDescLabel "${SM_TEXT_DIM}" "${SM_BG_COLOR}"
  CreateFont $0 "Segoe UI" 10 400
  SendMessage $SMDescLabel ${WM_SETFONT} $0 1

  nsDialogs::Show
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
!macroend

; ═══════ CUSTOM FINISH PAGE ═══════
!macro customFinishPage
  nsDialogs::Create 1018
  Pop $SMDialog
  ${If} $SMDialog == error
    Abort
  ${EndIf}

  SetCtlColors $SMDialog "" "${SM_BG_COLOR}"

  ; Success title
  ${NSD_CreateLabel} 0 25u 100% 30u "✓  Установка завершена!"
  Pop $SMFinishLabel
  SetCtlColors $SMFinishLabel "0x50FA7B" "${SM_BG_COLOR}"
  CreateFont $0 "Segoe UI" 22 700
  SendMessage $SMFinishLabel ${WM_SETFONT} $0 1

  ; Description
  ${NSD_CreateLabel} 10u 65u 90% 30u "Shadow Messenger успешно установлен на ваш компьютер.$\r$\nНажмите Готово для завершения."
  Pop $SMFinishDesc
  SetCtlColors $SMFinishDesc "${SM_TEXT_DIM}" "${SM_BG_COLOR}"
  CreateFont $0 "Segoe UI" 10 400
  SendMessage $SMFinishDesc ${WM_SETFONT} $0 1

  ; Desktop shortcut checkbox
  ${NSD_CreateCheckbox} 10u 110u 90% 16u "  Создать ярлык на рабочем столе"
  Pop $SMDesktopCB
  SetCtlColors $SMDesktopCB "${SM_TEXT_COLOR}" "${SM_BG_COLOR}"
  CreateFont $0 "Segoe UI" 10 400
  SendMessage $SMDesktopCB ${WM_SETFONT} $0 1
  ${NSD_Check} $SMDesktopCB

  ; Autostart checkbox
  ${NSD_CreateCheckbox} 10u 132u 90% 16u "  Запускать при старте Windows"
  Pop $SMAutoStartCB
  SetCtlColors $SMAutoStartCB "${SM_TEXT_COLOR}" "${SM_BG_COLOR}"
  CreateFont $0 "Segoe UI" 10 400
  SendMessage $SMAutoStartCB ${WM_SETFONT} $0 1

  nsDialogs::Show
!macroend

!macro customFinishLeave
  ; Check desktop shortcut checkbox
  ${NSD_GetState} $SMDesktopCB $SMDesktopState
  ${If} $SMDesktopState == ${BST_CHECKED}
    CreateShortCut "$DESKTOP\Shadow Messenger.lnk" "$INSTDIR\Shadow Messenger.exe" "" "$INSTDIR\Shadow Messenger.exe" 0
  ${EndIf}

  ; Check autostart checkbox
  ${NSD_GetState} $SMAutoStartCB $SMAutoStartState
  ${If} $SMAutoStartState == ${BST_CHECKED}
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ShadowMessenger" '"$INSTDIR\Shadow Messenger.exe" --hidden'
  ${Else}
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "ShadowMessenger"
  ${EndIf}
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
