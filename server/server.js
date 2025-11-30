app.get("/metrics", async (req, res) => {
  try {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  } catch (err) {
    console.error("Metrics error:", err);
    res.status(500).end(err.message);
  }
});
