# Installing on Windows

Each release has three Windows files:

| File | Use it when |
|---|---|
| `clerdodraft-<version>-win-x64.msi` | You want a normal installation with a Start menu entry and file associations |
| `clerdodraft-<version>-win-x64.exe` | You want to run it without installing, for example from a USB drive |
| `clerdodraft-<version>-win-x64.zip` | You want to unpack it somewhere yourself |

The builds aren't code-signed yet, so SmartScreen may warn the first time: click **More info**, then
**Run anyway**.

## Installing for many computers

The `.msi` installs silently with the standard options:

```bat
msiexec /i clerdodraft-0.5.0-win-x64.msi /qn
```

Uninstall with:

```bat
msiexec /x clerdodraft-0.5.0-win-x64.msi /qn
```

## File types

The installer offers ClerdoDraft for `.docx`, `.docm`, `.dotx`, `.doc`, `.odt`, `.rtf` and `.md`
files. Windows asks once which app to use; choose ClerdoDraft and tick **Always**.
