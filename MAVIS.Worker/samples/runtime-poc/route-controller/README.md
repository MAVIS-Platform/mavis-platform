# Prepared connection controller

This sample is the real forwarding service for the prepared Studio wire from orders to payment. It supports GET and HEAD, forwards the request path and query to UPSTREAM_URL, returns the upstream status, and reports its own health at /health. Automatic .NET OTel instrumentation propagates trace context.

The prepared Compose project points orders' PAYMENT_URL at http://orders-payment-route:8080. The controller has UPSTREAM_URL=http://payment:8080. Stopping the controller interrupts actual orders requests. Restarting it restores the route.

Initialize-Poc.ps1 builds this image and writes its local digest into artifacts/manifest.json. The opt-in test PreparedStudioActivatesMissingBlockAndConfirmsRealDockerChanges starts an isolated allocation, leaves payment and the controller initially stopped, then executes:

1. START payment.
2. START orders-payment-route and check workload error rate is zero.
3. STOP orders-payment-route and check workload error rate is 100 percent.
4. START orders-payment-route and check workload error rate returns to zero.
5. SCALE orders to two replicas.

The test also checks real OTel spans, Runner acknowledgements, telemetry and confirmed teardown. Its Java callback endpoint is an in-process fixture, so it validates Runner/Docker behavior independently of a production backend.

The source image and collector must be pinned to content digests by the generated profile. This fixture is not a universal proxy or a general repository deployment template.
