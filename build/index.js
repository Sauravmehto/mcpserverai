import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";
import { createServer as createHttpServer } from "node:http";
import { z } from "zod";
const NWS_HEADERS = {
    "User-Agent": "basic-mcp-weather-server/1.0.0",
    Accept: "application/geo+json"
};
async function nwsRequest(url) {
    const response = await fetch(url, { headers: NWS_HEADERS });
    if (!response.ok) {
        throw new Error(`NWS request failed with status ${response.status} for ${url}`);
    }
    return (await response.json());
}
function formatAlertText(alert) {
    const props = alert.properties ?? {};
    const parts = [
        `Event: ${props.event ?? "Unknown"}`,
        `Area: ${props.areaDesc ?? "Unknown"}`,
        `Severity: ${props.severity ?? "Unknown"}`,
        `Headline: ${props.headline ?? "No headline"}`,
        `Description: ${props.description ?? "No description"}`
    ];
    if (props.instruction) {
        parts.push(`Instruction: ${props.instruction}`);
    }
    return parts.join("\n");
}
function createWeatherServer() {
    const server = new McpServer({
        name: "weather",
        version: "1.0.0"
    });
    server.tool("get_alerts", "Get active weather alerts for a US state by two-letter code (for example: CA, NY, TX).", {
        state: z.string().length(2).describe("Two-letter US state code.")
    }, async ({ state }) => {
        try {
            const normalizedState = state.toUpperCase();
            const url = `https://api.weather.gov/alerts/active/area/${normalizedState}`;
            const data = await nwsRequest(url);
            const alerts = data.features ?? [];
            if (alerts.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `No active weather alerts found for state ${normalizedState}.`
                        }
                    ]
                };
            }
            const renderedAlerts = alerts
                .slice(0, 20)
                .map((alert, idx) => `Alert ${idx + 1}\n${formatAlertText(alert)}`)
                .join("\n\n---\n\n");
            return {
                content: [
                    {
                        type: "text",
                        text: renderedAlerts
                    }
                ]
            };
        }
        catch (error) {
            console.error("get_alerts failed:", error);
            return {
                content: [
                    {
                        type: "text",
                        text: "Failed to fetch weather alerts from NWS API."
                    }
                ],
                isError: true
            };
        }
    });
    server.tool("get_forecast", "Get a weather forecast for a latitude/longitude location in the US.", {
        latitude: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
        longitude: z.number().min(-180).max(180).describe("Longitude in decimal degrees.")
    }, async ({ latitude, longitude }) => {
        try {
            const pointsUrl = `https://api.weather.gov/points/${latitude},${longitude}`;
            const points = await nwsRequest(pointsUrl);
            const forecastUrl = points.properties?.forecast;
            if (!forecastUrl) {
                throw new Error("NWS points response missing forecast URL.");
            }
            const forecast = await nwsRequest(forecastUrl);
            const periods = forecast.properties?.periods ?? [];
            if (periods.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: "No forecast periods were returned for this location."
                        }
                    ]
                };
            }
            const renderedForecast = periods
                .slice(0, 8)
                .map((period) => {
                const summary = [
                    `${period.name ?? "Unknown period"}: ${period.shortForecast ?? "No summary"}`,
                    `Temp: ${period.temperature ?? "?"} ${period.temperatureUnit ?? ""}`.trim(),
                    `Wind: ${period.windSpeed ?? "?"} ${period.windDirection ?? ""}`.trim(),
                    `Details: ${period.detailedForecast ?? "No detailed forecast"}`
                ];
                return summary.join("\n");
            })
                .join("\n\n---\n\n");
            return {
                content: [
                    {
                        type: "text",
                        text: renderedForecast
                    }
                ]
            };
        }
        catch (error) {
            console.error("get_forecast failed:", error);
            return {
                content: [
                    {
                        type: "text",
                        text: "Failed to fetch weather forecast from NWS API."
                    }
                ],
                isError: true
            };
        }
    });
    return server;
}
async function main() {
    const sessions = new Map();
    const port = Number(process.env.PORT ?? "8080");
    const isInitializeRequest = (body) => typeof body === "object" &&
        body !== null &&
        "method" in body &&
        body.method === "initialize";
    const readJsonBody = async (req) => {
        const chunks = [];
        for await (const chunk of req) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const raw = Buffer.concat(chunks).toString("utf8").trim();
        return raw.length > 0 ? JSON.parse(raw) : undefined;
    };
    const sendJsonError = (res, statusCode, message) => {
        if (res.headersSent) {
            return;
        }
        res.writeHead(statusCode, { "content-type": "application/json" });
        res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message },
            id: null
        }));
    };
    const getSessionId = (req) => {
        const header = req.headers["mcp-session-id"];
        return typeof header === "string" ? header : undefined;
    };
    const httpServer = createHttpServer(async (req, res) => {
        const method = req.method ?? "GET";
        const url = req.url ?? "/";
        if (url === "/health") {
            res.writeHead(200, { "content-type": "application/json" });
            res.end(JSON.stringify({ ok: true }));
            return;
        }
        if (url !== "/mcp") {
            sendJsonError(res, 404, "Not found");
            return;
        }
        try {
            if (method === "POST") {
                const sessionId = getSessionId(req);
                const body = await readJsonBody(req);
                let transport;
                if (sessionId && sessions.has(sessionId)) {
                    transport = sessions.get(sessionId)?.transport;
                }
                else if (!sessionId && isInitializeRequest(body)) {
                    const mcpServer = createWeatherServer();
                    const newTransport = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => randomUUID(),
                        onsessioninitialized: (newSessionId) => {
                            sessions.set(newSessionId, { transport: newTransport, mcpServer });
                        }
                    });
                    transport = newTransport;
                    transport.onclose = () => {
                        const sid = transport?.sessionId;
                        if (sid) {
                            void sessions.get(sid)?.mcpServer.close().catch((error) => {
                                console.error("Failed to close MCP server session:", error);
                            });
                            sessions.delete(sid);
                        }
                    };
                    await mcpServer.connect(transport);
                }
                else {
                    sendJsonError(res, 400, "Bad Request: No valid session ID provided");
                    return;
                }
                if (!transport) {
                    sendJsonError(res, 404, "Session not found");
                    return;
                }
                await transport.handleRequest(req, res, body);
                return;
            }
            if (method === "GET" || method === "DELETE") {
                const sessionId = getSessionId(req);
                if (!sessionId) {
                    sendJsonError(res, 400, "Missing mcp-session-id header");
                    return;
                }
                const session = sessions.get(sessionId);
                if (!session) {
                    sendJsonError(res, 404, "Session not found");
                    return;
                }
                await session.transport.handleRequest(req, res);
                return;
            }
            sendJsonError(res, 405, "Method not allowed");
        }
        catch (error) {
            console.error("HTTP MCP request handling failed:", error);
            sendJsonError(res, 500, "Internal server error");
        }
    });
    await new Promise((resolve, reject) => {
        httpServer.listen(port, "0.0.0.0", () => resolve());
        httpServer.once("error", reject);
    });
    console.error(`Weather MCP server running on HTTP transport at /mcp (port ${port}).`);
}
main().catch((error) => {
    console.error("Fatal server error:", error);
    process.exit(1);
});
