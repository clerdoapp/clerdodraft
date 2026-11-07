# Releasing

1. Set `version` in `package.json` and `package-lock.json` (`npm version 0.6.0 --no-git-tag-version`
   does both), and add the changes to `CHANGELOG.md`.
2. Commit to `main` and push. The web app publishes from `main` within a few minutes.
3. Tag and push: `git tag v0.6.0 && git push origin v0.6.0`.

The tag starts [`release.yml`](../.github/workflows/release.yml):

| Job | Makes |
|---|---|
| Windows | `.msi`, portable `.exe`, `.zip` |
| macOS | universal `.dmg` and `.zip` |
| Linux | `.AppImage`, `.deb`, `.rpm`, `.tar.gz`, and the command-line tool `clerdodraft-cli-<version>.mjs` |
| Publish | the GitHub release with every file and `SHA256SUMS.txt` |

The tag must match `package.json`, or the first job stops the release. Each platform publishes even
when another fails, so one unavailable build machine doesn't hold the others back.

## When something fails

- **A job fails at once:** GitHub retires old build machines. Check the job's `runs-on` label.
- **macOS waits, then fails:** GitHub sometimes has no macOS machine free. Rerun only that job:
  `gh run rerun <run id> --failed -R clerdoapp/clerdodraft`.
- **Tests fail only on GitHub:** the cross-checks with another word processor run only where that
  program works; see `tests/office.ts`.

## Removing a release

Delete the release on the Releases page, then its tag on the Tags page, and locally with
`git tag -d v0.6.0`.
