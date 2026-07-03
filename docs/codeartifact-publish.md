# Publishing to CodeArtifact

The `@ipmotionmc/aicut-*` packages publish to the private Iplex CodeArtifact
registry (`iplex-npm` in domain `iplex`, account `883218392300`, region
`us-west-2`). Publishing is triggered by pushing a git tag of the form
`<pkg>-v<version>`:

```bash
git tag core-v0.7.5  && git push origin core-v0.7.5
git tag react-v0.7.5 && git push origin react-v0.7.5
git tag vue-v0.7.5   && git push origin vue-v0.7.5
```

The workflow at `.github/workflows/publish-codeartifact.yml` picks the
tag up, sanity-checks the version against `packages/<pkg>/package.json`,
builds, mints a short-lived CodeArtifact auth token via GitHub Actions
OIDC (no long-lived AWS credentials in secrets), and publishes.

## One-time AWS-side setup

The workflow assumes an IAM role via GitHub Actions OIDC. That role
needs to exist BEFORE the first tag push, and its ARN needs to be set
in the repository secret `AWS_PUBLISH_ROLE_ARN`.

### 1. Ensure the GitHub OIDC provider exists in the AWS account

Iplex's SST-managed AWS account (883218392300) very likely already has
the OIDC provider `token.actions.githubusercontent.com`. Confirm with:

```bash
aws iam list-open-id-connect-providers --region us-west-2
```

If not present, create it:

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

### 2. Create the IAM role trusted by this repo

Trust policy — replace `<AWS_ACCOUNT>` with `883218392300` if you're
copying literally:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::883218392300:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:ipmotionmc/AiCut:ref:refs/tags/*"
        }
      }
    }
  ]
}
```

Notes:
- `sub` is restricted to **tags** on `ipmotionmc/AiCut`. Nothing else
  in the repo (PR builds, main pushes, other refs) can assume this role.
- If the repo is renamed or moved, update the `sub` claim.

Permission policy — grant only what the workflow actually needs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "codeartifact:GetAuthorizationToken",
        "codeartifact:GetRepositoryEndpoint"
      ],
      "Resource": [
        "arn:aws:codeartifact:us-west-2:883218392300:domain/iplex",
        "arn:aws:codeartifact:us-west-2:883218392300:repository/iplex/iplex-npm"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "codeartifact:PublishPackageVersion",
        "codeartifact:ReadFromRepository",
        "codeartifact:DescribePackageVersion",
        "codeartifact:ListPackageVersions"
      ],
      "Resource": [
        "arn:aws:codeartifact:us-west-2:883218392300:package/iplex/iplex-npm/npm/ipmotionmc/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": "sts:GetServiceBearerToken",
      "Resource": "*",
      "Condition": {
        "StringEquals": {
          "sts:AWSServiceName": "codeartifact.amazonaws.com"
        }
      }
    }
  ]
}
```

Notes:
- The permission is **namespace-scoped to `ipmotionmc/*`** on the npm
  format. So this role can never publish anything outside the
  `@ipmotionmc` scope.
- No delete permission — a mis-tag can only ADD a version, never
  overwrite or remove one.

Create with:

```bash
aws iam create-role \
  --role-name AiCut-CodeArtifact-Publish \
  --assume-role-policy-document file://trust.json

aws iam put-role-policy \
  --role-name AiCut-CodeArtifact-Publish \
  --policy-name CodeArtifactPublish \
  --policy-document file://permissions.json
```

### 3. Set the repository secret

Copy the resulting role ARN and set it as `AWS_PUBLISH_ROLE_ARN` on
`ipmotionmc/AiCut` (Settings → Secrets and variables → Actions).

## Publishing checklist

1. Merge the code you want to release to `main`.
2. Confirm the version in `packages/<pkg>/package.json` matches what
   you're about to tag.
3. `git tag <pkg>-v<version> && git push origin <pkg>-v<version>` for
   each package that needs to publish.
4. Watch the Actions tab — one workflow run per tag.

If a run fails after the "Verify version" step, it means the tag was
valid but publish itself failed — re-run the job after fixing (network
flake / permissions / cached version conflict).

## Consumer install

Consumers need this in their `.npmrc`:

```
@ipmotionmc:registry=https://iplex-883218392300.d.codeartifact.us-west-2.amazonaws.com/npm/iplex-npm/
//iplex-883218392300.d.codeartifact.us-west-2.amazonaws.com/npm/iplex-npm/:always-auth=true
//iplex-883218392300.d.codeartifact.us-west-2.amazonaws.com/npm/iplex-npm/:_authToken=${NODE_AUTH_TOKEN}
```

And a `NODE_AUTH_TOKEN` env var populated at install time — typically
from `aws codeartifact get-authorization-token` in local dev, or
minted in CI via the same OIDC pattern this repo uses to publish.
