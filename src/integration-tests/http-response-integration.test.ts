import { McpServer } from '../server/mcp.js';
import { Client as McpClient } from '../client/index.js';
import { InMemoryTransport } from '../inMemory.js';

describe('HTTP Response Integration Test - Auth Use Cases', () => {
  let server: McpServer;
  let client: McpClient;
  let clientTransport: InMemoryTransport;
  let serverTransport: InMemoryTransport;

  beforeEach(async () => {
    // Create in-memory transport pair
    [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    // Create MCP server
    server = new McpServer({
      name: 'auth-response-test-server',
      version: '1.0.0'
    });

    // Register tools that throw auth-related Response objects
    server.registerTool('unauthorized-tool', {
      title: 'Unauthorized Tool'
    }, async () => {
      throw new Response('Unauthorized', {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'WWW-Authenticate': 'Bearer realm="api.example.com", error="invalid_token", error_description="The access token provided is expired, revoked, malformed, or invalid for other reasons"' }
      });
    });

    server.registerTool('forbidden-tool', {
      title: 'Forbidden Tool'
    }, async () => {
      throw new Response('Forbidden', {
        status: 403,
        statusText: 'Forbidden',
        headers: { 'WWW-Authenticate': 'Bearer realm="api.example.com", error="insufficient_scope", error_description="The request requires higher privileges than provided by the access token"' }
      });
    });

    server.registerTool('auth-challenge-tool', {
      title: 'Auth Challenge Tool'
    }, async () => {
      const response = new Response('Authentication Required', {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'Content-Type': 'text/plain' }
      });
      response.headers.set('WWW-Authenticate', 'Bearer realm="api.example.com", error="invalid_token"');
      response.headers.append('WWW-Authenticate', 'Basic realm="admin.example.com"');
      throw response;
    });

    // Create MCP client
    client = new McpClient({
      name: 'test-client',
      version: '1.0.0'
    });

    // Connect both client and server
    await Promise.all([
      client.connect(clientTransport),
      server.connect(serverTransport)
    ]);
  });

  afterEach(async () => {
    await client.close();
    await server.close();
  });

  test('should handle 401 Unauthorized responses with WWW-Authenticate header', async () => {
    try {
      await client.callTool({
        name: 'unauthorized-tool',
        arguments: {}
      });
      fail('Expected tool call to throw an error');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: 401,
        message: 'MCP error 401: HTTP 401: Unauthorized',
        data: {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'www-authenticate': 'Bearer realm="api.example.com", error="invalid_token", error_description="The access token provided is expired, revoked, malformed, or invalid for other reasons"' },
          body: 'Unauthorized',
          originalHttpResponse: true
        }
      })
    }
  });

  test('should handle 403 Forbidden responses with WWW-Authenticate header', async () => {
    try {
      await client.callTool({
        name: 'forbidden-tool',
        arguments: {}
      });
      fail('Expected tool call to throw an error');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: 403,
        message: 'MCP error 403: HTTP 403: Forbidden',
        data: {
          status: 403,
          statusText: 'Forbidden',
          headers: { 'www-authenticate': 'Bearer realm="api.example.com", error="insufficient_scope", error_description="The request requires higher privileges than provided by the access token"' },
          body: 'Forbidden',
          originalHttpResponse: true
        }
      })
    }
  });

  test('should handle concatenated WWW-Authenticate headers', async () => {
    try {
      await client.callTool({
        name: 'auth-challenge-tool',
        arguments: {}
      });
      fail('Expected tool call to throw an error');
    } catch (error: unknown) {
      expect(error).toMatchObject({
        code: 401,
        message: 'MCP error 401: HTTP 401: Unauthorized',
        data: {
          status: 401,
          statusText: 'Unauthorized',
          headers: { 'www-authenticate': 'Bearer realm="api.example.com", error="invalid_token", Basic realm="admin.example.com"' },
          body: 'Authentication Required',
          originalHttpResponse: true
        }
      })
    }
  });
});
