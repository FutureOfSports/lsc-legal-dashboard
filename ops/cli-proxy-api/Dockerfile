# Package the checksum-verified upstream v8.0.16 Linux AMD64 no-plugin binary.
# Build context contains this file, the binary, upstream LICENSE and example config.
FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --chown=65532:65532 cli-proxy-api /app/cli-proxy-api
COPY --chown=65532:65532 config.example.yaml /app/config.example.yaml
COPY --chown=65532:65532 LICENSE /app/LICENSE
ENV TZ=UTC PGSTORE_LOCAL_PATH=/tmp/cliproxy PGSTORE_SCHEMA=public
USER 65532:65532
EXPOSE 8317
ENTRYPOINT ["/app/cli-proxy-api"]
CMD ["--local-model"]
