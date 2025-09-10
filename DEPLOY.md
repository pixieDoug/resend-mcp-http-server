# Resend MCP HTTP Server

A Model Context Protocol (MCP) server for sending emails via Resend, deployed as an HTTP service.

## Environment Variables

Set these environment variables in your deployment platform:

- `RESEND_API_KEY` (required): Your Resend API key
- `SENDER_EMAIL_ADDRESS` (optional): Default sender email address  
- `REPLY_TO_EMAIL_ADDRESSES` (optional): Comma-separated reply-to addresses
- `PORT` (optional): Server port (defaults to 3000)

## Deployment Options

### Railway (Recommended)
1. Push this code to a GitHub repo
2. Go to [railway.app](https://railway.app) and sign up
3. Create new project → Deploy from GitHub repo
4. Connect your repo
5. Set environment variables in Railway dashboard
6. Deploy automatically

### Vercel
1. Push to GitHub
2. Connect to Vercel
3. Set environment variables in Vercel dashboard
4. Deploy

### Render  
1. Connect to Render
2. Set environment variables
3. Build: `npm run build`
4. Start: `npm start`

## Usage in Emissaries

Once deployed, use the server URL:
- Health: `https://your-app.railway.app/health`
- MCP: `https://your-app.railway.app/mcp`

## Setup Steps

1. **Get Resend API Key:**
   - Go to [resend.com](https://resend.com)
   - Create account and get API key
   - Add your domain and verify sender email

2. **Deploy to Cloud:**
   - Choose Railway (easiest)
   - Set `RESEND_API_KEY` environment variable
   - Set `SENDER_EMAIL_ADDRESS` (your verified email)

3. **Configure in Emissaries:**
   - Add MCP server with deployed URL
   - Test with "List Actions"