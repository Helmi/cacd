# Security Model

This document describes the security model for CA⚡CD (Coding Agent Control Desk).

## Design Philosophy

CA⚡CD is a **local development tool** designed to run on the developer's machine and be accessed only from localhost. This is similar to other development tools like:

- Vite/webpack dev servers
- Jupyter notebooks
- Docker Desktop
- Database management GUIs (e.g., pgAdmin, MongoDB Compass)

## Trust Model

### Local-Only Access

The API server binds to `localhost:3000` by default. This means:

1. **External machines cannot connect** - Only processes on your local machine can reach the server
2. **Same-machine trust** - If malicious code is running on your machine with access to localhost, it likely already has shell access and full system control
3. **No network exposure** - The server is not accessible from your local network or the internet

### Authentication

Currently, CA⚡CD uses a simple token-based authentication:

- A random UUID token is generated on server startup
- The token is passed to the WebUI via URL parameter (`?token=...`)
- The token is stored in localStorage for session persistence

This provides basic session management without the overhead of a full authentication system. For a local tool where the user has physical access to the machine, this is sufficient.

### CORS Configuration

CORS is set to allow all origins (`origin: *`). This is intentional because:

1. The WebUI may run on different ports during development
2. Only localhost can reach the server anyway
3. Strict CORS would add complexity without security benefit for local access

## What This Means for Users

### Safe Usage

CA⚡CD is safe to use when:

- Running on your local development machine
- Accessed only via localhost/127.0.0.1
- Used in a trusted local environment

### Unsafe Usage (Not Recommended)

Do **NOT**:

- Expose the CA⚡CD port to the network (e.g., binding to `0.0.0.0`)
- Use port forwarding to make CA⚡CD accessible remotely
- Run CA⚡CD on a shared/multi-user server without additional security

## Future Security Enhancements

For users who need to expose CA⚡CD to a network (e.g., remote development scenarios), we plan to add:

- [ ] **Optional authentication middleware** - Enable via environment variable
- [ ] **Configurable CORS origins** - Restrict to specific origins
- [ ] **HTTPS support** - For encrypted remote access
- [ ] **API key authentication** - For programmatic access

## Reporting Security Issues

If you discover a security vulnerability, please report it by:

1. Opening a GitHub issue (for non-sensitive issues)
2. Contacting the maintainers directly (for sensitive issues)

## References

- [OWASP Secure Coding Practices](https://owasp.org/www-project-secure-coding-practices-quick-reference-guide/)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)
