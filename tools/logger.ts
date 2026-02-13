import winston from "winston";

/**
 * Structured logger for Git MCP Server operations.
 *
 * Log levels:
 * - error: Operation failures and exceptions
 * - warn: Potential issues or deprecated usage
 * - info: Successful operations and important events
 * - debug: Detailed operation information
 *
 * Configure log level via LOG_LEVEL environment variable (default: info).
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.printf(
          ({ level, message, timestamp, ...meta }) =>
            `${timestamp} [${level}]: ${message}${Object.keys(meta).length ? " " + JSON.stringify(meta) : ""}`,
        ),
      ),
    }),
  ],
});
