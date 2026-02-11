import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer({
  name: "weather",
  version: "1.0.0"
});

const NWS_HEADERS = {
  "User-Agent": "basic-mcp-weather-server/1.0.0",
  Accept: "application/geo+json"
};

type NwsAlertsResponse = {
  features?: Array<{
    properties?: {
      event?: string;
      areaDesc?: string;
      severity?: string;
      headline?: string;
      description?: string;
      instruction?: string;
    };
  }>;
};

type NwsPointResponse = {
  properties?: {
    forecast?: string;
  };
};

type NwsForecastResponse = {
  properties?: {
    periods?: Array<{
      name?: string;
      detailedForecast?: string;
      temperature?: number;
      temperatureUnit?: string;
      windSpeed?: string;
      windDirection?: string;
      shortForecast?: string;
    }>;
  };
};

async function nwsRequest<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers: NWS_HEADERS });

  if (!response.ok) {
    throw new Error(`NWS request failed with status ${response.status} for ${url}`);
  }

  return (await response.json()) as T;
}

function formatAlertText(alert: NonNullable<NwsAlertsResponse["features"]>[number]): string {
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

server.tool(
  "get_alerts",
  "Get active weather alerts for a US state by two-letter code (for example: CA, NY, TX).",
  {
    state: z.string().length(2).describe("Two-letter US state code.")
  },
  async ({ state }) => {
    try {
      const normalizedState = state.toUpperCase();
      const url = `https://api.weather.gov/alerts/active/area/${normalizedState}`;
      const data = await nwsRequest<NwsAlertsResponse>(url);
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
    } catch (error) {
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
  }
);

server.tool(
  "get_forecast",
  "Get a weather forecast for a latitude/longitude location in the US.",
  {
    latitude: z.number().min(-90).max(90).describe("Latitude in decimal degrees."),
    longitude: z.number().min(-180).max(180).describe("Longitude in decimal degrees.")
  },
  async ({ latitude, longitude }) => {
    try {
      const pointsUrl = `https://api.weather.gov/points/${latitude},${longitude}`;
      const points = await nwsRequest<NwsPointResponse>(pointsUrl);
      const forecastUrl = points.properties?.forecast;

      if (!forecastUrl) {
        throw new Error("NWS points response missing forecast URL.");
      }

      const forecast = await nwsRequest<NwsForecastResponse>(forecastUrl);
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
    } catch (error) {
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
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Weather MCP server running on stdio transport.");
}

main().catch((error) => {
  console.error("Fatal server error:", error);
  process.exit(1);
});

