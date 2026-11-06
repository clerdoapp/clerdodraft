# Security

ClerdoDraft opens files from anywhere, so a bug in a file reader matters. Please report security problems privately through the repository's **Security > Report a vulnerability** page rather than in a public issue.

Include the version, your system, and a sample file if there is one.

## What the app does
- The desktop app runs with a sandboxed, isolated page and can only write to paths you picked.
- Documents never leave your device. There is no account, server or tracking.
- Links in documents open only for `http`, `https` and `mailto`.
- Password-protected files use AES-256 and SHA-512. A forgotten password cannot be recovered.
