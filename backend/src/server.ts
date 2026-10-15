try {
  const { default: app } = await import("./app.js");
  if (process.env.VERCEL !== "1") {
    const port = Number(process.env.PORT) || 3001;
    app.listen(port, () => {
      console.log(`FourQA API em http://localhost:${port}`);
    });
  }
} catch (err) {
  console.error(err instanceof Error ? err.message : "provider inválido");
  process.exit(1);
}
