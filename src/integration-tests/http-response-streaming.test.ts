import { McpServer } from '../server/mcp.js';
import { Client as McpClient } from '../client/index.js';
import { StreamableHTTPServerTransport } from '../server/streamableHttp.js';
import { StreamableHTTPClientTransport } from '../client/streamableHttp.js';
import { isHttpResponseError } from '../types.js';
import { z } from 'zod';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { AddressInfo, Server } from 'node:net';

interface TestServerAndClient {
  client: McpClient;
  clientTransport: StreamableHTTPClientTransport;
  baseUrl: string;
  httpServer: Server;
  [Symbol.asyncDispose](): Promise<void>;
}

async function setupServerAndClient(): Promise<TestServerAndClient> {
  // Create Express app
  const app = express();
  app.use(express.json());

  // Set up StreamableHTTPServerTransport with fresh server per request
  const transports: { [sessionId: string]: StreamableHTTPServerTransport } = {};

  app.all('/mcp', async (req, res) => {
    const sessionId = req.headers['mcp-session-id'] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports[sessionId]) {
      transport = transports[sessionId];
    } else if (!sessionId && req.method === 'POST' && req.body?.method === 'initialize') {
      // Create a fresh MCP server for each new session
      const server = new McpServer({
        name: 'streaming-response-test-server',
        version: '1.0.0'
      });

      // Register a simple tool that throws a Response
      server.registerTool(
        'auth-required',
        {
          title: 'Auth Required Tool',
          description: 'A tool that requires authentication',
          inputSchema: {
            action: z.string().describe('Action to perform')
          }
        },
        async ({ action }) => {
          // Simulate authentication check
          const isAuthenticated = false; // Always fail for testing
          
          if (!isAuthenticated) {
            throw new Response('Unauthorized', {
              status: 401,
              statusText: 'Unauthorized',
              headers: {
                'WWW-Authenticate': 'Bearer realm="api.example.com", error="invalid_token"'
              }
            });
          }

          return {
            content: [{ type: "text", text: `Action completed: ${action}` }]
          };
        }
      );

      // New initialization request
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sessionId) => {
          transports[sessionId] = transport;
        }
      });

      transport.onclose = () => {
        if (transport.sessionId) {
          delete transports[transport.sessionId];
        }
      };

      await server.connect(transport);
    } else {
      res.status(400).json({
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Bad Request: No valid session ID provided',
        },
        id: null,
      });
      return;
    }

    await transport.handleRequest(req, res, req.body);
  });

  // Start HTTP server
  const httpServer = app.listen(0);
  const port = (httpServer.address() as AddressInfo).port;
  const baseUrl = `http://localhost:${port}`;

  // Create client
  const client = new McpClient({
    name: 'streaming-response-test-client',
    version: '1.0.0'
  });

  // Connect client (this automatically handles initialization)
  const clientTransport = new StreamableHTTPClientTransport(new URL(`${baseUrl}/mcp`));
  await client.connect(clientTransport);

  return {
    client,
    clientTransport,
    baseUrl,
    httpServer,
    async [Symbol.asyncDispose]() {
      await clientTransport.close();
      return new Promise<void>((resolve) => {
        httpServer.close(() => resolve());
      });
    }
  };
}

describe('HTTP Response Streaming Integration Test', () => {
  test('should handle tool that throws HTTP Response', async () => {
    await using testSetup = await setupServerAndClient();
    const { client } = testSetup;

    try {
      // Call the tool that throws a Response
      await client.callTool({
        name: 'auth-required',
        arguments: { action: 'test-action' }
      });
      fail('Expected tool call to throw an error');
    } catch (error: unknown) {
      // Verify this is an HTTP response error
      expect(isHttpResponseError(error)).toBe(true);
      
      if (isHttpResponseError(error)) {
        // Verify we got an HTTP response error with full response details
        expect(error).toMatchObject({
          message: 'Error POSTing to endpoint (HTTP 401): Unauthorized',
          status: 401,
          statusText: 'Unauthorized',
          body: 'Unauthorized'
        });
        
        // Verify we can access the full response object
        expect(error).toHaveProperty('response');
        expect(error).toHaveProperty('headers');
        
        // Verify the WWW-Authenticate header is preserved
        expect(error.headers.get('www-authenticate')).toBe('Bearer realm="api.example.com", error="invalid_token"');
      }
    }
  });
});