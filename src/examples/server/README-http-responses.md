# HTTP Response Handling in MCP TypeScript SDK

The MCP TypeScript SDK now supports throwing `Response` objects from request handlers to send direct HTTP responses. This enables proper HTTP status codes, headers, and bodies for scenarios like authorization, custom error pages, redirects, and more.

## Overview

Any request handler (tools, resources, prompts, completions) can now throw a `Response` object to send a direct HTTP response instead of a JSON-RPC response. This is particularly useful for:

- **Authorization flows** (401/403 with WWW-Authenticate headers)
- **Custom error pages** (HTML error pages with proper status codes)
- **Redirects** (302 redirects to other locations)
- **Rate limiting** (429 responses with Retry-After headers)
- **Custom API responses** (200 responses with custom headers)
- **Multiple headers** (Set-Cookie with multiple values)

## How It Works

### Protocol-Level Handling

The SDK handles `Response` objects at the protocol level, making this feature available to all request handlers:

1. **HTTP Transports** (StreamableHTTP, SSE): Send actual HTTP responses
2. **Non-HTTP Transports** (STDIO): Convert to descriptive JSON-RPC errors

### Transport Support

- ✅ **StreamableHTTPServerTransport**: Full HTTP response support
- ✅ **SSEServerTransport**: Full HTTP response support  
- ❌ **StdioServerTransport**: Converts to JSON-RPC errors (no HTTP support)

## Usage Examples

### Authorization Responses

```typescript
// 401 Unauthorized with WWW-Authenticate header
server.registerTool('protected-tool', {
  title: 'Protected Tool',
  description: 'A tool that requires authentication',
  inputSchema: {
    action: z.string().describe('Action to perform')
  }
}, async (args) => {
  if (!isAuthenticated) {
    throw new Response('Unauthorized', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="example", error="invalid_token", resource_metadata="https://example.com/.well-known/oauth-protected-resource"'
      }
    });
  }
  // ... rest of tool logic
});

// 403 Forbidden with scope information
server.registerTool('admin-tool', {
  title: 'Admin Tool',
  description: 'A tool that requires admin scope',
  inputSchema: {
    command: z.string().describe('Command to execute')
  }
}, async (args) => {
  if (!hasAdminScope) {
    throw new Response('Forbidden', {
      status: 403,
      headers: {
        'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="admin write"'
      }
    });
  }
  // ... rest of tool logic
});
```

### Custom Error Pages

```typescript
server.registerTool('error-generator', {
  title: 'Error Generator',
  description: 'Generates custom error pages',
  inputSchema: {
    errorType: z.string().describe('Type of error to generate')
  }
}, async (args) => {
  const errorHtml = `
    <!DOCTYPE html>
    <html>
    <head><title>Error - ${args.errorType}</title></head>
    <body>
      <h1>Custom Error Page</h1>
      <p>Error Type: ${args.errorType}</p>
      <p>Timestamp: ${new Date().toISOString()}</p>
    </body>
    </html>
  `;
  
  throw new Response(errorHtml, {
    status: 500,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'X-Custom-Header': 'error-details',
      'Cache-Control': 'no-cache'
    }
  });
});
```

### Redirects

```typescript
server.registerTool('redirect-tool', {
  title: 'Redirect Tool',
  description: 'Redirects to another location',
  inputSchema: {
    url: z.string().url().describe('URL to redirect to')
  }
}, async (args) => {
  throw new Response('', {
    status: 302,
    headers: {
      'Location': args.url,
      'Cache-Control': 'no-cache'
    }
  });
});
```

### Rate Limiting

```typescript
server.registerTool('rate-limited-action', {
  title: 'Rate Limited Action',
  description: 'An action with rate limiting',
  inputSchema: {
    action: z.string().describe('Action to perform')
  }
}, async (args) => {
  if (isRateLimited) {
    throw new Response('Too Many Requests', {
      status: 429,
      headers: {
        'Retry-After': '60',
        'X-RateLimit-Limit': '100',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': (Date.now() + 60000).toString()
      }
    });
  }
  // ... rest of tool logic
});
```

### Multiple Headers

