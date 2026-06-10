import type { ErrorRequestHandler } from "express";

export const errorMiddleware: ErrorRequestHandler = (
  error,
  _request,
  response,
  _next
) => {
  if (error instanceof Error && error.name === "PaymentRequiredError") {
    response.status(402).json({
      error: "Payment required",
      message: error.message
    });
    return;
  }

  const statusCode =
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : 400;

  response.status(statusCode).json({
    error: statusCode >= 500 ? "Internal server error" : "Bad request",
    message: error instanceof Error ? error.message : "Unknown error"
  });
};
