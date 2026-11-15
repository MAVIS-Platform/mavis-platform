# Prepared Live Studio projects

This extends the curated-repository workflow in Ultimate Docs. It preserves pinned source/model identities, Quiz Gate, Compose Preflight, 1–8 replicas, bounded sessions, Runner acknowledgement and frozen submission evidence.

## Runtime semantics

A prepared block is a service already included in the approved Compose/profile and confirmed service mappings. Add block sends START. Remove block sends STOP and preserves the service definition so the student can add it again. Scale is available only for blocks marked canScale and uses the existing 1–8 replica command.

Clone replica scales the same prepared service by one instance. Its image, environment and resource limits are inherited from the pinned Compose/profile. Stateful services should leave canScale false unless their repository implements the required replication and routing.

A prepared connection is a dedicated route-controller service in the same Compose allocation. For example, orders calls orders-payment-route and that controller forwards to payment. Connect sends START to orders-payment-route. Disconnect sends STOP. The controller must be an actual part of the call path. A direct URL from orders to payment would bypass this exercise and must be removed when authoring the repo.

Connection controllers need digest-pinned images, health endpoints and confirmed mappings like other runnable services. They cannot also be visible blocks, be shared by two wires, or target a service outside the profile. No environment values, host commands or arbitrary images are accepted through the drawing gesture.

An enabled configured wire is dashed. It shows route configuration, not proof of an observed call. Solid interactions and measured timings still come from captured OTel traces. Controller hops can appear in those traces. No synthetic latency is added in Live.

## Preparing a repository

1. Build and pin all images, including route controllers.
2. Configure application endpoints to use the named route controllers, forwarding trace context.
3. Give each service a health endpoint that can succeed before dependencies are removed.
4. Ensure no fixed host ports or container names prevent scaling. Verify the application's real load balancing.
5. Add all controllable services to runtime applications and confirmed model mappings.
6. Save the following studioTopology object inside the runtime profile, using Runtime → Interactive Studio session → Prepared Live blocks and connections.
7. Start an interactive session and verify initial telemetry before making changes.

```json
{
  "version": 1,
  "blocks": [
    { "service": "orders", "label": "Order API", "canScale": true, "initiallyStopped": false },
    { "service": "payment", "label": "Payment API", "canScale": false, "initiallyStopped": true }
  ],
  "connections": [
    {
      "from": "orders",
      "to": "payment",
      "controllerService": "orders-payment-route",
      "protocol": "HTTP",
      "initiallyStopped": true
    }
  ]
}
```

The profile editor saves through the existing project-write API with expectedRevision. Changing topology in a workspace also requires lecturer access. Saving Step 1 without a topology field preserves the configuration for the same source snapshot. Start validates names against both runtime applications and confirmed mappings. Session state exposes only public, normalized topology fields.

In Guided Lab, configure the reference project on the exact source snapshot published to the assignment. A new student Live session reads the topology from that reference project's profile and pins it to the session. It uses the student's existing runtime configuration and secrets flow. Edits to the reference profile affect future sessions only. A Lab-level frozen topology revision is still an open item.

Runner first verifies the entire prepared stack can start and pass readiness, then stops initiallyStopped blocks/controllers before the baseline workload. This means the prepared repository must be runnable before the exercise's initial faults are injected. No initial stop is recorded as a student action.

An exercise starting with a missing dependency should use a baseline request that can fail promptly or explicitly accepts its initial error response. GET/HEAD workloads are replayed after confirmed commands. Mutating HTTP workloads retain the existing initial-only execution behavior. Initial preparation, experiments and evidence capture share the profile timeout, at most 300 seconds.

## Student flow

Open the assigned Lab's Runtime workspace after the Quiz gate, select Interactive Studio session, save/approve the runtime plan and start. Studio → Live can select the resulting session. The prepared builder shows available blocks, supports dragging wires between supported endpoints, cutting configured wires, and editing allowed replica counts. Unknown pairs display a message without queuing a Docker command.

The command queue disables further changes until acknowledgement. Failed commands remain visible in action history. Capture requires observed telemetry, explanation and no pending command. Finish drains evidence and cleans the allocation. The existing submission flow freezes these snapshots and the signed receipt.

## Current boundary

This implementation activates prepared definitions. It does not generate new application code, rewrite arbitrary application configuration, or clone database contents. Sandbox-only controls such as simulated traffic, simulated resilience policies, arbitrary clone counts and local video evidence do not silently become Docker capabilities. Curated repositories can implement policies in their own code; Live reports their observed behavior.

Local verification includes backend topology validation and service authorization tests, Runner initialization tests, and browser tests for block activation and route connect/disconnect. A managed Docker test verifies activation of an initially stopped block with telemetry and cleanup. Production deployment and a real teacher/student account round-trip must be verified separately.

## Local verification on 15 November 2026

- Java unit tests passed: PreparedStudioTopologyTest (4), RuntimeStudioServiceTest (8), RuntimePlanningServiceTest (22).
- TypeScript typecheck and 18 runtime-planning tests passed.
- studio-ui.browser.cjs passed the existing Live/snapshot/grading flow and prepared block activation, connect, disconnect and acknowledgement behavior using API fixtures.
- studio-workbench.browser.cjs passed the Sandbox regression suite.
- Seven Runner infrastructure tests passed, including baseline initialization with a stopped block.
- PreparedStudioActivatesMissingBlockAndConfirmsRealDockerChanges passed against Linux Docker using cached, digest-pinned sample images. It checks route enabled error rate 0%, disabled 100%, re-enabled 0%, scale to two replicas, captured spans and confirmed cleanup. Java callbacks in this test use an in-process transport fixture.
- Runtime START and SCALE now wait for the target health endpoint before confirming readiness and measuring the next GET/HEAD workload. This fixed an observed startup race in the Docker test.
- Production deployment, real account authorization through a backend server, and a teacher/student Lab submission round-trip were not exercised in this local run.
