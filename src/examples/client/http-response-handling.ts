import { Client as McpClient } from '../../client/index.js';
import { StreamableHTTPClientTransport } from '../../client/streamableHttp.js';
import { isHttpResponseError, extractHttpErrorInfo } from '../../types.js';

/**
 * Example demonstrating how to handle HTTP Response objects thrown by tools
 * 
 * This example shows how clients can access full HTTP response details
 * including status codes, headers, and body content when tools throw Response objects.
 */

async function demonstrateHttpResponseHandling() {
  // Create client
  const client = new McpClient({
    name: 'http-response-handling-example',
    version: '1.0.0'
  });

  // Connect to a server that has tools that throw Response objects
  const transport = new StreamableHTTPClientTransport(new URL('http://localhost:3000/mcp'));
  await client.connect(transport);

  try {
    // Call a tool that throws a 401 Unauthorized response
    await client.callTool({
      name: 'protected-resource',
      arguments: { resource: 'user-data' }
    });
  } catch (error: unknown) {
    // Check if this is an HTTP response error
    if (isHttpResponseError(error)) {
      const httpError = error;

      console.log('HTTP Response Details:');
      console.log(`Status: ${httpError.status} ${httpError.statusText}`);
      console.log(`Body: ${httpError.body}`);
      console.log('Headers:');
      
      // Iterate through all headers
      httpError.headers.forEach((value, key) => {
        console.log(`  ${key}: ${value}`);
      });

      // Handle specific status codes
      switch (httpError.status) {
        case 401: {
          console.log('Authentication required');
          const authHeader = httpError.headers.get('www-authenticate');
          if (authHeader) {
            console.log(`WWW-Authenticate: ${authHeader}`);
            // Parse the WWW-Authenticate header for OAuth 2.1 compliance
            if (authHeader.includes('Bearer')) {
              console.log('Bearer token authentication required');
            }
          }
          break;
        }
          
        case 403:
          console.log('Access forbidden');
          break;
          
        case 429: {
          console.log('Rate limited');
          const retryAfter = httpError.headers.get('retry-after');
          if (retryAfter) {
            console.log(`Retry after: ${retryAfter} seconds`);
          }
          break;
        }
          
        default:
          console.log(`Unexpected status: ${httpError.status}`);
      }

      // Access the full Response object if needed
      console.log('Full Response object available:', httpError.response);
      
    } else {
      // Handle non-HTTP errors
      console.log('Non-HTTP error:', error);
    }
  }

  await transport.close();
}

// Example of a more sophisticated error handler
function createHttpErrorHandler() {
  return (error: unknown) => {
    return extractHttpErrorInfo(error);
  };
}

// Example usage
if (import.meta.url === `file://${process.argv[1]}`) {
  demonstrateHttpResponseHandling().catch(console.error);
}

export { demonstrateHttpResponseHandling, createHttpErrorHandler };
