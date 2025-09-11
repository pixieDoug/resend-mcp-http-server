import express from 'express';
import cors from 'cors';
import { Resend } from 'resend';

// Get configuration from environment
console.log('Environment variables:', {
  RESEND_API_KEY: process.env.RESEND_API_KEY ? '***SET***' : 'MISSING',
  SENDER_EMAIL_ADDRESS: process.env.SENDER_EMAIL_ADDRESS || 'NOT SET',
  PORT: process.env.PORT || 'NOT SET (will default to 3000)'
});

const apiKey = process.env.RESEND_API_KEY;
const senderEmailAddress = process.env.SENDER_EMAIL_ADDRESS;
const port = parseInt(process.env.PORT || '3000');

let replierEmailAddresses: string[] = [];
if (process.env.REPLY_TO_EMAIL_ADDRESSES) {
  replierEmailAddresses = process.env.REPLY_TO_EMAIL_ADDRESSES.split(',');
}

if (!apiKey) {
  console.error('No API key provided. Please set RESEND_API_KEY environment variable');
  process.exit(1);
}

const resend = new Resend(apiKey);

// JSON-RPC MCP Server Implementation
interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: any;
  id: string | number | null;
}

interface JsonRpcResponse {
  jsonrpc: string;
  result?: any;
  error?: {
    code: number;
    message: string;
    data?: any;
  };
  id: string | number | null;
}

class McpJsonRpcServer {
  private async handleInitialize(params: any): Promise<any> {
    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {}
      },
      serverInfo: {
        name: "resend-email-service",
        version: "1.0.0"
      }
    };
  }

  private async handleListTools(): Promise<any> {
    return {
      tools: [
        {
          name: "send-email",
          description: "Send an email using Resend",
          inputSchema: {
            type: "object",
            properties: {
              to: {
                type: "string",
                format: "email",
                description: "Recipient email address"
              },
              subject: {
                type: "string",
                description: "Email subject line"
              },
              text: {
                type: "string",
                description: "Plain text email content"
              },
              html: {
                type: "string",
                description: "HTML email content. When provided, the plain text argument MUST be provided as well."
              },
              cc: {
                type: "array",
                items: {
                  type: "string",
                  format: "email"
                },
                description: "Optional array of CC email addresses. You MUST ask the user for this parameter."
              },
              bcc: {
                type: "array",
                items: {
                  type: "string",
                  format: "email"
                },
                description: "Optional array of BCC email addresses. You MUST ask the user for this parameter."
              },
              scheduledAt: {
                type: "string",
                description: "Optional parameter to schedule the email. Uses natural language like 'tomorrow at 10am'."
              },
              ...(senderEmailAddress ? {} : {
                from: {
                  type: "string",
                  format: "email",
                  description: "Sender email address. You MUST ask the user for this parameter."
                }
              }),
              ...(replierEmailAddresses.length === 0 ? {
                replyTo: {
                  type: "array",
                  items: {
                    type: "string",
                    format: "email"
                  },
                  description: "Optional email addresses for reply-to. You MUST ask the user for this parameter."
                }
              } : {})
            },
            required: ["to", "subject", "text"]
          }
        },
        {
          name: "list-audiences",
          description: "List all audiences from Resend",
          inputSchema: {
            type: "object",
            properties: {}
          }
        }
      ]
    };
  }

  private async handleCallTool(params: any): Promise<any> {
    const { name, arguments: args } = params;

    if (name === "send-email") {
      const { from, to, subject, text, html, replyTo, scheduledAt, cc, bcc } = args;
      
      const fromEmailAddress = from ?? senderEmailAddress;
      const replyToEmailAddresses = replyTo ?? replierEmailAddresses;

      if (!fromEmailAddress) {
        throw new Error('from argument must be provided.');
      }

      const emailRequest: any = {
        to,
        subject,
        text,
        from: fromEmailAddress,
        replyTo: replyToEmailAddresses,
      };

      if (html) emailRequest.html = html;
      if (scheduledAt) emailRequest.scheduledAt = scheduledAt;
      if (cc) emailRequest.cc = cc;
      if (bcc) emailRequest.bcc = bcc;

      const response = await resend.emails.send(emailRequest);

      if (response.error) {
        throw new Error(`Email failed to send: ${JSON.stringify(response.error)}`);
      }

      return {
        content: [
          {
            type: "text",
            text: `Email sent successfully! ${JSON.stringify(response.data)}`
          }
        ]
      };
    }

    if (name === "list-audiences") {
      const response = await resend.audiences.list();

      if (response.error) {
        throw new Error(`Failed to list audiences: ${JSON.stringify(response.error)}`);
      }

      return {
        content: [
          {
            type: "text",
            text: `Audiences found: ${JSON.stringify(response.data)}`
          }
        ]
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
    try {
      let result: any;

      switch (request.method) {
        case 'initialize':
          result = await this.handleInitialize(request.params);
          break;
        case 'tools/list':
          result = await this.handleListTools();
          break;
        case 'tools/call':
          result = await this.handleCallTool(request.params);
          break;
        default:
          return {
            jsonrpc: '2.0',
            error: {
              code: -32601,
              message: 'Method not found'
            },
            id: request.id
          };
      }

      return {
        jsonrpc: '2.0',
        result,
        id: request.id
      };
    } catch (error: any) {
      return {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: error.message || 'Internal error'
        },
        id: request.id
      };
    }
  }
}

async function main() {
  const app = express();
  const mcpServer = new McpJsonRpcServer();
  
  app.use(cors());
  app.use(express.json());
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'resend-mcp-server' });
  });
  
  // Handle GET requests to MCP endpoint (return method not allowed like the working server)
  app.get('/mcp', (req, res) => {
    res.status(405).json({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message: 'Method not allowed'
      },
      id: null
    });
  });
  
  // MCP JSON-RPC endpoint
  app.post('/mcp', async (req, res) => {
    try {
      const response = await mcpServer.handleRequest(req.body);
      res.json(response);
    } catch (error) {
      console.error('MCP request error:', error);
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal error'
        },
        id: null
      });
    }
  });

  app.listen(port, () => {
    console.log(`Resend MCP Server running on port ${port}`);
    console.log(`Health: http://localhost:${port}/health`);
    console.log(`MCP endpoint: http://localhost:${port}/mcp`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});