import { createLogger, format, transports } from "winston";

export const logger = createLogger({
  level: process.env.LOG_LEVEL ?? "info",
  format: format.combine(
    format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length
            ? " " +
              JSON.stringify(meta, (_key, value) =>
                value instanceof Error ? { message: value.message, stack: value.stack } : value
              )
            : "";
          return `${timestamp} [${level}] ${message}${metaStr}`;
        })
      ),
    }),
  ],
});
