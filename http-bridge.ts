import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import express from 'express';
import cors from 'cors';
import { Resend } from 'resend';
import { z } from 'zod';

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

// Create server instance
const server = new McpServer({
  name: 'resend-email-service',
  version: '1.0.0',
});

server.tool(
  'send-email',
  'Send an email using Resend',
  {
    to: z.string().email().describe('Recipient email address'),
    subject: z.string().describe('Email subject line'),
    text: z.string().describe('Plain text email content'),
    html: z
      .string()
      .optional()
      .describe(
        'HTML email content. When provided, the plain text argument MUST be provided as well.',
      ),
    cc: z
      .string()
      .email()
      .array()
      .optional()
      .describe(
        'Optional array of CC email addresses. You MUST ask the user for this parameter. Under no circumstance provide it yourself',
      ),
    bcc: z
      .string()
      .email()
      .array()
      .optional()
      .describe(
        'Optional array of BCC email addresses. You MUST ask the user for this parameter. Under no circumstance provide it yourself',
      ),
    scheduledAt: z
      .string()
      .optional()
      .describe(
        "Optional parameter to schedule the email. This uses natural language. Examples would be 'tomorrow at 10am' or 'in 2 hours' or 'next day at 9am PST' or 'Friday at 3pm ET'.",
      ),
    // If sender email address is not provided, the tool requires it as an argument
    ...(!senderEmailAddress
      ? {
          from: z
            .string()
            .email()
            .nonempty()
            .describe(
              'Sender email address. You MUST ask the user for this parameter. Under no circumstance provide it yourself',
            ),
        }
      : {}),
    ...(replierEmailAddresses.length === 0
      ? {
          replyTo: z
            .string()
            .email()
            .array()
            .optional()
            .describe(
              'Optional email addresses for the email readers to reply to. You MUST ask the user for this parameter. Under no circumstance provide it yourself',
            ),
        }
      : {}),
  },
  async ({ from, to, subject, text, html, replyTo, scheduledAt, cc, bcc }) => {
    const fromEmailAddress = from ?? senderEmailAddress;
    const replyToEmailAddresses = replyTo ?? replierEmailAddresses;

    if (typeof fromEmailAddress !== 'string') {
      throw new Error('from argument must be provided.');
    }

    if (
      typeof replyToEmailAddresses !== 'string' &&
      !Array.isArray(replyToEmailAddresses)
    ) {
      throw new Error('replyTo argument must be provided.');
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
      throw new Error(
        `Email failed to send: ${JSON.stringify(response.error)}`,
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: `Email sent successfully! ${JSON.stringify(response.data)}`,
        },
      ],
    };
  },
);

server.tool(
  'list-audiences',
  'List all audiences from Resend',
  {},
  async () => {
    const response = await resend.audiences.list();

    if (response.error) {
      throw new Error(
        `Failed to list audiences: ${JSON.stringify(response.error)}`,
      );
    }

    return {
      content: [
        {
          type: 'text',
          text: `Audiences found: ${JSON.stringify(response.data)}`,
        },
      ],
    };
  },
);

async function main() {
  const app = express();
  
  app.use(cors());
  app.use(express.json());
  
  // Health check
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'resend-mcp-server' });
  });
  
  // MCP SSE endpoint
  app.get('/mcp', async (req, res) => {
    try {
      const transport = new SSEServerTransport('/mcp/message', res);
      await server.connect(transport);
      await transport.start();
    } catch (error) {
      console.error('MCP connection error:', error);
      res.status(500).json({ error: 'Failed to establish MCP connection' });
    }
  });
  
  // MCP message handler
  app.post('/mcp/message', async (req, res) => {
    res.json({ status: 'received' });
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