```typescript
server.registerTool('set-cookies', {
  title: 'Set Cookies',
  description: 'Sets multiple cookies',
  inputSchema: {
    sessionId: z.string().describe('Session ID to set')
  }
}, async (args) => {
  const response = new Response('Cookies set successfully', {
    status: 200,
    headers: {
      'Content-Type': 'text/plain'
    }
  });
  
  // Set multiple cookies
  response.headers.set('Set-Cookie', `sessionId=${args.sessionId}; Path=/; HttpOnly; Secure`);
  response.headers.append('Set-Cookie', 'preferences=dark-mode; Path=/; Max-Age=86400');
  response.headers.append('Set-Cookie', 'analytics=enabled; Path=/; Max-Age=31536000');
  
  throw response;
});
```

### Resource and Prompt Handlers

```typescript
// Resource handler with authorization
server.resource('protected-data', 'Protected data resource', async (uri, extra) => {
  if (!hasAccess) {
    throw new Response('Resource access denied', {
      status: 403,
      headers: {
        'WWW-Authenticate': 'Bearer error="insufficient_scope", scope="data:read"'
      }
    });
  }
  // ... rest of resource logic
});

// Prompt handler with authorization
server.prompt('admin-prompt', 'Administrative prompt', async (extra) => {
  if (!isAdmin) {
    throw new Response('Admin access required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Bearer realm="admin", error="insufficient_privileges"'
      }
    });
  }
  // ... rest of prompt logic
});
```

## Response Object Properties

The `Response` constructor accepts:

- **body**: Response body (string, Blob, ArrayBuffer, etc.)
- **status**: HTTP status code (200, 401, 403, 500, etc.)
- **statusText**: HTTP status text (optional)
- **headers**: Headers object or Headers instance

```typescript
new Response(body, {
  status: 200,
  statusText: 'OK',
  headers: {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache'
  }
})
```

## Header Handling

The SDK properly handles multiple headers with the same name (like `Set-Cookie`):

```typescript
const response = new Response('', { status: 200 });
response.headers.set('Set-Cookie', 'cookie1=value1');
response.headers.append('Set-Cookie', 'cookie2=value2');
response.headers.append('Set-Cookie', 'cookie3=value3');
throw response;
```

## Transport Behavior

### HTTP Transports (StreamableHTTP, SSE)

- Send actual HTTP responses with status codes and headers
- Preserve all header values (including multiple headers with same name)
- Send response body as-is

### Non-HTTP Transports (STDIO)

- Convert to descriptive JSON-RPC errors
- Include original HTTP status, headers, and body in error data
- Headers are converted to lowercase (HTTP standard)

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": 401,
    "message": "HTTP 401: Unauthorized",
    "data": {
      "status": 401,
      "statusText": "Unauthorized",
      "headers": {
        "www-authenticate": "Bearer realm=\"test\""
      },
      "body": "Unauthorized",
      "originalHttpResponse": true
    }
  }
}
```

## Best Practices

1. **Use appropriate status codes**: 401 for authentication, 403 for authorization, 429 for rate limiting, etc.

2. **Include proper headers**: WWW-Authenticate for auth, Retry-After for rate limiting, Content-Type for body format

3. **Handle multiple headers correctly**: Use `headers.set()` for first value, `headers.append()` for additional values

4. **Consider transport compatibility**: HTTP responses only work with HTTP transports

5. **Provide meaningful error messages**: Include helpful information in response bodies

6. **Follow HTTP standards**: Use proper header names, status codes, and response formats

## Migration Guide

If you have existing error handling that returns JSON-RPC errors, you can now throw `Response` objects for better HTTP compliance:

```typescript
// Before: JSON-RPC error
if (!isAuthenticated) {
  return {
    content: [{ type: 'text', text: 'Authentication required' }],
    isError: true
  };
}

// After: HTTP response
if (!isAuthenticated) {
  throw new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Bearer realm="example"'
    }
  });
}
```

## Examples

See `src/examples/server/http-response-examples.ts` for comprehensive examples of all supported scenarios.

## Testing

The implementation includes comprehensive unit tests covering:

- Protocol-level response handling
- Transport-specific behavior
- Multiple header support
- Error handling and edge cases

Run tests with:
```bash
npm test -- --testPathPattern="authorization|protocol-authorization"
```
