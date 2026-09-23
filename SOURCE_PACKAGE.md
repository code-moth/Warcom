# Source package

This folder contains the complete source and a Git repository with its master branch checked out.
The packaging commit is a new local snapshot of this migration, not the upstream Git history.
No remote is configured and no files have been pushed anywhere.

    git status
    git log --oneline
    .\setup.ps1
    .\run.ps1

The original source is preserved under legacy/. The tests verify its recorded hashes.
The .git/info/attributes file disables text conversion for this packaged repository so those
original bytes stay unchanged. Keep that rule when committing from this extracted repository.
The compiler, dependencies, generated executables, and personal battle data are excluded.
The setup script obtains the required compiler/dependencies and rebuilds the application.
