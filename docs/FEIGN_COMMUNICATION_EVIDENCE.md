# Feign communication evidence

MAVIS analyzes imported Spring Cloud OpenFeign source without executing it or adding OpenFeign to the platform runtime.

For each directly declared mapped client method, a static `SERVICE_HTTP_CALL` relationship records the HTTP method/path, client interface/method, source and target service, target selection, receiver matching and call-site resolution. Annotation URL overrides service name and configuration URL. An unprofiled configuration URL is considered only in the owning service. Dynamic or profile-dependent targets remain unresolved. Imported service names must match exactly, ignoring case; ambiguous names are never first-matched.

Saved evidence carries one of these roles:

| Role | Meaning |
| --- | --- |
| CLIENT_DECLARATION | `@FeignClient` annotation, file and line |
| CLIENT_CONFIGURATION | Applicable target URL configuration, file and line |
| CLIENT_CONTRACT | Mapped client method, HTTP verb/path and snippet |
| CALL_SITE | Typed receiver invocation in a method body |
| SERVER_ENDPOINT | Unique target-service controller endpoint matching verb and normalized path |

For example, `order-service` can declare a Feign POST to `/api/catalog/inventory/deduct`. The Inspector shows its client contract and any typed `client.deductInventory(...)` calls. It attaches receiver source only when the imported target service contains a unique matching POST endpoint. A GET at the same path does not match. Different path-variable names are normalized. Missing receiver source remains visible as missing evidence, not proof that the service does not exist.

Select a service in Architecture Graph Explorer to list communications of that service and its descendant components. Select a relationship to inspect its contract, matching status and role-labelled source snippets. Kafka/messaging remains publisher → channel and channel → consumer; Compose `depends_on` remains a deployment declaration. Neither creates an inferred HTTP call.

## Limits and verification

These are static source facts, not proof of successful requests or message delivery at runtime. Constants, environment placeholders, inherited contracts, dynamic clients, local aliases, data-flow dispatch and ambiguous overloads are not fully resolved. Controller matching compares service ownership, HTTP verb and path; it does not verify request headers, payload compatibility, security, gateway rewrites, active profiles or context paths. URL-host matching does not prove DNS or load-balancer deployment bindings. Configuration under conflicting profiles remains uncertain.

The analysis policy is `source-method-v3-feign`. Existing immutable model revisions retain their old evidence: reanalyze/import the source into a new revision to obtain the new relationships. No database migration is required.

Tests cover parser/resolver ambiguity and URL precedence, persistence of multiple proofs on each relationship, owner JWT access versus outsider denial, FE DTO role validation, Inspector rendering and messaging/Compose distinctions. See the delivery receipt for actual run results. Hosted CI and production acceptance are separate gates.

Reference: [Spring Cloud OpenFeign URL selection](https://docs.spring.io/spring-cloud-openfeign/reference/spring-cloud-openfeign.html).
