# Security Policy

## Supported versions

The `main` branch and the latest GitHub Pages deployment receive fixes.

## Reporting a vulnerability

Please **do not** open a public issue for security problems. Use GitHub's private vulnerability
reporting: **Security → Report a vulnerability** in this repository. Include a description,
reproduction steps, and impact. You can expect an initial response within a week.

## Security model

datablocks is a client-only application. There is no server component in this repository, and
flows are not uploaded anywhere by the reference demo.

Known characteristics to keep in mind:

- **Javascript block = arbitrary code execution by design.** User code runs in a hidden iframe
  via `eval`, with dependencies loaded from a CDN. The iframe is same-origin and can access the
  parent page; it is not a sandbox against a malicious flow author. Only open flows you trust,
  and self-host or pin dependencies with `VITE_DEPENDENCY_CDN` if needed.
- **Markdown output** is sanitized with DOMPurify before rendering. If you add another
  `dangerouslySetInnerHTML` sink, sanitize the HTML first.
- **Third-party API keys** typed into the Geocode block are sent to Google Maps or HERE as query
  parameters, as required by those APIs. Restrict keys by HTTP referrer and set quotas. Keys are
  stored in the flow data and therefore in browser storage and exported flows.
- **Mapbox token** is a public (`pk.`) token. Use your own token via `VITE_MAPBOX_TOKEN` and
  restrict it to your domain in the Mapbox dashboard.
- **HTTP Request block** can fetch any URL reachable from the browser. Browsers enforce CORS;
  this app does not proxy requests.
