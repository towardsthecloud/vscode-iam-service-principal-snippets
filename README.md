# AWS IAM Service Principal Snippets for VS Code

This VS Code extension completes documented AWS service principals in IAM trust policies and AWS CDK roles. Requires VS Code 1.85 or newer.

<!-- TIP-LIST:START -->
> [!TIP]
> **Catch AWS waste before and after you deploy.**
>
> [CloudBurn](https://cloudburn.io) is a free, open-source CLI that checks your Terraform and CloudFormation for costly patterns before deploy, then finds the waste already running in your AWS account. Run it locally or in CI.
>
> <a href="https://github.com/towardsthecloud/cloudburn"><img alt="Get the free CloudBurn CLI on GitHub" src="https://img.shields.io/badge/Get%20the%20free%20CLI-GitHub-brightgreen.svg?style=for-the-badge&logo=github"/></a>
>
> Want it managed across your AWS accounts? [CloudBurn Platform](https://cloudburn.io) runs it for you and keeps scan results in your own account. Join the waitlist for 30% off.
<!-- TIP-LIST:END -->

---

## Features

1. **Context-aware completion**: Suggestions appear in `Principal.Service`, Terraform `principals` blocks with `type = "Service"`, and the first argument of CDK `ServicePrincipal` constructors.
2. **Correct insertion**: Arrays, multiline constructors, incomplete quotes, and partially typed hostnames are supported. Selecting a principal replaces the entire hostname and preserves existing quotes.
3. **Language support**: JSON, JSONC, YAML, Terraform, TypeScript, TSX, Python, and JSON/YAML CloudFormation `.template` files.

## Usage

1. Install the "AWS IAM Service Principal Snippets" extension in VS Code.
2. Open or create a new file (`.json`, `.yml`, `.tf`, `.ts`, or `.py`) where you're defining IAM policies or roles.
3. When you reach a point where you need to specify a Service Principal (e.g., `Principal` key in JSON/YAML policies, `assumed_by` parameter in Python roles, etc.), start typing the name of the AWS service.
4. The extension will provide auto-completion suggestions for matching AWS Service Principals.
5. Select the desired Service Principal to insert it into your code.

Example of auto-completion in action:

![IAM Service Principal Snippets Autocomplete Example](https://raw.githubusercontent.com/dannysteenman/vscode-iam-service-principal-snippets/main/images/iam-service-principal-snippets-autocomplete-example.gif)

> **Note:** If auto-completion doesn't trigger automatically, press `Ctrl+Space` (or `Cmd+Space` on macOS) to manually invoke IntelliSense.

---

## Catalog accuracy

The catalog contains literal principal names from AWS service-linked role documentation and curated service-role references in `src/principal-sources.json`. Each record retains its AWS documentation URLs. Full hostnames remain distinct: `ec2.amazonaws.com` and `ec2.application-autoscaling.amazonaws.com` are separate entries.

Coverage depends on these sources and is not exhaustive. IAM action prefixes and service endpoint names are not reliable evidence of a service principal. The catalog excludes inferred names and documentation placeholders. Completion inserts the selected hostname; it does not rewrite or validate the rest of your IAM policy.

## Development

Use Node 24 from `.nvmrc` and Python 3.14.8, matching CI. Install the pinned dependencies:

```sh
fnm use
npm ci
uv venv --python $(python --version 2>&1 | sed "s/Python //")
uv pip install -r src/requirements.txt
```

Run the checks sequentially:

```sh
npm run test:python
npm run validate:catalog
npm test
VSCODE_VERSION=stable npm test
npm run package -- --out extension.vsix
```

The extension tests launch real VS Code instances, request completions through the editor API, and apply the returned edits. The suite covers insertion, excluded contexts, failed catalog loading, cache invalidation, and a 1 MiB template benchmark. Reports are written to `test-results/vscode.json`. On headless Linux, use `xvfb-run -a npm test`.

The loader recovery test temporarily removes and corrupts the catalog, then restores its bytes in a `finally` block. Run extension tests sequentially and avoid refreshing the catalog during a test run.

To refresh the catalog:

```sh
.venv/bin/python src/update_service_principals.py
```

Requests have bounded timeouts and retries. A failed source or missing required principal aborts the update; successful results are sorted and written atomically. Removals stop the update until reviewed and explicitly accepted with `--allow-removals`. Retired service guides are excluded explicitly, and the stale Lightsail link is mapped to its current AWS documentation page.

Edit `src/requirements.in` when changing Python dependencies, then regenerate the lock with `uv pip compile src/requirements.in -o src/requirements.txt --no-header --no-annotate`.

The VS Code type definitions match the minimum supported editor version, and Node type definitions match its Node 18 extension host. Keep these compatibility constraints when updating build tools and dependencies. GitHub Actions use explicit release version tags.

## Updates and releases

The weekly update workflow fetches documentation and runs the catalog checks, updater tests, both VS Code test versions, and packaging before opening a catalog PR. It waits while an earlier update proposal is open. Fetching documentation no longer publishes a release.

PRs and changes to `main` run the validation workflow. For a release, update the version in `package.json` and `package-lock.json`, merge the reviewed changes into `main`, and push the matching `v<version>` tag. The release workflow checks the tag/version and main ancestry, validates and packages the tagged source, then publishes the same VSIX independently to Visual Studio Marketplace and Open VSX. A failed registry job can be rerun without repeating the successful registry job.

Publishing uses the existing `VSCE_TOKEN` and `OPEN_VSX_TOKEN` repository secrets. Automated update proposals require the repository setting that allows GitHub Actions to create pull requests.

---

## Related IAM extensions

- [AWS IAM Actions Snippets](https://marketplace.visualstudio.com/items?itemName=dannysteenman.iam-actions-snippets) completes IAM actions and shows which actions match a wildcard.
- [AWS IAM Policy Debugger](https://marketplace.visualstudio.com/items?itemName=dannysteenman.iam-policy-debugger) validates policies, explains request matches and saves regression scenarios in VS Code’s Testing panel. It is an unpublished development preview; build a local VSIX to try it.

## Support

If you have a feature request or an issue, please let me know on [Github](https://github.com/towardsthecloud/vscode-iam-service-principal-snippets/issues)

## Author

[Danny Steenman](https://towardsthecloud.com/about)

[![](https://img.shields.io/badge/LinkedIn-0077B5?style=for-the-badge&logo=linkedin&logoColor=white)](https://www.linkedin.com/company/towardsthecloud)
[![](https://img.shields.io/badge/X-000000?style=for-the-badge&logo=x&logoColor=white)](https://twitter.com/dannysteenman)
[![](https://img.shields.io/badge/GitHub-2b3137?style=for-the-badge&logo=github&logoColor=white)](https://github.com/towardsthecloud)
