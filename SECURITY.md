# Security policy

## Reporting a problem

Please **don't open a public issue** for a security problem. Report it privately through
[GitHub's advisory form](https://github.com/AnasSAV/Canvasly/security/advisories/new), with the steps to reproduce it and what
an attacker could do with it. This is a one-person project, so the aim is a first response within a week, and a fix as soon
as one can be made.

## Supported versions

Only the latest release and the [live site](https://canvasly.anas-hussaindeen.com) get security fixes.

## What's in scope

- Reaching or changing a board without permission, including bypassing a viewer's read-only role
- Authentication and session problems
- Running script in another person's browser through board content, pasted content or links
- Exposure of another person's data

Please don't test against other people's boards, or run load tests against the live site. It's on a free plan with daily
limits, so run a [local copy](CONTRIBUTING.md) for anything heavy.

## How it's protected

- **Roles are enforced on the server.** The Worker checks them on every request, and the Durable Object drops document updates
  from viewers' sockets. Comments get their author from the authenticated connection, not from the client.
- **Everything read from a document is validated** against Zod schemas, and links that aren't `http`, `https` or `mailto` are
  dropped.
- **Pasted HTML is contained.** It's laid out in a sandboxed iframe with scripts off and a restrictive content security policy,
  and only ever becomes plain board objects.
- **Uploads are restricted.** The server accepts only WebP, PNG, JPEG and GIF, with no SVG, up to 1 MB, and serves them with
  `nosniff`.
- **Secrets stay in Cloudflare and GitHub.** They're never in the repository, and CodeQL and Dependabot watch the code and its
  dependencies.

## Known limitations

- Without an email provider configured, addresses aren't verified, so anyone can register with any address. Pending invites are
  only claimed by verified addresses for this reason. See [Deployment](docs/DEPLOYMENT.md#email-resend).
- Board content isn't encrypted end to end: the server can read it.
