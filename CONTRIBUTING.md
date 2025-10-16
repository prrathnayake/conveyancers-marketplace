# Contributing to Conveyancers Marketplace

Thank you for your interest in contributing! This document outlines the workflow and conventions that keep the project healthy and maintainable.

## Ways to contribute

- Report bugs or request features via GitHub Issues.
- Improve documentation, example configurations, or onboarding guides.
- Submit pull requests for new features, refactors, or reliability fixes.
- Share feedback from real-world deployments to shape the roadmap.

## Development setup

1. Fork the repository and clone your fork locally.
2. Install prerequisite tooling:
   - Node.js 20+ and npm for the frontend.
   - A modern C++ toolchain (GCC 12+/Clang 15+) with CMake 3.26+ and Ninja for the backend services.
   - Docker and Docker Compose for running the infrastructure stack.
3. Copy environment templates and configure secrets as described in the [README](README.md#environment-configuration).
4. Run the quick start steps to validate your setup.

## Branching model

- Use the default branch (`main`) as your base.
- Create feature branches named `feature/<short-description>` or `fix/<issue-number>`.
- Keep branches focused; small, cohesive changes are easier to review.

## Coding guidelines

- Match the existing formatting conventions:
  - Frontend: follow ESLint and Prettier rules (`npm run lint`).
  - Backend: use `clang-format` (see `.clang-format` if present) and prefer modern C++ practices.
- Include unit tests or integration tests when introducing new functionality.
- Update documentation and configuration examples when behaviour changes.

## Commit standards

- Write descriptive commit messages in the imperative mood (e.g. `Add escrow release handler`).
- Reference relevant issue numbers in the commit body when applicable.
- Squash commits if a PR contains noisy intermediate work.

## Pull request checklist

Before opening a PR:

- [ ] Ensure linting and tests pass (`npm run lint`, `npm run test`, `ctest`, etc.).
- [ ] Update the README or other docs when necessary.
- [ ] Provide context in the PR description, including testing evidence.
- [ ] Link to any dependent issues or design documents.

## Code review expectations

- Two approvals are recommended for significant changes.
- Be responsive to feedback and aim to address comments within a couple of business days.
- Reviewers should focus on correctness, security, readability, and maintainability.

## Release process

For tagged releases:

1. Ensure `main` is green in CI.
2. Update version numbers or changelogs where applicable.
3. Create a Git tag (`git tag -a vX.Y.Z -m "Release vX.Y.Z"`) and push it to the repository.
4. Publish release notes summarising key changes, migrations, and deployment considerations.

## Community conduct

All contributors and maintainers are expected to uphold the [Code of Conduct](CODE_OF_CONDUCT.md). Please report unacceptable behaviour to the maintainers listed there.

## Getting help

Need guidance? Start a discussion in GitHub Issues or reach out directly through the private channels shared with your team.
