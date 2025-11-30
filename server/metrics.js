// server/metrics.js
import client from "prom-client";

const register = new client.Registry();

// نجمع الـ default metrics (CPU, memory, إلخ)
client.collectDefaultMetrics({ register });

// Counter لعدد الـ requests
const httpRequestsTotal = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status"],
});

register.registerMetric(httpRequestsTotal);

export { register, httpRequestsTotal };
