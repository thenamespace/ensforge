# Security policy

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/thenamespace/ensforge/security/advisories/new)
to report suspected vulnerabilities. Do not open a public issue or pull request with exploit details
before a fix is available.

Include the affected package and version, a minimal reproduction, expected and observed behavior,
and the potential impact. For deployment-specific issues, include the chain ID and public contract
addresses. Redact private keys, session keys, API credentials, and authenticated RPC URLs.

Reproduce issues locally or on a test network using accounts you control. Do not access another
user's funds or data, disrupt public infrastructure, or test against accounts without permission.

## Supported versions

Security fixes target the latest stable ensforge release. Upgrade all directly installed ensforge
packages together. Older releases and prereleases do not receive guaranteed backports.

## Scope

Reports about authorization, transaction construction, signing, session policies, workflow recovery,
dependency integrity, and package publishing are welcome. Documentation that causes unsafe use is
also in scope.

Ensforge integrates ENS contracts, wallets, RPCs, indexers, and execution providers. Those systems
have their own security boundaries. Report suspected ensforge integration flaws here even when an
external service is involved; vulnerabilities solely in another project should also be reported
through that project's private security channel.

## Disclosure

The maintainer will investigate privately and coordinate remediation and disclosure with the
reporter. Accepted reports may result in a GitHub security advisory and patched release. This policy
does not promise a response deadline, audit coverage, or a bounty.
