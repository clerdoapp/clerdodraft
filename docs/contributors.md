# Contributors in the About window

**About ClerdoDraft › Contributors** credits everyone who contributed, and **Models** credits the AI
models named in `Co-Authored-By` lines of commits.

## How it works

- [`contributors/contributors.json`](../contributors/contributors.json) holds the counts per GitHub
  username. [`scripts/contributors.mjs`](../scripts/contributors.mjs) writes it from the git
  history; every release and web-app build runs it, so the app is always current. Don't edit it by
  hand.
- [`contributors/people.toml`](../contributors/people.toml) holds the names people chose for
  themselves. **Each contributor adds only their own entry**, in their own pull request.
- Each contributor gets one line: GitHub username (always), display name (only if they added one, or
  asked for their GitHub profile name), real name (only if they added it), pull requests, commits,
  lines added and removed, files added, and the dates of their first and latest contribution.
- The list shows as names or as a table, sorted by name, pull requests, commits, lines added,
  lines removed, lines added minus removed, or first or latest contribution. The name button cycles
  **Usernames → Display names → Real names**; a missing name falls back to `@username`.
- Both files are built into the app. Nothing is read from the network when the window opens.

Git author names and email addresses are never recorded.

## Credit yourself

Add your entry to `contributors/people.toml` in a pull request you commit yourself (every field is
optional):

```toml
[people.your-github-username]
real_name = "Your Name"
display_name = "Nickname"
sync_github_name = true   # use the name on your public GitHub profile as display name
```

Delete your entry to remove your names.
