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

## Run (STDIO MCP Server)

```bash
npm start
```

The server communicates over STDIO, so it is intended to be launched by an MCP host.

## Tool Inputs

- `get_alerts`
  - `state` (string): two-letter US state code (example: `CA`)
- `get_forecast`
  - `latitude` (number): decimal latitude
  - `longitude` (number): decimal longitude

## MCP Host Hookup Example

For hosts that accept a command-based MCP server configuration, point to the built entry:

- Command: `node`
- Args: `["D:/mcpserverdemo/build/index.js"]`
- Working directory: `D:/mcpserverdemo`

If your host supports npm scripts, you can alternatively run `npm start` in this project directory.

