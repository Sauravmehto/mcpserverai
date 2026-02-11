# Basic TypeScript MCP Weather Server

Minimal MCP server that exposes two tools backed by the US National Weather Service (NWS) API:

- `get_alerts` for active weather alerts by state code
- `get_forecast` for forecast by latitude/longitude

## Requirements

- Node.js 18+
- npm

## Install

```bash
npm install
```

## Build

```bash
npm run build
```

Build output is written to `build/index.js`.

## Run (HTTP MCP Server)

```bash
npm start
```

The server listens on `PORT` (defaults to `3000`) and exposes:

- MCP endpoint: `/mcp`
- Health endpoint: `/health`

Local test URLs:

- `http://localhost:3000/mcp`
- `http://localhost:3000/health`

## Tool Inputs

- `get_alerts`
  - `state` (string): two-letter US state code (example: `CA`)
- `get_forecast`
  - `latitude` (number): decimal latitude
  - `longitude` (number): decimal longitude

## Deploy on Railway

1. Push this repo to GitHub.
2. Create a Railway project and link the repo.
3. Use:
   - Build command: `npm install && npm run build`
   - Start command: `npm start`
4. Railway provides a public URL, for example:
   - `https://your-app.up.railway.app`

MCP endpoint becomes:

- `https://your-app.up.railway.app/mcp`

## Claude Custom Connector Setup

- Name: any label you prefer (for example `Weather MCP`)
- Remote MCP server URL: `https://your-app.up.railway.app/mcp`

After saving the connector, test tools:

- `get_alerts` with a state like `CA`
- `get_forecast` with coordinates like `37.7749, -122.4194`

