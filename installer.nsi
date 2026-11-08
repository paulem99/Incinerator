; Incinerator: per-user Windows installer (no admin rights needed).
; Built on Linux by scripts/build-installer.sh, which passes VERSION, SHELLVER, SRC, OUTFILE and ICO.
Unicode true
SetCompressor /SOLID lzma
SetCompressorDictSize 64

!ifndef VERSION
  !error "pass -DVERSION=x.y.z"
!endif
!ifndef SHELLVER
  !error "pass -DSHELLVER=<contents of the castLabs version file>"
!endif
!ifndef SRC
  !error "pass -DSRC=<folder with the assembled app>"
!endif
!ifndef OUTFILE
  !error "pass -DOUTFILE=<installer path>"
!endif
!ifndef ICO
  !error "pass -DICO=<icon.ico>"
!endif

!define APPNAME "Incinerator"
; The app used to be "The Incinerator". The exe, install folder and registry key keep that name so the
; castLabs signature, settings and earlier installs carry over; only what people see is renamed.
!define OLDNAME "The Incinerator"
!define APPKEY "TheIncinerator"
!define EXE "The Incinerator.exe"
!define UNINST "Uninstall The Incinerator.exe"
!define REGKEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${APPKEY}"

Name "${APPNAME}"
OutFile "${OUTFILE}"
InstallDir "$LOCALAPPDATA\Programs\${OLDNAME}"
RequestExecutionLevel user
BrandingText "${APPNAME} ${VERSION}"
VIProductVersion "${VERSION}.0"
VIAddVersionKey "ProductName" "${APPNAME}"
VIAddVersionKey "FileDescription" "${APPNAME} installer"
VIAddVersionKey "FileVersion" "${VERSION}"
VIAddVersionKey "ProductVersion" "${VERSION}"
VIAddVersionKey "LegalCopyright" " "

!include "MUI2.nsh"
!define MUI_ICON "${ICO}"
!define MUI_UNICON "${ICO}"
!define MUI_ABORTWARNING
!define MUI_WELCOMEPAGE_TITLE "${APPNAME}"
!define MUI_WELCOMEPAGE_TEXT "This installs ${APPNAME} on this PC, with shortcuts on your desktop and in the Start menu.$\r$\n$\r$\nNo admin rights needed. Click Install to continue."
!define MUI_FINISHPAGE_RUN "$INSTDIR\${EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "Open ${APPNAME}"
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_LANGUAGE "English"

Section "Install"
  ; Close a running copy so its files can be replaced.
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Sleep 800

  ; Which castLabs Electron is installed now? The signature on this PC only fits that exact .exe.
  StrCpy $1 "same"
  IfFileExists "$INSTDIR\version" 0 shellChecked
    FileOpen $0 "$INSTDIR\version" r
    FileRead $0 $2
    FileClose $0
    StrCpy $3 $2 1 -1
    StrCmp $3 "$\n" 0 +2
    StrCpy $2 $2 -1
    StrCpy $3 $2 1 -1
    StrCmp $3 "$\r" 0 +2
    StrCpy $2 $2 -1
    StrCmp $2 "${SHELLVER}" shellChecked 0
    StrCpy $1 "changed"
  shellChecked:

  ; Start the app folder clean so files removed in this version don't linger.
  RMDir /r "$INSTDIR\resources\app"
  SetOutPath "$INSTDIR"
  File /r /x "${EXE}.sig" "${SRC}/*"

  ; Same Electron: keep the castLabs signature already on this PC, so there's no re-signing.
  ; New Electron (or a fresh install): put the development signature in place and the app runs setup.
  StrCmp $1 "changed" sigReplace 0
    SetOverwrite off
    File "${SRC}/${EXE}.sig"
    SetOverwrite on
    Goto sigDone
  sigReplace:
    File "${SRC}/${EXE}.sig"
  sigDone:

  WriteUninstaller "$INSTDIR\${UNINST}"
  Delete "$DESKTOP\${OLDNAME}.lnk"
  Delete "$SMPROGRAMS\${OLDNAME}.lnk"
  CreateShortCut "$DESKTOP\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\resources\app\assets\icon.ico" 0
  CreateShortCut "$SMPROGRAMS\${APPNAME}.lnk" "$INSTDIR\${EXE}" "" "$INSTDIR\resources\app\assets\icon.ico" 0
  WriteRegStr HKCU "${REGKEY}" "DisplayName" "${APPNAME}"
  WriteRegStr HKCU "${REGKEY}" "DisplayVersion" "${VERSION}"
  WriteRegStr HKCU "${REGKEY}" "Publisher" "${APPNAME}"
  WriteRegStr HKCU "${REGKEY}" "DisplayIcon" "$INSTDIR\resources\app\assets\icon.ico"
  WriteRegStr HKCU "${REGKEY}" "InstallLocation" "$INSTDIR"
  WriteRegStr HKCU "${REGKEY}" "UninstallString" '"$INSTDIR\${UNINST}"'
  WriteRegDWORD HKCU "${REGKEY}" "NoModify" 1
  WriteRegDWORD HKCU "${REGKEY}" "NoRepair" 1
  WriteRegDWORD HKCU "${REGKEY}" "EstimatedSize" 450000

  ; Quiet install from the app's own updater: open the app again when done.
  IfSilent 0 +2
    Exec '"$INSTDIR\${EXE}"'
SectionEnd

Section "Uninstall"
  nsExec::Exec 'taskkill /F /IM "${EXE}"'
  Sleep 800
  Delete "$DESKTOP\${APPNAME}.lnk"
  Delete "$SMPROGRAMS\${APPNAME}.lnk"
  Delete "$DESKTOP\${OLDNAME}.lnk"
  Delete "$SMPROGRAMS\${OLDNAME}.lnk"
  RMDir /r "$INSTDIR"
  DeleteRegKey HKCU "${REGKEY}"
SectionEnd
